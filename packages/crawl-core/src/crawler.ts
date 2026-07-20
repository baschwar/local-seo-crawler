import pino from "pino";
import { ProjectDatabase } from "@seo-auditor/database";
import type {
  CrawlOptions,
  CrawlProgress,
  CrawlSummary,
  DiscoveredUrl,
  IndexabilityReason
} from "@seo-auditor/shared-types";
import { extractPageMetadata } from "./extract.js";
import { HttpFetcher } from "./http.js";
import { isInternalUrl, isPrivateNetworkLiteral, normalizeUrl } from "./url.js";
import { RobotsCache } from "./robots.js";

export interface CrawlHooks {
  onProgress?: (progress: CrawlProgress) => void;
  waitIfPaused?: () => Promise<void>;
  isCancelled?: () => boolean;
}

class CrawlCancelledError extends Error {
  constructor() { super("Crawl cancelled by user"); this.name = "CrawlCancelledError"; }
}

interface QueueEntry {
  id: number;
  url: DiscoveredUrl;
}

function headerValues(headers: Record<string, string | string[]>, name: string): string[] {
  const value = headers[name];
  if (!value) return [];
  return Array.isArray(value) ? value : value.split(/\s*,\s*/);
}

function classifyIndexability(status: number, contentType: string, robots: string[]): {
  indexable: boolean;
  reason: IndexabilityReason;
} {
  if (status >= 300 && status < 400) return { indexable: false, reason: "redirected" };
  if (status >= 400) return { indexable: false, reason: "error" };
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    return { indexable: false, reason: "unsupported_content_type" };
  }
  if (robots.some((value) => /(?:^|,)\s*noindex\b/i.test(value))) {
    return { indexable: false, reason: "noindex" };
  }
  return { indexable: true, reason: "indexable" };
}

export async function crawl(options: CrawlOptions, hooks: CrawlHooks = {}): Promise<CrawlSummary> {
  const started = Date.now();
  const start = normalizeUrl(options.startUrl);
  const database = new ProjectDatabase(options.projectPath);
  const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });
  const projectId = database.createOrOpenProject(options.projectName, start.host, options);
  const crawlId = database.startCrawl(projectId, start.normalizedUrl, options);
  const queue: QueueEntry[] = [];
  const robots = new RobotsCache(options.userAgent, options.timeoutMs);
  const allowPrivateNetwork = isPrivateNetworkLiteral(start.normalizedUrl);
  const fetcher = new HttpFetcher({ ...options, allowPrivateNetwork }, database);
  const externalFetcher = new HttpFetcher({ ...options, maxResponseBytes: 1024, allowPrivateNetwork }, undefined);
  const externalChecks = new Map<string, Promise<{ status?: number; error?: string }>>();
  let discoveredInternal = 0;
  let fetched = 0;
  let blocked = 0;
  let errors = 0;
  let activeUrl: string | undefined;

  const progress = () => hooks.onProgress?.({
    crawlId,
    crawled: fetched,
    queued: queue.length,
    blocked,
    errors,
    ...(activeUrl ? { currentUrl: activeUrl } : {})
  });

  const discover = (url: DiscoveredUrl): { id: number; inserted: boolean } | undefined => {
    if (url.isInternal && options.maxUrls > 0 && discoveredInternal >= options.maxUrls) return undefined;
    const result = database.discoverUrl(crawlId, url);
    if (result.inserted && url.isInternal) {
      discoveredInternal += 1;
      if (url.depth <= options.maxDepth) queue.push({ id: result.id, url });
    }
    return result;
  };

  const initial: DiscoveredUrl = {
    ...start,
    depth: 0,
    discoverySource: "start",
    isInternal: true
  };
  discover(initial);

  const processEntry = async (entry: QueueEntry): Promise<void> => {
    if (hooks.isCancelled?.()) throw new CrawlCancelledError();
    await hooks.waitIfPaused?.();
    if (hooks.isCancelled?.()) throw new CrawlCancelledError();
    activeUrl = entry.url.normalizedUrl;
    progress();
    try {
      if (options.respectRobotsTxt) {
        const rules = await robots.rulesFor(new URL(entry.url.normalizedUrl));
        const decision = rules.evaluate(new URL(entry.url.normalizedUrl), options.userAgent);
        if (!decision.allowed) {
          blocked += 1;
          database.completeUrl(entry.id, {
            finalUrl: entry.url.normalizedUrl,
            isIndexable: false,
            indexabilityReason: "blocked_by_robots",
            ...(decision.matchedRule ? { robotsRule: decision.matchedRule } : {})
          });
          progress();
          return;
        }
      }

      const response = await fetcher.fetch(entry.id, entry.url.normalizedUrl);
      if (response.redirects.length > 0) {
        database.recordRedirects(crawlId, entry.id, response.redirects);
        for (const redirect of response.redirects) {
          const normalized = normalizeUrl(redirect.toUrl);
          if (isInternalUrl(normalized.normalizedUrl, start.normalizedUrl, options.includeSubdomains)) {
            discover({
              ...normalized,
              depth: entry.url.depth + 1,
              discoverySource: "redirect",
              isInternal: true,
              sourceUrlId: entry.id
            });
          }
        }
      }
      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
      const xRobots = headerValues(response.headers, "x-robots-tag");
      const metadata = isHtml
        ? extractPageMetadata(response.body.toString("utf8"), response.finalUrl, xRobots)
        : undefined;
      const indexability = classifyIndexability(
        response.initialStatusCode,
        contentType,
        [...(metadata?.robots ?? []), ...xRobots]
      );
      database.completeUrl(entry.id, {
        finalUrl: response.finalUrl,
        contentType,
        statusCode: response.initialStatusCode,
        responseTimeMs: response.responseTimeMs,
        responseSizeBytes: response.body.length,
        isIndexable: indexability.indexable,
        indexabilityReason: indexability.reason,
        ...(metadata ? { metadata } : {})
      });
      fetched += 1;
      if (response.initialStatusCode >= 400) errors += 1;

      if (metadata) {
        database.recordImages(crawlId, entry.id, metadata.images);
        for (const link of metadata.links) {
          let normalized;
          try {
            normalized = normalizeUrl(link.destinationUrl);
          } catch {
            continue;
          }
          const internal = isInternalUrl(normalized.normalizedUrl, start.normalizedUrl, options.includeSubdomains);
          let destinationUrlId: number | undefined;
          if (internal) {
            const discovered = discover({
              ...normalized,
              depth: entry.url.depth + 1,
              discoverySource: "link",
              isInternal: true,
              sourceUrlId: entry.id
            });
            destinationUrlId = discovered?.id;
          }
          const linkId = database.recordLink({
            crawlId,
            sourceUrlId: entry.id,
            ...(destinationUrlId !== undefined ? { destinationUrlId } : {}),
            destinationUrl: normalized.normalizedUrl,
            linkType: "anchor",
            anchorText: link.anchorText,
            rel: link.rel,
            isFollow: link.isFollow,
            isInternal: internal,
            ...(link.domSelector ? { domSelector: link.domSelector } : {})
          });
          if (!internal && options.checkExternalLinks) {
            let check = externalChecks.get(normalized.normalizedUrl);
            if (!check) {
              check = externalFetcher
                .fetch(undefined, normalized.normalizedUrl, "HEAD")
                .then((result) => ({ status: result.initialStatusCode }))
                .catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
              externalChecks.set(normalized.normalizedUrl, check);
            }
            const result = await check;
            database.completeExternalLink(linkId, result.status, result.error);
          }
        }
      }
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ url: entry.url.normalizedUrl, error: message }, "crawl request failed");
      database.completeUrl(entry.id, {
        finalUrl: entry.url.normalizedUrl,
        isIndexable: false,
        indexabilityReason: "error",
        errorType: error instanceof Error ? error.name : "RequestError",
        errorMessage: message
      });
    } finally {
      progress();
    }
  };

  try {
    while (queue.length > 0) {
      if (hooks.isCancelled?.()) throw new CrawlCancelledError();
      await hooks.waitIfPaused?.();
      const batch = queue.splice(0, options.maxConcurrency);
      await Promise.all(batch.map(processEntry));
    }
    const status = errors > 0 ? "completed_with_errors" : "completed";
    database.finishCrawl(crawlId, status);
    const total = database.db.prepare("SELECT COUNT(*) AS count FROM urls WHERE crawl_id = ?").get(crawlId) as { count: number };
    return {
      projectId,
      crawlId,
      projectPath: database.path,
      status,
      totalUrls: total.count,
      fetchedUrls: fetched,
      blockedUrls: blocked,
      errorUrls: errors,
      elapsedMs: Date.now() - started
    };
  } catch (error) {
    database.finishCrawl(crawlId, error instanceof CrawlCancelledError ? "cancelled" : "failed");
    throw error;
  } finally {
    database.close();
  }
}
