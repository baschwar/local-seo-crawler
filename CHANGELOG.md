# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use semantic versioning.

## [Unreleased]

## [0.3.0] - 2026-07-20

### Added

- Initial pnpm workspace, repository structure, and Git configuration.
- Working Milestone 1 CLI crawler with breadth-first discovery, URL normalization and scope control.
- robots.txt caching and rule evaluation with blocked-URL evidence.
- Redirect histories, bounded retry handling, response limits, and resilient request-error persistence.
- Static HTML metadata, heading, canonical, directive, link, image, word-count, and SHA-256 extraction.
- Incremental SQLite project storage with the initial migration and indexed crawl tables.
- Streaming all-URLs CSV export with spreadsheet formula-injection protection.
- Milestone 2 technical SEO rule package with the documented `AuditRule` contract.
- SQLite migration for persisted findings, priorities, evidence, actions, statuses, notes, and indexes.
- Rules for response/link failures, redirects, titles, descriptions, headings, canonicals, indexability, internal links, images, URL quality, duplicates, and low-content review.
- `audit` and `findings` CLI commands plus formula-safe findings CSV export.
- Milestone 3 Tauri 2 and React desktop foundation with application shell, project library, New Crawl, Live Crawl, Overview, Action Plan, Finding Detail, basic URL Inspector, Technical SEO summary, and export entry point.
- Local NDJSON Node sidecar protocol for real project access, crawl controls, audit execution, findings/status, URL inspection, and CSV export.
- Local recent-project registry and reusable unavailable states for later audit categories without fabricated findings.
- Native macOS **Open Existing Project** dialog for `.seocrawl` files, replacing manual path entry in the Project Library.
- **Save Draft** in New Crawl persists a local project and settings without starting a network crawl.
- Automatic technical SEO audit execution after successful desktop crawls, with explicit started/completed/failed lifecycle events and an analyzing state before Action Plan navigation.
- Isolated technical-audit failure handling with visible recovery feedback and retry without recrawling or changing the successful crawl state.
- Database-filtered, paginated Action Plan with priority, category, status, URL/finding text, and automatic/manual-review filters.
- Finding Detail with explanation, evidence, recommended action, review guidance, editable notes, status controls, and an explicit URL Inspector action.
- Migration 0003 for technical-audit attempts, deterministic cross-run finding identity, recurrence tracking, and automatic/manual-review classification.
- Recurring-finding status and note retention, including ignored-finding retention and reopening resolved findings that reappear.
- Crawl-specific historical finding rows so prior crawl evidence remains unchanged when findings recur or disappear in later runs.
- Crawl History with start/completion times, state, URL and finding counts, duration, audit state, and prior-run selection for crawl-specific summaries and findings.
- Partial-data retention for failed and cancelled crawls, with no automatic technical SEO audit for either state.
- Native macOS Apple Silicon Tauri application and DMG build configuration.
- Self-contained arm64 installed-application packaging with the compiled crawler sidecar, architecture-matched Node runtime, and `better-sqlite3` binding, without a runtime dependency on `pnpm` or the source checkout.
- Deterministic 100+ page fixture site and final 23-test unit/integration closeout suite covering crawl behavior, automatic audit orchestration, cancellation, persistence, failure isolation, retry, desktop queries, migrations, cross-run status retention, and exports.
- Fixture cases and integration coverage for technical SEO findings, filters, re-audit status persistence, and formula-safe findings export.
- Installed-app checklist in `docs/UAT.md`, closeout status in `PROJECT_STATUS.md`, Milestone 3 closeout record in `docs/m3-planning-handoff.md`, and desktop interaction specification in `docs/ui-ux-spec.md`.

### Changed

- Adopted the detailed desktop interaction, accessibility, and visual-direction addendum in `docs/ui-ux-spec.md` for Milestone 3 and later UI work.
- Added user-level pnpm 11.7.0 setup guidance and documented the native-runtime requirement for Apple Silicon desktop development.
- Updated repository operating guidance in `AGENTS.md` and the implementation roadmap in `SPEC.md` for the Milestone 3 baseline.

### Fixed

- New Crawl now uses a user-writable Documents location by default, normalizes `~` and relative project paths in the sidecar, waits for bridge initialization, and shows startup errors instead of silently ignoring a Start Crawl click.
- Primary actions, including **Start Crawl**, retain their action color on hover instead of being overridden by the generic white button hover style.
- Live Crawl now polls the native host’s latest sidecar event as a fallback when macOS webview event delivery is missed.
- Live Crawl now immediately replaces New Crawl after a command is accepted and presents starting feedback, an activity wheel, current URL, live counts, bounded-crawl progress, and a return-to-projects action.
- Live Crawl preserves its paused presentation when an in-flight progress event arrives, so Resume remains available until the user resumes or cancels.
- Sidecar progress snapshots include running/paused state so fallback polling recovers pause feedback even when the dedicated lifecycle event is missed.

### Security

- Added literal private-network blocking for public-origin crawls while allowing explicitly entered local/private start origins.
- Kept full HTML, cookies, authorization headers, and other sensitive request data out of default storage.

[Unreleased]: https://github.com/baschwar/local-seo-crawler/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/baschwar/local-seo-crawler/releases/tag/v0.3.0
