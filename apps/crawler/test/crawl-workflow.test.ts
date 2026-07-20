import { describe, expect, it, vi } from "vitest";
import type { CrawlSummary } from "@seo-auditor/shared-types";
import { runCrawlWorkflow } from "../src/crawl-workflow.js";

const summary: CrawlSummary = {
  projectId: "project-1",
  crawlId: "crawl-1",
  projectPath: "/tmp/project.seocrawl",
  status: "completed",
  totalUrls: 2,
  fetchedUrls: 2,
  blockedUrls: 0,
  errorUrls: 0,
  elapsedMs: 10
};

describe("desktop crawl workflow", () => {
  it("triggers the technical audit exactly once after a completed crawl", async () => {
    const events: string[] = [];
    const audit = vi.fn(async (_path, _crawlId, emit) => {
      emit({ type: "technical-audit-started", payload: { projectPath: summary.projectPath, crawlId: summary.crawlId } });
      emit({ type: "technical-audit-completed", payload: { projectPath: summary.projectPath, crawlId: summary.crawlId, findingCount: 3 } });
      return { ok: true as const, findingCount: 3 };
    });
    await runCrawlWorkflow(Promise.resolve(summary), summary.projectPath, () => false, (event) => events.push(event.type), audit);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["crawl.completed", "technical-audit-started", "technical-audit-completed"]);
  });

  it("does not run an automatic audit for a cancelled crawl", async () => {
    const events: string[] = [];
    const audit = vi.fn();
    await runCrawlWorkflow(Promise.reject(new Error("cancelled")), summary.projectPath, () => true, (event) => events.push(event.type), audit);
    expect(audit).not.toHaveBeenCalled();
    expect(events).toEqual(["crawl.cancelled"]);
  });
});
