import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ManualEntryProps {
  onSubmit: (epc: string) => void;
}

export function ManualEntry({ onSubmit }: ManualEntryProps) {
  const [epc, setEpc] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (epc.trim().length >= 4) {
      onSubmit(epc.trim());
      setEpc("");
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="w-full border-dashed"
      >
        <Plus className="h-4 w-4 mr-2" />
        Manual Entry
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={epc}
        onChange={(e) => setEpc(e.target.value.toUpperCase())}
        placeholder="Enter EPC hex..."
        className="font-mono text-xs flex-1"
        autoFocus
      />
      <Button type="submit" size="sm" disabled={epc.trim().length < 4}>
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
        ✕
      </Button>
    </form>
  );
}
