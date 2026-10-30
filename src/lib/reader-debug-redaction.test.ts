import { expect, it } from "vitest";
import { redactReaderHeaders, redactReaderUrl } from "./reader-debug-redaction";

it("redacts reader credentials and cookies while retaining diagnostic headers", () => {
  expect(redactReaderHeaders(new Headers({ "x-api-key": "private", apikey: "private", authorization: "Bearer private", cookie: "private", "content-type": "application/json" }))).toEqual({ "x-api-key": "[redacted]", apikey: "[redacted]", authorization: "[redacted]", cookie: "[redacted]", "content-type": "application/json" });
});
it("redacts key-bearing paths and query parameters", () => {
  const result = redactReaderUrl(new URL("https://www.scanloc8.com/api/zebra-reader/company-a/private?key=private&reader=reader-a"));
  expect(result).not.toContain("private");
  expect(result).toContain("reader=reader-a");
});