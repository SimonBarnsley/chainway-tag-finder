import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
  head: () => ({
    meta: [
      { title: "ScanLoc8 — UHF RFID Tag Scanner" },
      { name: "description", content: "UHF RFID tag scanner for Chainway C75 and Zebra handhelds plus Chainway UA4E and Zebra FX fixed readers" },
    ],
  }),
});

function IndexRedirect() {
  const { isAuthenticated, isLoading, isAdmin, companySlug } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  // Handheld devices (and the APK) keep their dedicated menu;
  // desktop browsers go straight to the role-appropriate dashboard.
  if (isHandheldMode()) {
    return <Navigate to="/handheld" />;
  }

  const target = isAdmin ? "admin-dashboard" : "dashboard";
  if (companySlug) {
    return <Navigate to="/$company/$page" params={{ company: companySlug, page: target }} />;
  }

  // Fallback for users without a company slug
  return <Navigate to="/$company/$page" params={{ company: "default", page: target }} />;
}
