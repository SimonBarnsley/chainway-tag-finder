import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantAdmin, requireSuperAdmin } from "./tenant-access.server";
import type { Json } from "@/integrations/supabase/types";
import { findRegisteredCompany, isAssignableUserRole } from "./company-registration";

export interface PendingUser {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
}

async function writeAudit(
  companySlug: string | null | undefined,
  userId: string,
  action: string,
  details?: { [key: string]: Json | undefined }
) {
  if (!companySlug) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const adminDb = supabaseAdmin;
  try {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
    await adminDb.from("audit_log").insert({
      company_slug: companySlug,
      user_id: userId,
      user_email: u.user?.email ?? null,
      action,
      details: details ?? null,
    });
  } catch (e) {
    console.error("audit log write failed:", e);
  }
}

export interface ListPendingResult {
  ok: boolean;
  users: PendingUser[];
  error?: string;
}

export const listPendingUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ListPendingResult> => {
    try {
      await requireSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const pending: PendingUser[] = [];
      let page = 1;
      const perPage = 200;
      while (page <= 5) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });
        if (error) {
          return { ok: false, users: [], error: error.message };
        }
        for (const u of data.users) {
          if (!u.email_confirmed_at) {
            pending.push({
              id: u.id,
              email: u.email ?? null,
              display_name:
                (u.user_metadata?.display_name as string | undefined) ?? null,
              created_at: u.created_at,
              email_confirmed_at: u.email_confirmed_at ?? null,
              last_sign_in_at: u.last_sign_in_at ?? null,
            });
          }
        }
        if (data.users.length < perPage) break;
        page += 1;
      }
      pending.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return { ok: true, users: pending };
    } catch (e) {
      const msg = e instanceof Response
        ? `${e.status}: ${await e.text().catch(() => e.statusText)}`
        : e instanceof Error
          ? e.message
          : String(e);
      console.error("listPendingUsers failed:", msg);
      return { ok: false, users: [], error: msg };
    }
  });

export const approveUserSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId || typeof input.userId !== "string") {
      throw new Response("userId required", { status: 400 });
    }
    return input;
  })
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { email_confirm: true }
    );
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

export const resendConfirmationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => {
    if (!input?.email || typeof input.email !== "string") {
      throw new Response("email required", { status: 400 });
    }
    return input;
  })
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Generate a magic link the user can click to sign in & confirm their
    // email. Supabase will deliver it via the configured auth email hook.
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: data.email,
    });
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

export const updateUserCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { userId: string; companySlug: string | null }) => {
      if (!input?.userId || typeof input.userId !== "string") {
        throw new Response("userId required", { status: 400 });
      }
      if (
        input.companySlug !== null &&
        typeof input.companySlug !== "string"
      ) {
        throw new Response("companySlug must be string or null", {
          status: 400,
        });
      }
      return input;
    }
  )
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let companyName: string | null = null;
    if (data.companySlug) {
      // Look up the canonical company_name for this slug
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("company_name")
        .eq("company_slug", data.companySlug)
        .not("company_name", "is", null)
        .limit(1)
        .maybeSingle();
      companyName = existing?.company_name ?? null;
      if (!companyName) {
        const { data: reg } = await supabaseAdmin
          .from("companies").select("name").eq("slug", data.companySlug).maybeSingle();
        companyName = reg?.name ?? null;
      }
      if (!companyName) {
        throw new Response("Unknown company", { status: 400 });
      }
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        company_slug: data.companySlug,
        company_name: companyName,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", data.userId);

    if (error) throw new Response(error.message, { status: 500 });
    await writeAudit(data.companySlug, context.userId, "user.company_changed", {
      target_user_id: data.userId,
      company_slug: data.companySlug,
    });
    return { ok: true };
  });

export interface CompanyOption {
  slug: string;
  name: string;
}

export const listCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; companies: CompanyOption[]; error?: string }> => {
    try {
      const access = await requireTenantAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("company_slug, company_name")
        .not("company_slug", "is", null)
        .not("company_name", "is", null);
      if (error) throw new Response(error.message, { status: 500 });
      const map = new Map<string, string>();
      const { data: reg } = await supabaseAdmin.from("companies").select("slug, name");
      for (const c of reg ?? []) if (c.slug && c.name) map.set(c.slug, c.name);
      for (const r of data ?? []) {
        if (r.company_slug && r.company_name && !map.has(r.company_slug)) {
          map.set(r.company_slug, r.company_name);
        }
      }
      const companies = Array.from(map.entries())
        .filter(([slug]) => access.isSuper || slug === access.companySlug)
        .map(([slug, name]) => ({ slug, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { ok: true, companies };
    } catch (e) {
      const msg =
        e instanceof Response
          ? `${e.status}: ${await e.text().catch(() => e.statusText)}`
          : e instanceof Error
            ? e.message
            : String(e);
      return { ok: false, companies: [], error: msg };
    }
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      password: string;
      displayName?: string;
      companyName?: string;
      companySlug?: string;
      role?: "admin" | "supervisor" | "user";
    }) => {
      if (!input?.email || typeof input.email !== "string") {
        throw new Response("email required", { status: 400 });
      }
      if (!input?.password || typeof input.password !== "string" || input.password.length < 10) {
        throw new Response("password must be at least 10 characters", { status: 400 });
      }
      if (!input.companyName && !input.companySlug) {
        throw new Response("companyName or companySlug required", { status: 400 });
      }
      if (input.role !== undefined && !isAssignableUserRole(input.role)) {
        throw new Response("Invalid assignable role", { status: 400 });
      }
      return input;
    }
  )
  .handler(async ({ context, data }): Promise<{ ok: boolean; userId?: string; error?: string }> => {
   try {
    await requireTenantAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: registered, error: companyError } = await supabaseAdmin.from("companies").select("name, slug");
    if (companyError) throw new Error("Could not load registered companies");
    const company = findRegisteredCompany(registered ?? [], data);
    if (!company) throw new Response("Unknown registered company", { status: 400 });
    const companyName = company.name;
    const companySlug = company.slug;
    await requireTenantAdmin(context, companySlug);

    // Create the user (auto-confirmed). The handle_new_user trigger will
    // create the profile + default 'user' role and resolve the company slug.
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        display_name: data.displayName || data.email.split("@")[0],
        company_name: companyName,
      },
    });
    if (error || !created.user) {
      throw new Response(error?.message ?? "Failed to create user", { status: 500 });
    }

    // Ensure profile + base role exist (in case the signup trigger isn't attached).
    const comp = company;
    const { error: pErr } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: created.user.id,
        email: data.email,
        display_name: data.displayName || data.email.split("@")[0],
        company_name: comp?.name ?? companyName,
        company_slug: comp?.slug ?? companySlug,
      },
      { onConflict: "user_id" }
    );
    if (pErr) throw new Error(`Could not save profile: ${pErr.message}`);
    const { data: hasRole } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", created.user.id).limit(1);
    if (!hasRole?.length) {
      await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "user" });
    }

    // If a non-default role was requested, replace the default 'user' role.
    if (data.role && data.role !== "user") {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", created.user.id)
        .neq("role", "super_admin");
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: created.user.id, role: data.role });
      if (rErr) throw new Response(rErr.message, { status: 500 });
    }

    await writeAudit(comp?.slug ?? companySlug, context.userId, "user.created", {
      email: data.email,
      role: data.role ?? "user",
    });
    return { ok: true, userId: created.user.id };
   } catch (e) {
    const msg = e instanceof Response
      ? await e.text().catch(() => e.statusText)
      : e instanceof Error ? e.message : String(e);
    console.error("createUser failed:", msg);
    return { ok: false, error: msg };
   }
  });

export const deleteUserCompletely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId || typeof input.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.userId)) {
      throw new Response("Valid userId required", { status: 400 });
    }
    return input;
  })
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.userId === context.userId) throw new Response("You cannot delete your own account", { status: 400 });

    const { data: targetSuper } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", data.userId).eq("role", "super_admin").maybeSingle();
    if (targetSuper) throw new Response("Cannot delete a super admin", { status: 400 });

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles").select("company_slug, email").eq("user_id", data.userId).maybeSingle();
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Response(error.message, { status: 500 });
    await writeAudit(targetProfile?.company_slug, context.userId, "user.deleted", {
      email: targetProfile?.email ?? null,
    });
    return { ok: true };
  });
