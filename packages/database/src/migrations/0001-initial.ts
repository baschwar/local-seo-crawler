export const initialMigration = {
  version: 1,
  name: "initial_milestone_one_schema",
  sql: `
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      schema_version INTEGER NOT NULL
    );

    CREATE TABLE crawls (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      start_url TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      total_urls INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
      original_url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      final_url TEXT,
      scheme TEXT NOT NULL,
      host TEXT NOT NULL,
      path TEXT NOT NULL,
      query TEXT NOT NULL,
      fragment TEXT NOT NULL,
      depth INTEGER NOT NULL,
      discovery_source TEXT NOT NULL,
      is_internal INTEGER NOT NULL,
      is_indexable INTEGER,
      indexability_reason TEXT NOT NULL DEFAULT 'unknown',
      content_type TEXT,
      status_code INTEGER,
      response_time_ms INTEGER,
      response_size_bytes INTEGER,
      word_count INTEGER,
      html_hash TEXT,
      normalized_html_hash TEXT,
      text_hash TEXT,
      robots_rule TEXT,
      error_type TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      fetched_at TEXT,
      UNIQUE(crawl_id, normalized_url)
    );

    CREATE TABLE requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      attempt INTEGER NOT NULL,
      request_headers_json TEXT NOT NULL,
      response_headers_json TEXT,
      error_type TEXT,
      error_message TEXT
    );

    CREATE TABLE redirects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
      source_url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
      hop_number INTEGER NOT NULL,
      from_url TEXT NOT NULL,
      to_url TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      redirect_type TEXT NOT NULL
    );

    CREATE TABLE links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
      source_url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
      destination_url_id INTEGER REFERENCES urls(id) ON DELETE SET NULL,
      destination_url TEXT NOT NULL,
      link_type TEXT NOT NULL,
      anchor_text TEXT NOT NULL,
      rel TEXT NOT NULL,
      is_follow INTEGER NOT NULL,
      is_internal INTEGER NOT NULL,
      dom_selector TEXT,
      destination_status_code INTEGER,
      destination_error TEXT
    );

    CREATE TABLE page_elements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
      element_type TEXT NOT NULL,
      element_index INTEGER NOT NULL,
      value TEXT NOT NULL,
      dom_selector TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
      source_url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      status_code INTEGER,
      alt_text TEXT,
      width TEXT,
      height TEXT,
      size_bytes INTEGER,
      loading TEXT,
      dom_selector TEXT
    );

    CREATE INDEX idx_urls_crawl ON urls(crawl_id);
    CREATE INDEX idx_urls_normalized ON urls(crawl_id, normalized_url);
    CREATE INDEX idx_urls_status ON urls(crawl_id, status_code);
    CREATE INDEX idx_requests_url ON requests(url_id);
    CREATE INDEX idx_redirects_crawl ON redirects(crawl_id);
    CREATE INDEX idx_links_crawl_source ON links(crawl_id, source_url_id);
    CREATE INDEX idx_links_destination ON links(crawl_id, destination_url);
    CREATE INDEX idx_page_elements_url_type ON page_elements(url_id, element_type);
    CREATE INDEX idx_images_crawl_source ON images(crawl_id, source_url_id);
  `
} as const;
