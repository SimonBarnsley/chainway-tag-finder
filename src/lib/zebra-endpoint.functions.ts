import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Returns the Zebra reader API key for building the webhook URL.
 *
 * Auth model: client passes its Supabase access token in the body. We verify it
 * server-side with the admin client (no RLS bypass for this check — just user
 * lookup). This avoids relying on the Authorization header, which `useServerFn`
 * does not auto-attach.
 *
 * The key itself is read from the runtime secret ZEBRA_READER_API_KEY and
 * never bundled into client code.
 */
export const getZebraApiKey = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accessToken: z.string().min(10).max(4000),
    }).parse
  )
  .handler(async ({ data }) => {
    const { data: userData, error } = await supabaseAdmin.auth.getUser(
      data.accessToken
    );
    if (error || !userData?.user) {
      return { configured: false as const, apiKey: "", error: "unauthorized" };
    }

    const key = process.env.ZEBRA_READER_API_KEY ?? "";
    return {
      apiKey: key,
      configured: key.length > 0,
      error: null as string | null,
    };
  });
