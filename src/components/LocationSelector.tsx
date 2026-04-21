import { useState, useRef } from "react";
import { MapPin, ScanBarcode, X, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LocationSelectorProps {
  location: string;
  onLocationChange: (location: string) => void;
}

export function LocationSelector({ location, onLocationChange }: LocationSelectorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(location);
  const [isBarcodeMode, setIsBarcodeMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputValue.trim();
    if (val) {
      onLocationChange(val);
      setIsEditing(false);
      setIsBarcodeMode(false);
    }
  };

  const handleBarcodeScan = () => {
    setIsBarcodeMode(true);
    setIsEditing(true);
    setInputValue("");
    // Focus the input — the barcode scanner will type into it via keyboard wedge
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleClear = () => {
    onLocationChange("");
    setInputValue("");
    setIsEditing(false);
    setIsBarcodeMode(false);
  };

  if (isEditing) {
    return (
      <div className="rounded-lg border border-primary/40 bg-card p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span>{isBarcodeMode ? "Scan barcode or type location" : "Enter location"}</span>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={isBarcodeMode ? "Scan barcode now..." : ""}
            className="font-mono text-xs flex-1"
            autoFocus
          />
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
        className="flex-1 gap-2 border-dashed"
      >
        <ScanBarcode className="h-4 w-4" />
        Scan Location Barcode
      </Button>
    </div>
  );
}
