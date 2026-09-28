import { createFileRoute } from "@tanstack/react-router";
import {
  ZEBRA_CORS_HEADERS,
  jsonResponse,
  handleZebraReaderPost,
} from "@/lib/zebra-reader-handler";

/**
 * Endpoint for Chainway UA4E Android fixed readers (HTTP post mode).
 * Shares the same parser + API key as the Zebra endpoint.
 *   POST /api/chainway-reader?company=<slug>&key=<key>
 */
export const Route = createFileRoute("/api/chainway-reader")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: ZEBRA_CORS_HEADERS }),
      GET: async () =>
        jsonResponse({
          status: "ok",
          service: "chainway-rfid-reader",
          timestamp: new Date().toISOString(),
        }),
      POST: async ({ request }) =>
        handleZebraReaderPost(request, { defaultDeviceName: "Chainway UA4E Reader" }),
    },
  },
});
