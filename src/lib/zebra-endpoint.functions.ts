import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the API key for building the Zebra reader webhook URL.
 * Auth-gated so only signed-in users in this app can retrieve it.
 *
 * The key itself is read from the runtime secret ZEBRA_READER_API_KEY and
 * never bundled into client code.
 */
export const getZebraApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env.ZEBRA_READER_API_KEY ?? "";
    return {
      apiKey: key,
      configured: key.length > 0,
    };
  });
