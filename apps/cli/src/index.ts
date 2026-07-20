#!/usr/bin/env node
import { basename, isAbsolute, resolve } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { crawl } from "@seo-auditor/crawler";
import { exportFindingsCsv, exportUrlsCsv } from "@seo-auditor/reporting";
import { findingsForProject, runTechnicalSeoAudit } from "@seo-auditor/seo-rules";
import { DEFAULT_CRAWL_OPTIONS, DEFAULT_SEO_RULE_SETTINGS, type CrawlOptions } from "@seo-auditor/shared-types";

function integer(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new InvalidArgumentError("Expected a non-negative integer.");
  return parsed;
}

function positiveNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new InvalidArgumentError("Expected a positive number.");
  return parsed;
}

function boolean(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InvalidArgumentError("Expected true or false.");
}

function invocationPath(value: string): string {
  if (isAbsolute(value)) return value;
  return resolve(process.env.INIT_CWD ?? process.cwd(), value);
}

const program = new Command()
  .name("seo-auditor")
  .description("Local-first SEO crawler")
  .version("0.1.0");

program
  .command("crawl")
  .description("Crawl a site into a local .seocrawl SQLite project")
  .argument("<url>", "starting HTTP or HTTPS URL")
  .requiredOption("--project <path>", "project database path")
  .option("--project-name <name>", "project display name")
  .option("--max-concurrency <number>", "maximum concurrent requests", integer, DEFAULT_CRAWL_OPTIONS.maxConcurrency)
  .option("--requests-per-second <number>", "maximum request starts per second", positiveNumber, DEFAULT_CRAWL_OPTIONS.requestsPerSecond)
  .option("--max-urls <number>", "maximum internal URLs; 0 is unlimited", integer, DEFAULT_CRAWL_OPTIONS.maxUrls)
  .option("--max-depth <number>", "maximum link depth", integer, DEFAULT_CRAWL_OPTIONS.maxDepth)
  .option("--respect-robots <boolean>", "respect robots.txt", boolean, DEFAULT_CRAWL_OPTIONS.respectRobotsTxt)
  .option("--include-subdomains <boolean>", "include subdomains in crawl scope", boolean, DEFAULT_CRAWL_OPTIONS.includeSubdomains)
  .option("--check-external-links <boolean>", "check but do not crawl external links", boolean, DEFAULT_CRAWL_OPTIONS.checkExternalLinks)
  .option("--timeout-ms <number>", "per-request timeout in milliseconds", integer, DEFAULT_CRAWL_OPTIONS.timeoutMs)
  .option("--max-response-bytes <number>", "maximum downloaded response size", integer, DEFAULT_CRAWL_OPTIONS.maxResponseBytes)
  .option("--max-redirects <number>", "maximum redirect hops", integer, DEFAULT_CRAWL_OPTIONS.maxRedirects)
  .option("--max-retries <number>", "retry count for request failures and retryable responses", integer, DEFAULT_CRAWL_OPTIONS.maxRetries)
  .option("--user-agent <value>", "crawler user agent", DEFAULT_CRAWL_OPTIONS.userAgent)
  .action(async (url: string, flags: Record<string, unknown>) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Starting URL must use HTTP or HTTPS.");
    const options: CrawlOptions = {
      startUrl: url,
      projectPath: invocationPath(String(flags.project)),
      projectName: flags.projectName ? String(flags.projectName) : parsed.hostname,
      includeSubdomains: Boolean(flags.includeSubdomains),
      respectRobotsTxt: Boolean(flags.respectRobots),
      userAgent: String(flags.userAgent),
      maxConcurrency: Number(flags.maxConcurrency),
      requestsPerSecond: Number(flags.requestsPerSecond),
      maxUrls: Number(flags.maxUrls),
      maxDepth: Number(flags.maxDepth),
      timeoutMs: Number(flags.timeoutMs),
      maxResponseBytes: Number(flags.maxResponseBytes),
      maxRedirects: Number(flags.maxRedirects),
      maxRetries: Number(flags.maxRetries),
      checkExternalLinks: Boolean(flags.checkExternalLinks),
      seo: { ...DEFAULT_SEO_RULE_SETTINGS }
    };
    let lastUpdate = 0;
    const summary = await crawl(options, {
      onProgress(progress) {
        if (Date.now() - lastUpdate < 500) return;
        lastUpdate = Date.now();
        process.stderr.write(
          `\rCrawled ${progress.crawled} | queued ${progress.queued} | blocked ${progress.blocked} | errors ${progress.errors}`
        );
      }
    });
    process.stderr.write("\n");
    console.log(`Crawl ${summary.status}: ${summary.totalUrls} URLs stored in ${summary.projectPath}`);
    console.log(`Fetched ${summary.fetchedUrls}; blocked ${summary.blockedUrls}; errors ${summary.errorUrls}.`);
  });

program
  .command("audit")
  .description("Evaluate technical SEO rules for the latest crawl in a project")
  .argument("<project>", "project database path")
  .action(async (project: string) => {
    const result = await runTechnicalSeoAudit(invocationPath(project));
    console.log(`Stored ${result.findingCount} technical SEO findings for crawl ${result.crawlId}.`);
  });

program
  .command("findings")
  .description("List actionable technical SEO findings from the latest crawl")
  .argument("<project>", "project database path")
  .option("--priority <priority>", "filter by priority")
  .option("--category <category>", "filter by category")
  .option("--page <url>", "filter by page URL substring")
  .option("--status <status>", "filter by finding status")
  .action((project: string, flags: Record<string, unknown>) => {
    const findings = findingsForProject(invocationPath(project), {
      ...(flags.priority ? { priority: String(flags.priority) } : {}),
      ...(flags.category ? { category: String(flags.category) } : {}),
      ...(flags.page ? { pageUrl: String(flags.page) } : {}),
      ...(flags.status ? { status: String(flags.status) as "open" | "ignored" | "resolved" | "intentional" } : {})
    });
    for (const item of findings) console.log(`${item.priority.toUpperCase()} | ${item.category} | ${item.pageUrl}\n${item.title}: ${item.recommendedAction}\n`);
    console.log(`${findings.length} finding${findings.length === 1 ? "" : "s"}.`);
  });

program
  .command("export")
  .description("Export data from a .seocrawl project")
  .argument("<project>", "project database path")
  .requiredOption("--type <type>", "export dataset (urls or findings)")
  .requiredOption("--format <format>", "export format (currently: csv)")
  .requiredOption("--output <path>", "output file path")
  .action(async (project: string, flags: Record<string, unknown>) => {
    if (flags.format !== "csv") throw new Error(`Unsupported export format: ${String(flags.format)}`);
    const projectPath = invocationPath(project);
    const outputPath = invocationPath(String(flags.output));
    if (flags.type === "urls") {
      const result = await exportUrlsCsv(projectPath, outputPath);
      console.log(`Exported ${result.rows} URL rows to ${result.outputPath}`);
    } else if (flags.type === "findings") {
      const result = await exportFindingsCsv(projectPath, outputPath);
      console.log(`Exported ${result.rows} finding rows to ${result.outputPath}`);
    } else throw new Error(`Unsupported export type: ${String(flags.type)}`);
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${basename(process.argv[1] ?? "seo-auditor")}: ${message}`);
  process.exitCode = 1;
});
