import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AuditContext,
  AuditFinding,
  AuditLink,
  AuditImage,
  AuditElement,
  AuditPage,
  AuditRedirect,
  CrawlOptions,
  CrawlHistoryEntry,
  CrawlStatus,
  DiscoveredUrl,
  PageMetadata,
  RedirectHop,
  FindingFilters
} from "@seo-auditor/shared-types";
import { initialMigration } from "./migrations/0001-initial.js";
import { findingsMigration } from "./migrations/0002-findings.js";
import { auditHistoryMigration } from "./migrations/0003-audit-history.js";

function normalizeIdentityPart(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
    return url.toString();
  } catch {
    return trimmed.replace(/\s+/g, " ").toLocaleLowerCase();
  }
}

export function findingIdentity(finding: Pick<AuditFinding, "ruleId" | "pageUrl" | "sourceUrl" | "destinationUrl" | "evidence">): string {
  const details = finding.evidence.details;
  const discriminator = finding.destinationUrl
    ?? (finding.sourceUrl && finding.sourceUrl !== finding.pageUrl ? finding.sourceUrl : undefined)
    ?? (typeof details.selector === "string" ? details.selector : undefined)
    ?? (typeof details.target === "string" ? details.target : undefined)
    ?? "";
  return [finding.ruleId, finding.pageUrl, discriminator].map(normalizeIdentityPart).join("\u0000");
}

export interface UrlCompletion {
  finalUrl?: string;
  contentType?: string;
  statusCode?: number;
  responseTimeMs?: number;
  responseSizeBytes?: number;
  isIndexable?: boolean;
  indexabilityReason: string;
  robotsRule?: string;
  errorType?: string;
  errorMessage?: string;
  metadata?: PageMetadata;
}

export interface RequestRecord {
  startedAt: string;
  completedAt: string;
  attempt: number;
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string | string[]>;
  errorType?: string;
  errorMessage?: string;
}

export class ProjectDatabase {
  readonly path: string;
  readonly db: Database.Database;

  constructor(projectPath: string) {
    this.path = resolve(projectPath);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new Database(this.path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    const applied = this.db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => (row as { version: number }).version);
    for (const migration of [initialMigration, findingsMigration, auditHistoryMigration]) {
      if (applied.includes(migration.version)) continue;
      this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db
          .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(migration.version, migration.name, new Date().toISOString());
      })();
    }
  }

  createOrOpenProject(name: string, domain: string, settings: CrawlOptions): string {
    const existing = this.db.prepare("SELECT id FROM projects LIMIT 1").get() as
      | { id: string }
      | undefined;
    const now = new Date().toISOString();
    if (existing) {
      this.db
        .prepare("UPDATE projects SET name = ?, domain = ?, updated_at = ?, settings_json = ?, schema_version = ? WHERE id = ?")
        .run(name, domain, now, JSON.stringify(settings), auditHistoryMigration.version, existing.id);
      return existing.id;
    }
    const id = randomUUID();
    this.db
      .prepare(`
        INSERT INTO projects (id, name, domain, created_at, updated_at, settings_json, schema_version)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, name, domain, now, now, JSON.stringify(settings), auditHistoryMigration.version);
    return id;
  }

  startCrawl(projectId: string, startUrl: string, settings: CrawlOptions): string {
    const id = randomUUID();
    this.db
      .prepare(`
        INSERT INTO crawls (id, project_id, started_at, status, start_url, settings_json)
        VALUES (?, ?, ?, 'running', ?, ?)
      `)
      .run(id, projectId, new Date().toISOString(), startUrl, JSON.stringify(settings));
    return id;
  }

  finishCrawl(crawlId: string, status: CrawlStatus): void {
    const total = this.db
      .prepare("SELECT COUNT(*) AS count FROM urls WHERE crawl_id = ?")
      .get(crawlId) as { count: number };
    this.db
      .prepare("UPDATE crawls SET completed_at = ?, status = ?, total_urls = ? WHERE id = ?")
      .run(new Date().toISOString(), status, total.count, crawlId);
  }

  discoverUrl(crawlId: string, url: DiscoveredUrl): { id: number; inserted: boolean } {
    const result = this.db
      .prepare(`
        INSERT INTO urls (
          crawl_id, original_url, normalized_url, scheme, host, path, query, fragment,
          depth, discovery_source, is_internal, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(crawl_id, normalized_url) DO NOTHING
      `)
      .run(
        crawlId,
        url.originalUrl,
        url.normalizedUrl,
        url.scheme,
        url.host,
        url.path,
        url.query,
        url.fragment,
        url.depth,
        url.discoverySource,
        url.isInternal ? 1 : 0,
        new Date().toISOString()
      );
    const row = this.db
      .prepare("SELECT id FROM urls WHERE crawl_id = ? AND normalized_url = ?")
      .get(crawlId, url.normalizedUrl) as { id: number };
    return { id: row.id, inserted: result.changes === 1 };
  }

  completeUrl(urlId: number, result: UrlCompletion): void {
    const metadata = result.metadata;
    this.db.transaction(() => {
      this.db
        .prepare(`
          UPDATE urls SET
            final_url = ?, content_type = ?, status_code = ?, response_time_ms = ?,
            response_size_bytes = ?, word_count = ?, html_hash = ?, normalized_html_hash = ?,
            text_hash = ?, is_indexable = ?, indexability_reason = ?, robots_rule = ?,
            error_type = ?, error_message = ?, fetched_at = ?
          WHERE id = ?
        `)
        .run(
          result.finalUrl ?? null,
          result.contentType ?? null,
          result.statusCode ?? null,
          result.responseTimeMs ?? null,
          result.responseSizeBytes ?? null,
          metadata?.wordCount ?? null,
          metadata?.htmlHash ?? null,
          metadata?.normalizedHtmlHash ?? null,
          metadata?.textHash ?? null,
          result.isIndexable === undefined ? null : result.isIndexable ? 1 : 0,
          result.indexabilityReason,
          result.robotsRule ?? null,
          result.errorType ?? null,
          result.errorMessage ?? null,
          result.statusCode !== undefined ? new Date().toISOString() : null,
          urlId
        );
      if (metadata) {
        const insert = this.db.prepare(`
          INSERT INTO page_elements (url_id, element_type, element_index, value, dom_selector, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const element of metadata.elements) {
          insert.run(
            urlId,
            element.type,
            element.index,
            element.value,
            element.domSelector ?? null,
            JSON.stringify(element.metadata ?? {})
          );
        }
      }
    })();
  }

  recordRequest(urlId: number, request: RequestRecord): void {
    this.db
      .prepare(`
        INSERT INTO requests (
          url_id, started_at, completed_at, attempt, request_headers_json,
          response_headers_json, error_type, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        urlId,
        request.startedAt,
        request.completedAt,
        request.attempt,
        JSON.stringify(request.requestHeaders),
        JSON.stringify(request.responseHeaders ?? {}),
        request.errorType ?? null,
        request.errorMessage ?? null
      );
  }

  recordRedirects(crawlId: string, sourceUrlId: number, redirects: RedirectHop[]): void {
    const insert = this.db.prepare(`
      INSERT INTO redirects (
        crawl_id, source_url_id, hop_number, from_url, to_url, status_code, redirect_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.transaction(() => {
      for (const hop of redirects) {
        insert.run(
          crawlId,
          sourceUrlId,
          hop.hopNumber,
          hop.fromUrl,
          hop.toUrl,
          hop.statusCode,
          hop.redirectType
        );
      }
    })();
  }

  recordLink(input: {
    crawlId: string;
    sourceUrlId: number;
    destinationUrlId?: number;
    destinationUrl: string;
    linkType: string;
    anchorText: string;
    rel: string;
    isFollow: boolean;
    isInternal: boolean;
    domSelector?: string;
  }): number {
    const result = this.db
      .prepare(`
        INSERT INTO links (
          crawl_id, source_url_id, destination_url_id, destination_url, link_type,
          anchor_text, rel, is_follow, is_internal, dom_selector
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.crawlId,
        input.sourceUrlId,
        input.destinationUrlId ?? null,
        input.destinationUrl,
        input.linkType,
        input.anchorText,
        input.rel,
        input.isFollow ? 1 : 0,
        input.isInternal ? 1 : 0,
        input.domSelector ?? null
      );
    return Number(result.lastInsertRowid);
  }

  completeExternalLink(linkId: number, statusCode?: number, error?: string): void {
    this.db
      .prepare("UPDATE links SET destination_status_code = ?, destination_error = ? WHERE id = ?")
      .run(statusCode ?? null, error ?? null, linkId);
  }

  updateLinkDestinationId(crawlId: string, normalizedUrl: string, urlId: number): void {
    this.db
      .prepare("UPDATE links SET destination_url_id = ? WHERE crawl_id = ? AND destination_url = ?")
      .run(urlId, crawlId, normalizedUrl);
  }

  recordImages(crawlId: string, sourceUrlId: number, images: PageMetadata["images"]): void {
    const insert = this.db.prepare(`
      INSERT INTO images (
        crawl_id, source_url_id, image_url, alt_text, width, height, loading, dom_selector
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.transaction(() => {
      for (const image of images) {
        insert.run(
          crawlId,
          sourceUrlId,
          image.imageUrl,
          image.altText,
          image.width,
          image.height,
          image.loading,
          image.domSelector ?? null
        );
      }
    })();
  }

  latestCrawlId(): string {
    const row = this.db
      .prepare("SELECT id FROM crawls ORDER BY started_at DESC LIMIT 1")
      .get() as { id: string } | undefined;
    if (!row) throw new Error("The project does not contain a crawl.");
    return row.id;
  }

  crawlSettings(crawlId: string): CrawlOptions {
    const row = this.db
      .prepare("SELECT settings_json FROM crawls WHERE id = ?")
      .get(crawlId) as { settings_json: string } | undefined;
    if (!row) throw new Error(`Crawl not found: ${crawlId}`);
    return JSON.parse(row.settings_json) as CrawlOptions;
  }

  auditContext(crawlId: string, settings: AuditContext["settings"]): AuditContext {
    const pages = this.db.prepare(`
      SELECT id, normalized_url AS url, final_url AS finalUrl, status_code AS statusCode,
        content_type AS contentType, depth, is_internal AS isInternal,
        CASE WHEN is_indexable IS NULL THEN NULL WHEN is_indexable = 1 THEN 1 ELSE 0 END AS isIndexable,
        indexability_reason AS indexabilityReason, word_count AS wordCount,
        html_hash AS htmlHash, normalized_html_hash AS normalizedHtmlHash, text_hash AS textHash,
        path, query, error_type AS errorType, error_message AS errorMessage
      FROM urls WHERE crawl_id = ?
    `).all(crawlId).map((row) => {
      const item = row as Omit<AuditPage, "isInternal" | "isIndexable"> & { isInternal: number; isIndexable: 0 | 1 | null };
      return { ...item, isInternal: item.isInternal === 1, isIndexable: item.isIndexable === null ? null : item.isIndexable === 1 };
    }) as AuditPage[];
    const elements = this.db.prepare(`
      SELECT url_id AS urlId, element_type AS type, element_index AS "index", value,
        dom_selector AS selector, metadata_json AS metadataJson
      FROM page_elements WHERE url_id IN (SELECT id FROM urls WHERE crawl_id = ?)
    `).all(crawlId).map((row) => {
      const item = row as AuditElement & { metadataJson: string };
      return { ...item, metadata: JSON.parse(item.metadataJson) as Record<string, unknown> };
    }) as AuditElement[];
    const links = this.db.prepare(`
      SELECT id, source_url_id AS sourceUrlId, destination_url_id AS destinationUrlId,
        destination_url AS destinationUrl, anchor_text AS anchorText, rel,
        is_follow AS isFollow, is_internal AS isInternal, dom_selector AS selector,
        destination_status_code AS destinationStatusCode, destination_error AS destinationError
      FROM links WHERE crawl_id = ?
    `).all(crawlId).map((row) => {
      const item = row as Omit<AuditLink, "isFollow" | "isInternal"> & { isFollow: number; isInternal: number };
      return { ...item, isFollow: item.isFollow === 1, isInternal: item.isInternal === 1 };
    }) as AuditLink[];
    const images = this.db.prepare(`
      SELECT id, source_url_id AS sourceUrlId, image_url AS imageUrl, alt_text AS altText,
        width, height, size_bytes AS sizeBytes, dom_selector AS selector
      FROM images WHERE crawl_id = ?
    `).all(crawlId) as AuditImage[];
    const redirects = this.db.prepare(`
      SELECT source_url_id AS sourceUrlId, hop_number AS hopNumber, from_url AS fromUrl,
        to_url AS toUrl, status_code AS statusCode, redirect_type AS redirectType
      FROM redirects WHERE crawl_id = ? ORDER BY source_url_id, hop_number
    `).all(crawlId) as AuditRedirect[];
    return { crawlId, settings, pages, elements, links, images, redirects };
  }

  replaceFindings(crawlId: string, findings: AuditFinding[]): void {
    const existing = this.db.prepare(`
      SELECT f.*, u.normalized_url AS page_url
      FROM findings f LEFT JOIN urls u ON u.id = f.page_url_id
      WHERE f.crawl_id = ?
    `).all(crawlId) as Array<{ id: string; rule_id: string; page_url: string | null; source_url: string | null; destination_url: string | null; first_detected_at: string; status: string; notes: string | null }>;
    const existingByIdentity = new Map(existing.map((row) => [
      findingIdentity({
        ruleId: row.rule_id,
        pageUrl: row.page_url ?? "",
        ...(row.source_url ? { sourceUrl: row.source_url } : {}),
        ...(row.destination_url ? { destinationUrl: row.destination_url } : {}),
        evidence: { summary: "", details: {} }
      }),
      row
    ]));
    const previous = this.db.prepare(`
      SELECT f.*, c.started_at
      FROM findings f JOIN crawls c ON c.id = f.crawl_id
      WHERE f.crawl_id <> ? AND f.identity_key = ?
      ORDER BY c.started_at DESC LIMIT 1
    `);
    const pageIds = new Map((this.db.prepare("SELECT id, normalized_url FROM urls WHERE crawl_id = ?").all(crawlId) as Array<{ id: number; normalized_url: string }>).map((row) => [row.normalized_url, row.id]));
    const insert = this.db.prepare(`
      INSERT INTO findings (
        id, crawl_id, rule_id, category, priority, original_priority, page_url_id, source_url,
        destination_url, title, what_was_found, why_it_matters, evidence_json, recommended_action,
        review_guidance, status, first_detected_at, last_detected_at, notes,
        identity_key, recurring, review_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM findings WHERE crawl_id = ?").run(crawlId);
      const insertedIdentities = new Set<string>();
      for (const finding of findings) {
        const identity = findingIdentity(finding);
        if (insertedIdentities.has(identity)) continue;
        insertedIdentities.add(identity);
        const prior = existingByIdentity.get(identity);
        const previousRun = prior ? undefined : previous.get(crawlId, identity) as { status: string; notes: string | null; first_detected_at: string; recurring: number } | undefined;
        const retainedStatus = previousRun?.status === "resolved" ? "open" : previousRun?.status;
        const reviewType = finding.reviewType ?? (finding.reviewGuidance || finding.priority === "review" ? "manual-review" : "automatic");
        insert.run(
          prior?.id ?? finding.id,
          crawlId,
          finding.ruleId,
          finding.category,
          finding.priority,
          finding.originalPriority,
          pageIds.get(finding.pageUrl) ?? null,
          finding.sourceUrl ?? null,
          finding.destinationUrl ?? null,
          finding.title,
          finding.whatWasFound,
          finding.whyItMatters,
          JSON.stringify(finding.evidence),
          finding.recommendedAction,
          finding.reviewGuidance ?? null,
          prior?.status ?? retainedStatus ?? finding.status,
          prior?.first_detected_at ?? previousRun?.first_detected_at ?? finding.firstDetectedAt,
          finding.lastDetectedAt,
          prior?.notes ?? previousRun?.notes ?? finding.notes ?? null,
          identity,
          prior ? Number((prior as { recurring?: number }).recurring ?? 0) : previousRun ? 1 : 0,
          reviewType
        );
      }
    })();
  }

  listFindings(crawlId: string, filters: FindingFilters = {}, limit?: number, offset = 0): AuditFinding[] {
    const clauses = ["f.crawl_id = ?"];
    const values: string[] = [crawlId];
    if (filters.priority) { clauses.push("f.priority = ?"); values.push(filters.priority); }
    if (filters.category) { clauses.push("f.category = ?"); values.push(filters.category); }
    if (filters.status) { clauses.push("f.status = ?"); values.push(filters.status); }
    if (filters.pageUrl) { clauses.push("u.normalized_url LIKE ?"); values.push(`%${filters.pageUrl}%`); }
    if (filters.reviewType) { clauses.push("f.review_type = ?"); values.push(filters.reviewType); }
    if (filters.search) {
      clauses.push("(u.normalized_url LIKE ? OR f.title LIKE ? OR f.what_was_found LIKE ? OR f.recommended_action LIKE ? OR f.evidence_json LIKE ?)");
      const query = `%${filters.search}%`;
      values.push(query, query, query, query, query);
    }
    const pagination = limit === undefined ? "" : " LIMIT ? OFFSET ?";
    const parameters: Array<string | number> = [...values];
    if (limit !== undefined) parameters.push(limit, offset);
    return this.db.prepare(`
      SELECT f.*, u.normalized_url AS page_url
      FROM findings f JOIN urls u ON u.id = f.page_url_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY CASE f.priority
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3
        WHEN 'low' THEN 4 WHEN 'review' THEN 5 ELSE 6 END, f.title, u.normalized_url
      ${pagination}
    `).all(...parameters).map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: String(item.id), crawlId: String(item.crawl_id), ruleId: String(item.rule_id),
        category: String(item.category) as AuditFinding["category"], priority: String(item.priority) as AuditFinding["priority"],
        originalPriority: String(item.original_priority) as AuditFinding["originalPriority"], pageUrl: String(item.page_url),
        ...(item.source_url ? { sourceUrl: String(item.source_url) } : {}),
        ...(item.destination_url ? { destinationUrl: String(item.destination_url) } : {}),
        title: String(item.title), whatWasFound: String(item.what_was_found), whyItMatters: String(item.why_it_matters),
        evidence: JSON.parse(String(item.evidence_json)) as AuditFinding["evidence"], recommendedAction: String(item.recommended_action),
        ...(item.review_guidance ? { reviewGuidance: String(item.review_guidance) } : {}),
        firstDetectedAt: String(item.first_detected_at), lastDetectedAt: String(item.last_detected_at),
        status: String(item.status) as AuditFinding["status"], ...(item.notes ? { notes: String(item.notes) } : {}),
        identityKey: String(item.identity_key), recurring: Number(item.recurring) === 1,
        reviewType: String(item.review_type) as "automatic" | "manual-review"
      };
    });
  }

  countFindings(crawlId: string, filters: FindingFilters = {}): number {
    const clauses = ["f.crawl_id = ?"];
    const values: string[] = [crawlId];
    if (filters.priority) { clauses.push("f.priority = ?"); values.push(filters.priority); }
    if (filters.category) { clauses.push("f.category = ?"); values.push(filters.category); }
    if (filters.status) { clauses.push("f.status = ?"); values.push(filters.status); }
    if (filters.pageUrl) { clauses.push("u.normalized_url LIKE ?"); values.push(`%${filters.pageUrl}%`); }
    if (filters.reviewType) { clauses.push("f.review_type = ?"); values.push(filters.reviewType); }
    if (filters.search) {
      clauses.push("(u.normalized_url LIKE ? OR f.title LIKE ? OR f.what_was_found LIKE ? OR f.recommended_action LIKE ? OR f.evidence_json LIKE ?)");
      const query = `%${filters.search}%`;
      values.push(query, query, query, query, query);
    }
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM findings f JOIN urls u ON u.id = f.page_url_id WHERE ${clauses.join(" AND ")}`).get(...values) as { count: number };
    return row.count;
  }

  updateFindingStatus(findingId: string, status: AuditFinding["status"]): void {
    const result = this.db.prepare("UPDATE findings SET status = ? WHERE id = ?").run(status, findingId);
    if (result.changes !== 1) throw new Error(`Finding not found: ${findingId}`);
  }

  updateFindingNotes(findingId: string, notes: string): void {
    const result = this.db.prepare("UPDATE findings SET notes = ? WHERE id = ?").run(notes.trim() || null, findingId);
    if (result.changes !== 1) throw new Error(`Finding not found: ${findingId}`);
  }

  assertCrawlAuditable(crawlId: string): void {
    const row = this.db.prepare("SELECT status FROM crawls WHERE id = ?").get(crawlId) as { status: CrawlStatus } | undefined;
    if (!row) throw new Error(`Crawl not found: ${crawlId}`);
    if (row.status !== "completed" && row.status !== "completed_with_errors") throw new Error(`Technical SEO audit requires a completed crawl; current state is ${row.status}.`);
  }

  startTechnicalAudit(crawlId: string): string {
    this.assertCrawlAuditable(crawlId);
    const id = randomUUID();
    this.db.prepare("INSERT INTO technical_audits (id, crawl_id, started_at, status) VALUES (?, ?, ?, 'running')").run(id, crawlId, new Date().toISOString());
    return id;
  }

  finishTechnicalAudit(auditId: string, status: "completed" | "failed", findingCount?: number, errorMessage?: string): void {
    const result = this.db.prepare("UPDATE technical_audits SET completed_at = ?, status = ?, finding_count = ?, error_message = ? WHERE id = ?")
      .run(new Date().toISOString(), status, findingCount ?? null, errorMessage ?? null, auditId);
    if (result.changes !== 1) throw new Error(`Technical audit not found: ${auditId}`);
  }

  crawlHistory(): CrawlHistoryEntry[] {
    const rows = this.db.prepare(`
      SELECT c.id AS crawl_id, c.started_at, c.completed_at, c.status, c.total_urls,
        (SELECT COUNT(*) FROM findings f WHERE f.crawl_id = c.id) AS finding_count,
        a.status AS audit_status, a.error_message AS audit_error, a.finding_count AS audit_finding_count
      FROM crawls c
      LEFT JOIN technical_audits a ON a.id = (
        SELECT id FROM technical_audits WHERE crawl_id = c.id ORDER BY started_at DESC LIMIT 1
      )
      ORDER BY c.started_at DESC
    `).all() as Array<{ crawl_id: string; started_at: string; completed_at: string | null; status: CrawlStatus; total_urls: number; finding_count: number; audit_status: CrawlHistoryEntry["technicalAuditStatus"] | null; audit_error: string | null; audit_finding_count: number | null }>;
    return rows.map((row) => ({
      crawlId: row.crawl_id,
      startedAt: row.started_at,
      ...(row.completed_at ? { completedAt: row.completed_at, durationMs: Math.max(0, Date.parse(row.completed_at) - Date.parse(row.started_at)) } : {}),
      status: row.status,
      totalUrls: row.total_urls,
      findingCount: row.finding_count,
      ...(row.audit_status ? { technicalAuditStatus: row.audit_status } : {}),
      ...(row.audit_error ? { technicalAuditError: row.audit_error } : {}),
      ...(row.audit_finding_count !== null ? { technicalAuditFindingCount: row.audit_finding_count } : {})
    }));
  }

  close(): void {
    this.db.close();
  }
}

export { initialMigration } from "./migrations/0001-initial.js";
export { findingsMigration } from "./migrations/0002-findings.js";
export { auditHistoryMigration } from "./migrations/0003-audit-history.js";
