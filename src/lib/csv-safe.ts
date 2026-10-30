/** Spreadsheet-safe CSV cell: neutralises formula prefixes and quotes delimiters. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/** Quote a value for a PostgREST filter list (e.g. `.or()`), so commas/parens can't change the query. */
export function pgrstValue(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Wildcard (* ?) match without regular expressions — linear time, safe for any input length. */
export function wildcardTest(value: string, pattern: string): boolean {
  let v = 0, p = 0, star = -1, mark = 0;
  while (v < value.length) {
    if (p < pattern.length && (pattern[p] === "?" || pattern[p] === value[v])) { v++; p++; }
    else if (p < pattern.length && pattern[p] === "*") { star = p++; mark = v; }
    else if (star !== -1) { p = star + 1; v = ++mark; }
    else return false;
  }
  while (p < pattern.length && pattern[p] === "*") p++;
  return p === pattern.length;
}
