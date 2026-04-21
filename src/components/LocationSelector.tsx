import { useState, useRef, useEffect } from "react";
import { MapPin, ScanBarcode, X, Edit3, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface LocationSelectorProps {
  location: string;
  onLocationChange: (location: string) => void;
}

export function LocationSelector({ location, onLocationChange }: LocationSelectorProps) {
  const { companySlug } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(location);
  const [isBarcodeMode, setIsBarcodeMode] = useState(false);
  const [existingLocations, setExistingLocations] = useState<
    Array<{ name: string; barcode: string | null }>
  >([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch the company's managed location list (from the locations table).
  // Falls back to merging in legacy values from rfid_scans / items.warehouse_location
  // so locations created before this feature still appear in the dropdown.
  useEffect(() => {
    if (!isEditing || !companySlug) return;
    let cancelled = false;
    (async () => {
      const [locsRes, scansRes, itemsRes] = await Promise.all([
        supabase
          .from("locations")
          .select("name, barcode")
          .eq("company_slug", companySlug)
          .order("name", { ascending: true }),
        supabase
          .from("rfid_scans")
          .select("location")
          .eq("company_slug", companySlug)
          .not("location", "is", null),
        supabase
          .from("items")
          .select("warehouse_location")
          .eq("company_slug", companySlug)
          .not("warehouse_location", "is", null),
      ]);
      if (cancelled) return;
      const map = new Map<string, { name: string; barcode: string | null }>();
      (locsRes.data ?? []).forEach((r) => {
        const v = r.name?.trim();
        if (v) map.set(v.toLowerCase(), { name: v, barcode: r.barcode ?? null });
      });
      (scansRes.data ?? []).forEach((r) => {
        const v = r.location?.trim();
        if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), { name: v, barcode: null });
      });
      (itemsRes.data ?? []).forEach((r) => {
        const v = r.warehouse_location?.trim();
        if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), { name: v, barcode: null });
      });
      setExistingLocations(
        Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditing, companySlug]);

  // Close the dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputValue.trim();
    if (!val) return;
    // If the typed/scanned value matches a known location's barcode, resolve to its name
    const byBarcode = existingLocations.find(
      (l) => l.barcode && l.barcode.trim().toLowerCase() === val.toLowerCase(),
    );
    const finalValue = byBarcode?.name ?? val;
    onLocationChange(finalValue);
    setIsEditing(false);
    setIsBarcodeMode(false);
    setShowDropdown(false);
  };

  const handlePickExisting = (name: string) => {
    setInputValue(name);
    onLocationChange(name);
    setIsEditing(false);
    setIsBarcodeMode(false);
    setShowDropdown(false);
  };

  const handleBarcodeScan = () => {
    setIsBarcodeMode(true);
    setIsEditing(true);
    setInputValue("");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleClear = () => {
    onLocationChange("");
    setInputValue("");
    setIsEditing(false);
    setIsBarcodeMode(false);
    setShowDropdown(false);
  };

  const filteredLocations = inputValue.trim()
    ? existingLocations.filter((l) => {
        const q = inputValue.trim().toLowerCase();
        return (
          l.name.toLowerCase().includes(q) ||
          (l.barcode?.toLowerCase().includes(q) ?? false)
        );
      })
    : existingLocations;

  if (isEditing) {
    return (
      <div
        ref={containerRef}
        className="rounded-lg border border-primary/40 bg-card p-3 space-y-2 relative"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span>{isBarcodeMode ? "Scan barcode or pick location" : "Enter or pick location"}</span>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder={isBarcodeMode ? "Scan barcode now..." : ""}
              className="font-mono text-xs pr-8"
              autoFocus
            />
            {existingLocations.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDropdown((v) => !v)}
                className="absolute right-0 top-0 h-full w-8 p-0 hover:bg-transparent"
                tabIndex={-1}
              >
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
            {showDropdown && filteredLocations.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                {filteredLocations.map((loc) => (
                  <button
                    key={loc.name}
                    type="button"
                    onClick={() => handlePickExisting(loc.name)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-mono hover:bg-accent hover:text-accent-foreground"
                  >
                    <MapPin className="h-3 w-3 shrink-0 text-primary" />
                    <span className="truncate flex-1">{loc.name}</span>
                    {loc.barcode && (
                      <span className="truncate text-[10px] text-muted-foreground shrink-0">
                        {loc.barcode}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="submit" size="sm" disabled={!inputValue.trim()}>
            Set
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsEditing(false);
              setIsBarcodeMode(false);
              setShowDropdown(false);
              setInputValue(location);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      </div>
    );
  }

  if (location) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm font-mono font-medium text-foreground truncate">
                {location}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEditing(true);
                setInputValue(location);
              }}
              className="h-8 w-8 p-0"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleBarcodeScan}
        className="flex-1 gap-2 border-solid border-4 border-yellow-300 text-xl font-mono"
      >
        <ScanBarcode className="h-4 w-4" />
        Select Location
      </Button>
    </div>
  );
}
