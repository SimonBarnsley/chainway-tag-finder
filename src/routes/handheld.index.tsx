import { createFileRoute, Link } from "@tanstack/react-router";
import { PackagePlus, ClipboardCheck, List, Building2 } from "lucide-react";
import { HandheldShell } from "@/components/HandheldShell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/handheld/")({
  component: HandheldHome,
  head: () => ({
    meta: [
      { title: "ScanLoc8 Handheld" },
      { name: "description", content: "ScanLoc8 handheld app: Goods In, Stock Check and Inventory." },
      { property: "og:title", content: "ScanLoc8 Handheld" },
      { property: "og:description", content: "Goods In, Stock Check and Inventory on your RFID handheld." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const actions = [
  { to: "/handheld/goods-in", label: "Goods In", hint: "Scan arriving stock into a location", icon: PackagePlus },
  { to: "/handheld/stock-check", label: "Stock Check", hint: "Count a location: found, missing, unexpected", icon: ClipboardCheck },
  { to: "/handheld/inventory", label: "Inventory", hint: "Every item and where it is", icon: List },
] as const;

function HandheldHome() {
  const { companyName } = useAuth() as ReturnType<typeof useAuth> & {
    companyName?: string | null;
  };

  return (
    <HandheldShell title="ScanLoc8" back={false}>
      <div
        className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3"
        aria-label="Logged in company"
      >
        <Building2 className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Logged in for</p>
          <p className="truncate text-base font-semibold text-foreground">
            {companyName || "Unknown company"}
          </p>
        </div>
      </div>
      <div className="grid gap-4">
        {actions.map(({ to, label, hint, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-4 rounded-xl border-2 border-primary/40 bg-card p-5 active:bg-accent"
          >
            <Icon className="h-10 w-10 shrink-0 text-primary" />
            <div>
              <p className="text-xl font-semibold text-foreground">{label}</p>
              <p className="text-sm text-muted-foreground">{hint}</p>
            </div>
          </Link>
        ))}
      </div>
    </HandheldShell>
  );
}
