import { useState, useRef, useEffect } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Menu, X, Radio, BarChart3, Package, History, Barcode, Upload, LogOut, Shield, Router, MapPin, Map as MapIcon, ChevronDown, Users, ShieldCheck, Bug, DollarSign } from "lucide-react";
import scanLoc8Logo from "@/assets/scanloc8-logo.jpg.asset.json";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type PermissionKey } from "@/hooks/use-permissions";
import { CompanySwitcher } from "@/components/CompanySwitcher";

interface AppHeaderProps {
  actions?: React.ReactNode;
}

export function AppHeader({ actions }: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, isAdmin, isSuperAdmin, user, signOut, companySlug } = useAuth();
  const { has, loading: permLoading } = usePermissions();
  const params = useParams({ strict: false }) as { company?: string };
  const company = params.company || companySlug || "default";

  const allNavItems: { label: string; to: "/$company" | "/$company/dashboard" | "/$company/items" | "/$company/locations" | "/$company/maps/view" | "/$company/history" | "/$company/decoder" | "/$company/bulk-upload"; icon: typeof Radio; perm: PermissionKey | null }[] = [
    { label: "Scanner", to: "/$company", icon: Radio, perm: "scanner.use" },
    { label: "Mobile Dashboard", to: "/$company/dashboard", icon: BarChart3, perm: "dashboard.admin" },
    { label: "Items", to: "/$company/items", icon: Package, perm: "items.view" },
    { label: "Map", to: "/$company/maps/view", icon: MapIcon, perm: null },
    { label: "History", to: "/$company/history", icon: History, perm: "history.view" },
    { label: "Bulk Upload", to: "/$company/bulk-upload", icon: Upload, perm: "bulk_upload.use" },
  ];
  const navItems = permLoading
    ? allNavItems
    : allNavItems.filter((item) => !item.perm || has(item.perm) || isSuperAdmin);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6">
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/$company" params={{ company }}>
              <img
                src={scanLoc8Logo.url}
                alt="ScanLoc8"
                className="h-10 w-20 rounded-md object-cover"
              />
            </Link>
          </div>

          <h1 className="absolute left-1/2 -translate-x-1/2 text-xl sm:text-3xl font-extrabold tracking-tight text-foreground pointer-events-none">
            ScanLoc8
          </h1>

          <div className="flex items-center gap-2">
            {isSuperAdmin && <CompanySwitcher />}
            {actions}

            <div ref={menuRef} className="relative">
              <button
                onClick={() => setOpen(!open)}
                className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Menu"
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              {open && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-card shadow-lg py-1 z-50">
                  {navItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      params={{ company }}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  ))}
                  {isAdmin && (
                    <>
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => setAdminOpen(!adminOpen)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <Shield className="h-4 w-4" />
                          Admin
                        </span>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${adminOpen ? "rotate-180" : ""}`} />
                      </button>
                      {adminOpen && (
                        <div className="bg-muted/30">
                          <Link
                            to="/$company/locations"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <MapPin className="h-4 w-4" />
                            Locations
                          </Link>
                          <Link
                            to="/$company/decoder"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <Barcode className="h-4 w-4" />
                            Decoder
                          </Link>
                          <Link
                            to="/$company/admin-dashboard"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <BarChart3 className="h-4 w-4" />
                            Admin Dashboard
                          </Link>
                          <Link
                            to="/$company/cost-dashboard"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <DollarSign className="h-4 w-4" />
                            Cloud Cost
                          </Link>
                          <Link
                            to="/$company/users"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <Users className="h-4 w-4" />
                            Users
                          </Link>
                          <Link
                            to="/$company/roles"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <ShieldCheck className="h-4 w-4" />
                            Roles
                          </Link>
                          <Link
                            to="/$company/readers"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <Router className="h-4 w-4" />
                            Readers
                          </Link>
                          <Link
                            to="/$company/maps"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <MapIcon className="h-4 w-4" />
                            Floor Plan Maps
                          </Link>
                          <Link
                            to="/$company/signup-debug"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <Bug className="h-4 w-4" />
                            Signup Debug
                          </Link>
                          <Link
                            to="/$company/admin"
                            params={{ company }}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 pl-9 pr-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                          >
                            <Shield className="h-4 w-4" />
                            User Management & Settings
                          </Link>
                        </div>
                      )}
                    </>
                  )}
                  {isAuthenticated && (
                    <>
                      <div className="border-t border-border my-1" />
                      <div className="px-4 py-1.5 text-xs text-muted-foreground truncate">
                        {user?.email}
                      </div>
                      <button
                        onClick={() => {
                          setOpen(false);
                          signOut();
                        }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-accent transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
