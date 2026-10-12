import { createFileRoute } from "@tanstack/react-router";
import { isHandheldMode } from "@/lib/handheld-mode";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import scanLoc8Logo from "@/assets/scanloc8-logo.jpg.asset.json";

export const Route = createFileRoute("/signin")({
  component: SignInPage,
  head: () => ({
    meta: [
      { title: "Sign In — ScanLoc8" },
      {
        name: "description",
        content: "Sign in to ScanLoc8, the UHF RFID tag scanning and tracking system.",
      },
      { property: "og:title", content: "Sign In — ScanLoc8" },
      {
        property: "og:description",
        content: "Sign in to ScanLoc8, the UHF RFID tag scanning and tracking system.",
      },
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
    ],
  }),
});

function SignInPage() {
  const { signIn, isAuthenticated, isAdmin, companySlug, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && isHandheldMode()) {
      window.location.replace("/handheld");
    } else if (!isLoading && isAuthenticated) {
      // Desktop browsers land on the role-appropriate dashboard.
      const target = isAdmin ? "/$company/admin-dashboard" : "/$company/dashboard";
      const params = { company: companySlug ?? "default" };
      window.location.replace(
        target.replace("$company", params.company)
      );
    }
  }, [isAuthenticated, isLoading, isAdmin, companySlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signIn(email, password);
      toast.success("Logged in successfully");
      // Redirect happens via useEffect when auth state updates
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
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
          <h1 className="font-heading text-2xl font-bold text-foreground">Sign In</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your credentials to access the system
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>

          <p className="text-center text-sm">
            <Link to="/forgot-password" className="text-primary hover:underline">
              Forgot your password?
            </Link>
          </p>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
