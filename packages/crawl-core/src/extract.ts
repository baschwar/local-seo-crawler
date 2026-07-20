import { createHash } from "node:crypto";
import { load } from "cheerio";
import { parse, serialize } from "parse5";
import type { PageElement, PageMetadata } from "@seo-auditor/shared-types";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function extractPageMetadata(
  html: string,
  pageUrl: string,
  xRobotsTag: string[] = []
): PageMetadata {
  const $ = load(html);
  const elements: PageElement[] = [];
  const titles = $("title")
    .map((index, element) => {
      const value = cleanText($(element).text());
      elements.push({ type: "title", index, value, domSelector: `title:nth-of-type(${index + 1})` });
      return value;
    })
    .get();
  const descriptions = $('meta[name="description" i]')
    .map((index, element) => {
      const value = cleanText($(element).attr("content"));
      elements.push({ type: "description", index, value, domSelector: `meta[name="description"]:nth-of-type(${index + 1})` });
      return value;
    })
    .get();
  const heading = (selector: "h1" | "h2") =>
    $(selector)
      .map((index, element) => {
        const value = cleanText($(element).text());
        elements.push({ type: selector, index, value, domSelector: `${selector}:nth-of-type(${index + 1})` });
        return value;
      })
      .get();
  const h1 = heading("h1");
  const h2 = heading("h2");
  const canonicals = $('link[rel~="canonical" i]')
    .map((index, element) => {
      const raw = $(element).attr("href") ?? "";
      let value = raw;
      try {
        value = new URL(raw, pageUrl).href;
      } catch {
        // Preserve malformed evidence.
      }
      elements.push({
        type: "canonical",
        index,
        value,
        domSelector: `link[rel~="canonical"]:nth-of-type(${index + 1})`,
        metadata: { rawHref: raw, isRelative: !/^[a-z][a-z0-9+.-]*:/i.test(raw) }
      });
      return value;
    })
    .get();
  const robots = $('meta[name="robots" i]')
    .map((index, element) => {
      const value = cleanText($(element).attr("content"));
      elements.push({ type: "robots", index, value, domSelector: `meta[name="robots"]:nth-of-type(${index + 1})` });
      return value;
    })
    .get();
  xRobotsTag.forEach((value, index) => elements.push({ type: "x-robots-tag", index, value }));

  const links = $("a[href]")
    .map((index, element) => {
      const href = $(element).attr("href") ?? "";
      try {
        const destination = new URL(href, pageUrl);
        if (destination.protocol !== "http:" && destination.protocol !== "https:") return null;
        const rel = cleanText($(element).attr("rel"));
        return {
          destinationUrl: destination.href,
          anchorText: cleanText($(element).text()),
          rel,
          isFollow: !rel.toLowerCase().split(/\s+/).includes("nofollow"),
          domSelector: `a:nth-of-type(${index + 1})`,
          ...(destination.hash ? { fragment: destination.hash.slice(1) } : {})
        };
      } catch {
        return null;
      }
    })
    .get();

  const images = $("img[src]")
    .map((index, element) => {
      const src = $(element).attr("src") ?? "";
      try {
        return {
          imageUrl: new URL(src, pageUrl).href,
          altText: $(element).attr("alt") ?? null,
          width: $(element).attr("width") ?? null,
          height: $(element).attr("height") ?? null,
          loading: $(element).attr("loading") ?? null,
          domSelector: `img:nth-of-type(${index + 1})`
        };
      } catch {
        return null;
      }
    })
    .get();

  $("script, style, noscript, template, svg").remove();
  const visibleText = cleanText($("body").text());
  const words = visibleText ? visibleText.split(/\s+/u) : [];
  let normalizedHtml: string;
  try {
    normalizedHtml = serialize(parse(html)).replace(/\s+/g, " ").trim();
  } catch {
    normalizedHtml = html.replace(/\s+/g, " ").trim();
  }

  return {
    title: titles[0] ?? null,
    titleCount: titles.length,
    description: descriptions[0] ?? null,
    descriptionCount: descriptions.length,
    canonical: canonicals[0] ?? null,
    canonicals,
    robots,
    xRobotsTag,
    h1,
    h2,
    wordCount: words.length,
    htmlHash: hash(html),
    normalizedHtmlHash: hash(normalizedHtml),
    textHash: hash(visibleText),
    links,
    images,
    elements
  };
}
