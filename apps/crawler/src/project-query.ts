import { ProjectDatabase } from "@seo-auditor/database";
import type { FindingFilters } from "@seo-auditor/shared-types";

export function queryProjectFindings(projectPath: string, crawlId: string, filters: FindingFilters = {}, page = 1, pageSize = 100) {
  const database = new ProjectDatabase(projectPath);
  try {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(250, Math.max(1, pageSize));
    return {
      crawlId,
      findings: database.listFindings(crawlId, filters, safePageSize, (safePage - 1) * safePageSize),
      total: database.countFindings(crawlId, filters),
      page: safePage,
      pageSize: safePageSize
    };
  } finally {
    database.close();
  }
}
