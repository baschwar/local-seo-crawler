# Local SEO Auditor — Milestone 3 Closeout Record

**Prepared:** 2026-07-20
**Purpose:** Record the implemented Milestone 3 baseline, verification evidence, remaining release refinements, and post-Milestone-3 boundary.

## Executive summary

The project is a local-first macOS desktop SEO auditor built as a pnpm TypeScript workspace with a Tauri 2/React desktop host, a Node crawler sidecar, and SQLite `.seocrawl` project files. Milestones 1 and 2 and the Milestone 3 crawl-to-Action-Plan workflow are implemented with deterministic coverage.

A successful desktop crawl now enters an analyzing state, automatically runs technical SEO exactly once, reloads crawl-specific findings, and opens a populated Action Plan. Audit failure is stored separately from crawl status and can be retried without another crawl. Crawl History and deterministic cross-run finding identity preserve both history and reviewer work.

## What is implemented and verified

### Crawl and project engine

- Breadth-first static crawl of internal HTTP/HTTPS pages with normalized URL deduplication.
- Exact-host scope with optional subdomains, conservative concurrency/rate settings, robots.txt handling, retries, redirects, request limits, and incremental persistence.
- SQLite `.seocrawl` projects with crawl history, URLs, requests, redirects, links, page elements, images, and technical SEO findings.
- Local project library registry, native open-file dialog for existing projects, and Save Draft for persisting settings without network activity.
- Crawl project files default to `~/Documents/Local SEO Auditor/`; `~` and relative paths are normalized in the sidecar.

### Technical SEO engine

- Persisted deterministic rules for responses/links, redirects, titles, descriptions, headings, canonicals, indexability, internal linking, images, URL quality, duplicate content, and low-content review.
- Findings include priority, evidence, recommended action, review guidance where needed, status, and notes.
- CLI audit/findings/export commands and formula-safe CSV exports work against real projects.

### Desktop foundation

- Tauri 2/React shell, project library, New Crawl workflow, Live Crawl, Overview, Action Plan, Finding Detail, basic URL Inspector, Technical SEO summary, and CSV export entry point.
- Installed macOS app bundles the Node sidecar, native Node runtime, and `better-sqlite3` binding; it does not depend on pnpm or the source checkout.
- Live Crawl has pause/resume/cancel controls, immediate transition from New Crawl, starting feedback, current URL, page/queue/blocked/error counts, activity wheel, bounded-crawl progress bar, and fallback polling of the native host’s latest sidecar event.
- Completed crawls automatically run technical SEO with explicit lifecycle events and only navigate after findings reload.
- Action Plan uses SQLite filtering/pagination and supports status, notes, manual-review filtering, Finding Detail, URL Inspector, and audit retry.
- Crawl History selects previous runs without silently falling back to the latest crawl.
- Accessibility, grammar, HTML validation, answer readiness, Search Console, and several raw-data views intentionally display unavailable states instead of fabricated output.

### Verification performed

- `pnpm check` passes with 22 tests: unit tests plus deterministic 100+ page crawl, automatic audit lifecycle, persistence, failure/retry, cancellation, filtering, history, identity retention, and export integration coverage.
- Final native bundle and installed-app evidence are recorded in `docs/UAT.md`.

## Current known gaps and defects

| Priority | Gap | Planning implication |
| --- | --- | --- |
| P0 | None in the scoped crawl-to-Action-Plan closeout. | Keep the installed-app UAT evidence current for every release candidate. |
| P1 | Raw crawl-data views are navigation placeholders rather than usable 10,000-row investigative views. | Treat as a release refinement; Action Plan itself is paginated in SQLite. |
| P1 | Export uses typed output paths rather than native Save dialogs. | Add a native save-file workflow without moving reporting into React. |
| P1 | Crash-resume is not implemented. | Design durable recovery before promising unattended long-running crawls. |
| P2 | No desktop E2E automation. | Keep the versioned installed-app UAT checklist until a stable Tauri-compatible harness is selected. |

## Completed Milestone 3 closeout

1. **Automatic technical SEO handoff**
   - Successful static crawls call the existing domain audit through the sidecar.
   - Started, completed, and failed audit events carry project and crawl identity plus safe counts/errors.
   - The UI shows analysis, reloads findings, isolates failure, and offers retry.

2. **Project and crawl history**
   - Crawl History shows state, dates, URL/finding counts, duration, and audit state.
   - Previous runs can drive Overview, Action Plan, and URL Inspector queries.
   - Cancelled and failed crawls retain partial data and receive no automatic audit.

3. **UAT and release readiness**
   - `docs/UAT.md` defines installed-app steps, visible results, persisted evidence, and failure criteria.
   - Automated checks cover all critical lifecycle and persistence paths.
   - The initial Git commit is created only after final native verification.

4. **Secondary M3 usability work**
   - Native Save dialog for exports.
   - Virtualized raw URLs/redirects/links/images tables with filters and page inspection links.
   - Clear app version/build information, update path, and a proper signed/notarized distribution plan if external distribution is intended.

## Proposed milestones after M3

### Milestone 4 — rendered accessibility

Add low-concurrency Playwright Chromium rendering only after the static crawl. Execute axe-core in the rendered page and persist rule, impact, WCAG tags, selector, relevant HTML excerpt, and page context. Generate separate manual-review tasks; do not report manual accessibility checks as automatic passes.

### Milestone 5 — grammar and spelling

Run a local LanguageTool service over extracted readable content. Preserve offsets and context; support dictionaries, scoped ignores, and deterministic checks. Keep passive voice informational.

### Milestone 6 — HTML validation

Use local Nu HTML Checker source validation first, with optional rendered/both modes later. Normalize and deduplicate meaningful messages while preserving raw validator evidence.

### Milestone 7 — sitemap comparison

Discover/parse sitemap sources and compare them against the crawl. Avoid absolute orphan claims unless coverage supports them.

### Milestone 8 — deterministic answer readiness

Produce evidence-backed categories, not a universal “GEO score.” Evaluate technical eligibility, clarity, answer structure, entities, provenance, structured-data opportunities, and optional Search Console alignment.

### Milestone 9 — Google Search Console

Use OAuth 2.0 with OS-keychain token storage. Keep page metrics and query metrics separate, retain unmatched URLs, and make priority adjustments transparent and reversible.

## Architecture constraints to preserve

- Keep crawling, audits, persistence, and reporting in Node/TypeScript domain packages; React renders data and must not acquire domain logic.
- Keep the desktop app local-first: no crawler content, cookies, credentials, or telemetry sent to cloud services by default.
- Use migrations for all database changes.
- Treat later audit stages as independent: a failure in one must not invalidate a completed static crawl.
- Continue robots compliance, conservative defaults, incremental persistence, and secret redaction.
- The distributable app must continue to bundle architecture-matched Node/SQLite sidecar dependencies.

## Questions for the planning partner

1. Should automatic technical SEO analysis run for every completed static crawl, or be a user-configurable post-crawl stage? The current recommendation is automatic by default with a visible retry path.
2. What is the desired definition of “M3 complete”: foundation only, or foundation plus the fully populated Action Plan loop and raw-data investigation views?
3. Should the next large investment be rendered accessibility (M4), or should the team finish M3 release discipline first: UAT, crawl history, exports, GitHub baseline, signing/notarization?
4. Which data should be retained across crawl runs by default, and how should status/notes be matched when the same finding recurs?
5. Is macOS-only acceptable for the first public release, or should the packaging/build architecture be planned for Windows/Linux before further desktop-specific work?

## Useful source locations

- `apps/crawler/src/sidecar.ts` — desktop IPC, project workflow, crawl lifecycle.
- `apps/desktop/src/App.tsx` — reusable Milestone 3 presentation screens.
- `apps/desktop/src-tauri/src/main.rs` — sidecar lifecycle, native file picker, event snapshot fallback.
- `packages/crawl-core/src/crawler.ts` — static crawler orchestration.
- `packages/seo-rules/src/rules.ts` — technical SEO audit rules.
- `packages/database/src/index.ts` — SQLite migrations and persistence API.
- `packages/test-fixtures/test/crawl.integration.test.ts` — deterministic crawl/finding/export acceptance coverage.
- `SPEC.md` — product architecture and milestone specification.
