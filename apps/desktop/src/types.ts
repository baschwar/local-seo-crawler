export type Priority = "critical" | "high" | "medium" | "low" | "review" | "informational";
export type FindingStatus = "open" | "ignored" | "resolved" | "intentional";

export interface Finding {
  id: string;
  crawlId: string;
  ruleId: string;
  category: string;
  priority: Priority;
  pageUrl: string;
  sourceUrl?: string;
  destinationUrl?: string;
  title: string;
  whatWasFound: string;
  whyItMatters: string;
  evidence: { summary: string; details: Record<string, unknown> };
  recommendedAction: string;
  reviewGuidance?: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  status: FindingStatus;
  notes?: string;
  identityKey?: string;
  recurring?: boolean;
  reviewType?: "automatic" | "manual-review";
}

export interface CrawlHistoryEntry {
  crawlId: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  totalUrls: number;
  findingCount: number;
  durationMs?: number;
  technicalAuditStatus?: "running" | "completed" | "failed";
  technicalAuditError?: string;
  technicalAuditFindingCount?: number;
}

export interface ProjectSummary {
  projectPath: string;
  name: string;
  domain: string;
  crawlId?: string;
  crawlStatus?: string;
  startedAt?: string;
  completedAt?: string;
  totalUrls: number;
  indexableUrls: number;
  nonIndexableUrls: number;
  errors: number;
  redirects: number;
  openFindings: number;
  priorityCounts: Record<Priority, number>;
  categoryCounts: Array<{ category: string; count: number; highestPriority: Priority | null }>;
  technicalAuditStatus?: "running" | "completed" | "failed";
  technicalAuditError?: string;
}

export interface UrlInspectorData {
  url: Record<string, unknown>;
  elements: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
  images: Array<Record<string, unknown>>;
  findings: Finding[];
}

export interface SidecarMessage {
  id: string;
  type: string;
  timestamp: string;
  payload: unknown;
}
