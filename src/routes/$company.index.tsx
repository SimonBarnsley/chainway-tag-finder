import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { isHandheldMode } from "@/lib/handheld-mode";

export const Route = createFileRoute("/$company/")({
  head: () => ({ meta: [{ title: "Company workspace \u2014 ScanLoc8" },{ name: "description", content: "Open your ScanLoc8 company workspace." },{ property: "og:title", content: "Company workspace \u2014 ScanLoc8" },{ property: "og:description", content: "Open your ScanLoc8 company workspace." },{ property: "og:type", content: "website" },{ name: "twitter:card", content: "summary" }] }),
  component: CompanyIndexRedirect,
});

/**
 * The old Scanner page was removed. This route now redirects to the
 * role-appropriate dashboard (or the handheld menu on handheld devices).
 */
function CompanyIndexRedirect() {
  const { company } = Route.useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isHandheldMode()) {
      navigate({ to: "/handheld" });
      return;
    }
    navigate({
      to: isAdmin ? "/$company/admin-dashboard" : "/$company/dashboard",
      params: { company },
    });
  }, [isAdmin, company, navigate]);

  return null;
}
