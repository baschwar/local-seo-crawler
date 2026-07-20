import { ProjectDatabase } from "@seo-auditor/database";
import {
  DEFAULT_SEO_RULE_SETTINGS,
  type AuditFinding,
  type FindingStatus,
  type SeoRuleSettings
} from "@seo-auditor/shared-types";
import { technicalSeoRules } from "./rules.js";

export { technicalSeoRules } from "./rules.js";
export type { AuditRule, AuditFinding, SeoRuleSettings } from "@seo-auditor/shared-types";

export async function runTechnicalSeoAudit(projectPath: string, crawlId?: string): Promise<{ crawlId: string; findingCount: number }> {
  const database = new ProjectDatabase(projectPath);
  try {
    const resolvedCrawlId = crawlId ?? database.latestCrawlId();
    const settings = { ...DEFAULT_SEO_RULE_SETTINGS, ...(database.crawlSettings(resolvedCrawlId).seo ?? {}) };
    const context = database.auditContext(resolvedCrawlId, settings);
    const groups = await Promise.all(technicalSeoRules.map((rule) => rule.evaluate(context)));
    const findings = groups.flat();
    database.replaceFindings(resolvedCrawlId, findings);
    return { crawlId: resolvedCrawlId, findingCount: database.listFindings(resolvedCrawlId).length };
  } finally {
    database.close();
  }
}

export function findingsForProject(projectPath: string, filters: { priority?: string; category?: string; pageUrl?: string; status?: FindingStatus } = {}): AuditFinding[] {
  const database = new ProjectDatabase(projectPath);
  try {
    return database.listFindings(database.latestCrawlId(), filters);
  } finally {
    database.close();
  }
}
