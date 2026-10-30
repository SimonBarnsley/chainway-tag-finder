import { expect, it } from "vitest";
import { decodeDraft, draftKey, readDraft, writeDraft } from "./handheld-draft";
it("keeps separate drafts for accounts, companies, tasks and locations", () => {
  const base = draftKey("u1", "a", "goods", "Dock");
  expect(new Set([base, draftKey("u2", "a", "goods", "Dock"), draftKey("u1", "b", "goods", "Dock"), draftKey("u1", "a", "count", "Dock"), draftKey("u1", "a", "goods", "Shelf")]).size).toBe(5);
});
it("recovers real 3039 tag counts without accepting other prefixes", () => {
  expect(decodeDraft(JSON.stringify({ version: 1, savedAt: 100, tags: [["303900AA", 4], ["123400AA", 3], ["303900BB", -1]] }), 200)).toEqual([["303900AA", 4]]);
});
it("expires drafts after 24 hours", () => {
  expect(decodeDraft(JSON.stringify({ version: 1, savedAt: 100, tags: [["303900AA", 4]] }), 86400101)).toEqual([]);
});
it("handles unavailable storage without losing the in-memory scan", () => {
  const storage = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => { throw Error(); } };
  expect(readDraft(storage, "key")).toEqual([]);
  expect(writeDraft(storage, "key", new Map([["303900AA", 1]]))).toBe(false);
});
it("removes only the completed or cleared draft", () => {
  const values = new Map<string, string>([["other", "keep"]]);
  const storage = { setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) };
  writeDraft(storage, "current", new Map([["303900AA", 2]]));
  expect(decodeDraft(values.get("current") ?? null)).toEqual([["303900AA", 2]]);
  writeDraft(storage, "current", new Map());
  expect(values.has("current")).toBe(false);
  expect(values.get("other")).toBe("keep");
});