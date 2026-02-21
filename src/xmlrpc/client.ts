/**
 * XML-RPC HTTP client with cookie jar for session management.
 *
 * Security: no redirect following to other hosts, response size limits,
 * request timeouts, cookie scope limited to the configured domain.
 */

import { buildMethodCall, type ParamType } from "./serialize.js";
import { parseMethodResponse, XmlRpcFault } from "./deserialize.js";
import { logger } from "../util/logger.js";

export { XmlRpcFault };

export interface XmlRpcClientOptions {
  url: string;
  timeoutMs: number;
  maxResponseSize: number;
}

export class XmlRpcClient {
  private cookies: Map<string, string> = new Map();
  private readonly url: string;
  private readonly hostname: string;
  private readonly timeoutMs: number;
  private readonly maxResponseSize: number;

  constructor(options: XmlRpcClientOptions) {
    this.url = options.url;
    this.hostname = new URL(options.url).hostname;
    this.timeoutMs = options.timeoutMs;
    this.maxResponseSize = options.maxResponseSize;
  }

  async call(
    method: string,
    params: unknown[] = [],
    paramTypes?: ParamType[],
  ): Promise<unknown> {
    const body = buildMethodCall(method, params, paramTypes);
    logger.debug(`XML-RPC call: ${method}`, { paramCount: params.length });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "User-Agent": "TapatalkMCP/1.0",
          "Accept-Encoding": "gzip, deflate",
          ...(this.cookieHeader() ? { Cookie: this.cookieHeader()! } : {}),
        },
        body,
        signal: controller.signal,
        redirect: "manual", // Don't follow redirects (SSRF prevention)
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
            if (e instanceof Error && e.message.includes("Refusing redirect")) {
              throw e;
            }
            // Malformed URL in redirect — reject
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

  clearCookies(): void {
    this.cookies.clear();
  }

  hasCookies(): boolean {
    return this.cookies.size > 0;
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
    // fetch() combines multiple Set-Cookie into getSetCookie()
    const setCookies =
      "getSetCookie" in headers
        ? (headers as unknown as { getSetCookie(): string[] }).getSetCookie()
        : [];

    // Fallback for environments without getSetCookie
    if (setCookies.length === 0) {
      const raw = headers.get("set-cookie");
      if (raw) {
        // Multiple cookies may be comma-separated (RFC 6265 allows this)
        // but safer to split on the pattern
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

    // Check domain scope — only accept cookies for our forum's domain
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
    // Use arrayBuffer for size checking, then decode
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > this.maxResponseSize) {
      throw new Error(
        `Response too large: ${buffer.byteLength} bytes (limit: ${this.maxResponseSize})`,
      );
    }
    return new TextDecoder("utf-8").decode(buffer);
  }
}
