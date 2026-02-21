/**
 * XML-RPC HTTP client with cookie jar for session management.
 *
 * Security: no redirect following to other hosts, response size limits,
 * request timeouts, cookie scope limited to the configured domain.
 *
 * Optional Chrome CDP integration: when configured and direct requests
 * get 403 (Cloudflare), connects to a headless Chrome instance via
 * Puppeteer and executes fetch() from within the browser context.
 */

import { buildMethodCall, type ParamType } from "./serialize.js";
import { parseMethodResponse, XmlRpcFault } from "./deserialize.js";
import { logger } from "../util/logger.js";

export { XmlRpcFault };

export interface XmlRpcClientOptions {
  url: string;
  timeoutMs: number;
  maxResponseSize: number;
  chromeCdpUrl?: string;
}

export class XmlRpcClient {
  private cookies: Map<string, string> = new Map();
  private readonly url: string;
  private readonly hostname: string;
  private readonly timeoutMs: number;
  private readonly maxResponseSize: number;
  private readonly chromeCdpUrl?: string;
  private browserPage: unknown = null;
  private browserPageCreatedAt = 0;
  private readonly browserPageTtlMs = 10 * 60 * 1000; // 10 minutes
  private useBrowser = false;

  constructor(options: XmlRpcClientOptions) {
    this.url = options.url;
    this.hostname = new URL(options.url).hostname;
    this.timeoutMs = options.timeoutMs;
    this.maxResponseSize = options.maxResponseSize;
    this.chromeCdpUrl = options.chromeCdpUrl;
  }

  async call(
    method: string,
    params: unknown[] = [],
    paramTypes?: ParamType[],
  ): Promise<unknown> {
    const body = buildMethodCall(method, params, paramTypes);
    logger.debug(`XML-RPC call: ${method}`, { paramCount: params.length });

    // If we've already switched to browser mode, use it directly
    if (this.useBrowser && this.chromeCdpUrl) {
      return await this.doBrowserFetch(method, body);
    }

    try {
      return await this.doDirectFetch(method, body);
    } catch (err) {
      // On 403, switch to browser mode if Chrome CDP is configured
      if (
        this.chromeCdpUrl &&
        err instanceof Error &&
        err.message.includes("HTTP 403")
      ) {
        logger.info("Got 403, switching to browser-proxied requests via Chrome CDP...");
        this.useBrowser = true;
        return await this.doBrowserFetch(method, body);
      }
      throw err;
    }
  }

  clearCookies(): void {
    this.cookies.clear();
  }

  hasCookies(): boolean {
    return this.cookies.size > 0;
  }

  private async doDirectFetch(method: string, body: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "User-Agent": "Tapatalk/8.9.7 (Android; com.quoord.tapatalkpro.activity)",
          "Accept-Encoding": "gzip, deflate",
          ...(this.cookieHeader() ? { Cookie: this.cookieHeader()! } : {}),
        },
        body,
        signal: controller.signal,
        redirect: "manual",
      });

      // Check for redirects to other hosts
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          try {
            const redirectHost = new URL(location, this.url).hostname;
            if (redirectHost !== this.hostname) {
              throw new Error(`Refusing redirect to different host: ${redirectHost}`);
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes("Refusing redirect")) throw e;
            throw new Error(`Malformed redirect URL: ${location}`);
          }
        }
        throw new Error(`Unexpected redirect (${response.status})`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.captureCookies(response.headers);

      const responseBody = await this.readResponseBody(response);
      const result = parseMethodResponse(responseBody);

      logger.debug(`XML-RPC response: ${method} OK`);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Execute an XML-RPC call from within a headless Chrome browser context.
   * The browser's real TLS fingerprint and network stack bypass Cloudflare.
   */
  private async doBrowserFetch(method: string, body: string): Promise<unknown> {
    const page = await this.getOrCreatePage();

    // Use page.evaluate to run fetch() inside the browser
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (page as any).evaluate(
      async (url: string, xmlBody: string, timeoutMs: number) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "text/xml; charset=utf-8" },
            body: xmlBody,
            signal: controller.signal,
          });
          if (!resp.ok) {
            return { error: `HTTP ${resp.status}: ${resp.statusText}` };
          }
          const text = await resp.text();
          return { body: text };
        } catch (e: unknown) {
          return { error: (e as Error).message || String(e) };
        } finally {
          clearTimeout(timer);
        }
      },
      this.url,
      body,
      this.timeoutMs,
    );

    if (result.error) {
      throw new Error(result.error);
    }

    if (result.body.length > this.maxResponseSize) {
      throw new Error(
        `Response too large: ${result.body.length} chars (limit: ${this.maxResponseSize})`,
      );
    }

    const parsed = parseMethodResponse(result.body);
    logger.debug(`XML-RPC response (browser): ${method} OK`);
    return parsed;
  }

  /**
   * Get or create a persistent browser page.
   * First time: connects to Chrome via CDP, opens the forum URL to
   * establish Cloudflare clearance, then reuses the page for fetch() calls.
   */
  private async getOrCreatePage(): Promise<unknown> {
    // Expire stale pages to avoid using a disconnected browser
    if (
      this.browserPage &&
      Date.now() - this.browserPageCreatedAt > this.browserPageTtlMs
    ) {
      logger.info("Browser page TTL expired, reconnecting...");
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page = this.browserPage as any;
        const browser = page.browser();
        await page.close().catch(() => {});
        await browser.disconnect().catch(() => {});
      } catch { /* ignore cleanup errors */ }
      this.browserPage = null;
    }

    if (this.browserPage) return this.browserPage;

    if (!this.chromeCdpUrl) {
      throw new Error("Chrome CDP URL not configured");
    }

    // Dynamic import — puppeteer-core is only needed when Chrome mode is active
    const puppeteer = await import("puppeteer-core");

    // Get the WebSocket URL from the Chrome CDP endpoint
    const versionResp = await fetch(`${this.chromeCdpUrl}/json/version`);
    if (!versionResp.ok) {
      throw new Error(`Chrome CDP not reachable: HTTP ${versionResp.status}`);
    }
    const versionData = (await versionResp.json()) as { webSocketDebuggerUrl: string };
    // Chrome returns ws://localhost/... but we need to connect via the Docker hostname
    const cdpHost = new URL(this.chromeCdpUrl).host;
    const wsUrl = versionData.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${cdpHost}`);

    logger.info(`Connecting to Chrome at ${wsUrl}`);
    const browser = await puppeteer.default.connect({ browserWSEndpoint: wsUrl });

    const page = await browser.newPage();

    // Navigate to the forum first to establish Cloudflare clearance
    const forumBaseUrl = this.url.replace(/\/mobiquo\/mobiquo\.php$/, "");
    logger.info(`Navigating to ${forumBaseUrl} to establish clearance...`);
    await page.goto(forumBaseUrl, { waitUntil: "networkidle2", timeout: 30000 });
    logger.info("Browser clearance established");

    this.browserPage = page;
    this.browserPageCreatedAt = Date.now();
    return page;
  }

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    const pairs: string[] = [];
    for (const [name, value] of this.cookies) {
      pairs.push(`${name}=${value}`);
    }
    return pairs.join("; ");
  }

  private captureCookies(headers: Headers): void {
    const setCookies =
      "getSetCookie" in headers
        ? (headers as unknown as { getSetCookie(): string[] }).getSetCookie()
        : [];

    if (setCookies.length === 0) {
      const raw = headers.get("set-cookie");
      if (raw) {
        for (const part of raw.split(/,(?=\s*\w+=)/)) {
          this.parseSingleCookie(part.trim());
        }
        return;
      }
    }

    for (const cookie of setCookies) {
      this.parseSingleCookie(cookie);
    }
  }

  private parseSingleCookie(setCookie: string): void {
    const parts = setCookie.split(";");
    const nameValue = parts[0]?.trim();
    if (!nameValue) return;

    const eqIdx = nameValue.indexOf("=");
    if (eqIdx === -1) return;

    const name = nameValue.substring(0, eqIdx).trim();
    const value = nameValue.substring(eqIdx + 1).trim();

    const domainPart = parts.find((p) =>
      p.trim().toLowerCase().startsWith("domain="),
    );
    if (domainPart) {
      const cookieDomain = domainPart.split("=")[1]?.trim().replace(/^\./, "");
      if (
        cookieDomain &&
        this.hostname !== cookieDomain &&
        !this.hostname.endsWith("." + cookieDomain)
      ) {
        logger.debug(`Rejecting cookie for foreign domain: ${cookieDomain}`);
        return;
      }
    }

    this.cookies.set(name, value);
  }

  private async readResponseBody(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > this.maxResponseSize) {
      throw new Error(
        `Response too large: ${buffer.byteLength} bytes (limit: ${this.maxResponseSize})`,
      );
    }
    return new TextDecoder("utf-8").decode(buffer);
  }
}
