# Milestone 3 Installed-App UAT

This checklist validates the installed macOS application, not the development server. Use a deterministic local fixture when a network target is needed, record the build path and project path, and preserve no private HTML or credentials in test evidence.

## Execution record

- Date: 2026-07-20
- Build: `Local SEO Auditor_0.3.0_aarch64.dmg`, final rebuild completed 2026-07-20
- Installed application: `/Applications/Local SEO Auditor.app` copied from the DMG (real directory, not a source-tree symlink)
- Fixture origin: `http://localhost:4173`
- Test projects: `/Users/bradschwartz/Documents/Local SEO Auditor/local-seo-audit.seocrawl` for visual checklist execution; `/private/tmp/local-seo-auditor-v030-uat.seocrawl` for final packaged-runtime persistence verification
- Tester: Codex through the installed application accessibility interface plus SQLite evidence
- Result: PASS for the Milestone 3 closeout scope. Two pause/resume presentation races found during the initial checklist were fixed, rebuilt, and retested. The final versioned bundle was installed from the DMG and reverified through its packaged arm64 runtime and persisted database evidence.

## Checks

| Check | Steps | Expected visible result | Expected persisted evidence | Failure criteria |
| --- | --- | --- | --- | --- |
| Launch installed bundle | Copy the built `.app` from the DMG to `/Applications`; launch it without a development server. | Project Library opens without a sidecar or pnpm error. | The app process runs from `/Applications`; bundled resources are used. | App does not launch, shows a sidecar startup error, or needs the source checkout, Node, or pnpm from `PATH`. |
| Create project | Choose **New Crawl**, enter a valid local fixture URL, project name, and writable `.seocrawl` path; continue through all steps. | Four-step flow validates inputs and displays the reviewed settings. | None until Save Draft or Start Crawl. | Invalid input is accepted silently, later-milestone audits are represented as completed, or the path is not writable. |
| Save Draft without network | Stop the fixture server or note its request count; choose **Save Draft**. | A local-save confirmation appears and the project opens without crawl progress. | `.seocrawl` exists with a `projects` row, settings, and no `crawls` row; fixture request count does not change. | Any network request occurs, no project is stored, or a crawl row is created. |
| Open and reopen project | Return to Projects, open the saved card; quit and relaunch, then reopen it. Also exercise **Open Existing Project…**. | The same name, domain, and saved settings appear after reopen. | Recent-project registry contains the path; SQLite project remains readable and migration-complete. | Project disappears, settings change, or reopening requires a network request. |
| Start crawl and starting feedback | Start the fixture, open the draft, choose **Recrawl** or Start Crawl. | UI immediately enters Live Crawl and shows “Starting crawl” before the first completed URL. | A new `crawls` row enters `running`. | New Crawl remains visible, no feedback appears, or duplicate crawl rows are created for one start. |
| Progress | Allow the crawl to run. | Current URL and crawled, queued, blocked, and error counts update. | URLs and request outcomes grow incrementally before completion. | Counts remain frozen while the database grows, or the whole crawl is retained only in memory. |
| Pause | During an active crawl choose **Pause**. | State changes to paused and Resume becomes available. | Existing partial rows remain intact; crawl remains `running` until final disposition. | Stored data disappears, crawl is marked completed, or pause is unavailable during a running crawl. |
| Resume | Choose **Resume** after pausing. | Running state and progress updates return. | The same crawl ID continues accumulating results. | A second crawl is created or progress cannot resume. |
| Cancel | Start a separate crawl, then choose **Cancel** and wait for cancellation. | Visible cancelled state explains that partial results remain. | Crawl is `cancelled`, partial URL data remains, and no `technical_audits` row is created for it. | Partial data is deleted, state is completed, or an automatic audit runs. |
| Successful crawl | Start a fresh fixture crawl and let it finish. | Static crawl transitions to “Analyzing crawl”; it does not open an empty Action Plan. | Crawl is `completed` or `completed_with_errors` with a completion time and plausible URL count. | Crawl stays running, opens an empty report before analysis, or later audit failure changes crawl success. |
| Automatic technical audit | Observe the post-crawl transition. | “Analyzing crawl” is visible, then the populated Action Plan opens. | Exactly one automatic audit attempt has started and completed for the crawl; finding count is non-zero. | No audit starts, more than one starts automatically, or Action Plan opens before findings reload. |
| Audit failure and retry | Use a controlled failing audit test build or automated failure fixture; open the affected crawl. Choose **Retry Technical SEO Audit** after restoring normal analysis. | Crawl remains successful; a non-blocking error and Retry action appear; retry shows analyzing and then a populated Action Plan. | Failed and completed audit attempts are recorded; crawl status is unchanged; findings are repopulated. | Crawl becomes failed, retry requires a new crawl, or previous crawl data is lost. |
| Populated Action Plan and filters | Verify rows; exercise priority, category, status, URL/finding search, and automatic/manual-review filters; page forward/back when available. | Total and rows update; every row includes priority, issue, URL, category, explanation/evidence, action, status, and notes summary. | Queries are scoped to selected crawl and paged from SQLite. | Fixture findings are empty, filters produce unrelated rows, or React loads every finding for a large project. |
| Finding detail and URL Inspector | Choose **Open Finding Detail**, review all sections, then choose **Open URL Inspector**. | Detail shows explanation, evidence, action, review guidance when applicable, status, notes, and page crawl facts. | Inspector data and findings belong to the selected crawl and URL. | Detail fabricates evidence, inspector silently uses a newer crawl, or required fields are absent. |
| Status and note persistence | Change a finding status and save a distinctive note; close/reopen the project and selected crawl. | Updated status and note reappear. | The selected crawl’s `findings` row stores both values; a recurring matching finding retains them according to identity rules. | Changes vanish, alter another finding, or mutate older crawl evidence. |
| Crawl history | Open **Crawl History** and select both completed and cancelled previous crawls. | Each row shows start, completion, state, URL count, finding count, duration, and audit state; selecting a row changes Overview/Action Plan data. | Data is read from crawl-specific rows; cancelled crawl has no completed audit. | History shows only latest crawl, selection still queries latest, or partial results are labeled audited. |
| CSV export | Export findings and URLs to writable paths. | Success notice reports output path and row count. | UTF-8 CSV exists, has plausible rows, and formula-leading cells are protected. | File is missing, row count is implausible, or formula injection is possible. |
| Honest unavailable states | Open Accessibility, Grammar, HTML Validation, Answer Readiness, and Search Console. | Each explicitly says unavailable in the current milestone and shows no result rows. | No related audit tables, services, or dependencies are invoked. | Any pass/fail result is fabricated or a Milestone 4+ dependency runs. |
| No external transmission | During Save Draft and fixture crawl, inspect fixture logs and system network activity as practical. | No telemetry or cloud-analysis notice/request appears. | Requests are limited to the entered target, its discovered destinations, and deliberate external-link checks; no cookies or authorization headers are persisted. | Crawl content, credentials, cookies, or telemetry are sent to an unrelated service. |

## Closeout evidence

Final evidence:

- Final `0.3.0` bundle launched from `/Applications` with the packaged sidecar; no development server, pnpm, or source-tree symlink was used. The application window is configured at 1440 × 920 and should be expanded to the full visible display before future capture-based UAT.
- Save Draft created schema version 3 with one project and zero crawl rows before any crawl started.
- Final uninterrupted installed-runtime fixture run from a clean temporary application-data home: `completed_with_errors`, 121 URLs, one completed technical audit, and 517 findings. The fixture intentionally includes HTTP errors, hence `completed_with_errors`.
- The final app automatically navigated to a populated Action Plan showing page 1 of 6 at 100 rows per page.
- Installed pause/resume verification returned `Resume, Cancel` after pause and `Pause, Cancel` after resume. A separate cancelled run retained 119 discovered URLs and had no audit row.
- A controlled failed crawl retained 119 URL rows, ended in `failed`, passed `PRAGMA integrity_check`, and had no audit row.
- A controlled audit failure left the completed crawl unchanged, recorded a failed audit attempt, and completed a retry with 517 findings without another crawl.
- Finding Detail, status controls, notes editing, and URL Inspector were exercised in the installed app. Final packaged-runtime verification changed a finding to ignored, saved the note `v0.3.0 installed UAT retention note`, recrawled, and confirmed the recurring row inherited both values while the historical row remained unchanged.
- Crawl History rendered in the installed app; the installed bundled sidecar returned both cancelled and completed runs with crawl-specific counts, duration, and audit state.
- Reopening the project through a fresh packaged-sidecar process returned three crawl-history rows and the original ignored finding with its note intact.
- Formula-safe URL and finding exports are covered by the deterministic integration suite; the installed bundle contains the same reporting package and sidecar export handler.
- App executable, bundled Node runtime, and `better_sqlite3.node` are all Mach-O `arm64`. The app is 138 MB and the DMG is 43 MB in this build.
- Later audit navigation remained explicit unavailable states; no Milestone 4 dependency was added.
- Network activity was limited to the entered fixture and intentional crawler destinations. During picker troubleshooting, an existing `baschwar.com` project was selected by mistake and its recrawl was cancelled immediately after the toolbar label exposed the mismatch; no cloud analysis or telemetry service was involved.
- The release-shell environment could launch the final app but macOS denied it assistive-access window inspection. Final visual-state confidence therefore combines the earlier same-code installed-app checklist with final `0.3.0` lifecycle, pagination, persistence, history, retry, and architecture evidence from the packaged runtime.
