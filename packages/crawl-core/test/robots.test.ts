import { describe, expect, it } from "vitest";
import { RobotsRules } from "../src/index.js";

describe("RobotsRules", () => {
  const rules = new RobotsRules(`
    User-agent: *
    Disallow: /private
    Allow: /private/public
    Disallow: /*.pdf$
  `);

  it("uses the longest matching allow or disallow rule", () => {
    expect(rules.evaluate(new URL("https://example.com/private/a"), "LocalSEOAuditor/0.1").allowed).toBe(false);
    expect(rules.evaluate(new URL("https://example.com/private/public/a"), "LocalSEOAuditor/0.1").allowed).toBe(true);
  });

  it("supports wildcards and end anchors", () => {
    expect(rules.evaluate(new URL("https://example.com/file.pdf"), "LocalSEOAuditor/0.1").allowed).toBe(false);
    expect(rules.evaluate(new URL("https://example.com/file.pdf?download=1"), "LocalSEOAuditor/0.1").allowed).toBe(true);
  });
});
