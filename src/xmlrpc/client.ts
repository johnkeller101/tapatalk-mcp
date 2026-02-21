/**
 * XML-RPC HTTP client with cookie jar for session management.
 *
 * Security: no redirect following to other hosts, response size limits,
 * request timeouts, cookie scope limited to the configured domain.
 *
 * Optional FlareSolverr integration: when configured and a 403 is received,
 * uses FlareSolverr to obtain Cloudflare clearance cookies, then retries.
 */

import { buildMethodCall, type ParamType } from "./serialize.js";
import { parseMethodResponse, XmlRpcFault } from "./deserialize.js";
import { logger } from "../util/logger.js";

export { XmlRpcFault };

export interface XmlRpcClientOptions {
  url: string;
  timeoutMs: number;
  maxResponseSize: number;
  flareSolverrUrl?: string;
}

interface FlareSolverrCookie {
  name: string;
  value: string;
  domain?: string;
}

interface FlareSolverrResponse {
  status: string;
  solution?: {
    cookies?: FlareSolverrCookie[];
    userAgent?: string;
    status?: number;
  };
}

export class XmlRpcClient {
  private cookies: Map<string, string> = new Map();
  private readonly url: string;
  private readonly hostname: string;
  private readonly timeoutMs: number;
  private readonly maxResponseSize: number;
  private readonly flareSolverrUrl?: string;
  private flareSolverrUserAgent?: string;

  constructor(options: XmlRpcClientOptions) {
    this.url = options.url;
    this.hostname = new URL(options.url).hostname;
    this.timeoutMs = options.timeoutMs;
    this.maxResponseSize = options.maxResponseSize;
    this.flareSolverrUrl = options.flareSolverrUrl;
  }

  async call(
    method: string,
    params: unknown[] = [],
    paramTypes?: ParamType[],
  ): Promise<unknown> {
    const body = buildMethodCall(method, params, paramTypes);
    logger.debug(`XML-RPC call: ${method}`, { paramCount: params.length });

    try {
      return await this.doFetch(method, body);
    } catch (err) {
      // On 403, try FlareSolverr fallback if configured
      if (
        this.flareSolverrUrl &&
        err instanceof Error &&
        err.message.includes("HTTP 403")
      ) {
        logger.info("Got 403, attempting FlareSolverr clearance...");
        const solved = await this.solveClearance();
        if (solved) {
          logger.info("FlareSolverr clearance obtained, retrying request");
          return await this.doFetch(method, body);
        }
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

  private async doFetch(method: string, body: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const userAgent =
        this.flareSolverrUserAgent ??
        "Tapatalk/8.9.7 (Android; com.quoord.tapatalkpro.activity)";

      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "User-Agent": userAgent,
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
              throw new Error(
                `Refusing redirect to different host: ${redirectHost}`,
              );
            }
          } catch (e) {
            if (
              e instanceof Error &&
              e.message.includes("Refusing redirect")
            ) {
              throw e;
            }
            throw new Error(`Malformed redirect URL: ${location}`);
          }
        }
        throw new Error(`Unexpected redirect (${response.status})`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Capture cookies
      this.captureCookies(response.headers);

      // Read response with size limit
      const responseBody = await this.readResponseBody(response);
      const result = parseMethodResponse(responseBody);

      logger.debug(`XML-RPC response: ${method} OK`);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Call FlareSolverr to get Cloudflare clearance cookies.
   * Uses request.get on the forum base URL (not mobiquo endpoint)
   * to obtain cf_clearance and session cookies.
   */
  private async solveClearance(): Promise<boolean> {
    if (!this.flareSolverrUrl) return false;

    try {
      // Request the mobiquo URL through FlareSolverr
      const resp = await fetch(`${this.flareSolverrUrl}/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "request.get",
          url: this.url,
          maxTimeout: 60000,
        }),
      });

      if (!resp.ok) {
        logger.warn(`FlareSolverr returned HTTP ${resp.status}`);
        return false;
      }

      const data = (await resp.json()) as FlareSolverrResponse;

      if (data.status !== "ok" || !data.solution) {
        logger.warn(`FlareSolverr failed: ${data.status}`);
        return false;
      }

      // Import cookies from FlareSolverr
      const cookies = data.solution.cookies ?? [];
      let imported = 0;
      for (const cookie of cookies) {
        if (cookie.name && cookie.value !== undefined) {
          this.cookies.set(cookie.name, cookie.value);
          imported++;
        }
      }

      // Use the same User-Agent FlareSolverr used (must match for cf_clearance)
      if (data.solution.userAgent) {
        this.flareSolverrUserAgent = data.solution.userAgent;
      }

      logger.info(
        `FlareSolverr: imported ${imported} cookies, UA: ${this.flareSolverrUserAgent ? "set" : "default"}`,
      );
      return imported > 0;
    } catch (e) {
      logger.warn(
        `FlareSolverr request failed: ${(e as Error).message}`,
      );
      return false;
    }
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
      const cookieDomain = domainPart
        .split("=")[1]
        ?.trim()
        .replace(/^\./, "");
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
