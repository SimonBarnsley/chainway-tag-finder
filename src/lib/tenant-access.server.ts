import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { canAdministerCompany } from "./tenant-access";

type Context = { supabase: SupabaseClient<Database>; userId: string; claims: { aal?: unknown } };

export async function requireTenantAdmin(context: Context, targetCompany?: string | null) {
  const [roles, profile] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.from("profiles").select("company_slug").eq("user_id", context.userId).maybeSingle(),
  ]);
  if (roles.error || profile.error) throw new Response("Forbidden", { status: 403 });
  const roleNames = (roles.data ?? []).map((row) => row.role);
  const ownCompany = profile.data?.company_slug ?? null;
  const company = targetCompany === undefined ? ownCompany : targetCompany;
  if (!canAdministerCompany(roleNames, ownCompany, company, context.claims.aal)) {
    throw new Response("Forbidden: company administrator with two-step sign-in required", { status: 403 });
  }
  return { isSuper: roleNames.includes("super_admin"), companySlug: company };
}

export async function requireSuperAdmin(context: Context) {
  const access = await requireTenantAdmin(context);
  if (!access.isSuper) throw new Response("Forbidden: super admin only", { status: 403 });
  return access;
}