/** Reuses a receipt only for byte-identical submitted data. */
export function retryId(storage: Pick<Storage, "getItem" | "setItem">, key: string, request: string, generate: () => string): string {
  const saved = storage.getItem(`${key}:receipt`);
  if (saved) {
    try {
      const value = JSON.parse(saved) as { id: string; request: string };
      if (value.request === request && typeof value.id === "string") return value.id;
    } catch { /* Replace malformed receipt. */ }
  }
  const id = generate();
  storage.setItem(`${key}:receipt`, JSON.stringify({ id, request }));
  return id;
}