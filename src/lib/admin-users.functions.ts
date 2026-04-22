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

export const listPendingUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingUser[]> => {
    await assertAdmin(context.userId);

    // List auth users (paginated). Page through up to 1000 recent users.
    const pending: PendingUser[] = [];
    let page = 1;
    const perPage = 200;
    while (page <= 5) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw new Response(error.message, { status: 500 });
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
    // Sort newest first
    pending.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return pending;
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
    // Generate a fresh signup confirmation link — Supabase will email it via
    // the configured auth email hook.
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email: data.email,
    });
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });
