import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useCallback } from "react";
import { getZebraApiKey } from "@/lib/zebra-endpoint.functions";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Radio,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Save,
  Power,
  PowerOff,
  MapPin,
  Copy,
  Link as LinkIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/$company/readers")({
  component: ReadersPage,
  head: () => ({
    meta: [
      { title: "Fixed Readers — Antenna Configuration" },
      { name: "description", content: "Configure fixed RFID readers and map antennas to locations" },
    ],
  }),
});

interface ReaderAntenna {
  id?: string;
  antenna_port: number;
  location: string;
  description: string;
}

interface FixedReader {
  id: string;
  hostname: string;
  name: string;
  model: string;
  antenna_count: number;
  is_active: boolean;
  company_slug: string;
  created_at: string;
  antennas: ReaderAntenna[];
}

function ReadersPage() {
  return (
    <AuthGuard requirePermission="readers.manage">
      <ReadersContent />
    </AuthGuard>
  );
}

function ReadersContent() {
  const { company } = Route.useParams();
  const [readers, setReaders] = useState<FixedReader[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReader, setExpandedReader] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // New reader form state
  const [newHostname, setNewHostname] = useState("");
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newAntennaCount, setNewAntennaCount] = useState(4);
  const [adding, setAdding] = useState(false);

  const fetchReaders = useCallback(async () => {
    setLoading(true);
    try {
      const { data: readersData, error: readersError } = await supabase
        .from("fixed_readers")
        .select("*")
        .eq("company_slug", company)
        .order("created_at", { ascending: false });

      if (readersError) throw readersError;

      const { data: antennasData, error: antennasError } = await supabase
        .from("reader_antennas")
        .select("*")
        .eq("company_slug", company);

      if (antennasError) throw antennasError;

      const antennasByReader = new Map<string, ReaderAntenna[]>();
      for (const a of antennasData ?? []) {
        const list = antennasByReader.get(a.reader_id) ?? [];
        list.push({
          id: a.id,
          antenna_port: a.antenna_port,
          location: a.location,
          description: a.description ?? "",
        });
        antennasByReader.set(a.reader_id, list);
      }

      const combined: FixedReader[] = (readersData ?? []).map((r) => ({
        id: r.id,
        hostname: r.hostname,
        name: r.name,
        model: r.model ?? "",
        antenna_count: r.antenna_count,
        is_active: r.is_active,
        company_slug: r.company_slug,
        created_at: r.created_at,
        antennas: antennasByReader.get(r.id) ?? [],
      }));

      setReaders(combined);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load readers");
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    fetchReaders();
  }, [fetchReaders]);

  const handleAddReader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHostname.trim() || !newName.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase.from("fixed_readers").insert({
        hostname: newHostname.trim().toLowerCase(),
        name: newName.trim(),
        model: newModel.trim() || null,
        antenna_count: newAntennaCount,
        company_slug: company,
      });
      if (error) throw error;
      toast.success("Reader added");
      setNewHostname("");
      setNewName("");
      setNewModel("");
      setNewAntennaCount(4);
      setShowAddForm(false);
      fetchReaders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add reader");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteReader = async (readerId: string) => {
    try {
      const { error } = await supabase.from("fixed_readers").delete().eq("id", readerId);
      if (error) throw error;
      toast.success("Reader deleted");
      fetchReaders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete reader");
    }
  };

  const handleToggleActive = async (reader: FixedReader) => {
    try {
      const { error } = await supabase
        .from("fixed_readers")
        .update({ is_active: !reader.is_active })
        .eq("id", reader.id);
      if (error) throw error;
      fetchReaders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update reader");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Fixed Readers</h1>
          </div>
          <Button
            size="sm"
            variant={showAddForm ? "secondary" : "default"}
            className="gap-1"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus className="h-4 w-4" /> {showAddForm ? "Cancel" : "Add Reader"}
          </Button>
        </div>

        <EndpointUrlCard company={company} />

        {showAddForm && (
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Add Fixed Reader</h2>
              <form onSubmit={handleAddReader} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reader-hostname" className="text-xs">
                    Hostname <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="reader-hostname"
                    value={newHostname}
                    onChange={(e) => setNewHostname(e.target.value)}
                    placeholder="e.g. fx7500-dock1.local"
                    required
                    maxLength={255}
                  />
                  <p className="text-xs text-muted-foreground">
                    The network hostname of the reader as configured in Zebra IoT Connector or the Chainway UA4E app
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reader-name" className="text-xs">
                    Display Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="reader-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Dock 1 Reader"
                    required
                    maxLength={255}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reader-model" className="text-xs">Model</Label>
                    <Input
                      id="reader-model"
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      placeholder="e.g. FX7500"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reader-antennas" className="text-xs">Antenna Ports</Label>
                    <Input
                      id="reader-antennas"
                      type="number"
                      min={1}
                      max={16}
                      value={newAntennaCount}
                      onChange={(e) => setNewAntennaCount(parseInt(e.target.value) || 4)}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={adding} className="w-full gap-1">
                  <Plus className="h-4 w-4" /> {adding ? "Adding..." : "Add Reader"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading readers...</p>
        ) : readers.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Radio className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No fixed readers configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add a reader to map its antennas to locations
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {readers.map((reader) => (
              <ReaderCard
                key={reader.id}
                reader={reader}
                company={company}
                expanded={expandedReader === reader.id}
                onToggleExpand={() =>
                  setExpandedReader(expandedReader === reader.id ? null : reader.id)
                }
                onDelete={() => handleDeleteReader(reader.id)}
                onToggleActive={() => handleToggleActive(reader)}
                onRefresh={fetchReaders}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface ReaderCardProps {
  reader: FixedReader;
  company: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onRefresh: () => void;
}

function ReaderCard({
  reader,
  company,
  expanded,
  onToggleExpand,
  onDelete,
  onToggleActive,
  onRefresh,
}: ReaderCardProps) {
  const [antennaLocations, setAntennaLocations] = useState<Record<number, { location: string; description: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const map: Record<number, { location: string; description: string }> = {};
    for (const a of reader.antennas) {
      map[a.antenna_port] = { location: a.location, description: a.description };
    }
    // Fill in empty ports
    for (let i = 1; i <= reader.antenna_count; i++) {
      if (!map[i]) map[i] = { location: "", description: "" };
    }
    setAntennaLocations(map);
  }, [reader]);

  const handleSaveAntennas = async () => {
    setSaving(true);
    try {
      // Delete existing antennas for this reader
      await supabase.from("reader_antennas").delete().eq("reader_id", reader.id);

      // Insert new ones (only ports with a location set)
      const records = Object.entries(antennaLocations)
        .filter(([, v]) => v.location.trim())
        .map(([port, v]) => ({
          reader_id: reader.id,
          antenna_port: parseInt(port),
          location: v.location.trim(),
          description: v.description.trim() || null,
          company_slug: company,
        }));

      if (records.length > 0) {
        const { error } = await supabase.from("reader_antennas").insert(records);
        if (error) throw error;
      }

      toast.success("Antenna mappings saved");
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save antennas");
    } finally {
      setSaving(false);
    }
  };

  const configuredCount = reader.antennas.length;

  return (
    <Card className={!reader.is_active ? "opacity-60" : ""}>
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center gap-3 p-3">
          <button onClick={onToggleExpand} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleExpand}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground truncate">{reader.name}</p>
              {reader.model && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                  {reader.model}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{reader.hostname}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {configuredCount}/{reader.antenna_count} antennas mapped
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={onToggleActive} className="h-8 w-8 p-0">
              {reader.is_active ? (
                <Power className="h-4 w-4 text-success" />
              ) : (
                <PowerOff className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Expanded antenna config */}
        {expanded && (
          <div className="border-t border-border p-3 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Antenna → Location Mapping
              </h3>
            </div>

            <div className="space-y-2">
              {Array.from({ length: reader.antenna_count }, (_, i) => i + 1).map((port) => (
                <div key={port} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
                  <span className="text-xs font-mono text-muted-foreground w-8 text-center bg-muted rounded py-1">
                    A{port}
                  </span>
                  <Input
                    placeholder="Location"
                    value={antennaLocations[port]?.location ?? ""}
                    onChange={(e) =>
                      setAntennaLocations((prev) => ({
                        ...prev,
                        [port]: { ...prev[port], location: e.target.value },
                      }))
                    }
                    className="text-xs h-8"
                    maxLength={255}
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={antennaLocations[port]?.description ?? ""}
                    onChange={(e) =>
                      setAntennaLocations((prev) => ({
                        ...prev,
                        [port]: { ...prev[port], description: e.target.value },
                      }))
                    }
                    className="text-xs h-8"
                    maxLength={255}
                  />
                </div>
              ))}
            </div>

            <Button
              onClick={handleSaveAntennas}
              disabled={saving}
              size="sm"
              className="w-full gap-1"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Antenna Mappings"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EndpointUrlCard({ company }: { company: string }) {
  const [apiKey, setApiKey] = useState("");
  const [brand, setBrand] = useState<"zebra" | "chainway">("zebra");
  const [fetchingKey, setFetchingKey] = useState(false);
  const getZebraApiKeyFn = useServerFn(getZebraApiKey);
  // Always point readers at the live site — preview addresses require a login.
  const origin = "https://scanloc8.com";
  const basePath = brand === "zebra" ? "zebra-reader" : "chainway-reader";
  const keyForUrl = apiKey.trim() || "<API_KEY>";
  const pathUrl = `${origin}/api/${basePath}/${company}/${encodeURIComponent(keyForUrl)}`;
  const queryUrl = `${origin}/api/${basePath}?company=${company}&key=${encodeURIComponent(keyForUrl)}`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const copyWithServerKey = async (kind: "path" | "query") => {
    setFetchingKey(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error("You must be signed in to copy the API key");
        return;
      }
      const res = await getZebraApiKeyFn({ data: { accessToken } });
      if (res.error === "unauthorized") {
        toast.error("Session expired — please sign in again");
        return;
      }
      if (!res.configured || !res.apiKey) {
        toast.error("ZEBRA_READER_API_KEY is not set in backend secrets");
        return;
      }
      const url =
        kind === "path"
          ? `${origin}/api/${basePath}/${company}/${encodeURIComponent(res.apiKey)}`
          : `${origin}/api/${basePath}?company=${company}&key=${encodeURIComponent(res.apiKey)}`;
      await navigator.clipboard.writeText(url);
      toast.success(
        `${kind === "path" ? "Path URL" : "Query URL"} with API key copied`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch API key");
    } finally {
      setFetchingKey(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Fixed Reader HTTPS POST Endpoint
          </h2>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={brand === "zebra" ? "default" : "outline"} onClick={() => setBrand("zebra")}>
            Zebra FX
          </Button>
          <Button type="button" size="sm" variant={brand === "chainway" ? "default" : "outline"} onClick={() => setBrand("chainway")}>
            Chainway UA4E
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {brand === "zebra"
            ? "Configure your FX9600 IoT Connector to POST tag reads to one of the URLs below."
            : "In the UA4E reader app, turn on HTTP upload / post mode and paste one of the URLs below as the server address. JSON, plain-text and form-encoded EPC lists are all accepted."}{" "}
          The path-based URL is preferred (single field, no <code>&amp;</code>).
          Use <span className="font-semibold text-foreground">Copy with key</span> to
          fetch your API key from backend secrets and copy a ready-to-paste URL.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="endpoint-key" className="text-xs">
            API Key (optional preview)
          </Label>
          <Input
            id="endpoint-key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your ZEBRA_READER_API_KEY to preview the full URL"
            className="text-xs font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Not stored — only used to render the URL below.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Path-based URL (recommended)</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1.5 break-all">
              {pathUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 shrink-0"
              onClick={() => copy(pathUrl, "Path URL")}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 gap-1 shrink-0"
              disabled={fetchingKey}
              onClick={() => copyWithServerKey("path")}
            >
              <Copy className="h-3.5 w-3.5" />
              {fetchingKey ? "..." : "Copy with key"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Query-string URL (legacy)</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1.5 break-all">
              {queryUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 shrink-0"
              onClick={() => copy(queryUrl, "Query URL")}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 gap-1 shrink-0"
              disabled={fetchingKey}
              onClick={() => copyWithServerKey("query")}
            >
              <Copy className="h-3.5 w-3.5" />
              {fetchingKey ? "..." : "Copy with key"}
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t border-border">
          <p><span className="font-semibold text-foreground">Method:</span> POST</p>
          <p><span className="font-semibold text-foreground">Content-Type:</span> application/json (or application/xml)</p>
          <p>
            <span className="font-semibold text-foreground">Optional headers:</span>{" "}
            <code>X-Reader: &lt;hostname&gt;</code> to map antennas to locations.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

