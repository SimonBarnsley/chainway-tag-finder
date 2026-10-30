import { describe, it, expect } from "vitest";
import { csvCell, pgrstValue, wildcardTest } from "./csv-safe";

describe("csv-safe", () => {
  it("neutralises formula prefixes", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("@SUM")).toBe(`"'@SUM"`);
    expect(csvCell("-1+1")).toBe(`"'-1+1"`);
  });
  it("quotes delimiters", () => {
    expect(csvCell('a,"b"')).toBe(`"a,""b"""`);
    expect(csvCell("Bay 1")).toBe("Bay 1");
  });
  it("quotes PostgREST filter values", () => {
    expect(pgrstValue("x,id.neq.0")).toBe(`"x,id.neq.0"`);
  });
  it("matches wildcards in linear time", () => {
    expect(wildcardTest("bay-12", "bay*")).toBe(true);
    expect(wildcardTest("bay-12", "b?y-1?")).toBe(true);
    expect(wildcardTest("bay", "x*")).toBe(false);
    const t = Date.now();
    wildcardTest("a".repeat(5000), "*a".repeat(2000) + "b");
    expect(Date.now() - t).toBeLessThan(2000);
  });
});
