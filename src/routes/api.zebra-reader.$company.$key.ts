import { createFileRoute } from "@tanstack/react-router";
import {
  ZEBRA_CORS_HEADERS,
  jsonResponse,
  handleZebraReaderPost,
} from "@/lib/zebra-reader-handler";

/**
 * Path-based variant of /api/zebra-reader for embedded clients (Zebra FX9600
 * IoT Connector) whose URL field cannot reliably carry query strings.
 *
 *   POST /api/zebra-reader/<company_slug>/<api_key>
 *
 * Optional reader hostname/location come from headers (X-Reader, X-Reader-Hostname)
 * or are auto-detected from the User-Agent.
 */
export const Route = createFileRoute("/api/zebra-reader/$company/$key")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: ZEBRA_CORS_HEADERS }),

      GET: async ({ params }) =>
        jsonResponse({
          status: "ok",
          service: "zebra-rfid-reader",
          mode: "path-auth",
          company: params.company,
          timestamp: new Date().toISOString(),
        }),

      POST: async ({ request, params }) =>
        handleZebraReaderPost(request, {
          companySlug: params.company,
          apiKey: params.key,
        }),
    },
  },
});
