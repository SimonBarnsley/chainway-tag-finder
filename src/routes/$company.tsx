import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$company")({
  component: CompanyLayout,
});

function CompanyLayout() {
  return <Outlet />;
}
