# Local SEO Auditor

Local SEO Auditor is a local-first website crawler intended to turn technical crawl data into a prioritized SEO, accessibility, content, and answer-readiness repair plan. Website content stays on the machine: the base product has no analytics, telemetry, cloud crawler, or AI-service integration.

This repository is currently at **Milestone 3**. The runnable implementation includes the TypeScript crawler, SQLite project files, persisted technical SEO findings, and a macOS-first Tauri desktop foundation. Later audit layers remain unavailable until their milestones.

## What works now

- Breadth-first discovery of internal HTTP and HTTPS pages
- Normalized-URL deduplication without removing arbitrary query parameters
- Exact-host scope with optional subdomain inclusion
- Conservative concurrency, request-rate, timeout, response-size, redirect, and retry controls
- robots.txt fetched once per origin and evaluated by user-agent
- Blocked URLs retained with the matching robots rule
- Manual redirect following with ordered redirect histories and loop/limit protection
- Status, content type, timing, byte size, crawl depth, discovery source, and request-attempt persistence
- Title, meta description, canonical, robots directives, H1, H2, word count, link, and image extraction
- SHA-256 raw HTML, normalized HTML, and visible-text hashes
- Internal source-to-destination relationships and external-link status checks
- Incremental SQLite persistence in `.seocrawl` project files
- Streaming UTF-8 all-URLs CSV export with spreadsheet formula-injection protection
- Modular, persisted technical SEO findings with priority, evidence, recommended actions, status, and notes fields
- Technical checks for responses and links, redirects, titles, descriptions, headings, canonicals, indexability, internal links, images, URL quality, duplicate content, and low-content-page review
- CLI finding filters and formula-safe findings CSV export
- Tauri 2 and React desktop application shell with a persistent toolbar, sidebar, status bar, and accessible keyboard-focus treatment
- Real local project library, stepped New Crawl form, Live Crawl progress with pause/resume/cancel controls, Overview, Action Plan, Finding Detail, and basic URL Inspector
- Automatic post-crawl technical SEO analysis with an explicit analyzing state, recoverable failure, and retry without recrawling
- Database-filtered and paginated Action Plan with priority, category, status, text, and automatic/manual-review filters plus editable notes
- Crawl History with crawl-specific Overview, findings, timing, totals, and audit state
- Newline-delimited JSON Node sidecar protocol used by the desktop host for project access, crawling, auditing, finding updates, inspection, and CSV export
- Explicit unavailable states for Accessibility, Grammar, HTML Validation, Answer Readiness, and Search Console; no fabricated audit data
- A deterministic 100+ page local fixture and automated unit/integration tests

## Prerequisites

- macOS on Apple Silicon is the initial supported development platform
- Node.js 22 or newer
- pnpm 10 or newer (the repository pins pnpm 11.7.0)
- Standard native build tools for `better-sqlite3` if a prebuilt binary is unavailable

Enable pnpm through Corepack when Node includes it:

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
```

## Setup

```bash
pnpm install
pnpm check
```

The workspace explicitly permits install scripts only for `better-sqlite3` and `esbuild`. No post-install script is approved globally.

## Crawl a website

```bash
pnpm seo-auditor crawl https://example.com \
  --project ./projects/example.seocrawl \
  --max-concurrency 10 \
  --requests-per-second 5 \
  --max-urls 0 \
  --respect-robots true
```

`--max-urls 0` means no application-imposed URL limit. The responsible defaults are five concurrent requests, two request starts per second, a 30-second timeout, a ten-hop redirect limit, a 20 MB maximum response, robots compliance, and external-link checking without recursively crawling external sites.

Useful options:

| Option | Default | Meaning |
| --- | ---: | --- |
| `--project <path>` | required | SQLite-backed `.seocrawl` project path |
| `--project-name <name>` | hostname | Display name stored in the project |
| `--max-concurrency <n>` | `5` | Maximum simultaneous crawl tasks |
| `--requests-per-second <n>` | `2` | Maximum request starts per second |
| `--max-urls <n>` | `0` | Internal URL limit; zero is unlimited |
| `--max-depth <n>` | `100` | Maximum discovery depth |
| `--respect-robots <boolean>` | `true` | Apply robots.txt rules |
| `--include-subdomains <boolean>` | `false` | Treat subdomains as internal |
| `--check-external-links <boolean>` | `true` | Check external destinations once |
| `--timeout-ms <n>` | `30000` | Request header/body timeout |
| `--max-response-bytes <n>` | `20971520` | Maximum body size |
| `--max-redirects <n>` | `10` | Redirect hop limit |
| `--max-retries <n>` | `2` | Retries after the initial attempt |
| `--user-agent <value>` | LocalSEOAuditor | Crawl user-agent |

Running another crawl against the same project appends a new crawl record. Exports use the most recent crawl.

## Export URL data

```bash
pnpm seo-auditor export ./projects/example.seocrawl \
  --type urls \
  --format csv \
  --output ./tmp/example-urls.csv
```

## Audit technical SEO findings

Desktop crawls run this audit automatically after a successful static crawl. The CLI command remains available for explicit analysis or recovery. It evaluates the latest crawl stored in the project and replaces its generated findings while preserving deterministic matching statuses and notes.

```bash
pnpm seo-auditor audit ./projects/example.seocrawl

pnpm seo-auditor findings ./projects/example.seocrawl \
  --priority high \
  --category responses \
  --status open

pnpm seo-auditor export ./projects/example.seocrawl \
  --type findings \
  --format csv \
  --output ./tmp/example-findings.csv
```

Priorities are `critical`, `high`, `medium`, `low`, `review`, and `informational`. Findings can also be filtered by `--page <substring>` and `--status open|ignored|resolved|intentional`.

Project settings persist the technical SEO thresholds used by the audit: title and description lengths, low-content word count, deep-page threshold, large-image size, and generic anchor text. Default thresholds are in `packages/shared-types` and are saved with each new crawl.

The current CSV includes original, normalized, and final URLs; response and indexability data; depth and discovery data; timing and byte counts; SHA-256 hashes; robots evidence; errors; and internal-inlink counts.

## Run the acceptance fixture

Terminal 1:

```bash
pnpm fixture
```

Terminal 2:

```bash
pnpm seo-auditor crawl http://localhost:4173 \
  --project ./tmp/fixture.seocrawl \
  --respect-robots true

pnpm seo-auditor export ./tmp/fixture.seocrawl \
  --type urls \
  --format csv \
  --output ./tmp/fixture-urls.csv
```

The fixture includes 105 normal pages, duplicate discoveries, a robots-blocked URL, a redirect chain, 404 and 500 responses, a noindex page, an external destination, images, canonical data, and stable metadata.

## Test and verify

```bash
pnpm typecheck
pnpm test
pnpm check
```

## Run the desktop application

The desktop foundation is macOS-first and requires Rust stable plus Xcode Command Line Tools in addition to the Node prerequisites.

```bash
pnpm --filter @seo-auditor/desktop dev
```

Build a local macOS application bundle:

```bash
pnpm --filter @seo-auditor/desktop build
```

The desktop app launches the Node crawler sidecar locally and exchanges newline-delimited JSON messages. A production build bundles a native Node runtime, the compiled sidecar, and its SQLite native binding inside the `.app`; after copying the DMG application to `/Applications`, it does not depend on a globally installed `node`, `pnpm`, or source checkout. It does not send crawl content to a cloud service.

Use **Open Existing Project…** in the Project Library to choose a saved `.seocrawl` file through the native macOS file picker. New projects default to `~/Documents/Local SEO Auditor/`; relative project paths are resolved there rather than against the installed application directory.

The New Crawl workflow can also **Save Draft**. This creates or updates the local project and persists its crawl settings without making any network request; saved drafts appear in the Project Library and can be opened later to run or revise.

Live Crawl receives sidecar progress events and also polls the native host’s latest event snapshot as a reliability fallback. A missed macOS webview event therefore cannot leave a running local crawl appearing stuck.

Starting a crawl moves directly to Live Crawl after the native host accepts the command. The screen shows a starting state, live page/queue/error counts, current URL, an indeterminate activity wheel for unlimited crawls, and a determinate progress bar when a page limit is set.

After a successful static crawl, Live Crawl shows **Analyzing crawl** while the local technical SEO stage runs. The app reloads crawl-specific metrics and findings before opening Action Plan. A failed audit does not change crawl success or delete crawl data; Action Plan displays **Retry Technical SEO Audit**.

Action Plan retrieval is filtered and paginated in SQLite. Crawl History can select an older run and keeps Overview, findings, and URL Inspector queries scoped to that crawl. The installed-app acceptance checklist is [docs/UAT.md](docs/UAT.md).

Build on Apple Silicon with a native ARM Node runtime. A Rosetta/x86 Node runtime can run command-line tooling but cannot produce a desktop bundle whose native SQLite binding matches the Apple Silicon app.

The integration suite binds a local ephemeral port. Environments that sandbox local networking must permit loopback server access.

## Repository layout

```text
.
├── apps/
│   ├── cli/                 # CLI argument parsing and terminal output
│   ├── crawler/             # Node crawler-runtime package boundary
│   └── desktop/             # Tauri host and React desktop foundation
├── packages/
│   ├── crawl-core/          # queue, HTTP, robots, scope, normalization, extraction
│   ├── database/            # SQLite connection, migration, persistence API
│   ├── reporting/           # streaming, formula-safe CSV output
│   ├── seo-rules/           # modular technical SEO rule engine
│   ├── shared-types/        # cross-package TypeScript contracts and defaults
│   └── test-fixtures/       # deterministic local website and integration tests
├── AGENTS.md                # repository operating rules
├── CHANGELOG.md             # version history
├── SPEC.md                  # product and milestone specification
├── package.json
└── pnpm-workspace.yaml
```

The crawler engine has no CLI or future React dependency. Both the CLI and Tauri sidecar consume the same domain packages.

## SQLite project schema

Migration `0001` creates:

- `projects`: project identity, domain, settings, and schema version
- `crawls`: one row per run, including status, settings, timing, and totals
- `urls`: normalized crawl entities, response data, indexability, hashes, robots evidence, and errors
- `requests`: individual attempts and redacted request/response metadata
- `redirects`: ordered hops for each redirecting source URL
- `links`: every source relationship, destination, anchor, follow state, scope, selector, and external-check result
- `page_elements`: repeated titles, descriptions, headings, canonicals, and robots directives
- `images`: extracted image source, alternatives, dimensions, loading hint, and source page
- `findings`: actionable rule results, priorities, evidence, recommended action, status, and notes
- `technical_audits`: retryable audit attempts, lifecycle state, counts, and redacted failures
- `schema_migrations`: ordered migration history

Indexes cover crawl and normalized URL lookup, statuses, request ownership, redirect lookup, source/destination links, page elements, and images. WAL mode, foreign keys, and a busy timeout are enabled.

## Privacy and request safety

- Crawled page content is processed locally.
- Full source HTML is not stored by default.
- Only a minimal user-agent request header is persisted; authorization headers and cookies are not accepted or logged.
- Private-network literal destinations are blocked when the crawl starts on a public origin. A user-entered localhost/private start URL is treated as explicit permission for local fixture and intranet crawling.
- CSV fields beginning with `=`, `+`, `-`, or `@` are prefixed to prevent formula execution.
- There is no telemetry or AI integration.

## Known current limitations

- Pause, resume, and cancellation are implemented; crash-resume of an interrupted process is not yet implemented.
- DNS-resolved private-address blocking is not complete; the current guard covers literal private and loopback hosts. Production hardening must validate resolved addresses and rebinding.
- Redirect targets may be fetched once as a hop and later once as their own discovered URL. Database URL entities remain unique, but network-hop deduplication will be refined.
- robots.txt redirects are not followed in the current security-conservative implementation.
- Image URLs are extracted but not independently requested in Milestone 1.
- External checks use `HEAD`; servers that reject `HEAD` are recorded as returned and do not yet fall back to a ranged `GET`.
- URL normalization handles required structural cases but does not yet expose configurable tracking-parameter removal.
- XLSX exports, rendered accessibility, grammar, HTML validation, sitemap analysis, answer-readiness audit, and Search Console integration are later milestones.
- Fragment target validation, HTTP-vs-HTML canonical conflict checks, and independent broken-image requests need additional crawl evidence and remain future technical SEO refinements.

## Roadmap

The next product milestone remains outside this closeout. Deeper raw-data views, native Save dialogs, signing/notarization, and crash recovery are release refinements; rendered accessibility and other later audits must not begin until Milestone 3 acceptance is recorded. See `SPEC.md` for the milestone sequence.

The accepted desktop interaction and visual specification is in [docs/ui-ux-spec.md](docs/ui-ux-spec.md).

For external planning beyond the current desktop foundation, see the [Milestone 3 planning handoff](docs/m3-planning-handoff.md).

## Versioning and contribution

The repository uses Git from its first milestone and intends to follow semantic versioning. Keep `README.md`, `SPEC.md`, `AGENTS.md`, and `CHANGELOG.md` synchronized with behavior. See `AGENTS.md` before making structural or schema changes.
