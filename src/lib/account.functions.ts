import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Untyped handle for tables not yet in the generated types.
const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

async function getCallerEmail(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const logAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companySlug: string; action: string; details?: Record<string, unknown> }) => {
      if (!input?.companySlug || typeof input.companySlug !== "string") {
        throw new Response("companySlug required", { status: 400 });
      }
      if (!input?.action || typeof input.action !== "string" || input.action.length > 100) {
        throw new Response("action required", { status: 400 });
      }
      return input;
    }
  )
  .handler(async ({ context, data }) => {
    // Only log for the caller's own company.
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_slug")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile?.company_slug || profile.company_slug !== data.companySlug) {
      throw new Response("Forbidden", { status: 403 });
    }
    const email = await getCallerEmail(context.userId);
    await adminDb.from("audit_log").insert({
      company_slug: data.companySlug,
      user_id: context.userId,
      user_email: email,
      action: data.action,
      details: data.details ?? null,
    });
    return { ok: true };
  });

export interface AuditEntry {
  id: string;
  user_email: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companySlug: string }) => {
    if (!input?.companySlug || typeof input.companySlug !== "string") {
      throw new Response("companySlug required", { status: 400 });
    }
    return input;
  })
  .handler(async ({ context, data }): Promise<{ ok: boolean; entries: AuditEntry[]; error?: string }> => {
    try {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      const { data: isSuper } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
      if (!isAdmin && !isSuper) throw new Response("Forbidden: admin only", { status: 403 });

      const { data: rows, error } = await adminDb
        .from("audit_log")
        .select("id, user_email, action, details, created_at")
        .eq("company_slug", data.companySlug)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return { ok: false, entries: [], error: error.message };
      return { ok: true, entries: (rows ?? []) as AuditEntry[] };
    } catch (e) {
      const msg = e instanceof Response ? `${e.status}` : e instanceof Error ? e.message : String(e);
      return { ok: false, entries: [], error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Download my data (GDPR data portability)
// ---------------------------------------------------------------------------

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [profile, roles, alerts, rulesCreated, auditEntries] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      context.supabase.from("user_roles").select("role, created_at").eq("user_id", userId),
      adminDb.from("alerts").select("location, epc, message, read_at, created_at").eq("recipient_user_id", userId),
      adminDb.from("alert_rules").select("name, location, target_type, enabled, created_at").eq("created_by", userId),
      adminDb.from("audit_log").select("action, details, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
    ]);
    const email = await getCallerEmail(userId);
    return {
      exported_at: new Date().toISOString(),
      account: { id: userId, email },
      profile: profile.data ?? null,
      roles: roles.data ?? [],
      alerts: alerts.data ?? [],
      rules_created: rulesCreated.data ?? [],
      activity_log: auditEntries.data ?? [],
    };
  });

// ---------------------------------------------------------------------------
// Self-service account deletion (GDPR right to erasure)
// ---------------------------------------------------------------------------

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) => {
    if (!input?.password || typeof input.password !== "string") {
      throw new Response("password required", { status: 400 });
    }
    return input;
  })
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    const userId = context.userId;

    // Super admins hold the keys to the whole system — they must be removed
    // by another super admin, not self-delete.
    const { data: isSuper } = await context.supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (isSuper) {
      return { ok: false, error: "Super admin accounts cannot delete themselves — ask another super admin to remove the account." };
    }

    const email = await getCallerEmail(userId);
    if (!email) return { ok: false, error: "Could not look up your account." };

    // Verify the password before deleting anything.
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const verifyClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { error: pwError } = await verifyClient.auth.signInWithPassword({ email, password: data.password });
    if (pwError) return { ok: false, error: "Password incorrect — account not deleted." };

    // Record the deletion in the audit log before the account disappears.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_slug")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile?.company_slug) {
      await adminDb.from("audit_log").insert({
        company_slug: profile.company_slug,
        user_id: userId,
        user_email: email,
        action: "account.self_deleted",
        details: { email },
      });
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
