import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogOut, RadioTower } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useReaderConnection } from "@/hooks/use-zebra-sdk";
import { setHandheldMode } from "@/lib/handheld-mode";
import { cn } from "@/lib/utils";

/** Minimal full-screen frame for the handheld app: sign-in gate, title, back button. */
export function HandheldShell({
  title,
  back = true,
  children,
}: {
  title: string;
  back?: boolean;
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, signOut, companyName } = useAuth() as ReturnType<typeof useAuth> & {
    companyName?: string | null;
  };
  const navigate = useNavigate();
  const readerConnection = useReaderConnection();

  useEffect(() => {
    setHandheldMode(true);
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-3">
        {back ? (
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to="/handheld">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        ) : (
          <div className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
          {companyName && <p className="truncate text-xs text-muted-foreground">{companyName}</p>}
        </div>
        <div
          className="flex items-center gap-1"
          title={
            readerConnection === "connected"
              ? "RFID reader connected"
              : readerConnection === "disconnected"
                ? "RFID reader disconnected"
                : "RFID reader status unknown"
          }
          aria-label={
            readerConnection === "connected"
              ? "RFID reader connected"
              : readerConnection === "disconnected"
                ? "RFID reader disconnected"
                : "RFID reader status unknown"
          }
        >
          <RadioTower
            className={cn(
              "h-5 w-5",
              readerConnection === "connected" && "text-green-500",
              readerConnection === "disconnected" && "text-destructive",
              readerConnection === "unknown" && "text-muted-foreground/40",
            )}
          />
          <span
            className={cn(
              "text-[10px] font-medium leading-none",
              readerConnection === "connected" && "text-green-500",
              readerConnection === "disconnected" && "text-destructive",
              readerConnection === "unknown" && "text-muted-foreground/40",
            )}
          >
            {readerConnection === "connected" ? "RFID" : readerConnection === "disconnected" ? "No RFID" : "—"}
          </span>
        </div>
        {!back && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setHandheldMode(false);
              navigate({ to: "/" });
            }}
          >
            Full app
          </Button>
        )}
        {!back && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        )}
      </header>
      <main className="flex-1 space-y-4 p-4">{children}</main>
    </div>
  );
}
