# Local SEO Auditor

Local SEO Auditor is a local-first macOS desktop crawler focused on turning website crawl evidence into a prioritized technical SEO Action Plan. It is private by default: crawl data stays on the machine, and the product has no telemetry, cloud crawling, analytics-service connection, or AI-service integration.

The installed desktop application is the primary workflow. A shared TypeScript domain layer also supports a command-line interface for development, automation, recovery, and explicit analysis.

## Current release

- **Version:** 0.3.0
- **Status:** Milestone 3 release closeout
- **Platform:** macOS on Apple Silicon
- **Available audit:** Technical SEO
- **Unavailable in this milestone:** Accessibility, Grammar, HTML Validation, Answer Readiness, and Search Console

Unavailable audits display explicit unavailable states. They do not fabricate results or silently run later-milestone services.

## What works now

### Crawl

- Breadth-first discovery of internal HTTP and HTTPS pages
- Normalized-URL deduplication without deleting arbitrary query parameters
- Exact-host scope with optional subdomain inclusion
- Conservative concurrency, request-rate, timeout, response-size, redirect, and retry controls
- robots.txt fetched once per origin and evaluated by user-agent, with blocked URLs and matching rules retained
- Manual redirect following with ordered redirect histories and loop/limit protection
- Incremental persistence of status, content type, timing, byte size, depth, discovery source, request attempts, and errors
- Extraction of titles, meta descriptions, headings, links, images, canonicals, robots directives, word counts, and other static page evidence
- SHA-256 hashes for raw HTML, normalized HTML, and visible text
- Internal source-to-destination relationships and external-link status checks
- SQLite-backed `.seocrawl` projects that retain partial data for failed and cancelled crawls

### Analyze

- Automatic technical SEO analysis after successful desktop crawls
- No automatic technical SEO audit for failed or cancelled crawls
- Isolated audit failure with retry that does not require another crawl or invalidate successful crawl data
- Deterministic checks for responses and links, redirects, titles, descriptions, headings, canonicals, indexability, internal linking, images, URL quality, duplicate content, and low-content review
- Persisted findings with priority, category, explanation, evidence, recommended action, review guidance, status, and notes
- Deterministic cross-run finding identity based on rule, normalized URL, and evidence target or discriminator
- Crawl-specific historical finding rows with recurring status and note retention

Each crawl retains its original finding records, while recurring findings can inherit their status and notes from earlier crawls.

### Act

- Database-filtered and paginated Action Plan for large projects
- Filters for priority, category, status, URL/finding text, and automatic versus manual-review findings
- Finding Detail with evidence, recommended action, review guidance, editable notes, and status controls
- Explicit **Open URL Inspector** action for page-level crawl evidence
- Priority and category summaries backed by persisted findings

### Review and export

- Local project library, native project picker, Save Draft, and project reopen workflow
- Live Crawl progress with pause, resume, and cancel controls
- Crawl History with run state, timing, URL count, finding count, duration, audit state, and prior-run selection
- Crawl-scoped Overview, Action Plan, findings, and URL Inspector data when reviewing a previous run
- Streaming UTF-8 CSV export for URLs with spreadsheet formula-injection protection
- Formula-safe CSV export for findings
- No XLSX export yet
- Deterministic 100+ page fixture and unit/integration acceptance suite

## Desktop workflow

Launch the installed application, create a project or choose **Open Existing Project…**, and review the crawl settings. New projects default to `~/Documents/Local SEO Auditor/`; relative paths are resolved there rather than against the installed application. **Save Draft** persists the project and settings without making a network request.

Starting a crawl opens Live Crawl immediately with starting feedback, current URL, page/queue/blocked/error counts, pause/resume/cancel controls, indeterminate activity for unlimited crawls, and bounded progress when a URL limit is set. Failed and cancelled runs keep their partial project data and do not start an automatic audit.

After a successful static crawl, the app shows **Analyzing crawl** while the local technical SEO audit runs. It reloads crawl-specific metrics and findings before opening the populated Action Plan. If analysis fails, the crawl remains successful and available; the Action Plan displays a non-blocking error and **Retry Technical SEO Audit**, which reruns analysis without recrawling.

Action Plan queries are filtered and paginated in SQLite. Crawl History can select an earlier run, after which Overview, findings, and URL Inspector remain scoped to that selected crawl. The installed-app acceptance record is in [docs/UAT.md](docs/UAT.md).

## CLI: development, automation, and recovery

The CLI exercises the same crawler, audit, persistence, and reporting packages as the desktop application. It is retained as a development interface, an automation interface, and a recovery or explicit-analysis interface; it is not the primary installed-user experience.

### Prerequisites

- macOS on Apple Silicon is the initial supported development platform
- Node.js 22 or newer
- pnpm 10 or newer (the repository pins pnpm 11.7.0)
- Standard native build tools for `better-sqlite3` if a prebuilt binary is unavailable

Enable pnpm through Corepack when Node includes it:

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
```

### Setup

```bash
pnpm install
pnpm check
```

The workspace explicitly permits install scripts only for `better-sqlite3` and `esbuild`. No post-install script is approved globally.

### Crawl a website

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

Running another crawl against the same project appends a new crawl record. CLI exports use the most recent crawl.

### Export URL data

CSV URL export is available:

```bash
pnpm seo-auditor export ./projects/example.seocrawl \
  --type urls \
  --format csv \
  --output ./tmp/example-urls.csv
```

The URL CSV includes original, normalized, and final URLs; response and indexability data; depth and discovery data; timing and byte counts; SHA-256 hashes; robots evidence; errors; and internal-inlink counts.

### Audit and export technical SEO findings

Use the CLI audit command for explicit analysis or recovery against the latest crawl. It replaces generated findings for that crawl while preserving deterministic matching status and notes.

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

CSV findings export is available. XLSX export is not yet available.

Priorities are `critical`, `high`, `medium`, `low`, `review`, and `informational`. Findings can also be filtered by `--page <substring>` and `--status open|ignored|resolved|intentional`.

Project settings persist the technical SEO thresholds used by the audit: title and description lengths, low-content word count, deep-page threshold, large-image size, and generic anchor text. Default thresholds are in `packages/shared-types` and are saved with each new crawl.

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

The integration suite binds a local ephemeral port. Environments that sandbox local networking must permit loopback server access.

## Desktop development and architecture

Desktop development requires Rust stable and Xcode Command Line Tools in addition to the Node prerequisites.

```bash
pnpm --filter @seo-auditor/desktop dev
```

Build a local macOS application bundle:

```bash
pnpm --filter @seo-auditor/desktop build
```

The Tauri/React desktop is a presentation layer over the same Node/TypeScript domain packages used by the CLI. The Rust host launches a local Node sidecar and exchanges newline-delimited JSON messages; native-host snapshot polling backs up webview event delivery. Production builds bundle the compiled sidecar, an arm64 Node runtime, and the architecture-matched `better-sqlite3` binding inside the `.app`, so an application copied from the DMG to `/Applications` does not depend on global Node, pnpm, or a source checkout. Builds must use native Apple Silicon Node: a Rosetta/x86 Node process cannot produce a bundle compatible with the arm64 application and SQLite binding. Detailed boundaries and packaging requirements are in [SPEC.md](SPEC.md) and [AGENTS.md](AGENTS.md).

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
├── PROJECT_STATUS.md        # current milestone verification status
├── SPEC.md                  # product and milestone specification
├── package.json
└── pnpm-workspace.yaml
```

The crawler engine has no CLI or React dependency. Both the CLI and desktop sidecar consume the same domain packages.

## SQLite project schema

Ordered migrations `0001` through `0003` create:

- `projects`: project identity, domain, settings, and schema version
- `crawls`: one row per run, including status, settings, timing, and totals
- `urls`: normalized crawl entities, response data, indexability, hashes, robots evidence, and errors
- `requests`: individual attempts and redacted request/response metadata
- `redirects`: ordered hops for each redirecting source URL
- `links`: every source relationship, destination, anchor, follow state, scope, selector, and external-check result
- `page_elements`: repeated titles, descriptions, headings, canonicals, and robots directives
- `images`: extracted image source, alternatives, dimensions, loading hint, and source page
- `findings`: crawl-specific actionable results, deterministic identity, recurrence, priorities, evidence, recommended action, review type, status, and notes
- `technical_audits`: retryable audit attempts, lifecycle state, counts, and redacted failures
- `schema_migrations`: ordered migration history

Indexes cover crawl and normalized URL lookup, finding filters and identity, statuses, request ownership, redirect lookup, source/destination links, page elements, and images. WAL mode, foreign keys, and a busy timeout are enabled.

## Privacy and request safety

- Crawled page content is processed locally.
- Full source HTML is not stored by default.
- Only a minimal user-agent request header is persisted; authorization headers and cookies are not accepted or logged.
- Private-network literal destinations are blocked when the crawl starts on a public origin. A user-entered localhost/private start URL is treated as explicit permission for local fixture and intranet crawling.
- CSV fields beginning with `=`, `+`, `-`, or `@` are prefixed to prevent formula execution.
- There is no telemetry, cloud crawling, analytics-service connection, or AI-service integration.

## Known current limitations

- Crash recovery and resumption of an interrupted process are not yet implemented.
- DNS-resolved private-address blocking is not complete; the current guard covers literal private and loopback hosts. Production hardening must validate resolved addresses and rebinding.
- Redirect targets may be fetched once as a hop and later once as their own discovered URL. Database URL entities remain unique, but network-hop deduplication will be refined.
- robots.txt redirects are not followed in the current security-conservative implementation.
- Image URLs are extracted but not independently requested.
- External checks use `HEAD`; servers that reject `HEAD` are recorded as returned and do not yet fall back to a ranged `GET`.
- URL normalization handles required structural cases but does not yet expose configurable tracking-parameter removal.
- XLSX export, rendered Accessibility, Grammar, HTML Validation, sitemap analysis, Answer Readiness, and Search Console are not yet available.
- Fragment target validation, HTTP-vs-HTML canonical conflict checks, and independent broken-image requests need additional crawl evidence and remain future technical SEO refinements.

## Roadmap

Likely later work, outside the Milestone 3 scope, includes:

- Rendered Accessibility auditing with explicit automatic and manual-review evidence
- Local HTML validation
- Local Grammar and spelling review
- Deterministic Answer Readiness / AEO / GEO analysis without a universal score
- XLSX report export
- Cross-crawl comparison, regression detection, and historical reporting
- Search Console integration after the core local audit stages
- Possible later PageSpeed Insights and Google Analytics integrations; neither is connected in the current product

Milestone 3 remains limited to the static crawler, technical SEO findings, desktop workflow, local persistence, and CSV export. See [SPEC.md](SPEC.md) for milestone boundaries and acceptance criteria.

The accepted desktop interaction and visual specification is in [docs/ui-ux-spec.md](docs/ui-ux-spec.md). The completed desktop closeout record is in [docs/m3-planning-handoff.md](docs/m3-planning-handoff.md).

## Versioning and contribution

The repository uses Git and intends to follow semantic versioning. Keep `README.md`, `SPEC.md`, `AGENTS.md`, and `CHANGELOG.md` synchronized with behavior. See [AGENTS.md](AGENTS.md) before making structural or schema changes.
