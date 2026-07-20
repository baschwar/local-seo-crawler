# Agent Guide

This repository contains a local-first SEO and accessibility auditing application. The current implementation scope is Milestone 3: the static crawler, technical SEO findings, and Tauri desktop foundation.

## Source of truth

- `SPEC.md` defines product scope, architecture, milestones, and acceptance criteria.
- `README.md` documents commands that work in the current revision.
- `CHANGELOG.md` records user-visible changes.
- Database changes must be migrations in `packages/database/src/migrations`.

If code and documentation disagree, fix both in the same change. Do not silently broaden the active milestone.

## Repository boundaries

- `apps/cli`: argument parsing and human-readable terminal output only.
- `apps/crawler`: Node sidecar/runtime package boundary; keep desktop IPC out until its milestone.
- `apps/desktop`: Tauri 2 host and React desktop screens; it renders data but does not contain crawl or audit domain logic.
- `packages/crawl-core`: crawling, scope, robots, extraction, and orchestration.
- `packages/seo-rules`: modular, deterministic technical SEO rules only.
- `packages/database`: SQLite connections, migrations, and persistence methods.
- `packages/shared-types`: cross-package contracts with no runtime dependencies.
- `packages/reporting`: streaming, formula-safe exports.
- `packages/test-fixtures`: the local deterministic test server.

Domain logic must never move into the future React UI. The CLI and future desktop sidecar must call the same crawl engine.

The production desktop bundle must include the Node sidecar runtime and its native dependencies. Never require a user who installs the DMG to have `pnpm`, Node, or a source checkout available in their shell PATH. Keep the bundled Node architecture aligned with the Tauri target and `better-sqlite3` binding.

## Development rules

1. Use pnpm workspaces and TypeScript strict mode.
2. Preserve local-first privacy: no content may be sent to AI or public analysis services.
3. Respect robots.txt by default and retain blocked URLs in project data.
4. Keep crawling conservative. Defaults are five concurrent requests and two request starts per second.
5. Normalize for deduplication without deleting arbitrary query parameters.
6. Persist discoveries and request outcomes incrementally; do not retain a whole crawl in memory.
7. Redact secrets from logs and never persist cookies or authorization headers.
8. Treat optional later audits as independent stages; their failure must not invalidate a completed crawl.
9. Add or update tests for behavior changes.
10. Update `README.md`, `SPEC.md`, and `CHANGELOG.md` when commands, behavior, schema, or scope changes.

## Verification

Before handing off a change, run:

```bash
pnpm check
```

For crawler changes, also run the fixture acceptance flow documented in `README.md`. Verify the SQLite project and CSV file exist and contain plausible row counts.

## Git hygiene

- Keep generated databases, CSVs, coverage, and dependencies untracked.
- Use focused commits with imperative subjects.
- Never rewrite or discard user changes.
- Do not commit secrets, OAuth credentials, cookies, captured private HTML, or screenshots.
- Keep the repository ready for GitHub, but do not push, tag, or create releases unless explicitly requested.

## Scope guardrail

Milestone 3 implements only the reusable desktop foundation: shell/sidebar, project library, New Crawl, Live Crawl, Overview, Action Plan, Finding Detail, basic URL Inspector, and export entry points. Accessibility, grammar, validation, answer-readiness, and Search Console may expose navigation and explicit unavailable states, but must not fabricate results before their milestones. Do not add Playwright, axe-core, LanguageTool, Nu HTML Checker, Google APIs, or AI integrations yet.
