import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface PendingUser {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
}

async function assertAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  if (!roleSet.has("admin") && !roleSet.has("super_admin")) {
    throw new Response("Forbidden: admin only", { status: 403 });
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
      await assertAdmin(context.userId);

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
    await assertAdmin(context.userId);
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
    await assertAdmin(context.userId);
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
    await assertAdmin(context.userId);

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
      await assertAdmin(context.userId);
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
      if (!input?.password || typeof input.password !== "string" || input.password.length < 6) {
        throw new Response("password must be at least 6 characters", { status: 400 });
      }
      if (!input.companyName && !input.companySlug) {
        throw new Response("companyName or companySlug required", { status: 400 });
      }
      return input;
    }
  )
  .handler(async ({ context, data }): Promise<{ ok: boolean; userId?: string; error?: string }> => {
   try {
    await assertAdmin(context.userId);

    let companyName = data.companyName?.trim() || null;
    let companySlug = data.companySlug || null;

    // If a slug was provided, resolve canonical name
    if (companySlug && !companyName) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("company_name")
        .eq("company_slug", companySlug)
        .not("company_name", "is", null)
        .limit(1)
        .maybeSingle();
      companyName = existing?.company_name ?? null;
      if (!companyName) {
        const { data: reg } = await supabaseAdmin
          .from("companies").select("name").eq("slug", companySlug).maybeSingle();
        companyName = reg?.name ?? null;
      }
      if (!companyName) {
        throw new Response("Unknown company", { status: 400 });
      }
    }

    // Make sure the company is registered (signup trigger requires it).
    if (companyName && !companySlug) {
      const { data: found } = await supabaseAdmin
        .from("companies").select("slug, name").ilike("name", companyName).maybeSingle();
      if (found) {
        companyName = found.name;
      } else {
        const { data: slug } = await supabaseAdmin.rpc("generate_slug", { input: companyName });
        const { error: cErr } = await supabaseAdmin
          .from("companies").insert({ name: companyName, slug: (slug as string) || companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
        if (cErr) throw new Error(`Could not register company: ${cErr.message}`);
      }
    }

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
    const { data: comp } = companyName
      ? await supabaseAdmin.from("companies").select("name, slug").ilike("name", companyName).maybeSingle()
      : { data: null };
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
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Response("Forbidden: super admin only", { status: 403 });
    if (data.userId === context.userId) throw new Response("You cannot delete your own account", { status: 400 });

    const { data: targetSuper } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", data.userId).eq("role", "super_admin").maybeSingle();
    if (targetSuper) throw new Response("Cannot delete a super admin", { status: 400 });

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });
