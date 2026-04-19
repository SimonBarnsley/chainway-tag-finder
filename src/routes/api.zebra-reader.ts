import { createFileRoute } from "@tanstack/react-router";
import {
  ZEBRA_CORS_HEADERS,
  jsonResponse,
  handleZebraReaderPost,
} from "@/lib/zebra-reader-handler";

/**
 * Webhook endpoint for Zebra FX fixed RFID readers.
 *
 * Two URL formats are supported:
 *
 *   1. Query-param form (legacy):
 *      POST /api/zebra-reader?company=<slug>&reader=<host>&key=<key>
 *
 *   2. Path form (preferred for FX9600 IoT Connector — single URL field, no `&`):
 *      POST /api/zebra-reader/<company>/<key>
 *      see api.zebra-reader.$company.$key.ts
 *
 * Auth precedence: path param key > query `?key=` > X-Api-Key header > Authorization Bearer.
 */
export const Route = createFileRoute("/api/zebra-reader")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: ZEBRA_CORS_HEADERS }),

      GET: async () =>
        jsonResponse({
          status: "ok",
          service: "zebra-rfid-reader",
          timestamp: new Date().toISOString(),
          usage:
            "POST tag reads to /api/zebra-reader/<company>/<key> OR /api/zebra-reader?company=<slug>&key=<key>",
        }),

      POST: async ({ request }) => handleZebraReaderPost(request),
    },
  },
});
