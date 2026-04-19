import { Copy, Check, ChevronDown, ChevronUp, Crosshair } from "lucide-react";
import { useState } from "react";
import { Radio } from "lucide-react";
import { ItemDetails } from "./ItemDetails";

interface TagEntry {
  epc: string;
  count: number;
  lastSeen: Date;
  saved: boolean;
}

interface TagListProps {
  tags: TagEntry[];
  companySlug: string;
  onGeigerSearch?: (epc: string) => void;
}

export function TagList({ tags, companySlug, onGeigerSearch }: TagListProps) {
  const [copiedEpc, setCopiedEpc] = useState<string | null>(null);
  const [expandedEpc, setExpandedEpc] = useState<string | null>(null);

  const handleCopy = (epc: string) => {
    navigator.clipboard.writeText(epc);
    setCopiedEpc(epc);
    setTimeout(() => setCopiedEpc(null), 1500);
  };

  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Radio className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">No tags scanned yet</p>
        <p className="text-xs mt-1">Pull the trigger on your Zebra RFD40</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
      {tags.map((tag) => (
        <div key={tag.epc}>
          <div
            className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
              tag.saved
                ? "border-success/30 bg-success/5"
                : "border-border bg-card"
            }`}
          >
            <button
              className="flex-1 min-w-0 text-left"
              onClick={() => setExpandedEpc(expandedEpc === tag.epc ? null : tag.epc)}
            >
              <p className="font-mono text-xs font-medium text-foreground truncate">
                {tag.epc}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-muted-foreground">
                  ×{tag.count}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tag.lastSeen.toLocaleTimeString()}
                </span>
                {tag.saved && (
                  <span className="text-xs text-success font-medium">✓ Saved</span>
                )}
                {expandedEpc === tag.epc ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
            </button>
            {onGeigerSearch && (
              <button
                onClick={() => onGeigerSearch(tag.epc)}
                className="ml-1 p-2 rounded-md hover:bg-accent text-muted-foreground"
                title="Geiger search"
              >
                <Crosshair className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => handleCopy(tag.epc)}
              className="ml-1 p-2 rounded-md hover:bg-accent text-muted-foreground"
            >
              {copiedEpc === tag.epc ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          {expandedEpc === tag.epc && (
            <div className="mt-1 ml-2">
              <ItemDetails epc={tag.epc} companySlug={companySlug} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
