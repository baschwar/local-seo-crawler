export const findingsMigration = {
  version: 2,
  name: "technical_seo_findings",
  sql: `
    CREATE TABLE findings (
      id TEXT PRIMARY KEY,
      crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      original_priority TEXT NOT NULL,
      page_url_id INTEGER REFERENCES urls(id) ON DELETE SET NULL,
      source_url TEXT,
      destination_url TEXT,
      title TEXT NOT NULL,
      what_was_found TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      review_guidance TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      first_detected_at TEXT NOT NULL,
      last_detected_at TEXT NOT NULL,
      notes TEXT
    );

    CREATE INDEX idx_findings_crawl ON findings(crawl_id);
    CREATE INDEX idx_findings_rule ON findings(rule_id);
    CREATE INDEX idx_findings_priority ON findings(crawl_id, priority);
    CREATE INDEX idx_findings_status ON findings(crawl_id, status);
    CREATE INDEX idx_findings_page ON findings(page_url_id);
  `
} as const;
