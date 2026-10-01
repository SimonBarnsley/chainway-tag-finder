import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Per-company reader key. Each company gets its own secret key, stored in the
 * server-only company_reader_keys table. Only admins/supervisors of that
 * company (or super admins) can view or regenerate it.
 */
function newKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const input = z.object({
  accessToken: z.string().min(10).max(4000),
  company: z.string().min(1).max(100),
  regenerate: z.boolean().optional(),
});

export const getZebraApiKey = createServerFn({ method: "POST" })
  .inputValidator(input.parse)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData, error } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (error || !userData?.user) {
      return { configured: false as const, apiKey: "", error: "unauthorized" };
    }
    const uid = userData.user.id;
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", uid);
    const roleSet = new Set((roles ?? []).map((r) => r.role as string));
    const isSuper = roleSet.has("super_admin");
    if (!isSuper) {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("company_slug").eq("user_id", uid).maybeSingle();
      const canManage = roleSet.has("admin") || roleSet.has("supervisor");
      if (!canManage || profile?.company_slug !== data.company) {
        return { configured: false as const, apiKey: "", error: "forbidden" };
      }
    }

    const { data: existing } = await supabaseAdmin
      .from("company_reader_keys" as never)
      .select("api_key")
      .eq("company_slug", data.company)
      .maybeSingle();
    let key = (existing as { api_key?: string } | null)?.api_key ?? "";

    if (!key || data.regenerate) {
      key = newKey();
      const { error: upErr } = await supabaseAdmin
        .from("company_reader_keys" as never)
        .upsert({ company_slug: data.company, api_key: key } as never, { onConflict: "company_slug" });
      if (upErr) return { configured: false as const, apiKey: "", error: "save_failed" };
    }
    return { apiKey: key, configured: true, error: null as string | null };
  });
