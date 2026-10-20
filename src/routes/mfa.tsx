import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/mfa")({
  component: MfaPage,
  head: () => ({
    meta: [
      { title: "Two-step sign-in — ScanLoc8" },
      { name: "description", content: "Confirm your identity with an authenticator app code to access ScanLoc8 admin features." },
      { property: "og:title", content: "Two-step sign-in — ScanLoc8" },
      { property: "og:description", content: "Confirm your identity with an authenticator app code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Mode = "loading" | "enroll" | "verify";

// What the authenticator app shows for this account. The backend builds its
// otpauth URI from the hosting address, so without this the app would list the
// deployment hostname instead of the product name. Only the label and issuer
// change — secret, algorithm, digits and period are passed through untouched,
// so codes still verify.
const MFA_ISSUER = "ScanLoc8";

const encodeLabel = (value: string) =>
  value.replace(/[/?#&%=+]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function rebrandTotpUri(raw: string): string {
  try {
    const url = new URL(raw);
    const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const account = label.includes(":") ? label.slice(label.lastIndexOf(":") + 1) : label;
    const params = new URLSearchParams(url.search);
    params.set("issuer", MFA_ISSUER);
    const query = params.toString();
    return `otpauth://${url.host}/${encodeLabel(MFA_ISSUER)}:${encodeLabel(account)}${query ? `?${query}` : ""}`;
  } catch {
    return raw;
  }
}

function MfaPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/signin" }); return; }
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) { setFactorId(verified.id); setMode("verify"); return; }
      // Clear any half-finished enrolments, then start a fresh one.
      for (const f of data?.all ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: en, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `ScanLoc8 ${Date.now()}` });
      if (error || !en) { toast.error(error?.message ?? "Could not start set-up"); return; }
      setFactorId(en.id);
      setSecret(en.totp.secret);
      setUri(en.totp.uri);
      // Render the QR ourselves from the otpauth URI: a standards-compliant PNG
      // on a solid white background scans reliably in any theme, unlike the
      // default SVG which can be transparent-on-dark or malformed as a data URI.
      try {
        const png = await QRCode.toDataURL(en.totp.uri, { width: 320, margin: 2, errorCorrectionLevel: "M" });
        setQr(png);
      } catch {
        setQr(en.totp.qr_code);
      }
      setMode("enroll");
    })();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) throw error;
      toast.success("Verified");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="font-heading text-2xl font-bold text-foreground">Two-step sign-in</h1>
        {mode === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
        {mode === "enroll" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Admin accounts need an authenticator app (Microsoft Authenticator, Google Authenticator, etc.). Scan this code, then enter the 6-digit number it shows.
            </p>
            {qr && (
              <div className="mx-auto w-fit rounded-lg p-3" style={{ backgroundColor: "#ffffff" }}>
                <img src={qr} alt="Authenticator QR code" className="h-56 w-56" style={{ imageRendering: "pixelated" }} />
              </div>
            )}
            <p className="break-all font-mono text-xs text-muted-foreground">Or enter key: {secret}</p>
            {uri && (
              <p className="break-all font-mono text-[10px] text-muted-foreground/70">
                If the key fails, paste this whole link into your app: {uri}
              </p>
            )}
          </div>
        )}
        {mode === "verify" && (
          <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
        )}
        {mode !== "loading" && (
          <form onSubmit={submit} className="space-y-4 text-left">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" required />
            </div>
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Verify"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/signin" }); }}>
              Sign out
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
