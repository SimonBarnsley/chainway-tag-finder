import { useState, useEffect } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { Building2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface Company {
  company_slug: string;
  company_name: string;
  display_name: string | null;
  email: string | null;
}

export function CompanySwitcher() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { company?: string };
  const currentCompany = params.company;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const fetchCompanies = async () => {
      const [{ data: reg }, { data }] = await Promise.all([
        supabase.from("companies").select("slug, name"),
        supabase
          .from("profiles")
          .select("company_slug, company_name, display_name, email")
          .not("company_slug", "is", null),
      ]);

      const map = new Map<string, Company>();
      for (const c of reg ?? []) {
        map.set(c.slug, { company_slug: c.slug, company_name: c.name, display_name: null, email: null });
      }
      for (const p of data ?? []) {
        if (!p.company_slug) continue;
        const existing = map.get(p.company_slug);
        if (!existing) {
          map.set(p.company_slug, p as Company);
        } else if (!existing.email) {
          existing.email = p.email;
        }
      }
      setCompanies(
        Array.from(map.values()).sort((a, b) =>
          (a.company_name || a.company_slug).localeCompare(b.company_name || b.company_slug)
        )
      );
      setLoading(false);
    };
    fetchCompanies();
  }, []);

  const currentLabel =
    currentCompany === "default"
      ? "Super Admin"
      : companies.find((c) => c.company_slug === currentCompany)?.company_name ||
        currentCompany ||
        "Select Company";

  if (loading) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 max-w-[180px]">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate text-xs">{currentLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Switch Company
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <DropdownMenuItem
            key={c.company_slug}
            className={`cursor-pointer text-sm ${c.company_slug === currentCompany ? "bg-accent font-medium" : ""}`}
            onClick={() =>
            {
              // Stay on the same page, just switch company
              const rest = currentCompany
                ? pathname.replace(new RegExp(`^/${currentCompany}`), "")
                : "";
              navigate({ to: `/${c.company_slug}${rest}` as never });
            }
            }
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="truncate">{c.company_name || c.company_slug}</span>
              {c.email && (
                <span className="text-xs text-muted-foreground truncate">
                  {c.email}
                </span>
              )}
            </div>
          </DropdownMenuItem>
        ))}
        {companies.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground text-center">
            No companies found
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
