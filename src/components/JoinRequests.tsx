import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listJoinRequests, decideJoinRequest, type JoinRequest } from "@/lib/admin-users.functions";

export function JoinRequests({ company, onChanged }: { company: string; onChanged?: () => void }) {
  const listFn = useServerFn(listJoinRequests);
  const decideFn = useServerFn(decideJoinRequest);
  const [rows, setRows] = useState<JoinRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await listFn({ data: { companySlug: company } })); }
    catch { /* not an admin of this company */ setRows([]); }
  }, [company, listFn]);
  useEffect(() => { load(); }, [load]);

  const decide = async (userId: string, approve: boolean) => {
    setBusy(userId);
    try {
      await decideFn({ data: { companySlug: company, userId, approve } });
      toast.success(approve ? "User approved" : "Request rejected");
      await load();
      onChanged?.();
    } catch {
      toast.error("Could not update the request");
    } finally { setBusy(null); }
  };

  if (rows.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserCheck className="h-4 w-4 text-primary" /> Sign-up requests ({rows.length})
        </div>
        {rows.map((r) => (
          <div key={r.user_id} className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <div className="min-w-0">
              <div className="text-sm truncate">{r.display_name || r.email}</div>
              <div className="text-xs text-muted-foreground truncate">{r.email} · {new Date(r.created_at).toLocaleDateString()}</div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="h-8 gap-1" disabled={busy === r.user_id} onClick={() => decide(r.user_id, true)}>
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1" disabled={busy === r.user_id} onClick={() => decide(r.user_id, false)}>
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
