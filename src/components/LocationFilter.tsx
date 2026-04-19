import { useState, useEffect } from "react";
import { Search, MapPin, Package, Loader2, X, ChevronDown, Crosshair, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ItemDetails } from "./ItemDetails";

interface ScanWithItem {
  id: string;
  epc: string;
  scan_count: number;
  last_seen: string;
  location: string | null;
}

interface LocationFilterProps {
  onGeigerSearch?: (epc: string) => void;
  companySlug: string;
}

export function LocationFilter({ onGeigerSearch, companySlug }: LocationFilterProps) {
  const [locations, setLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [wildcardQuery, setWildcardQuery] = useState("");
  const [scans, setScans] = useState<ScanWithItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEpc, setExpandedEpc] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [copiedEpc, setCopiedEpc] = useState<string | null>(null);

  const handleCopyEpc = (epc: string) => {
    navigator.clipboard.writeText(epc);
    setCopiedEpc(epc);
    setTimeout(() => setCopiedEpc(null), 1500);
  };

  useEffect(() => {
    async function fetchLocations() {
      const { data } = await supabase
        .from("rfid_scans")
        .select("location")
        .eq("company_slug", companySlug)
        .not("location", "is", null)
        .order("location");
      if (data) {
        const unique = [...new Set(data.map((r) => r.location).filter(Boolean))] as string[];
        setLocations(unique);
      }
    }
    fetchLocations();
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);
    setExpandedEpc(null);

    let query = supabase
      .from("rfid_scans")
      .select("id, epc, scan_count, last_seen, location")
      .eq("company_slug", companySlug)
      .order("last_seen", { ascending: false });

    if (selectedLocation !== "all") {
      query = query.eq("location", selectedLocation);
    } else if (wildcardQuery.trim()) {
      query = query.ilike("location", `%${wildcardQuery.trim()}%`);
    } else {
      query = query.not("location", "is", null);
    }

    const { data } = await query.limit(200);
    setScans(data ?? []);
    setLoading(false);
  };

  // Auto-search when dropdown changes
  useEffect(() => {
    if (selectedLocation !== "all") {
      setWildcardQuery("");
      handleSearch();
    }
  }, [selectedLocation]);

  const handleClear = () => {
    setSelectedLocation("all");
    setWildcardQuery("");
    setScans([]);
    setSearched(false);
    setExpandedEpc(null);
  };

  const activeLabel =
    selectedLocation !== "all"
      ? selectedLocation
      : wildcardQuery.trim()
        ? `"${wildcardQuery.trim()}"`
        : null;

  return (
    <div className="space-y-3">
      {/* Dropdown + wildcard row */}
      <div className="flex items-center gap-2">
        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
          <SelectTrigger className="flex-1 text-xs">
            <MapPin className="h-3.5 w-3.5 mr-1 text-primary shrink-0" />
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(searched) && (
          <Button variant="ghost" size="icon" onClick={handleClear} className="h-9 w-9 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Wildcard search */}
      {selectedLocation === "all" && (
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={wildcardQuery}
              onChange={(e) => setWildcardQuery(e.target.value)}
              placeholder="Wildcard search locations..."
              className="pl-9 text-xs font-mono"
            />
          </div>
          <Button type="submit" size="sm" disabled={loading}>
            Search
          </Button>
        </form>
      )}

      {/* Results */}
      {searched && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            {activeLabel && <span className="font-medium text-foreground">{activeLabel}</span>}
            <span>— {scans.length} tag{scans.length !== 1 ? "s" : ""}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : scans.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No tags found</p>
          ) : (
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
              {scans.map((scan) => (
                <div key={scan.id}>
                  <div className="w-full flex items-center justify-between rounded-lg border border-border bg-card p-3 hover:bg-accent/50 transition-colors">
                    <button
                      onClick={() => setExpandedEpc(expandedEpc === scan.epc ? null : scan.epc)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-mono text-xs font-medium text-foreground truncate">{scan.epc}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">×{scan.scan_count}</span>
                        {scan.location && (
                          <span className="text-xs text-primary flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />{scan.location}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(scan.last_seen).toLocaleString()}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleCopyEpc(scan.epc)}
                      className="p-2 rounded-md hover:bg-accent text-muted-foreground shrink-0"
                      title="Copy EPC"
                    >
                      {copiedEpc === scan.epc ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                    {onGeigerSearch && (
                      <button
                        onClick={() => onGeigerSearch(scan.epc)}
                        className="p-2 rounded-md hover:bg-accent text-muted-foreground shrink-0"
                        title="Geiger search"
                      >
                        <Crosshair className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {expandedEpc === scan.epc && (
                    <div className="mt-1 ml-2">
                      <ItemDetails epc={scan.epc} companySlug={companySlug} onDeleted={() => {
                        // Immediately remove from local state
                        setScans(prev => prev.filter(s => s.epc !== scan.epc));
                        setExpandedEpc(null);
                      }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
