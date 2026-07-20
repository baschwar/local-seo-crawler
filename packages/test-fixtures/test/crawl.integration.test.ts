import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawl } from "@seo-auditor/crawl-core";
import { ProjectDatabase } from "@seo-auditor/database";
import { exportUrlsCsv } from "@seo-auditor/reporting";
import { exportFindingsCsv } from "@seo-auditor/reporting";
import { runTechnicalSeoAudit } from "@seo-auditor/seo-rules";
import { DEFAULT_CRAWL_OPTIONS } from "@seo-auditor/shared-types";
import { runCrawlWorkflow } from "../../../apps/crawler/src/crawl-workflow.js";
import { queryProjectFindings } from "../../../apps/crawler/src/project-query.js";
import { runTechnicalAuditLifecycle } from "../../../apps/crawler/src/technical-audit.js";
import { createFixtureSite, type FixtureSite } from "../src/index.js";

describe("Milestone 1 fixture crawl", () => {
  let site: FixtureSite;
  let directory: string;
  let projectPath: string;
  let outputPath: string;
  let findingsOutputPath: string;
  let crawlId: string;
  const lifecycleEvents: string[] = [];

  beforeAll(async () => {
    site = await createFixtureSite();
    directory = await mkdtemp(join(tmpdir(), "seo-auditor-test-"));
    projectPath = join(directory, "fixture.seocrawl");
    outputPath = join(directory, "fixture-urls.csv");
    findingsOutputPath = join(directory, "fixture-findings.csv");
    const crawlPromise = crawl({
      ...DEFAULT_CRAWL_OPTIONS,
      startUrl: site.origin,
      projectPath,
      projectName: "Fixture integration test",
      maxConcurrency: 20,
      requestsPerSecond: 1000,
      timeoutMs: 5_000,
      checkExternalLinks: true
    });
    const summary = await runCrawlWorkflow(crawlPromise, projectPath, () => false, (event) => lifecycleEvents.push(event.type));
    if (!summary) throw new Error("Fixture crawl unexpectedly failed.");
    crawlId = summary.crawlId;
  });

  afterAll(async () => {
    if (site) await site.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("discovers 100+ internal pages without normalized URL duplicates", () => {
    const database = new ProjectDatabase(projectPath);
    const totals = database.db.prepare(`
      SELECT COUNT(*) AS total, COUNT(DISTINCT normalized_url) AS unique_total
      FROM urls WHERE crawl_id = ?
    `).get(crawlId) as { total: number; unique_total: number };
    expect(totals.total).toBeGreaterThanOrEqual(113);
    expect(totals.unique_total).toBe(totals.total);
    database.close();
  });

  it("records internal and external source relationships", () => {
    const database = new ProjectDatabase(projectPath);
    const external = database.db.prepare("SELECT * FROM links WHERE crawl_id = ? AND is_internal = 0").get(crawlId) as Record<string, unknown>;
    const inlinks = database.db.prepare(`
      SELECT COUNT(*) AS count FROM links l
      JOIN urls u ON u.id = l.destination_url_id
      WHERE l.crawl_id = ? AND u.normalized_url = ?
    `).get(crawlId, `${site.origin}/page-1`) as { count: number };
    expect(external.destination_url).toContain("127.0.0.1");
    expect(external.destination_status_code).toBe(204);
    expect(inlinks.count).toBeGreaterThanOrEqual(2);
    database.close();
  });

  it("blocks robots-disallowed URLs without fetching them", () => {
    const database = new ProjectDatabase(projectPath);
    const blocked = database.db.prepare("SELECT * FROM urls WHERE crawl_id = ? AND normalized_url = ?").get(crawlId, `${site.origin}/blocked`) as Record<string, unknown>;
    expect(blocked.indexability_reason).toBe("blocked_by_robots");
    expect(blocked.robots_rule).toBe("Disallow: /blocked");
    expect(site.requests.get("/blocked") ?? 0).toBe(0);
    expect(site.requests.get("/robots.txt")).toBe(1);
    database.close();
  });

  it("stores redirect history and broken response data", () => {
    const database = new ProjectDatabase(projectPath);
    const redirect = database.db.prepare("SELECT id FROM urls WHERE crawl_id = ? AND normalized_url = ?").get(crawlId, `${site.origin}/redirect-start`) as { id: number };
    const hops = database.db.prepare("SELECT * FROM redirects WHERE source_url_id = ? ORDER BY hop_number").all(redirect.id) as Record<string, unknown>[];
    const missing = database.db.prepare("SELECT status_code, indexability_reason FROM urls WHERE crawl_id = ? AND normalized_url = ?").get(crawlId, `${site.origin}/missing`) as Record<string, unknown>;
    expect(hops).toHaveLength(2);
    expect(hops.map((hop) => hop.status_code)).toEqual([301, 302]);
    expect(missing).toMatchObject({ status_code: 404, indexability_reason: "error" });
    database.close();
  });

  it("extracts metadata, images, crawl depth, and hashes", () => {
    const database = new ProjectDatabase(projectPath);
    const page = database.db.prepare("SELECT * FROM urls WHERE crawl_id = ? AND normalized_url = ?").get(crawlId, `${site.origin}/page-42`) as Record<string, unknown>;
    const elements = database.db.prepare("SELECT element_type, value FROM page_elements WHERE url_id = ?").all(page.id) as Record<string, unknown>[];
    const images = database.db.prepare("SELECT COUNT(*) AS count FROM images WHERE crawl_id = ?").get(crawlId) as { count: number };
    expect(page).toMatchObject({ depth: 1, word_count: 18, status_code: 200 });
    expect(page.html_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(elements).toContainEqual({ element_type: "title", value: "Fixture page 42" });
    expect(images.count).toBe(2);
    database.close();
  });

  it("persists SQLite data incrementally and exports all URLs to CSV", async () => {
    expect((await stat(projectPath)).size).toBeGreaterThan(0);
    const result = await exportUrlsCsv(projectPath, outputPath);
    const csv = await readFile(outputPath, "utf8");
    expect(result.rows).toBeGreaterThanOrEqual(113);
    expect(csv).toContain("normalized_url");
    expect(csv).toContain(`${site.origin}/page-105`);
  });

  it("generates actionable technical SEO findings, preserves statuses, filters, and exports them", async () => {
    const database = new ProjectDatabase(projectPath);
    const findings = database.listFindings(crawlId);
    expect(findings.length).toBeGreaterThan(100);
    expect(findings.some((item) => item.ruleId === "missing-title" && item.pageUrl.endsWith("/missing-title"))).toBe(true);
    expect(findings.some((item) => item.ruleId === "multiple-titles" && item.pageUrl.endsWith("/multiple-title"))).toBe(true);
    expect(findings.some((item) => item.ruleId === "missing-h1" && item.pageUrl.endsWith("/no-h1"))).toBe(true);
    expect(findings.some((item) => item.ruleId === "redirect-chain" && item.pageUrl.endsWith("/redirect-start"))).toBe(true);
    expect(findings.some((item) => item.ruleId === "duplicate-htmlHash" && item.pageUrl.endsWith("/duplicate-a"))).toBe(true);
    expect(findings.some((item) => item.ruleId === "canonical-target-issue" && item.pageUrl.endsWith("/bad-canonical"))).toBe(true);
    const titleFindings = database.listFindings(crawlId, { category: "titles", status: "open" });
    expect(titleFindings.length).toBeGreaterThan(0);
    const ignored = findings.find((item) => item.ruleId === "missing-title");
    expect(ignored).toBeDefined();
    database.updateFindingStatus(ignored?.id ?? "", "ignored");
    database.close();
    await runTechnicalSeoAudit(projectPath, crawlId);
    const reopened = new ProjectDatabase(projectPath);
    expect(reopened.listFindings(crawlId, { status: "ignored" }).some((item) => item.id === ignored?.id)).toBe(true);
    reopened.close();
    const result = await exportFindingsCsv(projectPath, findingsOutputPath);
    expect(result.rows).toBeGreaterThan(100);
    expect(await readFile(findingsOutputPath, "utf8")).toContain("recommended_action");
  });

  it("automatically completes one persisted audit and serves populated desktop findings", () => {
    expect(lifecycleEvents.filter((type) => type === "technical-audit-started")).toHaveLength(1);
    expect(lifecycleEvents.filter((type) => type === "technical-audit-completed")).toHaveLength(1);
    const result = queryProjectFindings(projectPath, crawlId, { status: "open" }, 1, 25);
    expect(result.total).toBeGreaterThan(0);
    expect(result.findings.length).toBeGreaterThan(0);
    const database = new ProjectDatabase(projectPath);
    const audit = database.db.prepare("SELECT status, finding_count FROM technical_audits WHERE crawl_id = ? ORDER BY started_at DESC LIMIT 1").get(crawlId) as { status: string; finding_count: number };
    expect(audit.status).toBe("completed");
    expect(audit.finding_count).toBeGreaterThan(0);
    database.close();
  });

  it("keeps a successful crawl intact after audit failure and retry repopulates findings", async () => {
    const database = new ProjectDatabase(projectPath);
    database.db.prepare("DELETE FROM findings WHERE crawl_id = ?").run(crawlId);
    const before = database.db.prepare("SELECT status FROM crawls WHERE id = ?").get(crawlId) as { status: string };
    database.close();
    const failedEvents: string[] = [];
    const failed = await runTechnicalAuditLifecycle(projectPath, crawlId, (event) => failedEvents.push(event.type), async () => { throw new Error(`token=private-value at ${projectPath}`); });
    expect(failed.ok).toBe(false);
    expect(failedEvents).toEqual(["technical-audit-started", "technical-audit-failed"]);
    const afterFailure = new ProjectDatabase(projectPath);
    expect((afterFailure.db.prepare("SELECT status FROM crawls WHERE id = ?").get(crawlId) as { status: string }).status).toBe(before.status);
    const failedAudit = afterFailure.db.prepare("SELECT status, error_message FROM technical_audits WHERE crawl_id = ? ORDER BY started_at DESC LIMIT 1").get(crawlId) as { status: string; error_message: string };
    expect(failedAudit.status).toBe("failed");
    expect(failedAudit.error_message).not.toContain("private-value");
    expect(failedAudit.error_message).not.toContain(projectPath);
    afterFailure.close();
    const retry = await runTechnicalAuditLifecycle(projectPath, crawlId, () => undefined);
    expect(retry.ok).toBe(true);
    expect(queryProjectFindings(projectPath, crawlId).total).toBeGreaterThan(0);
  });
});
