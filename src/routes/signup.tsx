import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { registerAccount } from "@/lib/signup.functions";
import scanLoc8Logo from "@/assets/scanloc8-logo.jpg.asset.json";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({ meta: [{ title: "Sign up \u2014 ScanLoc8" },{ name: "description", content: "Create an account for a registered ScanLoc8 company." },{ property: "og:title", content: "Sign up \u2014 ScanLoc8" },{ property: "og:description", content: "Create an account for a registered ScanLoc8 company." },{ property: "og:type", content: "website" },{ name: "twitter:card", content: "summary" }] }),
});

function SignupPage() {
  const register = useServerFn(registerAccount);
  const { isAuthenticated, companySlug, isLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && companySlug) {
      navigate({ to: "/$company", params: { company: companySlug } });
    } else if (!isLoading && isAuthenticated) {
      navigate({ to: "/$company", params: { company: "default" } });
    }
  }, [isAuthenticated, isLoading, companySlug, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const company = companyName.trim();
    if (!company) {
      toast.error("Please enter your company name");
      return;
    }
    setLoading(true);
    try {
      const res = await register({
        data: {
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          companyName: company,
          redirectTo: window.location.origin,
        },
      });
      if (!res.ok) {
        toast.error(res.error || "Sign up failed");
        return;
      }
      toast.success("Account created! Check your email to confirm.");
      navigate({ to: "/login" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign up failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img
            src={scanLoc8Logo.url}
            alt="ScanLoc8"
            className="mx-auto mb-4 h-auto w-full max-w-xs rounded-lg object-contain"
          />
          <h1 className="text-2xl font-bold text-foreground">Create Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign up for a new account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display Name</Label>
            <Input
              id="name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
           </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company Name (as given by your administrator)</Label>
            <Input
              id="company"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Exact company name"
              required
              maxLength={150}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={10}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <p className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-[11px] leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">Your details:</span>{" "}
            we record your name, email and company to create and manage your
            account. Your company administrator controls who has access, and you
            can correct or delete your details at any time from the Admin page.
            See our{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              privacy policy
            </Link>
            .
          </p>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
