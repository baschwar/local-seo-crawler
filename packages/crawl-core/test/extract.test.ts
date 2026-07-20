import { describe, expect, it } from "vitest";
import { extractPageMetadata } from "../src/index.js";

describe("extractPageMetadata", () => {
  it("extracts metadata, links, images, robots directives, words, and SHA-256 hashes", () => {
    const result = extractPageMetadata(`<!doctype html><html><head>
      <title> Example title </title><meta name="description" content="A description">
      <meta name="robots" content="noindex"><link rel="canonical" href="/canonical">
      </head><body><h1>Heading</h1><h2>Subheading</h2>
      <p>Readable page words.</p><a href="/next#part" rel="nofollow">Next page</a>
      <img src="/image.png" alt="Example"></body></html>`, "https://example.com/page", ["nosnippet"]);
    expect(result.title).toBe("Example title");
    expect(result.canonical).toBe("https://example.com/canonical");
    expect(result.h1).toEqual(["Heading"]);
    expect(result.links[0]).toMatchObject({ destinationUrl: "https://example.com/next#part", isFollow: false });
    expect(result.images[0]).toMatchObject({ imageUrl: "https://example.com/image.png", altText: "Example" });
    expect(result.wordCount).toBeGreaterThan(2);
    expect(result.htmlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.xRobotsTag).toEqual(["nosnippet"]);
  });
});
