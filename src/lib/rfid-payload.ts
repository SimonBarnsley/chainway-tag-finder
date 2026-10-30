export interface TagRead {
  epc: string;
  rssi?: number;
  antennaPort?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Plain-text / form-encoded bodies (e.g. Chainway UA4E "HTTP upload" mode):
 * pull out every hex EPC-looking token (24+ hex chars, or `epc=...` values).
 */
export function extractTagsFromText(body: string): TagRead[] {
  const tags: TagRead[] = [];
  const seen = new Set<string>();
  let text = body;
  try {
    text = decodeURIComponent(body.replace(/\+/g, " "));
  } catch {
    // keep raw
  }
  const re = /\b([0-9A-Fa-f]{24,64})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const epc = m[1].toUpperCase();
    if (seen.has(epc)) continue;
    seen.add(epc);
    tags.push({ epc });
  }
  return tags;
}

export function extractTagsFromJson(payload: unknown): TagRead[] {
  const tags: TagRead[] = [];
  const nestedKeys = [
    "data",
    "Data",
    "tag_reads",
    "tags",
    "Tags",
    "tagList",
    "TagList",
    "events",
    "event",
    "inventory",
    "items",
    "results",
  ];

  const extractOne = (item: Record<string, unknown>) => {
    const epc =
      item?.epc || item?.EPC || item?.Epc || item?.idHex || item?.tagId || item?.tagID ||
      item?.epcId || item?.EpcId || item?.TagId;
    if (typeof epc !== "string" || epc.length < 4) return;
    const port =
      item?.antennaPort ?? item?.antenna_port ?? item?.antenna ?? item?.antPort ??
      item?.antennaID ?? item?.ant ?? item?.Ant ?? item?.Antenna;
    tags.push({
      epc: epc.replace(/\s+/g, "").toUpperCase(),
      rssi: asNumber(item?.peakRssi ?? item?.rssi ?? item?.RSSI ?? item?.Rssi),
      antennaPort: asNumber(port),
    });
  };

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const item = asRecord(value);
    if (!item) return;

    extractOne(item);

    for (const key of nestedKeys) {
      if (key in item) visit(item[key]);
    }
  };

  visit(payload);
  return tags;
}

export function extractTagsFromXml(xml: string): TagRead[] {
  const tags: TagRead[] = [];
  const blockRegex =
    /<\s*(tag|tagReport|tagReadEvent|TagReadData|TagReadEvent|TagInfo)\b([^>]*?)(?:\/>|>([\s\S]*?)<\s*\/\s*\1\s*>)/gi;

  const getField = (block: string, attrs: string, names: string[]): string | undefined => {
    for (const name of names) {
      const attrRe = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");
      const am = attrs.match(attrRe);
      if (am && am[1]) return am[1];
      const elRe = new RegExp(`<\\s*${name}\\s*>\\s*([^<]+?)\\s*<\\s*/\\s*${name}\\s*>`, "i");
      const em = block.match(elRe);
      if (em && em[1]) return em[1];
    }
    return undefined;
  };

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(xml)) !== null) {
    const attrs = match[2] || "";
    const inner = match[3] || "";
    const epcRaw = getField(inner, attrs, ["epc", "EPC", "id", "idHex", "tagId", "epcId"]);
    if (!epcRaw || epcRaw.length < 4) continue;
    const rssiRaw = getField(inner, attrs, ["rssi", "RSSI", "peakRssi"]);
    const antennaRaw = getField(inner, attrs, [
      "antenna", "antennaPort", "antenna_port", "antPort", "AntennaID",
    ]);
    tags.push({
      epc: epcRaw.replace(/\s+/g, "").toUpperCase(),
      rssi: rssiRaw !== undefined ? Number(rssiRaw) : undefined,
      antennaPort: antennaRaw !== undefined ? Number(antennaRaw) : undefined,
    });
  }
  return tags;
}

export function deduplicateTagReads(tags: TagRead[]): TagRead[] {
  const byEpc = new Map<string, TagRead>();
  for (const tag of tags) {
    const previous = byEpc.get(tag.epc);
    if (!previous || (tag.rssi ?? -999) > (previous.rssi ?? -999)) byEpc.set(tag.epc, tag);
  }
  return [...byEpc.values()];
}
