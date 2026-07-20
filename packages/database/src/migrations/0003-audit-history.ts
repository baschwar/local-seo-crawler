export const auditHistoryMigration = {
  version: 3,
  name: "technical_audit_history_and_finding_identity",
  sql: `
    ALTER TABLE findings ADD COLUMN identity_key TEXT;
    ALTER TABLE findings ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE findings ADD COLUMN review_type TEXT NOT NULL DEFAULT 'automatic';

    UPDATE findings
    SET identity_key = lower(trim(rule_id)) || char(0) ||
      lower(trim(COALESCE((SELECT normalized_url FROM urls WHERE urls.id = findings.page_url_id), ''))) || char(0) ||
      lower(trim(COALESCE(destination_url, source_url, ''))),
      review_type = CASE WHEN review_guidance IS NOT NULL OR priority = 'review' THEN 'manual-review' ELSE 'automatic' END;

    CREATE UNIQUE INDEX idx_findings_crawl_identity ON findings(crawl_id, identity_key);
    CREATE INDEX idx_findings_query ON findings(crawl_id, status, category, priority, review_type);

    CREATE TABLE technical_audits (
      id TEXT PRIMARY KEY,
      crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      finding_count INTEGER,
      error_message TEXT
    );

    CREATE INDEX idx_technical_audits_crawl_started ON technical_audits(crawl_id, started_at DESC);
  `
} as const;
