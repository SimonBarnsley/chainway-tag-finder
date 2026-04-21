import { useState, useRef, useEffect } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Menu, X, Radio, BarChart3, Package, History, Barcode, Upload, LogOut, Shield, Router, MapPin } from "lucide-react";
import barcodeWarehouseLogo from "@/assets/barcode-warehouse-logo.jpg";
import { useAuth } from "@/hooks/use-auth";
import { CompanySwitcher } from "@/components/CompanySwitcher";

interface AppHeaderProps {
  actions?: React.ReactNode;
}

export function AppHeader({ actions }: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, isAdmin, isSuperAdmin, user, signOut, companySlug } = useAuth();
  const params = useParams({ strict: false }) as { company?: string };
  const company = params.company || companySlug || "default";

  const navItems = [
    { label: "Scanner", to: "/$company" as const, icon: Radio },
    { label: "Dashboard", to: "/$company/dashboard" as const, icon: BarChart3 },
    { label: "Items", to: "/$company/items" as const, icon: Package },
    { label: "Locations", to: "/$company/locations" as const, icon: MapPin },
    { label: "History", to: "/$company/history" as const, icon: History },
    { label: "Decoder", to: "/$company/decoder" as const, icon: Barcode },
    { label: "Bulk Upload", to: "/$company/bulk-upload" as const, icon: Upload },
    { label: "Readers", to: "/$company/readers" as const, icon: Router },
  ];

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
                src={barcodeWarehouseLogo}
                alt="The Barcode Warehouse"
                className="h-10 w-auto"
              />
            </Link>
          </div>

          <h1 className="absolute left-1/2 -translate-x-1/2 text-xl sm:text-3xl font-extrabold tracking-tight text-foreground pointer-events-none">
            ZEBRA - ZEBRA
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
                    <Link
                      to="/$company/admin-dashboard"
                      params={{ company }}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                    >
                      <Shield className="h-4 w-4" />
                      Admin Dashboard
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <Link
                      to="/$company/admin"
                      params={{ company }}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      activeProps={{ className: "text-primary bg-primary/5 font-medium" }}
                    >
                      <Shield className="h-4 w-4" />
                      Admin
                    </Link>
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
