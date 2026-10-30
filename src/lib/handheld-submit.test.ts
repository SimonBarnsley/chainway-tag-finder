import { expect, it } from "vitest";
import { retryId } from "./handheld-submit";
it("reuses the same receipt for retrying an identical handheld submission", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  expect(retryId(storage, "draft", "request-1", () => "id-1")).toBe("id-1");
  expect(retryId(storage, "draft", "request-1", () => "id-2")).toBe("id-1");
  expect(retryId(storage, "draft", "request-2", () => "id-3")).toBe("id-3");
});