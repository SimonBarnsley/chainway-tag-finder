import { createFileRoute } from "@tanstack/react-router";
import {
  ZEBRA_CORS_HEADERS,
  jsonResponse,
  handleZebraReaderPost,
} from "@/lib/zebra-reader-handler";

/** POST /api/chainway-reader/<company>/<key> — Chainway UA4E path form. */
export const Route = createFileRoute("/api/chainway-reader/$company/$key")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: ZEBRA_CORS_HEADERS }),
      GET: async ({ params }) =>
        jsonResponse({
          status: "ok",
          service: "chainway-rfid-reader",
          company: params.company,
          timestamp: new Date().toISOString(),
        }),
      POST: async ({ request, params }) =>
        handleZebraReaderPost(request, {
          companySlug: params.company,
          apiKey: params.key,
          defaultDeviceName: "Chainway UA4E Reader",
        }),
    },
  },
});
