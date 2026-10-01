import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(128),
  displayName: z.string().trim().max(100).optional(),
  companyName: z.string().trim().min(1).max(150),
  redirectTo: z.string().url().max(500),
});

/**
 * Self sign-up: only allowed against a company already registered by a super
 * admin. Creates the account (confirmation email sent) and the profile/role.
 */
export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name, slug")
      .ilike("name", data.companyName)
      .maybeSingle();
    if (!company) {
      return {
        ok: false,
        error: "That company isn't registered. Check the exact name with your administrator.",
      };
    }

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
    const pub = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
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

    const displayName = data.displayName || data.email.split("@")[0];
    const { data: res, error } = await pub.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { display_name: displayName, company_name: company.name },
        emailRedirectTo: data.redirectTo,
      },
    });
    if (error) return { ok: false, error: error.message };
    const userId = res.user?.id;
    // Existing email: Supabase returns a user with no identities — don't touch it.
    if (!userId || (res.user?.identities && res.user.identities.length === 0)) {
      return { ok: false, error: "An account with this email already exists. Try signing in." };
    }

    const { error: pErr } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: userId,
        email: data.email,
        display_name: displayName,
        company_name: company.name,
        company_slug: company.slug,
      },
      { onConflict: "user_id" }
    );
    if (pErr) return { ok: false, error: `Could not save profile: ${pErr.message}` };

    const { data: roles } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).limit(1);
    if (!roles?.length) {
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "user" });
    }
    return { ok: true };
  });
