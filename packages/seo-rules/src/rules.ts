import { randomUUID } from "node:crypto";
import type {
  AuditContext,
  AuditFinding,
  AuditPage,
  AuditRule,
  FindingPriority
} from "@seo-auditor/shared-types";

const htmlPage = (page: AuditPage) => Boolean(page.contentType?.includes("html"));
const key = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const words = (value: string) => new Set(key(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean));

function finding(input: Omit<AuditFinding, "id" | "firstDetectedAt" | "lastDetectedAt" | "status" | "originalPriority"> & { originalPriority?: FindingPriority }): AuditFinding {
  const now = new Date().toISOString();
  return {
    ...input,
    id: randomUUID(),
    originalPriority: input.originalPriority ?? input.priority,
    firstDetectedAt: now,
    lastDetectedAt: now,
    status: "open"
  };
}

function indexContext(context: AuditContext) {
  const pages = new Map(context.pages.map((page) => [page.id, page]));
  const elements = new Map<number, AuditContext["elements"]>();
  for (const element of context.elements) elements.set(element.urlId, [...(elements.get(element.urlId) ?? []), element]);
  const byType = (id: number, type: AuditContext["elements"][number]["type"]) => (elements.get(id) ?? []).filter((element) => element.type === type);
  const pageByUrl = new Map(context.pages.map((page) => [page.url, page]));
  return { pages, elements, byType, pageByUrl };
}

const responseRule: AuditRule = {
  id: "response-errors-and-broken-links",
  category: "responses",
  title: "Broken responses and links",
  defaultPriority: "high",
  description: "Identifies response failures and the pages that link to them.",
  async evaluate(context) {
    const output: AuditFinding[] = [];
    const { pages } = indexContext(context);
    for (const page of context.pages.filter((item) => item.isInternal && ((item.statusCode ?? 0) >= 400 || item.errorType))) {
      const priority: FindingPriority = (page.statusCode ?? 0) >= 500 || page.errorType ? "critical" : "high";
      output.push(finding({
        crawlId: context.crawlId, ruleId: "response-page-failure", category: "responses", priority, pageUrl: page.url,
        title: page.errorType ? "Request failure" : `HTTP ${page.statusCode} response`,
        whatWasFound: page.errorType ? `${page.errorType}: ${page.errorMessage ?? "No error detail recorded."}` : `The page returned HTTP ${page.statusCode}.`,
        whyItMatters: "Visitors and crawlers cannot reliably access this URL.",
        evidence: { summary: page.errorType ?? `HTTP ${page.statusCode}`, details: { statusCode: page.statusCode, errorType: page.errorType, errorMessage: page.errorMessage } },
        recommendedAction: "Repair the destination or redirect it intentionally to a working, relevant URL."
      }));
    }
    for (const link of context.links) {
      const source = pages.get(link.sourceUrlId);
      if (!source) continue;
      const destination = link.destinationUrlId ? pages.get(link.destinationUrlId) : undefined;
      const failedInternal = link.isInternal && destination && ((destination.statusCode ?? 0) >= 400 || destination.errorType);
      const failedExternal = !link.isInternal && ((link.destinationStatusCode ?? 0) >= 400 || link.destinationError);
      if (!failedInternal && !failedExternal) continue;
      const status = destination?.statusCode ?? link.destinationStatusCode;
      output.push(finding({
        crawlId: context.crawlId, ruleId: link.isInternal ? "broken-internal-link" : "broken-external-link", category: "responses",
        priority: link.isInternal ? "high" : "review", pageUrl: source.url, sourceUrl: source.url, destinationUrl: link.destinationUrl,
        title: link.isInternal ? "Broken internal link" : "External link needs review",
        whatWasFound: `Link text “${link.anchorText || "(empty)"}” points to a destination returning ${link.destinationError ? link.destinationError : `HTTP ${status}`}.`,
        whyItMatters: "Broken links interrupt user journeys and waste crawl effort.",
        evidence: { summary: link.destinationError ?? `HTTP ${status}`, details: { anchorText: link.anchorText, selector: link.selector, statusCode: status, error: link.destinationError } },
        recommendedAction: "Update the link to a working, relevant destination or remove it."
      }));
    }
    return output;
  }
};

const redirectRule: AuditRule = {
  id: "redirects",
  category: "redirects",
  title: "Redirects and redirected internal links",
  defaultPriority: "informational",
  description: "Classifies redirects, chains, loops, and internal links that require a redirect.",
  async evaluate(context) {
    const output: AuditFinding[] = [];
    const { pages, pageByUrl } = indexContext(context);
    const groups = new Map<number, AuditContext["redirects"]>();
    for (const redirect of context.redirects) groups.set(redirect.sourceUrlId, [...(groups.get(redirect.sourceUrlId) ?? []), redirect]);
    for (const [id, hops] of groups) {
      const page = pages.get(id);
      if (!page) continue;
      const final = hops.at(-1);
      output.push(finding({
        crawlId: context.crawlId, ruleId: hops.length > 1 ? "redirect-chain" : "redirect", category: "redirects",
        priority: hops.length > 1 ? "medium" : "informational", pageUrl: page.url, ...(final ? { destinationUrl: final.toUrl } : {}),
        title: hops.length > 1 ? "Redirect chain" : `${hops[0]?.redirectType === "permanent" ? "Permanent" : "Temporary"} redirect`,
        whatWasFound: `${hops.length} redirect hop${hops.length === 1 ? "" : "s"} lead from this URL to ${final?.toUrl ?? "an unknown destination"}.`,
        whyItMatters: hops.length > 1 ? "Redirect chains add latency and can dilute crawl efficiency." : "A single intentional redirect is normally acceptable but should be documented.",
        evidence: { summary: `${hops.length} hop${hops.length === 1 ? "" : "s"}`, details: { hops } },
        recommendedAction: hops.length > 1 ? "Update links and redirects to point directly to the final destination." : "Confirm this redirect is intentional and update internal links to the final URL."
      }));
    }
    for (const page of context.pages.filter((item) => /redirect loop/i.test(item.errorMessage ?? ""))) {
      output.push(finding({
        crawlId: context.crawlId, ruleId: "redirect-loop", category: "redirects", priority: "high", pageUrl: page.url,
        title: "Redirect loop", whatWasFound: page.errorMessage ?? "A redirect loop was detected.",
        whyItMatters: "Redirect loops make a URL inaccessible to visitors and crawlers.",
        evidence: { summary: "Redirect loop detected", details: { error: page.errorMessage } },
        recommendedAction: "Remove or correct the conflicting redirect rules so the URL resolves once."
      }));
    }
    for (const link of context.links.filter((item) => item.isInternal)) {
      const destination = link.destinationUrlId ? pages.get(link.destinationUrlId) : pageByUrl.get(link.destinationUrl);
      const source = pages.get(link.sourceUrlId);
      if (!source || !destination || !groups.has(destination.id)) continue;
      output.push(finding({
        crawlId: context.crawlId, ruleId: "internal-link-to-redirect", category: "redirects", priority: "medium", pageUrl: source.url,
        sourceUrl: source.url, destinationUrl: destination.url, title: "Internal link points to a redirect",
        whatWasFound: `The internal link “${link.anchorText || "(empty)"}” points to a URL that redirects.`,
        whyItMatters: "Direct links avoid an unnecessary request and simplify crawl paths.",
        evidence: { summary: destination.url, details: { anchorText: link.anchorText, selector: link.selector } },
        recommendedAction: "Change the internal link to the redirect’s final destination."
      }));
    }
    return output;
  }
};

function metadataRule(type: "title" | "description"): AuditRule {
  const config = type === "title"
    ? { category: "titles" as const, singular: "title", rule: "title", min: "titleMinLength" as const, max: "titleMaxLength" as const }
    : { category: "meta-descriptions" as const, singular: "meta description", rule: "meta-description", min: "descriptionMinLength" as const, max: "descriptionMaxLength" as const };
  return {
    id: `${config.rule}s`, category: config.category, title: `${config.singular} checks`, defaultPriority: "medium",
    description: `Checks missing, empty, multiple, duplicate, short, and long ${config.singular}s.`,
    async evaluate(context) {
      const output: AuditFinding[] = [];
      const { byType } = indexContext(context);
      const values = new Map<string, AuditPage[]>();
      for (const page of context.pages.filter((item) => item.isInternal && htmlPage(item) && (item.statusCode ?? 0) < 400)) {
        const elements = byType(page.id, type);
        if (elements.length === 0) {
          output.push(finding({ crawlId: context.crawlId, ruleId: `missing-${config.rule}`, category: config.category, priority: "high", pageUrl: page.url,
            title: `Missing ${config.singular}`, whatWasFound: `No ${config.singular} was extracted.`, whyItMatters: `${config.singular[0]?.toUpperCase()}${config.singular.slice(1)}s help searchers understand the page before visiting.`,
            evidence: { summary: "No element found", details: {} }, recommendedAction: `Add one descriptive ${config.singular}.` }));
          continue;
        }
        if (elements.length > 1) output.push(finding({ crawlId: context.crawlId, ruleId: `multiple-${config.rule}s`, category: config.category, priority: "medium", pageUrl: page.url,
          title: `Multiple ${config.singular}s`, whatWasFound: `${elements.length} ${config.singular} elements were found.`, whyItMatters: "Multiple competing declarations make the intended metadata unclear.",
          evidence: { summary: `${elements.length} elements`, details: { values: elements.map((item) => item.value) } }, recommendedAction: `Keep one intentional ${config.singular}.` }));
        for (const element of elements) {
          const value = element.value.trim();
          if (!value) output.push(finding({ crawlId: context.crawlId, ruleId: `empty-${config.rule}`, category: config.category, priority: "high", pageUrl: page.url,
            title: `Empty ${config.singular}`, whatWasFound: `A ${config.singular} element exists but has no content.`, whyItMatters: "An empty declaration provides no useful search-result context.", evidence: { summary: "Empty value", details: { selector: element.selector } }, recommendedAction: `Write a useful ${config.singular} or remove the empty element.` }));
          else {
            values.set(key(value), [...(values.get(key(value)) ?? []), page]);
            const threshold = context.settings[config.min];
            const maximum = context.settings[config.max];
            if (value.length < threshold || value.length > maximum) output.push(finding({ crawlId: context.crawlId, ruleId: value.length < threshold ? `short-${config.rule}` : `long-${config.rule}`, category: config.category, priority: "low", pageUrl: page.url,
              title: `${value.length < threshold ? "Short" : "Long"} ${config.singular}`, whatWasFound: `The ${config.singular} is ${value.length} characters; the project target is ${threshold}–${maximum}.`, whyItMatters: "Length is a review signal, not a guarantee of search-result display.", evidence: { summary: value, details: { length: value.length, min: threshold, max: maximum } }, recommendedAction: `Review the ${config.singular} for clarity and appropriate length.` }));
          }
        }
      }
      for (const [value, pages] of values) if (pages.length > 1) for (const page of pages) output.push(finding({ crawlId: context.crawlId, ruleId: `duplicate-${config.rule}`, category: config.category, priority: "review", pageUrl: page.url,
        title: `Duplicate ${config.singular}`, whatWasFound: `This ${config.singular} is shared by ${pages.length} pages.`, whyItMatters: "Duplicate metadata can make pages harder to distinguish in search results.", evidence: { summary: value, details: { urls: pages.map((item) => item.url) } }, recommendedAction: `Make the ${config.singular} distinct when the pages have distinct search intent.` }));
      return output;
    }
  };
}

const headingsRule: AuditRule = {
  id: "headings", category: "headings", title: "Heading checks", defaultPriority: "review", description: "Checks H1 presence, repetition, empty headings, and alignment with title.",
  async evaluate(context) {
    const output: AuditFinding[] = [];
    const { byType } = indexContext(context);
    const values = new Map<string, AuditPage[]>();
    for (const page of context.pages.filter((item) => item.isInternal && htmlPage(item) && (item.statusCode ?? 0) < 400)) {
      const h1 = byType(page.id, "h1");
      const title = byType(page.id, "title")[0]?.value ?? "";
      if (h1.length === 0) output.push(finding({ crawlId: context.crawlId, ruleId: "missing-h1", category: "headings", priority: "high", pageUrl: page.url, title: "Missing H1", whatWasFound: "No H1 heading was extracted.", whyItMatters: "A clear H1 helps users and crawlers identify the page’s main topic.", evidence: { summary: "No H1 found", details: {} }, recommendedAction: "Add one descriptive H1 that represents the primary page topic." }));
      if (h1.length > 1) output.push(finding({ crawlId: context.crawlId, ruleId: "multiple-h1", category: "headings", priority: "medium", pageUrl: page.url, title: "Multiple H1 headings", whatWasFound: `${h1.length} H1 headings were found.`, whyItMatters: "Multiple top-level headings can make the document topic ambiguous.", evidence: { summary: `${h1.length} H1s`, details: { values: h1.map((item) => item.value) } }, recommendedAction: "Keep one primary H1 unless multiple H1s are intentional and documented." }));
      for (const element of [...h1, ...byType(page.id, "h2")]) if (!element.value.trim()) output.push(finding({ crawlId: context.crawlId, ruleId: "empty-heading", category: "headings", priority: "review", pageUrl: page.url, title: "Empty heading", whatWasFound: "A heading element has no readable text.", whyItMatters: "Empty headings can confuse assistive technology users and create a weak outline.", evidence: { summary: element.selector ?? "Heading", details: {} }, recommendedAction: "Remove the empty heading or add meaningful text." }));
      const first = h1[0]?.value;
      if (first) {
        values.set(key(first), [...(values.get(key(first)) ?? []), page]);
        const titleWords = words(title); const h1Words = words(first);
        const overlap = [...titleWords].filter((word) => h1Words.has(word)).length;
        if (titleWords.size > 0 && h1Words.size > 0 && overlap === 0) output.push(finding({ crawlId: context.crawlId, ruleId: "h1-title-conflict", category: "headings", priority: "review", pageUrl: page.url, title: "H1 and title may conflict", whatWasFound: `The title “${title}” and H1 “${first}” share no significant words.`, whyItMatters: "Mismatched topic signals can make a page harder to understand.", evidence: { summary: "No shared terms", details: { title, h1: first } }, recommendedAction: "Review whether the title and H1 describe the same primary topic." }));
      }
    }
    for (const [value, pages] of values) if (pages.length > 1) for (const page of pages) output.push(finding({ crawlId: context.crawlId, ruleId: "duplicate-h1", category: "headings", priority: "review", pageUrl: page.url, title: "Duplicate H1", whatWasFound: `This H1 is used on ${pages.length} pages.`, whyItMatters: "Repeated H1s can be a sign that distinct pages lack distinct topical framing.", evidence: { summary: value, details: { urls: pages.map((item) => item.url) } }, recommendedAction: "Make the H1 distinct when each page serves a distinct purpose." }));
    return output;
  }
};

const canonicalRule: AuditRule = {
  id: "canonicals", category: "canonicals", title: "Canonical checks", defaultPriority: "review", description: "Checks missing, multiple, relative, chained, and unsuitable canonical targets.",
  async evaluate(context) {
    const output: AuditFinding[] = []; const { byType, pageByUrl } = indexContext(context);
    for (const page of context.pages.filter((item) => item.isInternal && htmlPage(item) && (item.statusCode ?? 0) < 400)) {
      const canonicals = byType(page.id, "canonical");
      if (canonicals.length === 0) { output.push(finding({ crawlId: context.crawlId, ruleId: "missing-canonical", category: "canonicals", priority: "review", pageUrl: page.url, title: "Missing canonical", whatWasFound: "No canonical link was extracted.", whyItMatters: "A canonical can clarify the preferred URL when duplicate variants exist.", evidence: { summary: "No canonical found", details: {} }, recommendedAction: "Review whether this page needs a self-referencing or alternate canonical." })); continue; }
      if (canonicals.length > 1) output.push(finding({ crawlId: context.crawlId, ruleId: "multiple-canonicals", category: "canonicals", priority: "medium", pageUrl: page.url, title: "Multiple canonicals", whatWasFound: `${canonicals.length} canonical declarations were found.`, whyItMatters: "Conflicting canonical signals make the preferred URL unclear.", evidence: { summary: `${canonicals.length} canonicals`, details: { values: canonicals.map((item) => item.value) } }, recommendedAction: "Keep one intentional canonical declaration." }));
      for (const canonical of canonicals) {
        if (canonical.metadata.isRelative === true) output.push(finding({ crawlId: context.crawlId, ruleId: "relative-canonical", category: "canonicals", priority: "review", pageUrl: page.url, destinationUrl: canonical.value, title: "Relative canonical", whatWasFound: `The canonical uses relative href “${String(canonical.metadata.rawHref ?? "")}”.`, whyItMatters: "Absolute canonicals are clearer across crawlers and environments.", evidence: { summary: canonical.value, details: canonical.metadata }, recommendedAction: "Use an absolute canonical URL." }));
        const target = pageByUrl.get(canonical.value);
        if (!target) continue;
        const issue = target.statusCode && target.statusCode >= 300 ? "redirect" : target.indexabilityReason !== "indexable" ? target.indexabilityReason : undefined;
        if (issue) output.push(finding({ crawlId: context.crawlId, ruleId: "canonical-target-issue", category: "canonicals", priority: issue === "error" ? "high" : "review", pageUrl: page.url, destinationUrl: target.url, title: "Canonical target needs review", whatWasFound: `The canonical target is classified as ${issue}.`, whyItMatters: "A canonical should normally resolve to a stable, indexable preferred URL.", evidence: { summary: issue, details: { target: target.url, statusCode: target.statusCode, indexabilityReason: target.indexabilityReason } }, recommendedAction: "Point the canonical at the intended final indexable URL." }));
        const next = byType(target.id, "canonical")[0]?.value;
        if (next && next !== target.url) output.push(finding({ crawlId: context.crawlId, ruleId: "canonical-chain", category: "canonicals", priority: "review", pageUrl: page.url, destinationUrl: target.url, title: "Canonical chain", whatWasFound: `This canonical points to a page that declares another canonical (${next}).`, whyItMatters: "Canonical chains can weaken the preferred-URL signal.", evidence: { summary: `${canonical.value} → ${next}`, details: {} }, recommendedAction: "Point directly to the final intended canonical URL." }));
      }
    }
    return output;
  }
};

const indexabilityRule: AuditRule = {
  id: "indexability", category: "indexability", title: "Indexability classification", defaultPriority: "informational", description: "Makes non-indexable crawl states visible for review.",
  async evaluate(context) {
    return context.pages.filter((page) => page.isInternal && page.indexabilityReason !== "indexable").map((page) => finding({
      crawlId: context.crawlId, ruleId: `indexability-${page.indexabilityReason}`, category: "indexability", priority: page.indexabilityReason === "unknown" ? "review" : "informational", pageUrl: page.url,
      title: `Non-indexable: ${page.indexabilityReason.replaceAll("_", " ")}`,
      whatWasFound: `This URL is classified as ${page.indexabilityReason.replaceAll("_", " ")}.`,
      whyItMatters: "Indexability status determines whether a URL is a candidate for search visibility.", evidence: { summary: page.indexabilityReason, details: { statusCode: page.statusCode, robotsRule: undefined } },
      recommendedAction: "Confirm the state is intentional; otherwise correct the response, directive, robots rule, or canonical signal."
    }));
  }
};

const linkingRule: AuditRule = {
  id: "internal-linking", category: "internal-linking", title: "Internal linking checks", defaultPriority: "review", description: "Checks discoverability, depth, anchor text, and links to non-indexable pages.",
  async evaluate(context) {
    const output: AuditFinding[] = []; const { pages, pageByUrl } = indexContext(context);
    const inlinks = new Map<number, number>();
    for (const link of context.links.filter((item) => item.isInternal && item.destinationUrlId)) inlinks.set(link.destinationUrlId as number, (inlinks.get(link.destinationUrlId as number) ?? 0) + 1);
    for (const page of context.pages.filter((item) => item.isInternal && item.isIndexable && item.depth > 0)) {
      if (!inlinks.get(page.id)) output.push(finding({ crawlId: context.crawlId, ruleId: "no-internal-inlinks", category: "internal-linking", priority: "review", pageUrl: page.url, title: "No internal inlinks", whatWasFound: "No crawled internal page links to this indexable URL.", whyItMatters: "Pages without known internal links can be hard for users and crawlers to discover.", evidence: { summary: "0 inlinks", details: { depth: page.depth } }, recommendedAction: "Add a relevant internal link if this URL should be discoverable." }));
      if (page.depth > context.settings.deepPageThreshold) output.push(finding({ crawlId: context.crawlId, ruleId: "deep-page", category: "internal-linking", priority: "low", pageUrl: page.url, title: "Deep crawl depth", whatWasFound: `This page was discovered at depth ${page.depth}; the project review threshold is ${context.settings.deepPageThreshold}.`, whyItMatters: "Deep pages may be less discoverable through site navigation.", evidence: { summary: `Depth ${page.depth}`, details: { threshold: context.settings.deepPageThreshold } }, recommendedAction: "Review navigation and contextual links if this is an important page." }));
    }
    for (const link of context.links.filter((item) => item.isInternal)) {
      const source = pages.get(link.sourceUrlId); const destination = link.destinationUrlId ? pages.get(link.destinationUrlId) : pageByUrl.get(link.destinationUrl); if (!source) continue;
      const anchor = key(link.anchorText);
      if (!anchor) output.push(finding({ crawlId: context.crawlId, ruleId: "empty-anchor", category: "internal-linking", priority: "medium", pageUrl: source.url, sourceUrl: source.url, destinationUrl: link.destinationUrl, title: "Empty internal-link text", whatWasFound: "An internal link has no readable anchor text.", whyItMatters: "Empty link text provides little context to users and assistive technology.", evidence: { summary: link.selector ?? "Link", details: {} }, recommendedAction: "Add concise, meaningful link text or an accessible name." }));
      else if (context.settings.genericAnchorText.includes(anchor)) output.push(finding({ crawlId: context.crawlId, ruleId: "generic-anchor", category: "internal-linking", priority: "review", pageUrl: source.url, sourceUrl: source.url, destinationUrl: link.destinationUrl, title: "Generic internal-link text", whatWasFound: `The link uses generic text “${link.anchorText}”.`, whyItMatters: "Descriptive links make destinations easier to understand.", evidence: { summary: link.anchorText, details: {} }, recommendedAction: "Use link text that describes the destination or action." }));
      if (destination && destination.indexabilityReason !== "indexable") output.push(finding({ crawlId: context.crawlId, ruleId: "link-to-non-indexable", category: "internal-linking", priority: "medium", pageUrl: source.url, sourceUrl: source.url, destinationUrl: destination.url, title: "Internal link to non-indexable URL", whatWasFound: `The destination is ${destination.indexabilityReason.replaceAll("_", " ")}.`, whyItMatters: "Internal links should normally point to the intended final, accessible URL.", evidence: { summary: destination.indexabilityReason, details: { statusCode: destination.statusCode } }, recommendedAction: "Confirm the link is intentional or point it to an indexable final destination." }));
    }
    return output;
  }
};

const imageRule: AuditRule = {
  id: "images", category: "images", title: "Image checks", defaultPriority: "review", description: "Checks image alternatives, dimensions, mixed-content references, and large images when size is known.",
  async evaluate(context) {
    const output: AuditFinding[] = []; const { pages } = indexContext(context);
    for (const image of context.images) {
      const page = pages.get(image.sourceUrlId); if (!page) continue;
      if (image.altText === null) output.push(finding({ crawlId: context.crawlId, ruleId: "missing-image-alt", category: "images", priority: "medium", pageUrl: page.url, destinationUrl: image.imageUrl, title: "Image missing alt attribute", whatWasFound: "An image has no alt attribute.", whyItMatters: "Missing alternatives can leave non-visual users without equivalent information.", evidence: { summary: image.imageUrl, details: { selector: image.selector } }, recommendedAction: "Provide meaningful alt text, or use empty alt only for a genuinely decorative image." }));
      if (image.altText === "") output.push(finding({ crawlId: context.crawlId, ruleId: "empty-image-alt-review", category: "images", priority: "review", pageUrl: page.url, destinationUrl: image.imageUrl, title: "Empty image alt requires review", whatWasFound: "An image has empty alt text.", whyItMatters: "Empty alt is correct for decorative images but may hide meaningful content.", evidence: { summary: image.imageUrl, details: { selector: image.selector } }, recommendedAction: "Confirm the image is decorative; otherwise add a concise equivalent text alternative." }));
      if (!image.width || !image.height) output.push(finding({ crawlId: context.crawlId, ruleId: "image-missing-dimensions", category: "images", priority: "low", pageUrl: page.url, destinationUrl: image.imageUrl, title: "Image missing dimensions", whatWasFound: "The image lacks an HTML width or height attribute.", whyItMatters: "Reserved dimensions can reduce layout shifting while images load.", evidence: { summary: image.imageUrl, details: { width: image.width, height: image.height } }, recommendedAction: "Provide appropriate dimensions or equivalent CSS aspect-ratio handling." }));
      if (page.url.startsWith("https:") && image.imageUrl.startsWith("http:")) output.push(finding({ crawlId: context.crawlId, ruleId: "mixed-content-image", category: "images", priority: "medium", pageUrl: page.url, destinationUrl: image.imageUrl, title: "HTTP image on HTTPS page", whatWasFound: "An HTTPS page references an HTTP image.", whyItMatters: "Mixed content can be blocked or weaken transport security.", evidence: { summary: image.imageUrl, details: {} }, recommendedAction: "Serve the image over HTTPS." }));
      if (image.sizeBytes !== null && image.sizeBytes > context.settings.largeImageBytes) output.push(finding({ crawlId: context.crawlId, ruleId: "large-image", category: "images", priority: "low", pageUrl: page.url, destinationUrl: image.imageUrl, title: "Large image", whatWasFound: `The image is ${image.sizeBytes} bytes; threshold is ${context.settings.largeImageBytes}.`, whyItMatters: "Large images can slow page loading.", evidence: { summary: `${image.sizeBytes} bytes`, details: { threshold: context.settings.largeImageBytes } }, recommendedAction: "Review compression, dimensions, and modern formats." }));
    }
    return output;
  }
};

const urlQualityRule: AuditRule = {
  id: "url-quality", category: "url-quality", title: "URL quality checks", defaultPriority: "review", description: "Flags URL patterns that commonly merit review.",
  async evaluate(context) {
    const output: AuditFinding[] = [];
    for (const page of context.pages.filter((item) => item.isInternal)) {
      const checks: Array<[string, string]> = [];
      if (/[A-Z]/.test(page.path)) checks.push(["uppercase-url-path", "Uppercase path"]);
      if (page.path.includes("_")) checks.push(["underscore-url-path", "Underscore in path"]);
      if (/%20|\s/.test(page.url)) checks.push(["space-url", "Space in URL"]);
      if (/[^\x00-\x7F]/.test(decodeURIComponent(page.path))) checks.push(["non-ascii-url", "Non-ASCII URL path"]);
      if (page.url.length > 115) checks.push(["long-url", "Long URL"]);
      if (page.query && page.query.split("&").filter(Boolean).length > 4) checks.push(["many-url-parameters", "Many URL parameters"]);
      if (/\/([^/]+)\/\1(?:\/|$)/i.test(page.path)) checks.push(["repeated-path-segment", "Repeated path segment"]);
      for (const [ruleId, title] of checks) output.push(finding({ crawlId: context.crawlId, ruleId, category: "url-quality", priority: "review", pageUrl: page.url, title, whatWasFound: `${title} was detected.`, whyItMatters: "URL patterns are review signals and may affect consistency, sharing, and crawl efficiency.", evidence: { summary: page.url, details: { path: page.path, query: page.query } }, recommendedAction: "Review whether the URL can be simplified without breaking an intentional URL structure." }));
    }
    return output;
  }
};

const duplicateRule: AuditRule = {
  id: "duplicates-and-thin-content", category: "duplicate-content", title: "Duplicate and thin-content checks", defaultPriority: "review", description: "Groups hash duplicates and flags low-word-count pages for review.",
  async evaluate(context) {
    const output: AuditFinding[] = [];
    for (const field of ["htmlHash", "normalizedHtmlHash", "textHash"] as const) {
      const groups = new Map<string, AuditPage[]>();
      for (const page of context.pages.filter((item) => item.isInternal && htmlPage(item) && item[field])) groups.set(page[field] as string, [...(groups.get(page[field] as string) ?? []), page]);
      for (const [hash, pages] of groups) if (pages.length > 1) for (const page of pages) output.push(finding({ crawlId: context.crawlId, ruleId: `duplicate-${field}`, category: "duplicate-content", priority: "review", pageUrl: page.url, title: "Duplicate content group", whatWasFound: `${pages.length} pages share the same ${field}.`, whyItMatters: "Near-identical pages can create ambiguous indexing and user journeys.", evidence: { summary: hash, details: { urls: pages.map((item) => item.url), hashType: field } }, recommendedAction: "Review whether these pages should be consolidated, canonicalized, redirected, or made meaningfully distinct." }));
    }
    for (const page of context.pages.filter((item) => item.isInternal && htmlPage(item) && item.isIndexable && (item.wordCount ?? 0) < context.settings.thinContentWordCount)) output.push(finding({ crawlId: context.crawlId, ruleId: "low-word-count", category: "duplicate-content", priority: "review", pageUrl: page.url, title: "Review low-content page", whatWasFound: `The page has ${page.wordCount ?? 0} extracted words; threshold is ${context.settings.thinContentWordCount}.`, whyItMatters: "A low word count alone is not an error, but can indicate a page that needs contextual review.", evidence: { summary: `${page.wordCount ?? 0} words`, details: { threshold: context.settings.thinContentWordCount } }, recommendedAction: "Confirm the page adequately serves its purpose; add useful content only where appropriate." }));
    return output;
  }
};

export const technicalSeoRules: AuditRule[] = [
  responseRule, redirectRule, metadataRule("title"), metadataRule("description"), headingsRule,
  canonicalRule, indexabilityRule, linkingRule, imageRule, urlQualityRule, duplicateRule
];
