import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface AuthLogEntry {
  id: string;
  timestamp: number;
  level: string | null;
  msg: string | null;
  path: string | null;
  status: string | null;
  error: string | null;
  raw: string;
}

interface RecentProfile {
  user_id: string;
  email: string | null;
  created_at: string;
  has_role: boolean;
}

interface DiagnosticsResult {
  authLogs: AuthLogEntry[];
  recentProfiles: RecentProfile[];
  authSettings: {
    auto_confirm: boolean | null;
    mailer_autoconfirm: boolean | null;
    external_email_enabled: boolean | null;
  } | null;
  warnings: string[];
  error: string | null;
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_PROJECT_REF = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "";

export const getAuthDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiagnosticsResult> => {
    const userId = context.userId;
    const warnings: string[] = [];

    // Verify caller is admin or super_admin
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("super_admin")) {
      throw new Response("Forbidden: admin only", { status: 403 });
    }

    // Recent profiles + role rows (last 10 signups)
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    const userIds = (profiles ?? []).map((p) => p.user_id);
    let roleRows: { user_id: string }[] = [];
    if (userIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("user_id", userIds);
      roleRows = data ?? [];
    }
    const roleUserIds = new Set(roleRows.map((r) => r.user_id));

    const recentProfiles: RecentProfile[] = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      email: p.email,
      created_at: p.created_at,
      has_role: roleUserIds.has(p.user_id),
    }));

    // Try to fetch auth logs via Supabase Management API analytics endpoint
    // This requires SUPABASE_ACCESS_TOKEN — if not set, we fall back to surfacing
    // the most useful info we can derive locally.
    let authLogs: AuthLogEntry[] = [];
    let logsError: string | null = null;
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

    if (!accessToken) {
      warnings.push(
        "SUPABASE_ACCESS_TOKEN is not configured — live auth provider logs are unavailable. Showing database evidence instead."
      );
    } else if (!SUPABASE_PROJECT_REF) {
      warnings.push("Could not derive project ref from SUPABASE_URL.");
    } else {
      try {
        const sql = `
          select id, timestamp, event_message, metadata.level as level,
                 metadata.status as status, metadata.path as path,
                 metadata.msg as msg, metadata.error as error
          from auth_logs
          cross join unnest(metadata) as metadata
          where metadata.path in ('/signup','/recover','/otp','/verify','/token','/magiclink','/invite')
          order by timestamp desc
          limit 25
        `;
        const url = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/analytics/endpoints/logs.all?sql=${encodeURIComponent(sql)}`;
        const resp = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (!resp.ok) {
          logsError = `Analytics API ${resp.status}: ${await resp.text()}`;
        } else {
          const payload = (await resp.json()) as { result?: Array<Record<string, unknown>> };
          authLogs = (payload.result ?? []).map((row) => ({
            id: String(row.id ?? ""),
            timestamp: Number(row.timestamp ?? 0),
            level: (row.level as string) ?? null,
            msg: (row.msg as string) ?? (row.event_message as string) ?? null,
            path: (row.path as string) ?? null,
            status: row.status != null ? String(row.status) : null,
            error: (row.error as string) ?? null,
            raw: JSON.stringify(row.event_message ?? row),
          }));
        }
      } catch (e) {
        logsError = e instanceof Error ? e.message : String(e);
      }
    }

    return {
      authLogs,
      recentProfiles,
      authSettings: null,
      warnings,
      error: logsError,
    };
  });
