import type { CrawlSummary } from "@seo-auditor/shared-types";
import { redactAuditError, runTechnicalAuditLifecycle, type TechnicalAuditEvent } from "./technical-audit.js";

type CrawlEvent = TechnicalAuditEvent | { type: "crawl.completed" | "crawl.cancelled" | "crawl.failed"; payload: unknown };

export async function runCrawlWorkflow(
  crawlPromise: Promise<CrawlSummary>,
  projectPath: string,
  isCancelled: () => boolean,
  emit: (event: CrawlEvent) => void,
  audit: typeof runTechnicalAuditLifecycle = runTechnicalAuditLifecycle
): Promise<CrawlSummary | undefined> {
  let summary: CrawlSummary;
  try {
    summary = await crawlPromise;
  } catch (error) {
    if (isCancelled()) emit({ type: "crawl.cancelled", payload: { projectPath } });
    else emit({ type: "crawl.failed", payload: { projectPath, message: redactAuditError(error) } });
    return undefined;
  }
  emit({ type: "crawl.completed", payload: summary });
  await audit(projectPath, summary.crawlId, emit);
  return summary;
}
