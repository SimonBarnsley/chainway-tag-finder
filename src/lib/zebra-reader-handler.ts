import { extractTagsFromJson, extractTagsFromXml, extractTagsFromText, deduplicateTagReads, type TagRead } from "@/lib/rfid-payload";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { autoLinkEpcsToItems } from "@/lib/auto-link-epcs";
import { syncItemLocationsForEpcs } from "@/lib/sync-item-locations";
import { redactReaderHeaders, redactReaderUrl } from "./reader-debug-redaction";

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

/**
 * Record the last time a reader contacted the server, so the Readers page can
 * show whether each fixed reader is still connected. Covers tag batches,
 * heartbeats and status posts. Matching falls back to the company's single
 * active reader when the payload carries no hostname.
 */
async function touchReader(companySlug: string, readerHostname: string | null) {
  const now = new Date().toISOString();
  try {
    if (readerHostname) {
      await supabaseAdmin
        .from("fixed_readers")
        .update({ last_seen_at: now })
        .eq("hostname", readerHostname.toLowerCase())
        .eq("company_slug", companySlug);
    } else {
      const { data } = await supabaseAdmin
        .from("fixed_readers")
        .select("id")
        .eq("company_slug", companySlug)
        .eq("is_active", true);
      const rows = (data ?? []) as { id: string }[];
      if (rows.length === 1) {
        await supabaseAdmin
          .from("fixed_readers")
          .update({ last_seen_at: now })
          .eq("id", rows[0].id);
      }
    }
  } catch (e) {
    console.error("touch reader failed:", e);
  }
}

export interface ZebraOverrides {
  companySlug?: string | null;
  apiKey?: string | null;
  defaultDeviceName?: string;
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
    overrides.defaultDeviceName ||
    (/chainway|ua4e/i.test(ua) ? "Chainway UA4E Reader" : "Zebra FX Reader");

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const rawBody = await request.text();
  const trimmed = rawBody.trimStart();
  const isXml =
    contentType.includes("xml") ||
    (contentType.includes("text/plain") && trimmed.startsWith("<")) ||
    (!contentType.includes("json") && trimmed.startsWith("<"));

  const headersObj = redactReaderHeaders(request.headers);
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
        query_string: redactReaderUrl(url),
        headers: headersObj,
        raw_body: "[omitted: request bodies may contain credentials or private tag data]",
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

  // Per-company key first; companies without one fall back to the shared key.
  const { data: companyKeyRow, error: companyKeyError } = await supabaseAdmin
    .from("company_reader_keys" as never)
    .select("api_key")
    .eq("company_slug", companySlug)
    .maybeSingle();
  const companyKey = (companyKeyRow as { api_key?: string } | null)?.api_key;
  if (companyKeyError) return respond({ error: "Reader authentication unavailable" }, 503);
  const expectedKey = companyKey || process.env.ZEBRA_READER_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    await writeDebug(null, companyKey ? "invalid company api key" : "invalid api key");
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
      // Chainway UA4E and other Android readers may post plain text or
      // form-encoded EPC lists instead of JSON.
      tags = extractTagsFromText(rawBody);
      if (tags.length === 0) {
        await writeDebug(0, `unrecognised body: ${(e as Error).message}`);
        return respond({ error: "Unrecognised body format" }, 400);
      }
    }
  }

  // Zebra IoT Connector heartbeats/management events carry no tags — ack quietly.
  if (tags.length === 0 && /"type"\s*:\s*"heartbeat"/.test(rawBody)) {
    await touchReader(companySlug, readerHostname);
    return respond({ accepted: 0, heartbeat: true }, 200);
  }

  // Only log anomalies (zero-tag payloads). Successful reads are NOT logged
  // to avoid filling zebra_reader_debug_logs (which previously grew to >1GB
  // from a single chatty reader). Tag data is already persisted in rfid_scans.
  if (tags.length === 0) {
    await touchReader(companySlug, readerHostname);
    await writeDebug(0, "no tags parsed from payload");
    return respond({ accepted: 0, message: "No valid tags found in payload" }, 200);
  }

  // Batches often repeat the same EPC; Postgres upsert rejects duplicate
  // conflict keys in one statement (caused HTTP 500 → reader disconnects).
  // Keep the strongest read per EPC.
  tags = deduplicateTagReads(tags);

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

  // Tag batch received — mark the reader as seen.
  if (resolvedReader) {
    await supabaseAdmin
      .from("fixed_readers")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", resolvedReader.id);
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
    if (t.antennaPort !== undefined && antennaLocationMap[t.antennaPort]) {
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
    .upsert(records, { onConflict: "company_slug,epc", ignoreDuplicates: false });

  if (error) {
    await writeDebug(tags.length, `database error: ${error.message}`);
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
