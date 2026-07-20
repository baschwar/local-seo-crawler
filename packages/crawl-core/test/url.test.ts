import { describe, expect, it } from "vitest";
import { isInternalUrl, normalizeUrl } from "../src/index.js";

describe("normalizeUrl", () => {
  it("normalizes fragments, host casing, default ports, duplicate slashes, dot segments, and unreserved encoding", () => {
    const result = normalizeUrl("HTTP://EXAMPLE.COM:80/a//b/../%7euser?q=%7evalue#part");
    expect(result.normalizedUrl).toBe("http://example.com/a/~user?q=~value");
    expect(result.fragment).toBe("part");
  });

  it("resolves relative URLs and preserves arbitrary query parameters", () => {
    expect(normalizeUrl("../item?utm_source=test&id=2", "https://example.com/one/two").normalizedUrl)
      .toBe("https://example.com/item?utm_source=test&id=2");
  });

  it("rejects unsupported protocols", () => {
    expect(() => normalizeUrl("mailto:test@example.com")).toThrow("Unsupported URL protocol");
  });
});

describe("isInternalUrl", () => {
  it("handles exact hosts and optional subdomains without suffix confusion", () => {
    expect(isInternalUrl("https://example.com/a", "https://example.com", false)).toBe(true);
    expect(isInternalUrl("https://docs.example.com/a", "https://example.com", false)).toBe(false);
    expect(isInternalUrl("https://docs.example.com/a", "https://example.com", true)).toBe(true);
    expect(isInternalUrl("https://notexample.com/a", "https://example.com", true)).toBe(false);
  });
});
