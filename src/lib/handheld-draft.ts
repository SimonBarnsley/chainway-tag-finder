export interface HandheldDraft { version: 1; savedAt: number; tags: [string, number][] }
export function draftKey(userId: string, company: string, screen: string, location: string) {
  return `scanloc8:draft:${JSON.stringify([userId, company, screen, location])}`;
}
export function decodeDraft(value: string | null, now = Date.now()): [string, number][] {
  if (!value) return [];
  try {
    const data = JSON.parse(value) as HandheldDraft;
    if (data.version !== 1 || !Number.isFinite(data.savedAt) || now - data.savedAt > 86400000 || !Array.isArray(data.tags)) return [];
    return data.tags.filter((entry) => Array.isArray(entry) && typeof entry[0] === "string" && /^3039[0-9A-F]+$/.test(entry[0]) && Number.isSafeInteger(entry[1]) && entry[1] > 0).slice(0, 5000);
  } catch { return []; }
}
export function readDraft(storage: Pick<Storage, "getItem">, key: string) {
  try { return decodeDraft(storage.getItem(key)); } catch { return []; }
}
export function writeDraft(storage: Pick<Storage, "setItem" | "removeItem">, key: string, tags: Map<string, number>): boolean {
  try {
    if (!tags.size) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), tags: [...tags] }));
    return true;
  } catch { return false; }
}