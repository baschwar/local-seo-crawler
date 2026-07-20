# Local SEO and Accessibility Crawler Specification

## Status

- Product specification version: 0.1
- Release baseline: 0.3.0
- Active implementation milestone: Milestone 3
- Initial platform: current macOS on Apple Silicon
- Architecture target: cross-platform local desktop application
- Milestone 1 implementation status: complete and acceptance-verified
- Milestone 2 implementation status: complete and acceptance-verified
- Milestone 3 implementation status: complete and acceptance-verified on 2026-07-20; 23 automated tests and final native-build/installed-app evidence are recorded in `docs/UAT.md`

Milestone 4 is explicitly outside the 0.3.0 release. Accessibility, Grammar, HTML Validation, Answer Readiness, Search Console, PageSpeed Insights, and Google Analytics remain unavailable and must not be inferred from Milestone 3 navigation contracts.

This file is the durable in-repository source of truth derived from the initial implementation brief. Each milestone must remain executable, tested, documented, and backward-compatible before work moves to the next milestone.

## Product goal

Build a local-first desktop application that crawls a website and generates a prioritized, actionable repair report covering technical SEO, accessibility, English grammar and spelling, HTML validation, deterministic answer-readiness signals, Google Search Console performance, CSV, and XLSX reporting.

The primary user outcome is:

> Show me which pages need attention, what was found, why it matters, and what I should fix or review.

Actionable findings take priority over raw crawl data. Every finding must identify its page, include evidence, explain impact, and recommend a fix or manual review. Website content must not be sent to external AI services.

## Product requirements

The completed application must:

1. Run locally on macOS first and preserve a cross-platform path for Windows and Linux.
2. Crawl without an application-imposed page limit.
3. store, save, reopen, and migrate local `.seocrawl` SQLite projects.
4. Produce prioritized findings connected to affected pages and supporting evidence.
5. Export UTF-8 CSV datasets and a formatted XLSX audit workbook.
6. Run accessibility tests inside rendered Chromium pages.
7. Run English grammar/spelling and HTML validation through local services.
8. Connect to Google Search Console with OAuth tokens stored in the OS keychain.
9. Evaluate deterministic page-level answer-readiness signals without claiming guaranteed search or AI-answer placement.
10. Avoid telemetry, cloud crawling, content uploads, and AI-service calls.

## Architecture

| Layer | Selected technology |
| --- | --- |
| Desktop shell | Tauri 2 |
| Desktop UI | React, TypeScript, Vite |
| Workspace | pnpm workspaces |
| Crawler runtime | Node.js sidecar |
| HTTP and parsing | Undici, parse5, Cheerio |
| Rendered auditing | Playwright Chromium, axe-core |
| Persistence | SQLite, better-sqlite3, ordered migrations |
| Runtime validation | Zod |
| Local language service | LanguageTool |
| Local HTML validation | Nu HTML Checker |
| Google integration | Official Google APIs client |
| Reporting | streaming CSV, ExcelJS |
| Logging and tests | Pino, Vitest, Playwright Test |
| UI data | Zustand, TanStack Query, TanStack Table |

The main crawler must remain in Node/TypeScript. Rust/Tauri is limited to desktop startup, sidecar lifecycle, native dialogs, filesystem access, credential access, future updates, and OS integration. Domain logic must stay out of React. The CLI and desktop sidecar must share crawl and audit packages.

## Repository model

Milestone 1 implements the executable packages needed now:

```text
apps/cli
apps/crawler
packages/shared-types
packages/database
packages/crawl-core
packages/reporting
packages/test-fixtures
```

Later packages are added only when their milestone begins: `seo-rules`, `accessibility`, `grammar`, `html-validation`, `answer-readiness`, `search-console`, and the Tauri desktop application. This avoids non-executable placeholder interfaces.

## Delivery strategy

Implementation proceeds vertically. Every milestone must:

- Run successfully and preserve existing behavior.
- Include automated tests and setup instructions.
- Add ordered database migrations for schema changes.
- Avoid fake UI actions that cannot execute their underlying feature.
- Update the README, this specification, agent guidance, and changelog when behavior or scope changes.

## Milestone 1: crawl engine prototype

### Objective

Provide a working CLI that accepts a starting URL, crawls internal HTML pages, records response and page data incrementally in SQLite, and exports an all-URLs CSV.

### Required commands

```bash
pnpm seo-auditor crawl https://example.com \
  --project ./projects/example.seocrawl \
  --max-concurrency 10 \
  --requests-per-second 5 \
  --max-urls 0 \
  --respect-robots true

pnpm seo-auditor export ./projects/example.seocrawl \
  --type urls \
  --format csv \
  --output ./tmp/example-urls.csv
```

Zero `max-urls` means unlimited.

### Crawl behavior

- Breadth-first queue and unique normalized URL entities
- Internal scope with configurable subdomain inclusion
- HTTP/HTTPS only
- Ordered redirect histories, loop detection, and hop limit
- Request timeout, bounded retry, 429/`Retry-After` handling, and maximum body size
- Content-type classification, depth, discovery source, and source-page mapping
- Link and image extraction
- Title, description, canonical, meta robots, X-Robots-Tag, H1, H2, and visible word-count extraction
- SHA-256 raw HTML, normalized HTML, and visible-text hashes
- Incremental persistence after discovery, request, and extraction stages
- External destinations recorded and optionally checked without recursive external crawling
- Individual request failures recorded without stopping the crawl

### URL normalization

Store both the original discovery URL and normalized crawl URL. Normalization must resolve relative URLs and dot segments, lowercase hosts, remove default ports and fragments from the crawl identity, collapse duplicate path slashes, and normalize percent-encoding. Arbitrary query parameters must remain. Tracking-parameter removal is a later configurable feature.

### robots.txt

Fetch once per origin, select the relevant user-agent group, apply allow/disallow using longest-match precedence, and respect blocking by default. Store blocked URLs and matching rule evidence without fetching page content.

### Responsible defaults

| Setting | Default |
| --- | ---: |
| Concurrency | 5 |
| Requests per second | 2 |
| Timeout | 30 seconds |
| Redirect limit | 10 |
| Maximum response | 20 MB |
| Respect robots.txt | enabled |
| External link checking | enabled, non-recursive |
| User-agent | `LocalSEOAuditor/0.3 (+local desktop audit tool)` |

The crawler must support 429 backoff, an emergency stop in the later sidecar, a domain allowlist, private-network blocking by default, and redaction of sensitive headers. A deliberately entered localhost/private start URL is an explicit local-crawl exception.

### Milestone 1 database

Migration 0001 contains `projects`, `crawls`, `urls`, `requests`, `redirects`, `links`, `page_elements`, `images`, and `schema_migrations`. The schema stores normalized URLs, all source relationships, attempts, redirect hops, repeatable metadata elements, images, hashes, indexability, blocking evidence, and errors. Schema additions beyond the original minimum are allowed when they preserve required evidence.

### Milestone 1 acceptance

The deterministic fixture must expose at least 100 pages and verify:

- Internal discovery and crawl depth
- External-link recording and checking
- Normalized URL deduplication
- robots.txt blocking without a page request
- Ordered redirect history
- 2XX, 3XX, 4XX, 5XX and request-failure data paths
- Broken internal destination data
- Metadata, link, and image extraction
- Every known source relationship
- Incremental SQLite persistence
- Streaming, formula-safe CSV export
- Unit tests for normalization, scope, robots, extraction, and CSV safety

Definition of done is a successful run of the two fixture commands in `README.md`, plus passing `pnpm check`.

## Milestone 2: technical SEO findings

Introduce a modular `AuditRule` interface and persisted `AuditFinding` model. Priorities are `critical`, `high`, `medium`, `low`, `review`, and `informational`; statuses are `open`, `ignored`, `resolved`, and `intentional`. Every finding must include what was found, why it matters, structured evidence, and a recommended action.

Required rule families:

- Responses and links: internal/external failures, images, fragments, timeout/DNS/connection evidence, and source/anchor/location context
- Redirects: permanent/temporary, chains, loops, internal redirected links, and failing destinations
- Titles and descriptions: missing, empty, multiple, duplicate, short, and long with configurable non-critical thresholds
- Headings: missing/multiple H1, duplicate H1, empty/skipped headings, and title conflict; hierarchy is normally review priority
- Canonicals: multiple, relative, redirects/errors/blocked/non-indexable destinations, chains, and conflicting headers; non-self canonicals are not automatically errors
- Indexability: indexable, noindex, robots-blocked, redirected, error, unsupported type, canonicalized elsewhere, and unknown
- Internal linking: in/outlink counts, anchors, follow state, orphan candidates, depth, generic/empty anchors, redirects, and non-indexable destinations
- Images: absent/empty alt nuance, broken images, dimensions, mixed content, and large files
- URL quality: uppercase, underscores, spaces, non-ASCII, length, parameters, repeated segments, protocol, and duplicate slashes
- Duplicate/thin content: raw, normalized, and visible-text SHA-256 groups plus duplicate metadata and review-level low content

Thresholds are project settings. Findings must filter by priority, category, page, and status.

### Implemented Milestone 2 command surface

```bash
pnpm seo-auditor audit ./projects/example.seocrawl
pnpm seo-auditor findings ./projects/example.seocrawl --priority high --status open
pnpm seo-auditor export ./projects/example.seocrawl --type findings --format csv --output ./tmp/findings.csv
```

The current engine evaluates deterministic rules against the persisted crawl database and preserves an existing matching finding’s ID, first-detected timestamp, status, and notes during re-audit. It covers response/link failures, redirects, metadata, headings, canonicals, indexability, internal links, image alternatives/dimensions/mixed content, URL quality, duplicate hash groups, and low-content review. Fragment targets, canonical response-header conflicts, and standalone image-response checks require new extraction/persistence evidence and are documented as follow-on technical SEO refinements.

## Milestone 3: Tauri desktop application

Add the macOS-first Tauri 2 shell and React UI only after Milestone 2. Required screens are Projects, New Crawl, Live Crawl, Overview, Action Plan, raw-data views, and URL Inspector. Action Plan is the default completed-crawl view. It must support filtering, search, status changes, notes, export, page opening, and page inspection. Tables must remain responsive at 10,000 URLs.

The UI communicates with the Node sidecar over documented newline-delimited JSON or equivalent IPC. Every message includes ID, type, timestamp, and payload. Commands cover project, crawl, audits, Search Console, and exports; events cover lifecycle, progress, completion, and errors. Large HTML must remain in SQLite and travel by identifier, never UI events.

The detailed accepted design direction, information architecture, interaction model, accessibility requirements, keyboard behavior, states, and implementation sequence live in [UI and UX Addendum](docs/ui-ux-spec.md). For Milestone 3, the Action Plan, Finding Detail panel, and URL Inspector are the three highest-priority components; raw-data tables remain secondary investigative views.

### Implemented Milestone 3 foundation

The `apps/desktop` workspace is a Tauri 2 host with a React/Vite interface. It owns reusable presentation components only; crawl, audit, persistence, reporting, and project-library data are served by the Node crawler sidecar over newline-delimited JSON. The Rust host launches the sidecar locally and forwards its messages as Tauri events.

Implemented screens and components:

- Application toolbar, sidebar, status bar, dense desktop layout, priority semantics, focus indicators, and keyboard-operable controls.
- Project Library backed by a local recent-project registry and real `.seocrawl` project summaries.
- Native macOS Open File workflow for existing `.seocrawl` projects; the UI does not require users to type a filesystem path.
- Four-step New Crawl flow: Website, Scope, Behavior, and Review.
- Save Draft persists a local project and crawl settings without initiating network activity; saved drafts remain usable from the Project Library.
- Live Crawl with real sidecar progress plus pause, resume, and cancel controls.
- Native-host progress snapshot polling as a fallback for Live Crawl event delivery.
- Immediate Live Crawl transition after a crawl command is accepted, with an accessible starting state, actual counts/current URL, indeterminate activity treatment, and page-limit progress bar.
- Overview with actual crawl, priority, and category counts.
- Action Plan as the default completed-crawl screen, using persisted finding filters and status.
- Finding Detail panel with what was found, why it matters, evidence, recommended action, review guidance, status controls, and basic URL Inspector data.
- Technical SEO category summary and export-sidecar entry point.
- Automatic successful-crawl handoff to technical SEO with `technical-audit-started`, `technical-audit-completed`, and `technical-audit-failed` lifecycle events.
- Analyzing state, findings reload before Action Plan navigation, isolated audit failures, and retry without another crawl.
- Database-side Action Plan filtering and pagination, including automatic/manual-review classification, status changes, notes, detail, and explicit URL Inspector actions.
- Crawl History with crawl-specific summaries, findings, timing, counts, duration, and audit state.
- Deterministic finding identity based on rule, normalized page URL, and normalized evidence target/discriminator. Recurrences retain open/ignored/intentional status and notes; a resolved finding that reappears is reopened and marked recurring. Older crawl rows remain historically unchanged.

Accessibility, Grammar, HTML Validation, Answer Readiness, Search Console, and raw secondary views are present as explicit unavailable states or navigation contracts. No fake result rows or synthetic metrics are shown before those audits exist. Cancelled and failed crawls retain partial data and never trigger an automatic technical SEO audit.

Development command: `pnpm --filter @seo-auditor/desktop dev`. Native build command: `pnpm --filter @seo-auditor/desktop build`. The Apple Silicon `.app` and `.dmg` bundle the compiled Node sidecar, a native Node runtime, and the `better-sqlite3` binding under application resources. The installed application must launch without relying on `pnpm`, a shell PATH, or the source checkout. Builds must use a native architecture-matched Node runtime so the packaged SQLite binding loads.

New project files default to the user’s Documents directory. Existing project selection uses a native file picker; recent projects remain the Project Library’s future no-path-entry selection surface.

The closeout implementation and evidence are summarized in [Milestone 3 Closeout Record](docs/m3-planning-handoff.md) and [Installed-App UAT](docs/UAT.md).

## Milestone 4: rendered accessibility

Run static discovery first, then selectively queue eligible pages for low-concurrency Playwright Chromium rendering. Execute axe-core inside the page and store rule ID, impact, help, WCAG tags, selector, HTML excerpt, failure summary, page, and occurrence count.

Starting axe impact mapping is critical→critical, serious→high, moderate→medium, minor→low, and absent→review. Generate separate manual tasks for alt meaning, heading logic, keyboard completion, focus order/visibility, captions, transcripts, error clarity, zoom/reflow, announcements, link meaning, and reading order. Manual tasks can never auto-pass.

## Milestone 5: grammar and spelling

Manage a local LanguageTool service. Extract readable content while excluding navigation, footer, scripts, styles, code, controls, hidden content, common boilerplate, and identifiable cookie banners. Store text context, selectors/approximate source, offsets, rule/category, match, suggestions, and status.

Support project/global dictionaries and scoped ignores. Add deterministic repeated-word, placeholder, duplicate-sentence, sentence-length, all-caps, and typo checks. Passive voice is informational only.

## Milestone 6: HTML validation

Manage a local Nu HTML Checker and validate source HTML by default, with optional rendered/both modes. Normalize output into page behavior, accessibility, SEO, structure, obsolete markup, and informational categories. Prioritize meaningful structure, metadata, ID, ARIA, JSON-LD, encoding, link, image, and fragment problems. Deduplicate/group messages, preserve raw output, and hide low-value notices by default.

## Milestone 7: sitemap comparison

Read sitemap locations from robots.txt, user URLs, local files, indexes, and gzip files. Compare sitemap and crawl data for missing, redirected, erroring, blocked, non-indexable, canonicalized, unsupported, duplicate, and potential-orphan URLs. Never claim full orphan status without complete source coverage.

## Milestone 8: deterministic answer readiness

Generate evidence-based categories rather than a universal GEO score. Check technical eligibility, topic clarity, answer structure, entity clarity, trust/provenance signals, structured data validity/opportunities, and—only when available—Search Console query alignment. Presence signals do not guarantee authority or AI-answer inclusion. Do not recommend FAQ schema indiscriminately.

## Milestone 9: Google Search Console

Use OAuth 2.0 and the OS keychain; never store unencrypted refresh tokens in SQLite. Import page clicks, impressions, CTR, position, query count, and top queries. Keep query rows separate. Make URL Inspection optional and quota-aware. Preserve unmatched Search Console URLs and implement transparent, configurable priority adjustments with original/adjusted priority and metric evidence.

## Completed-product data model

Later migrations add `findings`, `accessibility_results`, `manual_accessibility_tasks`, `grammar_results`, `html_validation_results`, `structured_data`, `sitemap_entries`, `search_console_page_metrics`, `search_console_queries`, `search_console_inspection`, `dictionaries`, and `ignored_rules`. Index crawl IDs, normalized/page URLs, rules, priorities, statuses, source/destination relationships, and Search Console URLs.

Project files use the `.seocrawl` extension while remaining SQLite databases. Full source/rendered HTML and screenshots are opt-in. Stored HTML uses compression.

## Reporting requirements

Separate UTF-8 CSV exports cover Action Plan, URLs, findings, link/redirect/metadata/image/canonical/directive/internal-link data, accessibility/manual review, grammar, validation, Search Console, answer readiness, structured data, and sitemap comparison. Protect cells beginning with `=`, `+`, `-`, or `@`.

The XLSX workbook contains 21 named sheets from Action Plan and Summary through Internal Links. Apply frozen headers, filters, wrapping, readable widths, hyperlinks, priority formatting, counts, and appropriate date/number formats. Do not merge data-sheet cells. Action Plan ends with blank Assigned To and Completion Notes columns.

## Actionable reporting

Every report answers what is wrong, which page is affected, what supports it, why it matters, what to fix, what to review, importance, and available traffic. Group work into Fix Broken Experiences, Review Search Visibility, Improve Page Clarity, Improve Accessibility, and Improve Crawl Efficiency.

## Error isolation

Tolerate malformed inputs and HTML/XML, DNS/TLS/timeouts, 429, large bodies, Chromium crashes, local-service failures, OAuth cancellation, Google quotas, SQLite contention, disk exhaustion, and cancellation. A failed optional stage must preserve completed crawl and other audit results. One bad page must not terminate a multi-page audit.

## Performance targets

- Crawl 10,000 static HTML URLs with stable memory through incremental persistence.
- Keep the future UI responsive and filter 10,000 rows.
- Stream CSV output.
- Reuse Chromium safely and constrain browser, grammar, and validator concurrency.
- Do not store full HTML by default.

## Privacy and security

- Local projects, grammar, and validation
- Keychain-protected Google credentials
- No default telemetry, analytics, AI calls, or content upload
- Formula-safe spreadsheet output and safe file paths
- Private-network blocking by default with explicit local-project allowance
- Redacted authorization, cookies, passwords, OAuth tokens, and private request headers

## Explicit exclusions

The base project excludes PageSpeed Insights, GA4, licensing, billing, accounts, teams, cloud crawling/scheduling, Sheets/Looker publishing, Ahrefs/Moz/Majestic, crawl maps, AMP, advanced hreflang, semantic-vector duplication, AI rewrites/providers, multiple browser engines, image sitemap generation, forms authentication, custom JavaScript, automated scheduling, and social metadata auditing.

Interfaces may later accommodate sampled PageSpeed data and GA4 landing-page metrics, but their dependencies and implementations must not enter the base milestones.

## Implementation order

1. Monorepo, shared types, SQLite migrations, CLI/static crawler, extraction, CSV, and fixture
2. Technical SEO rule engine and findings
3. Tauri desktop project, project lifecycle, crawl progress, and Action Plan
4. XLSX and sitemap analysis
5. Playwright, axe-core, and manual accessibility review
6. LanguageTool and Nu HTML Checker
7. Structured data and answer-readiness rules
8. Google OAuth, Search Console metrics/query/inspection, and traffic adjustments
9. Performance validation and macOS packaging documentation

## Current technical decisions and deviations

- The repository creates only packages with executable Milestone 1 responsibilities; future domain directories are deferred instead of committed as empty placeholders.
- CSV streaming is implemented directly with Node streams instead of adding a CSV-writer dependency; escaping and formula-injection behavior are unit-tested.
- robots.txt redirects are not followed in Milestone 1 to avoid an unvalidated cross-origin redirect path.
- The project stores additional `robots_rule`, URL/request error, fetched timestamp, external destination status, and migration-history fields because they are required to preserve acceptance evidence.

These decisions preserve the requested architecture and are subject to revision through documented migrations and changelog entries.
