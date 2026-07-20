import { describe, expect, it } from "vitest";
import { encodeCsvCell, protectSpreadsheetCell } from "../src/index.js";

describe("CSV safety", () => {
  it("protects spreadsheet formula prefixes", () => {
    expect(protectSpreadsheetCell("=2+2")).toBe("'=2+2");
    expect(protectSpreadsheetCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
  });

  it("quotes commas, quotes, and line breaks", () => {
    expect(encodeCsvCell('one,"two"')).toBe('"one,""two"""');
  });
});
