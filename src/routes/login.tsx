import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: LoginRedirect,
  head: () => ({ meta: [{ title: "Legacy sign-in \u2014 ScanLoc8" },{ name: "description", content: "Continue to the ScanLoc8 sign-in page." },{ property: "og:title", content: "Legacy sign-in \u2014 ScanLoc8" },{ property: "og:description", content: "Continue to the ScanLoc8 sign-in page." },{ property: "og:type", content: "website" },{ name: "twitter:card", content: "summary" }] }),
});

/** The sign-in page now lives at /signin; this route keeps old links working. */
function LoginRedirect() {
  return <Navigate to="/signin" />;
}
