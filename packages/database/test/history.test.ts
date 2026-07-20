import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectDatabase } from "../src/index.js";
import { DEFAULT_CRAWL_OPTIONS, type AuditFinding, type CrawlOptions } from "@seo-auditor/shared-types";

const directories: string[] = [];
const settings: CrawlOptions = { ...DEFAULT_CRAWL_OPTIONS, startUrl: "https://example.com/", projectPath: "", projectName: "History test" };

async function database() {
  const directory = await mkdtemp(join(tmpdir(), "seo-history-test-"));
  directories.push(directory);
  const path = join(directory, "history.seocrawl");
  return { path, db: new ProjectDatabase(path) };
}

function finding(crawlId: string): AuditFinding {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), crawlId, ruleId: "missing-title", category: "titles", priority: "high", originalPriority: "high", pageUrl: "https://example.com/page", title: "Missing title", whatWasFound: "No title.", whyItMatters: "Context.", evidence: { summary: "No title", details: {} }, recommendedAction: "Add a title.", firstDetectedAt: now, lastDetectedAt: now, status: "open" };
}

function completedCrawl(db: ProjectDatabase, projectId: string, path: string) {
  const crawlId = db.startCrawl(projectId, settings.startUrl, { ...settings, projectPath: path });
  db.discoverUrl(crawlId, { originalUrl: "https://example.com/page", normalizedUrl: "https://example.com/page", scheme: "https", host: "example.com", path: "/page", query: "", fragment: "", depth: 0, discoverySource: "start", isInternal: true });
  db.finishCrawl(crawlId, "completed");
  return crawlId;
}

afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("crawl history and finding identity", () => {
  it("migrates to schema 3 and retains ignored status and notes on recurrence", async () => {
    const item = await database();
    const projectId = item.db.createOrOpenProject("History", "example.com", { ...settings, projectPath: item.path });
    const first = completedCrawl(item.db, projectId, item.path);
    item.db.replaceFindings(first, [finding(first)]);
    const firstFinding = item.db.listFindings(first)[0];
    expect(firstFinding).toBeDefined();
    item.db.updateFindingStatus(firstFinding?.id ?? "", "ignored");
    item.db.updateFindingNotes(firstFinding?.id ?? "", "Keep ignored for this template.");
    const second = completedCrawl(item.db, projectId, item.path);
    item.db.replaceFindings(second, [finding(second)]);
    const recurring = item.db.listFindings(second)[0];
    expect(recurring).toMatchObject({ status: "ignored", notes: "Keep ignored for this template.", recurring: true });
    expect(item.db.listFindings(first)[0]).toMatchObject({ status: "ignored", recurring: false });
    expect(item.db.crawlHistory()).toHaveLength(2);
    expect((item.db.db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version).toBe(3);
    item.db.close();
    const reopened = new ProjectDatabase(item.path);
    expect(reopened.listFindings(second)[0]).toMatchObject({ status: "ignored", notes: "Keep ignored for this template.", recurring: true });
    reopened.close();
  });

  it("reopens a resolved finding when it reappears", async () => {
    const item = await database();
    const projectId = item.db.createOrOpenProject("History", "example.com", { ...settings, projectPath: item.path });
    const first = completedCrawl(item.db, projectId, item.path);
    item.db.replaceFindings(first, [finding(first)]);
    item.db.updateFindingStatus(item.db.listFindings(first)[0]?.id ?? "", "resolved");
    const second = completedCrawl(item.db, projectId, item.path);
    item.db.replaceFindings(second, [finding(second)]);
    expect(item.db.listFindings(second)[0]).toMatchObject({ status: "open", recurring: true });
    item.db.close();
  });
});
