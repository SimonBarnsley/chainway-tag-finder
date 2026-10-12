import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: LoginRedirect,
  head: () => ({
    meta: [{ title: "Sign In — ScanLoc8" }],
  }),
});

/** The sign-in page now lives at /signin; this route keeps old links working. */
function LoginRedirect() {
  return <Navigate to="/signin" />;
}
