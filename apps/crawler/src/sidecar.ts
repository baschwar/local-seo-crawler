import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { crawl } from "@seo-auditor/crawl-core";
import { ProjectDatabase } from "@seo-auditor/database";
import { exportFindingsCsv, exportUrlsCsv } from "@seo-auditor/reporting";
import { DEFAULT_SEO_RULE_SETTINGS, type CrawlOptions, type FindingFilters, type FindingStatus, type SidecarMessage } from "@seo-auditor/shared-types";
import { runTechnicalAuditLifecycle, type TechnicalAuditEvent } from "./technical-audit.js";
import { runCrawlWorkflow } from "./crawl-workflow.js";
import { queryProjectFindings } from "./project-query.js";

class CrawlController {
  paused = false;
  cancelled = false;
  private waiters: Array<() => void> = [];

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; this.waiters.splice(0).forEach((resolve) => resolve()); }
  cancel(): void { this.cancelled = true; this.resume(); }
  waitIfPaused(): Promise<void> { return this.paused ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve(); }
}

let active: { controller: CrawlController; crawlId?: string; projectPath: string } | undefined;
const libraryPath = join(homedir(), ".local-seo-auditor", "projects.json");

function send(type: string, payload: unknown, id: string = crypto.randomUUID()): void {
  const message: SidecarMessage = { id, type, timestamp: new Date().toISOString(), payload };
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function requirePath(payload: unknown): string {
  const projectPath = (payload as { projectPath?: unknown }).projectPath;
  if (typeof projectPath !== "string" || !projectPath.trim()) throw new Error("projectPath is required.");
  return normalizeProjectPath(projectPath);
}

function normalizeProjectPath(projectPath: string): string {
  const expanded = projectPath === "~" || projectPath.startsWith("~/")
    ? join(homedir(), projectPath.slice(2))
    : projectPath;
  return isAbsolute(expanded) ? expanded : resolve(join(homedir(), "Documents", "Local SEO Auditor"), expanded);
}

function readLibrary(): string[] {
  try {
    const paths = JSON.parse(readFileSync(libraryPath, "utf8")) as unknown;
    return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string" && existsSync(path)) : [];
  } catch { return []; }
}

function registerProject(projectPath: string): void {
  const entries = [projectPath, ...readLibrary().filter((entry) => entry !== projectPath)].slice(0, 50);
  mkdirSync(join(homedir(), ".local-seo-auditor"), { recursive: true });
  writeFileSync(libraryPath, JSON.stringify(entries, null, 2), { encoding: "utf8", mode: 0o600 });
}

function priorityCounts(database: ProjectDatabase, crawlId: string): Record<string, number> {
  const result: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, review: 0, informational: 0 };
  for (const row of database.db.prepare("SELECT priority, COUNT(*) AS count FROM findings WHERE crawl_id = ? AND status = 'open' GROUP BY priority").all(crawlId) as Array<{ priority: string; count: number }>) result[row.priority] = row.count;
  return result;
}

function openProject(projectPath: string, requestedCrawlId?: string) {
  const database = new ProjectDatabase(projectPath);
  try {
    const project = database.db.prepare("SELECT name, domain, settings_json FROM projects LIMIT 1").get() as { name: string; domain: string; settings_json: string } | undefined;
    if (!project) throw new Error("The project file does not contain a project record.");
    const crawl = (requestedCrawlId
      ? database.db.prepare("SELECT id, status, started_at, completed_at, total_urls FROM crawls WHERE id = ?").get(requestedCrawlId)
      : database.db.prepare("SELECT id, status, started_at, completed_at, total_urls FROM crawls ORDER BY started_at DESC LIMIT 1").get()) as { id: string; status: string; started_at: string; completed_at: string | null; total_urls: number } | undefined;
    if (!crawl) {
      registerProject(database.path);
      return {
        summary: {
          projectPath: database.path, name: project.name, domain: project.domain, crawlStatus: "draft", totalUrls: 0,
          indexableUrls: 0, nonIndexableUrls: 0, errors: 0, redirects: 0, openFindings: 0,
          priorityCounts: { critical: 0, high: 0, medium: 0, low: 0, review: 0, informational: 0 }, categoryCounts: []
        }, findings: [], findingTotal: 0, history: [], crawlSettings: JSON.parse(project.settings_json) as CrawlOptions
      };
    }
    const crawlId = crawl.id;
    const counts = database.db.prepare(`
      SELECT
        SUM(CASE WHEN is_indexable = 1 THEN 1 ELSE 0 END) AS indexable,
        SUM(CASE WHEN is_indexable = 0 THEN 1 ELSE 0 END) AS non_indexable,
        SUM(CASE WHEN status_code >= 400 OR error_type IS NOT NULL THEN 1 ELSE 0 END) AS errors,
        SUM(CASE WHEN status_code BETWEEN 300 AND 399 THEN 1 ELSE 0 END) AS redirects
      FROM urls WHERE crawl_id = ?
    `).get(crawlId) as { indexable: number | null; non_indexable: number | null; errors: number | null; redirects: number | null };
    const categoryCounts = database.db.prepare(`
      SELECT category, COUNT(*) AS count,
        MIN(CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 WHEN 'review' THEN 5 ELSE 6 END) AS priority_rank
      FROM findings WHERE crawl_id = ? AND status = 'open' GROUP BY category ORDER BY count DESC
    `).all(crawlId).map((row) => {
      const item = row as { category: string; count: number; priority_rank: number };
      return { category: item.category, count: item.count, highestPriority: (["critical", "high", "medium", "low", "review", "informational"] as const)[item.priority_rank - 1] ?? null };
    });
    const findings = database.listFindings(crawlId, { status: "open" }, 100, 0);
    const findingTotal = database.countFindings(crawlId, { status: "open" });
    const history = database.crawlHistory();
    const selectedHistory = history.find((entry) => entry.crawlId === crawlId);
    registerProject(database.path);
    return {
      summary: {
        projectPath: database.path, name: project.name, domain: project.domain, crawlId, crawlStatus: crawl.status,
        startedAt: crawl.started_at, ...(crawl.completed_at ? { completedAt: crawl.completed_at } : {}), totalUrls: crawl.total_urls,
        indexableUrls: counts.indexable ?? 0, nonIndexableUrls: counts.non_indexable ?? 0, errors: counts.errors ?? 0, redirects: counts.redirects ?? 0,
        openFindings: findingTotal, priorityCounts: priorityCounts(database, crawlId), categoryCounts,
        ...(selectedHistory?.technicalAuditStatus ? { technicalAuditStatus: selectedHistory.technicalAuditStatus } : {}),
        ...(selectedHistory?.technicalAuditError ? { technicalAuditError: selectedHistory.technicalAuditError } : {})
      }, findings, findingTotal, history, crawlSettings: database.crawlSettings(crawlId)
    };
  } finally { database.close(); }
}

function listProjects() {
  return readLibrary().flatMap((projectPath) => {
    try {
      const result = openProject(projectPath);
      return [{ projectPath, summary: result.summary }];
    } catch { return []; }
  });
}

function inspectUrl(projectPath: string, url: string, requestedCrawlId?: string) {
  const database = new ProjectDatabase(projectPath);
  try {
    const crawlId = requestedCrawlId ?? database.latestCrawlId();
    const page = database.db.prepare("SELECT * FROM urls WHERE crawl_id = ? AND normalized_url = ?").get(crawlId, url) as Record<string, unknown> | undefined;
    if (!page) throw new Error(`URL not found in latest crawl: ${url}`);
    const id = Number(page.id);
    const elements = database.db.prepare("SELECT * FROM page_elements WHERE url_id = ? ORDER BY element_type, element_index").all(id) as Array<Record<string, unknown>>;
    const links = database.db.prepare("SELECT * FROM links WHERE crawl_id = ? AND (source_url_id = ? OR destination_url_id = ?)").all(crawlId, id, id) as Array<Record<string, unknown>>;
    const images = database.db.prepare("SELECT * FROM images WHERE crawl_id = ? AND source_url_id = ?").all(crawlId, id) as Array<Record<string, unknown>>;
    const findings = database.listFindings(crawlId, { pageUrl: url });
    return { url: page, elements, links, images, findings };
  } finally { database.close(); }
}

async function startCrawl(projectPath: string, rawOptions: unknown, id: string): Promise<void> {
  if (active) throw new Error("A crawl is already active.");
  const options = rawOptions as Partial<CrawlOptions>;
  if (!options.startUrl || !options.projectName) throw new Error("crawl.start requires startUrl and projectName.");
  const resolvedProjectPath = normalizeProjectPath(projectPath);
  const controller = new CrawlController();
  active = { controller, projectPath: resolvedProjectPath };
  registerProject(resolvedProjectPath);
  send("crawl.started", {
    projectPath: resolvedProjectPath,
    startUrl: options.startUrl,
    maxUrls: options.maxUrls ?? 0
  }, id);
  const crawlPromise = crawl({
    ...options,
    projectPath: resolvedProjectPath,
    includeSubdomains: options.includeSubdomains ?? false,
    respectRobotsTxt: options.respectRobotsTxt ?? true,
    userAgent: options.userAgent ?? "LocalSEOAuditor/0.3 (+local desktop audit tool)",
    maxConcurrency: options.maxConcurrency ?? 5,
    requestsPerSecond: options.requestsPerSecond ?? 2,
    maxUrls: options.maxUrls ?? 0,
    maxDepth: options.maxDepth ?? 100,
    timeoutMs: options.timeoutMs ?? 30_000,
    maxResponseBytes: options.maxResponseBytes ?? 20 * 1024 * 1024,
    maxRedirects: options.maxRedirects ?? 10,
    maxRetries: options.maxRetries ?? 2,
    checkExternalLinks: options.checkExternalLinks ?? true,
    seo: options.seo ?? { ...DEFAULT_SEO_RULE_SETTINGS }
  } as CrawlOptions, {
    onProgress: (progress) => send("crawl.progress", { ...progress, state: controller.paused ? "paused" : "running" }, id),
    waitIfPaused: () => controller.waitIfPaused(),
    isCancelled: () => controller.cancelled
  });
  void runCrawlWorkflow(crawlPromise, resolvedProjectPath, () => controller.cancelled, (event) => send(event.type, event.payload, id))
    .finally(() => { active = undefined; });
}

function saveDraft(projectPath: string, rawOptions: unknown, id: string): void {
  const options = rawOptions as Partial<CrawlOptions>;
  if (!options.startUrl || !options.projectName) throw new Error("project.draft.save requires startUrl and projectName.");
  const resolvedProjectPath = normalizeProjectPath(projectPath);
  const startUrl = new URL(options.startUrl);
  const settings = { ...options, projectPath: resolvedProjectPath } as CrawlOptions;
  const database = new ProjectDatabase(resolvedProjectPath);
  try { database.createOrOpenProject(options.projectName, startUrl.hostname, settings); } finally { database.close(); }
  registerProject(resolvedProjectPath);
  send("project.draft.saved", { projectPath: resolvedProjectPath }, id);
}

async function handle(message: SidecarMessage): Promise<void> {
  const payload = message.payload;
  switch (message.type) {
    case "project.library.list": send("project.library.loaded", { projects: listProjects() }, message.id); break;
    case "project.open": { const input = payload as { crawlId?: string }; const result = openProject(requirePath(payload), input.crawlId); send("project.opened", result, message.id); break; }
    case "project.draft.save": { const input = payload as { projectPath?: string; options?: unknown }; saveDraft(requirePath(payload), input.options, message.id); break; }
    case "findings.list": { const projectPath = requirePath(payload); const input = payload as { crawlId?: string; filters?: FindingFilters; page?: number; pageSize?: number }; let crawlId = input.crawlId; if (!crawlId) { const database = new ProjectDatabase(projectPath); try { crawlId = database.latestCrawlId(); } finally { database.close(); } } send("findings.loaded", queryProjectFindings(projectPath, crawlId, input.filters, input.page, input.pageSize), message.id); break; }
    case "url.inspect": { const input = payload as { projectPath?: string; url?: string; crawlId?: string }; if (!input.url) throw new Error("url.inspect requires a URL."); send("url.inspected", { inspector: inspectUrl(requirePath(payload), input.url, input.crawlId) }, message.id); break; }
    case "finding.status": { const input = payload as { projectPath?: string; findingId?: string; status?: FindingStatus }; if (!input.findingId || !input.status) throw new Error("finding.status requires findingId and status."); const database = new ProjectDatabase(requirePath(payload)); try { database.updateFindingStatus(input.findingId, input.status); } finally { database.close(); } send("finding.updated", { findingId: input.findingId, status: input.status }, message.id); break; }
    case "finding.notes": { const input = payload as { projectPath?: string; findingId?: string; notes?: string }; if (!input.findingId || typeof input.notes !== "string") throw new Error("finding.notes requires findingId and notes."); const database = new ProjectDatabase(requirePath(payload)); try { database.updateFindingNotes(input.findingId, input.notes); } finally { database.close(); } send("finding.updated", { findingId: input.findingId, notes: input.notes }, message.id); break; }
    case "audit.technical-seo.start": { const projectPath = requirePath(payload); const input = payload as { crawlId?: string }; const database = new ProjectDatabase(projectPath); let crawlId: string; try { crawlId = input.crawlId ?? database.latestCrawlId(); } finally { database.close(); } await runTechnicalAuditLifecycle(projectPath, crawlId, (event) => send(event.type, event.payload, message.id)); break; }
    case "crawl.start": { const input = payload as { projectPath?: string; options?: unknown }; await startCrawl(requirePath(payload), input.options, message.id); break; }
    case "crawl.pause": { if (!active) throw new Error("No crawl is active."); active.controller.pause(); send("crawl.paused", { projectPath: active.projectPath }, message.id); break; }
    case "crawl.resume": { if (!active) throw new Error("No crawl is active."); active.controller.resume(); send("crawl.resumed", { projectPath: active.projectPath }, message.id); break; }
    case "crawl.cancel": { if (!active) throw new Error("No crawl is active."); active.controller.cancel(); send("crawl.cancelling", { projectPath: active.projectPath }, message.id); break; }
    case "crawl.status": send("crawl.status", active ? { state: active.controller.paused ? "paused" : "running", projectPath: active.projectPath } : { state: "idle" }, message.id); break;
    case "export.csv": { const input = payload as { projectPath?: string; type?: "urls" | "findings"; outputPath?: string }; if (!input.outputPath || !input.type) throw new Error("export.csv requires type and outputPath."); const result = input.type === "urls" ? await exportUrlsCsv(requirePath(payload), input.outputPath) : await exportFindingsCsv(requirePath(payload), input.outputPath); send("export.completed", result, message.id); break; }
    default: throw new Error(`Unsupported sidecar command: ${message.type}`);
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  void (async () => {
    try { await handle(JSON.parse(line) as SidecarMessage); }
    catch (error) { send("error", { message: error instanceof Error ? error.message : String(error) }); }
  })();
});
