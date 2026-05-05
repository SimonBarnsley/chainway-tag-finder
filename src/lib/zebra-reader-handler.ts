import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { autoLinkEpcsToItems } from "@/lib/auto-link-epcs";
import { syncItemLocationsForEpcs } from "@/lib/sync-item-locations";

export const ZEBRA_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Api-Key, X-Reader, X-Reader-Hostname, X-Device-Name",
};

export function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...ZEBRA_CORS_HEADERS },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function xmlResponse(body: Record<string, unknown>, status = 200) {
  const inner = Object.entries(body)
    .map(([k, v]) => `  <${k}>${escapeXml(String(v))}</${k}>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n${inner}\n</response>`;
  return new Response(xml, {
    status,
    headers: { "Content-Type": "application/xml", ...ZEBRA_CORS_HEADERS },
  });
}

interface TagRead {
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

function extractTagsFromJson(payload: unknown): TagRead[] {
  const tags: TagRead[] = [];
  const nestedKeys = [
    "data",
    "tag_reads",
    "tags",
    "events",
    "event",
    "inventory",
    "items",
    "results",
  ];

  const extractOne = (item: Record<string, unknown>) => {
    const epc = item?.epc || item?.idHex || item?.tagId || item?.tagID || item?.epcId;
    if (typeof epc !== "string" || epc.length < 4) return;
    const port =
      item?.antennaPort ?? item?.antenna_port ?? item?.antenna ?? item?.antPort ?? item?.antennaID;
    tags.push({
      epc: epc.toUpperCase(),
      rssi: asNumber(item?.peakRssi ?? item?.rssi ?? item?.RSSI),
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

function extractTagsFromXml(xml: string): TagRead[] {
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

export interface ZebraOverrides {
  companySlug?: string | null;
  apiKey?: string | null;
}

/**
 * Handle a Zebra reader POST. Overrides allow a path-based route to provide
 * the company slug + key from URL path params; otherwise we fall back to query
 * params and headers.
 */
export async function handleZebraReaderPost(
  request: Request,
  overrides: ZebraOverrides = {}
): Promise<Response> {
  const url = new URL(request.url);
  const companySlug = overrides.companySlug ?? url.searchParams.get("company");
  const fallbackLocation = url.searchParams.get("location") || null;

  const apiKey =
    overrides.apiKey ??
    (url.searchParams.get("key") ||
      request.headers.get("x-api-key") ||
      request.headers.get("apikey") ||
      request.headers.get("api-key") ||
      (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
      null);

  const ua = request.headers.get("user-agent") || "";
  const uaMatch = ua.match(/fx9?6\d{2}[a-f0-9]{6,}/i);
  const readerHostname =
    url.searchParams.get("reader") ||
    request.headers.get("x-reader") ||
    request.headers.get("x-reader-hostname") ||
    request.headers.get("x-device-hostname") ||
    request.headers.get("x-zebra-reader") ||
    (uaMatch ? uaMatch[0].toLowerCase() : null);

  const deviceName =
    url.searchParams.get("device") ||
    request.headers.get("x-device-name") ||
    readerHostname ||
    "Zebra FX Reader";

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const rawBody = await request.text();
  const trimmed = rawBody.trimStart();
  const isXml =
    contentType.includes("xml") ||
    (contentType.includes("text/plain") && trimmed.startsWith("<")) ||
    (!contentType.includes("json") && trimmed.startsWith("<"));

  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headersObj[k] = k.toLowerCase() === "authorization" ? "[redacted]" : v;
  });
  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    null;

  const writeDebug = async (parsedCount: number | null, parseError: string | null) => {
    try {
      await supabaseAdmin.from("zebra_reader_debug_logs").insert({
        company_slug: companySlug,
        reader_hostname: readerHostname,
        remote_ip: remoteIp,
        method: "POST",
        content_type: contentType || null,
        content_length: rawBody.length,
        user_agent: request.headers.get("user-agent"),
        query_string: url.search || url.pathname,
        headers: headersObj,
        raw_body: rawBody.slice(0, 16000),
        parsed_tag_count: parsedCount,
        parse_error: parseError,
      });
    } catch (e) {
      console.error("Failed to write zebra debug log:", e);
    }
  };

  const respond = (body: Record<string, unknown>, status = 200) =>
    isXml ? xmlResponse(body, status) : jsonResponse(body, status);

  if (!companySlug) {
    await writeDebug(null, "missing company");
    return respond({ error: "Missing company" }, 400);
  }

  const expectedKey = process.env.ZEBRA_READER_API_KEY;
  if (expectedKey && apiKey !== expectedKey) {
    await writeDebug(null, "invalid api key");
    return respond({ error: "Invalid API key" }, 401);
  }

  let tags: TagRead[] = [];
  if (isXml) {
    try {
      tags = extractTagsFromXml(rawBody);
    } catch (e) {
      await writeDebug(0, `xml parse error: ${(e as Error).message}`);
      return respond({ error: "Invalid XML body" }, 400);
    }
  } else {
    try {
      const payload = JSON.parse(rawBody);
      tags = extractTagsFromJson(payload);
    } catch (e) {
      await writeDebug(0, `json parse error: ${(e as Error).message}`);
      return respond({ error: "Invalid JSON body" }, 400);
    }
  }

  // Only log anomalies (zero-tag payloads). Successful reads are NOT logged
  // to avoid filling zebra_reader_debug_logs (which previously grew to >1GB
  // from a single chatty reader). Tag data is already persisted in rfid_scans.
  if (tags.length === 0) {
    await writeDebug(0, "no tags parsed from payload");
    return respond({ accepted: 0, message: "No valid tags found in payload" }, 200);
  }

  const antennaLocationMap: Record<number, string> = {};
  let resolvedReader:
    | { id: string; hostname: string; name: string; is_active: boolean }
    | null = null;

  if (readerHostname) {
    const { data } = await supabaseAdmin
      .from("fixed_readers")
      .select("id, hostname, name, is_active")
      .eq("hostname", readerHostname.toLowerCase())
      .eq("company_slug", companySlug)
      .maybeSingle();
    resolvedReader = data ?? null;
  }

  // Fallback: if hostname wasn't sent (some FX9600 IoT Connector configs strip
  // it), auto-resolve when the company has exactly one active reader.
  if (!resolvedReader) {
    const { data: companyReaders } = await supabaseAdmin
      .from("fixed_readers")
      .select("id, hostname, name, is_active")
      .eq("company_slug", companySlug)
      .eq("is_active", true);
    if (companyReaders && companyReaders.length === 1) {
      resolvedReader = companyReaders[0];
    }
  }

  if (resolvedReader && !resolvedReader.is_active) {
    return respond(
      { error: "Reader is disabled", hostname: resolvedReader.hostname },
      403
    );
  }

  if (resolvedReader) {
    const { data: antennas } = await supabaseAdmin
      .from("reader_antennas")
      .select("antenna_port, location")
      .eq("reader_id", resolvedReader.id);
    if (antennas) for (const a of antennas) antennaLocationMap[a.antenna_port] = a.location;
  }

  const resolvedDeviceName = resolvedReader?.name || deviceName;

  const records = tags.map((t) => {
    let location = fallbackLocation;
    if (t.antennaPort && antennaLocationMap[t.antennaPort]) {
      location = antennaLocationMap[t.antennaPort];
    }
    return {
      epc: t.epc,
      rssi: t.rssi,
      scan_count: 1,
      last_seen: new Date().toISOString(),
      location,
      company_slug: companySlug,
      device_name: resolvedDeviceName,
    };
  });

  const { error } = await supabaseAdmin
    .from("rfid_scans")
    .upsert(records, { onConflict: "epc", ignoreDuplicates: false });

  if (error) {
    return respond({ error: "Database error", detail: error.message }, 500);
  }

  // Auto-link any new EPCs to items via SGTIN decoding.
  let linked = 0;
  try {
    const linkResult = await autoLinkEpcsToItems(companySlug, tags.map((t) => t.epc));
    linked = linkResult.linked;
  } catch (e) {
    console.error("auto-link failed:", e);
  }

  // Sync item warehouse_location to most recent scan location
  try {
    await syncItemLocationsForEpcs(companySlug, tags.map((t) => t.epc));
  } catch (e) {
    console.error("sync-item-locations failed:", e);
  }

  return respond({ accepted: tags.length, linked, timestamp: new Date().toISOString() });
}
