import { request } from "undici";
import type { ProjectDatabase } from "@seo-auditor/database";
import type { RedirectHop } from "@seo-auditor/shared-types";
import { isPrivateNetworkLiteral } from "./url.js";

export interface FetchResult {
  initialStatusCode: number;
  finalStatusCode: number;
  finalUrl: string;
  headers: Record<string, string | string[]>;
  body: Buffer;
  redirects: RedirectHop[];
  responseTimeMs: number;
}

class RateLimiter {
  private nextStart = 0;
  constructor(private readonly startsPerSecond: number) {}

  async wait(): Promise<void> {
    if (this.startsPerSecond <= 0) return;
    const interval = 1000 / this.startsPerSecond;
    const now = Date.now();
    const start = Math.max(now, this.nextStart);
    this.nextStart = start + interval;
    const delay = start - now;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function redirectType(statusCode: number): RedirectHop["redirectType"] {
  if (statusCode === 301 || statusCode === 308) return "permanent";
  if (statusCode === 302 || statusCode === 303 || statusCode === 307) return "temporary";
  return "other";
}

function headerRecord(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined));
}

async function readLimitedBody(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error(`Response exceeded maximum size of ${maxBytes} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

export class HttpFetcher {
  private readonly limiter: RateLimiter;

  constructor(
    private readonly options: {
      userAgent: string;
      timeoutMs: number;
      maxResponseBytes: number;
      maxRedirects: number;
      maxRetries: number;
      requestsPerSecond: number;
      allowPrivateNetwork: boolean;
    },
    private readonly database?: ProjectDatabase
  ) {
    this.limiter = new RateLimiter(options.requestsPerSecond);
  }

  async fetch(urlId: number | undefined, inputUrl: string, method: "GET" | "HEAD" = "GET"): Promise<FetchResult> {
    let currentUrl = inputUrl;
    let initialStatusCode = 0;
    const redirects: RedirectHop[] = [];
    const visited = new Set<string>([currentUrl]);
    const overallStart = Date.now();

    for (let hop = 0; hop <= this.options.maxRedirects; hop += 1) {
      if (!this.options.allowPrivateNetwork && isPrivateNetworkLiteral(currentUrl)) {
        throw new Error(`Private-network request blocked: ${currentUrl}`);
      }
      let lastError: unknown;
      for (let attempt = 1; attempt <= this.options.maxRetries + 1; attempt += 1) {
        const startedAt = new Date().toISOString();
        await this.limiter.wait();
        try {
          const response = await request(currentUrl, {
            method,
            headers: {
              "user-agent": this.options.userAgent,
              accept: method === "HEAD" ? "*/*" : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"
            },
            headersTimeout: this.options.timeoutMs,
            bodyTimeout: this.options.timeoutMs
          });
          const headers = headerRecord(response.headers);
          this.database && urlId !== undefined && this.database.recordRequest(urlId, {
            startedAt,
            completedAt: new Date().toISOString(),
            attempt,
            requestHeaders: { "user-agent": this.options.userAgent },
            responseHeaders: headers
          });
          if (initialStatusCode === 0) initialStatusCode = response.statusCode;
          const retryable = response.statusCode === 429 || response.statusCode >= 500;
          if (retryable && attempt <= this.options.maxRetries) {
            await response.body.dump();
            const retryAfter = Number.parseInt(String(headers["retry-after"] ?? ""), 10);
            const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 250;
            await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 30_000)));
            continue;
          }
          if (response.statusCode >= 300 && response.statusCode < 400 && headers.location) {
            await response.body.dump();
            const location = Array.isArray(headers.location) ? headers.location[0] : headers.location;
            if (!location) throw new Error(`Redirect response from ${currentUrl} had no usable Location header`);
            const nextUrl = new URL(location, currentUrl).href;
            redirects.push({
              hopNumber: redirects.length + 1,
              fromUrl: currentUrl,
              toUrl: nextUrl,
              statusCode: response.statusCode,
              redirectType: redirectType(response.statusCode)
            });
            if (visited.has(nextUrl)) throw new Error(`Redirect loop detected at ${nextUrl}`);
            visited.add(nextUrl);
            currentUrl = nextUrl;
            break;
          }
          const body = method === "HEAD" ? Buffer.alloc(0) : await readLimitedBody(response.body, this.options.maxResponseBytes);
          return {
            initialStatusCode,
            finalStatusCode: response.statusCode,
            finalUrl: currentUrl,
            headers,
            body,
            redirects,
            responseTimeMs: Date.now() - overallStart
          };
        } catch (error) {
          lastError = error;
          this.database && urlId !== undefined && this.database.recordRequest(urlId, {
            startedAt,
            completedAt: new Date().toISOString(),
            attempt,
            requestHeaders: { "user-agent": this.options.userAgent },
            errorType: error instanceof Error ? error.name : "RequestError",
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          if (attempt <= this.options.maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 250));
          }
        }
      }
      if (lastError) throw lastError;
      if (redirects.length <= hop) continue;
    }
    throw new Error(`Redirect limit of ${this.options.maxRedirects} exceeded for ${inputUrl}`);
  }
}
