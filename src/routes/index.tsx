import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
  head: () => ({
    meta: [
      { title: "RFID Scanner — Zebra RFD40 + TC22" },
      { name: "description", content: "UHF RFID tag scanner for the Zebra RFD40 sled paired with a TC22 via e-Connex" },
    ],
  }),
});

function IndexRedirect() {
  const { isAuthenticated, isLoading, companySlug } = useAuth();

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

  if (companySlug) {
    return <Navigate to="/$company" params={{ company: companySlug }} />;
  }

  // Fallback for users without a company slug
  return <Navigate to="/$company" params={{ company: "default" }} />;
}
