export type CrawlStatus =
  | "running"
  | "completed"
  | "completed_with_errors"
  | "cancelled"
  | "failed";

export type DiscoverySource = "start" | "link" | "redirect" | "image";

export type IndexabilityReason =
  | "indexable"
  | "noindex"
  | "blocked_by_robots"
  | "redirected"
  | "error"
  | "unsupported_content_type"
  | "unknown";

export interface CrawlOptions {
  startUrl: string;
  projectPath: string;
  projectName: string;
  includeSubdomains: boolean;
  respectRobotsTxt: boolean;
  userAgent: string;
  maxConcurrency: number;
  requestsPerSecond: number;
  maxUrls: number;
  maxDepth: number;
  timeoutMs: number;
  maxResponseBytes: number;
  maxRedirects: number;
  maxRetries: number;
  checkExternalLinks: boolean;
  seo?: SeoRuleSettings;
}

export type FindingPriority =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "review"
  | "informational";

export type FindingStatus = "open" | "ignored" | "resolved" | "intentional";

export type AuditCategory =
  | "responses"
  | "redirects"
  | "titles"
  | "meta-descriptions"
  | "headings"
  | "canonicals"
  | "indexability"
  | "internal-linking"
  | "images"
  | "url-quality"
  | "duplicate-content";

export interface FindingEvidence {
  summary: string;
  details: Record<string, unknown>;
}

export interface AuditFinding {
  id: string;
  crawlId: string;
  ruleId: string;
  category: AuditCategory;
  priority: FindingPriority;
  originalPriority: FindingPriority;
  pageUrl: string;
  sourceUrl?: string;
  destinationUrl?: string;
  title: string;
  whatWasFound: string;
  whyItMatters: string;
  evidence: FindingEvidence;
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

export interface FindingFilters {
  priority?: string;
  category?: string;
  pageUrl?: string;
  search?: string;
  status?: FindingStatus;
  reviewType?: "automatic" | "manual-review";
}

export interface CrawlHistoryEntry {
  crawlId: string;
  startedAt: string;
  completedAt?: string;
  status: CrawlStatus;
  totalUrls: number;
  findingCount: number;
  durationMs?: number;
  technicalAuditStatus?: "running" | "completed" | "failed";
  technicalAuditError?: string;
  technicalAuditFindingCount?: number;
}

export interface SeoRuleSettings {
  titleMinLength: number;
  titleMaxLength: number;
  descriptionMinLength: number;
  descriptionMaxLength: number;
  thinContentWordCount: number;
  deepPageThreshold: number;
  largeImageBytes: number;
  genericAnchorText: string[];
}

export const DEFAULT_SEO_RULE_SETTINGS: SeoRuleSettings = {
  titleMinLength: 20,
  titleMaxLength: 60,
  descriptionMinLength: 70,
  descriptionMaxLength: 160,
  thinContentWordCount: 100,
  deepPageThreshold: 3,
  largeImageBytes: 500_000,
  genericAnchorText: ["click here", "here", "learn more", "read more", "more"]
};

export interface AuditPage {
  id: number;
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  contentType: string | null;
  depth: number;
  isInternal: boolean;
  isIndexable: boolean | null;
  indexabilityReason: string;
  wordCount: number | null;
  htmlHash: string | null;
  normalizedHtmlHash: string | null;
  textHash: string | null;
  path: string;
  query: string;
  errorType: string | null;
  errorMessage: string | null;
}

export interface AuditElement {
  urlId: number;
  type: PageElement["type"];
  index: number;
  value: string;
  selector: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditLink {
  id: number;
  sourceUrlId: number;
  destinationUrlId: number | null;
  destinationUrl: string;
  anchorText: string;
  rel: string;
  isFollow: boolean;
  isInternal: boolean;
  selector: string | null;
  destinationStatusCode: number | null;
  destinationError: string | null;
}

export interface AuditImage {
  id: number;
  sourceUrlId: number;
  imageUrl: string;
  altText: string | null;
  width: string | null;
  height: string | null;
  sizeBytes: number | null;
  selector: string | null;
}

export interface AuditRedirect {
  sourceUrlId: number;
  hopNumber: number;
  fromUrl: string;
  toUrl: string;
  statusCode: number;
  redirectType: "permanent" | "temporary" | "other";
}

export interface AuditContext {
  crawlId: string;
  settings: SeoRuleSettings;
  pages: AuditPage[];
  elements: AuditElement[];
  links: AuditLink[];
  images: AuditImage[];
  redirects: AuditRedirect[];
}

export interface AuditRule<TContext = AuditContext> {
  id: string;
  category: AuditCategory;
  title: string;
  defaultPriority: FindingPriority;
  description: string;
  evaluate(context: TContext): Promise<AuditFinding[]>;
}

export interface NormalizedUrl {
  originalUrl: string;
  normalizedUrl: string;
  scheme: string;
  host: string;
  path: string;
  query: string;
  fragment: string;
}

export interface DiscoveredUrl extends NormalizedUrl {
  depth: number;
  discoverySource: DiscoverySource;
  isInternal: boolean;
  sourceUrlId?: number;
}

export interface RedirectHop {
  hopNumber: number;
  fromUrl: string;
  toUrl: string;
  statusCode: number;
  redirectType: "permanent" | "temporary" | "other";
}

export interface ExtractedLink {
  destinationUrl: string;
  anchorText: string;
  rel: string;
  isFollow: boolean;
  domSelector?: string;
  fragment?: string;
}

export interface ExtractedImage {
  imageUrl: string;
  altText: string | null;
  width: string | null;
  height: string | null;
  loading: string | null;
  domSelector?: string;
}

export interface PageElement {
  type: "title" | "description" | "h1" | "h2" | "canonical" | "robots" | "x-robots-tag";
  index: number;
  value: string;
  domSelector?: string;
  metadata?: Record<string, unknown>;
}

export interface PageMetadata {
  title: string | null;
  titleCount: number;
  description: string | null;
  descriptionCount: number;
  canonical: string | null;
  canonicals: string[];
  robots: string[];
  xRobotsTag: string[];
  h1: string[];
  h2: string[];
  wordCount: number;
  htmlHash: string;
  normalizedHtmlHash: string;
  textHash: string;
  links: ExtractedLink[];
  images: ExtractedImage[];
  elements: PageElement[];
}

export interface CrawlProgress {
  crawlId: string;
  crawled: number;
  queued: number;
  blocked: number;
  errors: number;
  currentUrl?: string;
}

export interface SidecarMessage {
  id: string;
  type: string;
  timestamp: string;
  payload: unknown;
}

export interface CrawlSummary {
  projectId: string;
  crawlId: string;
  projectPath: string;
  status: CrawlStatus;
  totalUrls: number;
  fetchedUrls: number;
  blockedUrls: number;
  errorUrls: number;
  elapsedMs: number;
}

export interface RobotsDecision {
  allowed: boolean;
  matchedRule?: string;
}

export const DEFAULT_CRAWL_OPTIONS = {
  includeSubdomains: false,
  respectRobotsTxt: true,
  userAgent: "LocalSEOAuditor/0.1 (+local desktop audit tool)",
  maxConcurrency: 5,
  requestsPerSecond: 2,
  maxUrls: 0,
  maxDepth: 100,
  timeoutMs: 30_000,
  maxResponseBytes: 20 * 1024 * 1024,
  maxRedirects: 10,
  maxRetries: 2,
  checkExternalLinks: true
} as const;
