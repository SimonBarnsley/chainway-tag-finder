import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$company")({
  head: () => ({ meta: [{ title: "Company \u2014 ScanLoc8" },{ name: "description", content: "Your ScanLoc8 company workspace." },{ property: "og:title", content: "Company \u2014 ScanLoc8" },{ property: "og:description", content: "Your ScanLoc8 company workspace." },{ property: "og:type", content: "website" },{ name: "twitter:card", content: "summary" }] }),
  component: CompanyLayout,
});

function CompanyLayout() {
  return <Outlet />;
}
