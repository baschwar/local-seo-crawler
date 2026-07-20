import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { once } from "node:events";
import { ProjectDatabase } from "@seo-auditor/database";

export function protectSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function encodeCsvCell(value: unknown): string {
  const safe = protectSpreadsheetCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

async function writeChunk(stream: ReturnType<typeof createWriteStream>, chunk: string): Promise<void> {
  if (!stream.write(chunk)) await once(stream, "drain");
}

export async function exportUrlsCsv(projectPath: string, outputPath: string): Promise<{ rows: number; outputPath: string }> {
  if (!existsSync(projectPath)) throw new Error(`Project file does not exist: ${resolve(projectPath)}`);
  const database = new ProjectDatabase(projectPath);
  const crawlId = database.latestCrawlId();
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  const stream = createWriteStream(absoluteOutput, { encoding: "utf8" });
  const columns = [
    "original_url",
    "normalized_url",
    "final_url",
    "status_code",
    "content_type",
    "depth",
    "discovery_source",
    "is_internal",
    "is_indexable",
    "indexability_reason",
    "response_time_ms",
    "response_size_bytes",
    "word_count",
    "html_hash",
    "normalized_html_hash",
    "text_hash",
    "robots_rule",
    "error_type",
    "error_message",
    "internal_inlinks"
  ] as const;
  await writeChunk(stream, `${columns.join(",")}\n`);
  let rows = 0;
  const statement = database.db.prepare(`
    SELECT
      u.original_url,
      u.normalized_url,
      u.final_url,
      u.status_code,
      u.content_type,
      u.depth,
      u.discovery_source,
      u.is_internal,
      u.is_indexable,
      u.indexability_reason,
      u.response_time_ms,
      u.response_size_bytes,
      u.word_count,
      u.html_hash,
      u.normalized_html_hash,
      u.text_hash,
      u.robots_rule,
      u.error_type,
      u.error_message,
      (SELECT COUNT(*) FROM links l WHERE l.crawl_id = u.crawl_id AND l.destination_url_id = u.id) AS internal_inlinks
    FROM urls u
    WHERE u.crawl_id = ?
    ORDER BY u.id
  `);
  try {
    for (const raw of statement.iterate(crawlId)) {
      const row = raw as Record<(typeof columns)[number], unknown>;
      await writeChunk(stream, `${columns.map((column) => encodeCsvCell(row[column])).join(",")}\n`);
      rows += 1;
    }
    stream.end();
    await once(stream, "finish");
    return { rows, outputPath: absoluteOutput };
  } finally {
    if (!stream.closed) stream.destroy();
    database.close();
  }
}

export async function exportFindingsCsv(projectPath: string, outputPath: string): Promise<{ rows: number; outputPath: string }> {
  if (!existsSync(projectPath)) throw new Error(`Project file does not exist: ${resolve(projectPath)}`);
  const database = new ProjectDatabase(projectPath);
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  const stream = createWriteStream(absoluteOutput, { encoding: "utf8" });
  const columns = [
    "priority", "category", "rule_id", "page_url", "source_url", "destination_url", "title",
    "what_was_found", "why_it_matters", "evidence_summary", "recommended_action", "review_guidance",
    "status", "first_detected_at", "last_detected_at", "notes"
  ] as const;
  await writeChunk(stream, `${columns.join(",")}\n`);
  let rows = 0;
  const crawlId = database.latestCrawlId();
  const statement = database.db.prepare(`
    SELECT f.priority, f.category, f.rule_id, u.normalized_url AS page_url, f.source_url,
      f.destination_url, f.title, f.what_was_found, f.why_it_matters,
      json_extract(f.evidence_json, '$.summary') AS evidence_summary, f.recommended_action,
      f.review_guidance, f.status, f.first_detected_at, f.last_detected_at, f.notes
    FROM findings f JOIN urls u ON u.id = f.page_url_id
    WHERE f.crawl_id = ?
    ORDER BY CASE f.priority
      WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3
      WHEN 'low' THEN 4 WHEN 'review' THEN 5 ELSE 6 END, f.category, u.normalized_url
  `);
  try {
    for (const raw of statement.iterate(crawlId)) {
      const row = raw as Record<(typeof columns)[number], unknown>;
      await writeChunk(stream, `${columns.map((column) => encodeCsvCell(row[column])).join(",")}\n`);
      rows += 1;
    }
    stream.end();
    await once(stream, "finish");
    return { rows, outputPath: absoluteOutput };
  } finally {
    if (!stream.closed) stream.destroy();
    database.close();
  }
}
