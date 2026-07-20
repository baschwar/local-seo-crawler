# UI and UX Addendum

Status: adopted product specification for the desktop UI. This document refines Milestone 3 and later interface work; it does not authorize implementation of Tauri, React, or later audits ahead of their milestones.

## Product goal

Move the user through a simple repair workflow:

1. Start or reopen a crawl project.
2. Review the most important findings.
3. Understand the evidence and impact.
4. Open the affected page or inspect its crawl data.
5. Export an actionable repair checklist.

The Action Plan is the primary post-crawl experience. Raw data supports investigation but must not displace actionable work.

## Design principles

- Desktop-first, professional, dense enough for audit work, and usable with large datasets.
- Clear for people who are not SEO specialists.
- Keyboard accessible, consistent across audit categories, and capable of revealing raw evidence in context.
- Use priority and recommended action rather than universal SEO, accessibility, or GEO scores.
- Avoid decorative gauges, hidden navigation, excessive dialogs, and workflows that require multiple screens just to understand one finding.

## Application shell

Use a persistent three-part layout:

```text
Application toolbar
Primary sidebar | Main workspace
Crawl and task status bar
```

The toolbar remains visible and includes the current project/domain, crawl status, New Crawl, Recrawl, Export, Settings, report search, and an overflow menu.

The primary sidebar contains:

```text
Overview
Action Plan

Audit
  Technical SEO
  Accessibility
  Grammar
  HTML Validation
  Answer Readiness

Crawl Data
  URLs
  Links
  Redirects
  Titles and Descriptions
  Headings
  Images
  Canonicals and Directives
  Structured Data
  Sitemap

Performance
  Search Console

Project
  Crawl History
  Exports
  Settings
```

Show applicable issue counts, support an icon-only collapsed state, and make counts reflect active filters where practical.

The status bar shows task state, phase, completed/queued URLs, request rate, later-audit progress, Search Console state, and database-save state. When idle, it shows the latest crawl date and status.

## Project library and new crawl

The initial screen is a project library, not a zero-value dashboard. Project cards show name, domain, last crawl/status, URL count, critical/high/open findings, and Search Console state. Actions: open, new crawl, recrawl, rename, duplicate, reveal project file, export latest report, and delete. Deleting always requires confirmation.

The empty state offers New Project and Open Existing Project with a concise explanation of the audits.

New Crawl is a stepped workflow:

1. **Website:** starting URL, project name, save location; validate URL before continuing.
2. **Scope:** domain/subdomains/directory/custom scope, patterns, external checking, sitemap URL, and optional URL list.
3. **Behavior:** robots, user-agent, concurrency, request rate, timeout, response size, and maximum URLs; display `No limit` for zero.
4. **Audit options:** technical SEO, accessibility, grammar, validation, answer readiness, and Search Console; expose rendering controls when that feature exists.
5. **Review:** a human-readable scope, speed, audit, and Search Console summary before Start Crawl.

Save Settings, Back, and Cancel are secondary actions.

## Live crawl

The live screen shows status, start URL, elapsed time, Pause, Resume, and Cancel. Compact progress includes crawled/queued URLs, errors, redirects, blocked URLs, and external URLs checked.

Display crawl phases with `waiting`, `running`, `paused`, `completed`, `completed with errors`, `failed`, and `skipped` states:

```text
Static crawl              Running
Accessibility audit       Waiting
Grammar audit             Waiting
HTML validation           Waiting
Search Console import     Completed
Report generation         Waiting
```

Show a calm recent-activity table (URL, status, content type, depth, response time, findings, phase). Allow incomplete early critical/high findings to appear with clear labeling.

## Overview

Overview summarizes but does not replace the Action Plan. Show crawl date/duration, URL/indexability/blocked/error/redirect totals, optional Search Console range, priority counts, compact audit-category cards, and five to ten top actions. Selecting any priority or category opens the corresponding filtered Action Plan.

Crawl-health trends appear only once comparison data exists.

## Action Plan

This is the default completed-crawl screen. Default grouping is by action:

- Fix Broken Experiences
- Improve Accessibility
- Review Search Visibility
- Improve Page Clarity
- Improve Crawl Efficiency
- Review Markup and Validation

Allow grouping by priority, page, audit category, or an ungrouped table.

Core columns are Priority, Page, Finding, Recommended Action, Category, Evidence, Search Impressions, Search Clicks, and Status. Optional columns include source/destination URLs, accessibility impact, rule ID, first/last detected, and notes.

Support sorting, resizing, reordering, visibility, saved layouts, full-text search, persistent multi-column filters, multi-select, bulk status changes/export, copying, browser opening, and virtualized rows. Filters include priority, category, status, page/directory, traffic, indexability, impact, finding type, and crawl date. Presets include Critical and high, Pages with search traffic, Accessibility only, Broken links, New since last crawl, Manual review, Ignored, and Resolved.

Selecting a finding opens its detail panel without leaving the table.

## Finding Detail panel

Use a resizable right-side panel with priority, title, page URL, status, Open Page, Open Inspector, and More controls.

Required sections:

- **What Was Found:** direct plain-language explanation.
- **Why It Matters:** user, accessibility, crawl, indexing, or visibility impact.
- **Evidence:** status, sources/destinations, anchor, selector, excerpt, validator/grammar context, metrics, and later screenshots when available.
- **Recommended Action:** direct repair instruction.
- **Review Guidance:** only when human judgment is needed.
- **Affected Instances:** occurrence table with selector, context, source/destination, and count.
- **Search Performance:** metrics, queries, and transparent traffic-based priority adjustment when available.

Actions: mark resolved, intentional, or ignored; scoped ignores when supported; add note; copy/export finding. The current Milestone 2 status model is the source of truth for these controls.

## URL Inspector

The inspector is the complete page-level view. Header: page/final URL, status, indexability, depth, Search Console metrics, Open Live Page, and Recrawl Page.

Tabs:

- Summary: findings, category counts, highest priority, metadata, traffic summary.
- SEO: title, description, headings, canonical, directives, type, word count, depth, sitemap status.
- Links: inlinks, outlinks, external links, anchors, redirects, and broken links.
- Accessibility, Grammar, HTML Validation, Answer Readiness, and Search Console as their respective features arrive.
- Source: headers, source/rendered HTML, structured data, and browser-console errors. Large source loads only on demand.

## Category screens

Technical SEO provides category cards for errors, redirects, indexability, metadata, headings, canonicals, links, images, duplicate/thin content, and URL quality. It also exposes raw tables, but raw tables are never the default landing view.

Later audit screens follow the same pattern: a concise summary, focused finding table, grouped rule view where useful, evidence in the shared detail panel, and manual-review work separate from automated results.

Accessibility keeps automated violations and manual tasks separate. Grammar highlights matched text in context and never edits the live site. HTML validation defaults to prioritized messages with source context. Answer Readiness uses evidence-based categories, not a GEO score. Search Console clearly explains connection/privacy and makes imported metrics and opportunities inspectable.

## Export and settings

The toolbar Export action opens a focused panel for Action Plan XLSX, full audit XLSX, current/selected CSV rows, individual report CSV, or all CSV reports. Support destination selection, remembered location, progress, open/reveal actions, and later worksheet inclusion options.

Settings sections: Crawl, Scope, SEO Rules, Accessibility, Grammar, HTML Validation, Search Console, and Storage. Existing project SEO rule thresholds map directly to the SEO Rules section.

## Visual language

Use a neutral professional interface and the system font. Color reinforces meaning but never communicates status alone:

| Role | Meaning |
| --- | --- |
| Critical / High | strong error or warning treatment |
| Medium / Low | attention treatment with lower emphasis |
| Review | informational treatment |
| Informational | neutral treatment |
| Resolved | success treatment |
| Ignored | muted treatment |

Use text labels or icons with color. URLs, selectors, code, and HTML use a monospaced face. Support compact and comfortable table density. Icons are consistent and unfamiliar actions retain text labels.

## Application accessibility and keyboard use

The auditor itself must provide keyboard navigation, visible focus, named controls, logical headings, screen-reader-compatible tables, contrast, text resizing/zoom, modal focus management, skip navigation where useful, reduced motion, and keyboard-accessible tooltips. All primary workflows must work without a mouse.

Suggested shortcuts: `Cmd-N` New Crawl, `Cmd-O` Open, `Cmd-R` Recrawl, `Cmd-E` Export, `Cmd-F` report search, `Cmd-,` settings, Space pause/resume, `Cmd-K` command search, Escape close, Return open selected finding. Display shortcuts in menus.

## States, notifications, and performance

Every screen defines loading, empty, partial-data, failed, and retry states. Optional audit failures never make a project appear corrupt. Use non-blocking notifications for completed tasks and services. Reserve confirmations for cancellation, deletion, destructive clearing/resetting, and disconnecting Search Console.

Receive incremental crawl updates, but batch recent URLs and query large report tables from SQLite. Never send full crawl results through Tauri events. The primary target is 1280×800 or larger; on smaller desktop windows collapse the sidebar, hide optional columns, and convert the detail panel to a full-screen overlay. Mobile is out of scope.

## Implementation sequence and definition of done

Implement in this order: application shell, project library, new crawl, live crawl, overview, Action Plan, Finding Detail, URL Inspector, Technical SEO, export, later audit screens, settings, and crawl history.

The UI base is done only when a user can create/configure/start a project, monitor and control a crawl, open and filter the Action Plan, understand selected evidence, open the live page and URL Inspector, change finding status, review later audit/traffic results, export reports, and reopen the project without data loss. The Action Plan, Finding Detail panel, and URL Inspector are the three highest-priority components.
