# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use semantic versioning.

## [Unreleased]

### Added

- Initial pnpm workspace and Git repository foundation.
- Working Milestone 1 CLI crawler with breadth-first discovery, URL normalization and scope control.
- robots.txt caching and rule evaluation with blocked-URL evidence.
- Redirect histories, bounded retry handling, response limits, and resilient request-error persistence.
- Static HTML metadata, heading, canonical, directive, link, image, word-count, and SHA-256 extraction.
- Incremental SQLite project storage with the initial migration and indexed crawl tables.
- Streaming all-URLs CSV export with spreadsheet formula-injection protection.
- Deterministic 100+ page fixture site and unit/integration acceptance suite.
- Milestone 2 technical SEO rule package with the documented `AuditRule` contract.
- SQLite migration for persisted findings, priorities, evidence, actions, statuses, notes, and indexes.
- Rules for response/link failures, redirects, titles, descriptions, headings, canonicals, indexability, internal links, images, URL quality, duplicates, and low-content review.
- `audit` and `findings` CLI commands plus formula-safe findings CSV export.
- Fixture cases and integration coverage for technical SEO findings, filters, re-audit status persistence, and findings export.
- Adopted the detailed desktop interaction, accessibility, and visual-direction addendum in `docs/ui-ux-spec.md` for Milestone 3 and later UI work.
- Milestone 3 Tauri 2 and React desktop foundation with application shell, project library, New Crawl, Live Crawl, Overview, Action Plan, Finding Detail, basic URL Inspector, Technical SEO summary, and export entry point.
- Local NDJSON Node sidecar protocol for real project access, crawl controls, audit execution, findings/status, URL inspection, and CSV export.
- Local recent-project registry and reusable unavailable states for later audit categories without fabricated findings.
- Native macOS Apple Silicon Tauri application and DMG build configuration.
- Self-contained macOS desktop packaging: the `.app` now includes the compiled crawler sidecar, native Node runtime, and SQLite binding, so a DMG installation does not launch a development-only `pnpm` process.
- User-level pnpm 11.7.0 setup guidance and native-runtime requirement for Apple Silicon desktop development.
- Native macOS **Open Existing Project** dialog for `.seocrawl` files, replacing manual path entry in the Project Library.
- **Save Draft** in New Crawl persists a local project and settings without starting a network crawl.
- `docs/m3-planning-handoff.md` documents verified implementation, known gaps, closeout work, and recommended post-M3 planning questions.
- Automatic technical SEO analysis after successful desktop crawls with explicit started/completed/failed lifecycle events, analyzing UI, failure isolation, and retry.
- Migration 0003 for technical audit attempts, deterministic finding identity, recurrence, and automatic/manual-review classification.
- Database-filtered, paginated Action Plan with complete finding fields, editable notes, explicit detail and URL Inspector actions, and retry feedback.
- Crawl History with selectable crawl-specific summaries and findings.
- Deterministic tests for automatic audit orchestration, cancellation, persistence, failure isolation, retry, desktop queries, migration, and cross-run status retention.
- Installed-app checklist in `docs/UAT.md` and closeout status in `PROJECT_STATUS.md`.

### Fixed

- New Crawl now uses a user-writable Documents location by default, normalizes `~` and relative project paths in the sidecar, waits for bridge initialization, and shows startup errors instead of silently ignoring a Start Crawl click.
- Primary actions, including **Start Crawl**, retain their action color on hover instead of being overridden by the generic white button hover style.
- Live Crawl now polls the native host’s latest sidecar event as a fallback when macOS webview event delivery is missed.
- Live Crawl now immediately replaces New Crawl after a command is accepted and presents starting feedback, an activity wheel, current URL, live counts, bounded-crawl progress, and a return-to-projects action.
- Live Crawl preserves its paused presentation when an in-flight progress event arrives, so Resume remains available until the user resumes or cancels.
- Sidecar progress snapshots include running/paused state so fallback polling recovers pause feedback even when the dedicated lifecycle event is missed.
- Repository operating guidance in `AGENTS.md` and the implementation roadmap in `SPEC.md`.

### Security

- Added literal private-network blocking for public-origin crawls while allowing explicitly entered local/private start origins.
- Kept full HTML, cookies, authorization headers, and other sensitive request data out of default storage.
