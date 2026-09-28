import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai-gateway.server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";

const Input = z.object({
  companySlug: z.string().min(1),
  log: z.string().min(1).max(200_000),
});

export interface LogIssue {
  category: "connection" | "antenna" | "api_key" | "other";
  title: string;
  evidence: string;
  fix: string;
  severity: "low" | "medium" | "high";
}

export interface LogDoctorResult {
  signals: {
    lines: number;
    unauthorized: number;
    timeouts: number;
    connectionErrors: number;
    antennaMentions: number;
    successLines: number;
  };
  summary: string;
  issues: LogIssue[];
  aiAvailable: boolean;
}

// Redact anything that looks like a key in a URL path or header so secrets
// never leave the app.
function redact(text: string) {
  return text
    .replace(/(\/api\/(?:zebra|chainway)-reader\/[^/\s]+\/)[^\s"'?]+/gi, "$1[KEY]")
    .replace(/((?:key|api[-_]?key|apikey|authorization|token|password)["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]");
}

export const diagnoseReaderLog = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<LogDoctorResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const clean = redact(data.log);
    const lines = clean.split(/\r?\n/).filter((l) => l.trim());
    const count = (re: RegExp) => lines.filter((l) => re.test(l)).length;
    const signals = {
      lines: lines.length,
      unauthorized: count(/\b401\b|unauthori[sz]ed|invalid api key|forbidden|\b403\b/i),
      timeouts: count(/timeout|timed out/i),
      connectionErrors: count(/disconnect|refused|unreachable|dns|ssl|tls|certificate|reset by peer|no route|econn/i),
      antennaMentions: count(/antenna|port\s*\d|vswr|reflected|rf power/i),
      successLines: count(/\b200\b|accepted|\bok\b/i),
    };

    // Keep the most informative lines within a sensible size.
    const interesting = lines.filter((l) =>
      /error|fail|warn|401|403|404|5\d\d|timeout|disconnect|refused|antenna|port|key|ssl|tls|dns|reset/i.test(l),
    );
    const sample = (interesting.length ? interesting : lines).slice(-300).join("\n").slice(0, 30_000);

    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const schema = z.object({
      summary: z.string(),
      issues: z.array(
        z.object({
          category: z.enum(["connection", "antenna", "api_key", "other"]),
          title: z.string(),
          evidence: z.string(),
          fix: z.string(),
          severity: z.enum(["low", "medium", "high"]),
        }),
      ),
    });

    try {
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        output: Output.object({ schema }),
        system:
          "You are a fixed RFID reader support engineer for Zebra FX-series and Chainway UA4E readers. Readers post tag data over HTTPS to /api/zebra-reader/<company>/<key> (Zebra) or /api/chainway-reader/<company>/<key> (Chainway); a 401 'Invalid API key' means the key in the reader's URL does not match. Diagnose the pasted log for connection problems (DNS, TLS, timeouts, disconnects, wrong URL), antenna problems (disconnected ports, high VSWR/reflected power, no reads on a port), and API-key problems. Quote short evidence lines from the log. Give practical fixes an operator can do on the reader's web console. Plain language, summary under 100 words, at most 6 issues. If the log looks healthy, say so and return no issues. Never invent log content.",
        prompt: JSON.stringify({ signals, logExcerpt: sample }),
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
      return { signals, summary: output.summary, issues: output.issues as LogIssue[], aiAvailable: true };
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      const issues: LogIssue[] = [];
      if (signals.unauthorized)
        issues.push({ category: "api_key", title: "Reader key rejected", evidence: `${signals.unauthorized} rejected lines`, fix: "Copy the address with 'Copy with key' on the Readers page and paste it into the reader.", severity: "high" });
      if (signals.connectionErrors || signals.timeouts)
        issues.push({ category: "connection", title: "Connection problems", evidence: `${signals.connectionErrors + signals.timeouts} lines`, fix: "Check the reader's network, DNS and the HTTPS address.", severity: "medium" });
      return { signals, summary: "AI summary unavailable — showing basic checks only.", issues, aiAvailable: false };
    }
  });
