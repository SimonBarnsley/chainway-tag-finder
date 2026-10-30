const sensitiveHeader = /authorization|api[-_]?key|cookie|token|secret/i;
export function redactReaderHeaders(headers: Headers): Record<string, string> {
  const safe: Record<string, string> = {};
  headers.forEach((value, key) => { safe[key] = sensitiveHeader.test(key) ? "[redacted]" : value; });
  return safe;
}
export function redactReaderUrl(url: URL): string {
  const safe = new URL(url);
  for (const key of safe.searchParams.keys()) {
    if (sensitiveHeader.test(key) || key.toLowerCase() === "key") safe.searchParams.set(key, "[redacted]");
  }
  safe.pathname = safe.pathname.replace(/(\/api\/(?:zebra|chainway)-reader\/[^/]+\/)[^/]+/, "$1[redacted]");
  return safe.pathname + safe.search;
}