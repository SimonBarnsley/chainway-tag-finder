import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai-gateway.server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";

const Input = z.object({
  companySlug: z.string().min(1),
  mode: z.enum(["recent", "paste"]),
  hours: z.number().int().min(1).max(168),
  pasted: z.string(),
  location: z.string(),
});

export interface AuditFinding {
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
}

export interface ScanAuditResult {
  stats: {
    totalReads: number;
    uniqueEpcs: number;
    duplicateEpcs: number;
    malformedEpcs: number;
    prefixMismatches: number;
    multiLocationEpcs: number;
    unlinkedEpcs: number;
  };
  duplicates: { epc: string; reads: number }[];
  unusual: { epc: string; reason: string }[];
  summary: string;
  findings: AuditFinding[];
  recommendations: string[];
}

const HEX24 = /^[0-9A-F]{24}$/;

export const analyzeScanSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ScanAuditResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const { data: settings } = await context.supabase
      .from("company_settings")
      .select("epc_tag_prefix")
      .eq("company_slug", data.companySlug)
      .maybeSingle();
    const prefix = (settings?.epc_tag_prefix ?? "").trim().toUpperCase();

    // Build the session read list
    type Read = { epc: string; reads: number; location: string | null; lastSeen: string | null };
    let reads: Read[] = [];

    if (data.mode === "paste") {
      const counts = new Map<string, number>();
      for (const raw of data.pasted.split(/[\s,;]+/)) {
        const epc = raw.trim().toUpperCase();
        if (!epc) continue;
        counts.set(epc, (counts.get(epc) ?? 0) + 1);
      }
      reads = Array.from(counts.entries()).map(([epc, n]) => ({
        epc,
        reads: n,
        location: data.location.trim() || null,
        lastSeen: null,
      }));
    } else {
      const since = new Date(Date.now() - data.hours * 3600 * 1000).toISOString();
      let query = context.supabase
        .from("rfid_scans")
        .select("epc, scan_count, location, last_seen")
        .eq("company_slug", data.companySlug)
        .gte("last_seen", since)
        .order("last_seen", { ascending: false })
        .limit(2000);
      if (data.location.trim()) query = query.eq("location", data.location.trim());
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      reads = (rows ?? []).map((r) => ({
        epc: (r.epc ?? "").toUpperCase(),
        reads: r.scan_count ?? 1,
        location: r.location,
        lastSeen: r.last_seen,
      }));
    }

    if (reads.length === 0) {
      return {
        stats: {
          totalReads: 0, uniqueEpcs: 0, duplicateEpcs: 0, malformedEpcs: 0,
          prefixMismatches: 0, multiLocationEpcs: 0, unlinkedEpcs: 0,
        },
        duplicates: [],
        unusual: [],
        summary: "No scan data found for this session.",
        findings: [],
        recommendations: [],
      };
    }

    // Aggregate per EPC
    const byEpc = new Map<string, { reads: number; locations: Set<string> }>();
    for (const r of reads) {
      const entry = byEpc.get(r.epc) ?? { reads: 0, locations: new Set<string>() };
      entry.reads += r.reads;
      if (r.location) entry.locations.add(r.location);
      byEpc.set(r.epc, entry);
    }

    const epcs = Array.from(byEpc.keys());
    const { data: linkedRows } = await context.supabase
      .from("tag_items")
      .select("epc")
      .eq("company_slug", data.companySlug)
      .in("epc", epcs.slice(0, 1000));
    const linked = new Set((linkedRows ?? []).map((r) => (r.epc ?? "").toUpperCase()));

    const duplicates = epcs
      .filter((e) => (byEpc.get(e)?.reads ?? 0) > 1)
      .map((e) => ({ epc: e, reads: byEpc.get(e)!.reads }))
      .sort((a, b) => b.reads - a.reads);

    const unusual: { epc: string; reason: string }[] = [];
    let malformed = 0, prefixMismatch = 0, multiLocation = 0, unlinkedCount = 0;
    for (const epc of epcs) {
      const info = byEpc.get(epc)!;
      const reasons: string[] = [];
      if (!HEX24.test(epc)) { reasons.push("not a standard 96-bit hex EPC"); malformed++; }
      if (prefix && !epc.startsWith(prefix)) { reasons.push(`does not start with company prefix ${prefix}`); prefixMismatch++; }
      if (info.locations.size > 1) { reasons.push(`seen in ${info.locations.size} locations: ${Array.from(info.locations).join(", ")}`); multiLocation++; }
      if (!linked.has(epc)) { reasons.push("not linked to any item"); unlinkedCount++; }
      if (reasons.length > 0) unusual.push({ epc, reason: reasons.join("; ") });
    }

    const stats = {
      totalReads: reads.reduce((s, r) => s + r.reads, 0),
      uniqueEpcs: epcs.length,
      duplicateEpcs: duplicates.length,
      malformedEpcs: malformed,
      prefixMismatches: prefixMismatch,
      multiLocationEpcs: multiLocation,
      unlinkedEpcs: unlinkedCount,
    };

    // AI summary
    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const payload = {
      window: data.mode === "recent" ? `last ${data.hours}h` : "operator-supplied scan list",
      locationFilter: data.location.trim() || "all locations",
      companyEpcPrefix: prefix || "none configured",
      stats,
      topDuplicates: duplicates.slice(0, 25),
      unusualSample: unusual.slice(0, 40),
    };

    const schema = z.object({
      summary: z.string(),
      findings: z.array(
        z.object({
          title: z.string(),
          detail: z.string(),
          severity: z.enum(["low", "medium", "high"]),
        }),
      ),
      recommendations: z.array(z.string()),
    });

    let summary = "";
    let findings: AuditFinding[] = [];
    let recommendations: string[] = [];

    try {
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        output: Output.object({ schema }),
        system:
          "You are an RFID warehouse operations analyst. Review a scan session report and explain, in plain warehouse language, which EPC tags look duplicated or unusual and what the operator should do. Keep the summary under 120 words, at most 6 findings and at most 5 recommendations. Never invent EPCs that are not in the data.",
        prompt: JSON.stringify(payload),
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      const output = await result.output;
      summary = output.summary;
      findings = output.findings as AuditFinding[];
      recommendations = output.recommendations;
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      summary =
        `${stats.uniqueEpcs} unique tags across ${stats.totalReads} reads. ` +
        `${stats.duplicateEpcs} repeated, ${unusual.length} flagged as unusual. (AI summary unavailable.)`;
    }

    return {
      stats,
      duplicates: duplicates.slice(0, 50),
      unusual: unusual.slice(0, 50),
      summary,
      findings,
      recommendations,
    };
  });
