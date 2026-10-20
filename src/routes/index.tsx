import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { isHandheldMode } from "@/lib/handheld-mode";
import { Button } from "@/components/ui/button";
import scanLoc8Logo from "@/assets/scanloc8-logo.jpg.asset.json";
import levataLogo from "@/assets/levata-logo-white.svg";
import levataColorLogo from "@/assets/levata-logo-transparent.png.asset.json";
import {
  PackageCheck,
  ClipboardList,
  Warehouse,
  Radar,
  Wifi,
  Map,
  Building2,
  Smartphone,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "ScanLoc8 — UHF RFID Tag Scanning & Tracking" },
      {
        name: "description",
        content:
          "ScanLoc8 is a UHF RFID tag scanning and tracking system for Chainway C75, UA4E and Zebra TC22R / FX readers — goods in, stock check, inventory and geiger tag locating.",
      },
      { property: "og:title", content: "ScanLoc8 — UHF RFID Tag Scanning & Tracking" },
      {
        property: "og:description",
        content:
          "UHF RFID tag scanning and tracking for Chainway and Zebra readers — goods in, stock check, inventory and geiger tag locating.",
      },
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
    ],
  }),
});

const features = [
  {
    icon: PackageCheck,
    title: "Goods In",
    description:
      "Scan tags as deliveries arrive. Every read is recorded against a location so stock is booked in the moment it enters the building.",
  },
  {
    icon: ClipboardList,
    title: "Stock Check",
    description:
      "Count a location in minutes. See what's present, what's missing, and jump straight to geiger search for anything unaccounted for.",
  },
  {
    icon: Warehouse,
    title: "Inventory with locations",
    description:
      "Every item carries its scan history, so the handheld inventory shows where each tagged item was last seen.",
  },
  {
    icon: Radar,
    title: "Geiger / Find Tag",
    description:
      "Locate a specific tag with a live proximity meter and constant beep — just like Zebra's 123RFID locate, built into your workflow.",
  },
  {
    icon: Wifi,
    title: "Fixed reader monitoring",
    description:
      "Chainway UA4E and Zebra FX readers post reads over HTTP. The Readers page shows live connection status so you know when one drops off.",
  },
  {
    icon: Map,
    title: "Floor plans & zones",
    description:
      "Map antennas and reader locations onto floor plans, then filter and search the whole site by zone.",
  },
  {
    icon: Building2,
    title: "Multi-company",
    description:
      "Each company gets its own items, locations, maps, readers and users — with per-company reader endpoints for clean separation.",
  },
  {
    icon: Smartphone,
    title: "Handheld app",
    description:
      "A dedicated handheld UI for Goods In, Stock Check and Inventory — installable on the device home screen or as an APK.",
  },
];

function LandingPage() {
  const { isAuthenticated, isAdmin, companySlug } = useAuth();
  const signedIn = isAuthenticated;
  const appHref = isHandheldMode()
    ? "/handheld"
    : `/${companySlug ?? "default"}${isAdmin ? "/admin-dashboard" : "/dashboard"}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={scanLoc8Logo.url}
              alt="ScanLoc8"
              className="h-20 w-auto rounded md:h-28"
            />
            <div className="hidden items-center gap-3 sm:flex">
              <span className="h-9 w-px bg-border/70" aria-hidden />
              <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Powered by
                </span>
                <img
                  src={levataColorLogo.url}
                  alt="Levata"
                  className="h-4 w-auto"
                />
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/contact"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact us
            </Link>
            {signedIn ? (
              <Button asChild>
                <a href={appHref}>Open app</a>
              </Button>
            ) : (
              <>
                <Link
                  to="/signin"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sign in
                </Link>
                <Button asChild>
                  <Link to="/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.35_0.09_255/0.25),transparent_60%)]"
        />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            UHF RFID Tracking
          </p>
          <h1 className="mx-auto max-w-3xl font-heading text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Know exactly where every tagged item is.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            ScanLoc8 turns your Chainway and Zebra RFID readers into a complete
            tracking system — goods in, stock check, inventory and tag locating,
            all in one place.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {signedIn ? (
              <Button size="lg" asChild>
                <a href={appHref}>
                  Open app <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link to="/signup">
                    Get started <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/signin">Sign in</Link>
                </Button>
              </>
            )}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Works with Chainway C75 handhelds, UA4E fixed readers, and Zebra
            TC22R handhelds and FX fixed readers.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Powered by
            </span>
            <img
              src={levataLogo}
              alt="Levata"
              className="h-5 w-auto opacity-90"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h2 className="text-center font-heading text-2xl font-bold md:text-3xl">
            Everything a warehouse needs
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground md:text-base">
            Built around real RFID workflows — not a generic barcode system
            retro-fitted for tags.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-heading font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hardware strip */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-card p-6">
              <h3 className="font-heading text-lg font-semibold">Handhelds</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Chainway C75 with the built-in UHF reader, and Zebra TC22R via
                keyboard wedge or DataWedge. Goods In, Stock Check, Inventory
                and geiger locating in a dedicated handheld interface.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-6">
              <h3 className="font-heading text-lg font-semibold">Fixed readers</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Chainway UA4E and Zebra FX readers post tag reads straight to
                ScanLoc8 over HTTP, with per-company endpoints and live
                connection monitoring.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-6">
              <h3 className="font-heading text-lg font-semibold">One URL</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                The same scanloc8.com site serves every device — handheld, web
                browser or fixed reader — with role-based dashboards and
                multi-company support.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Powered by Levata */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-14 md:py-16">
          <div className="flex flex-col items-center gap-8 text-center md:flex-row md:justify-between md:text-left">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                Powered by Levata
              </p>
              <h2 className="mt-3 font-heading text-2xl font-bold md:text-3xl">
                Built on Levata's RFID and mobility expertise
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                ScanLoc8 is powered by Levata — formerly Barcodes Group — a
                global technology solutions provider delivering RFID, mobile
                computing, printing and managed services to more than 100,000
                customers worldwide. From readers and tags to configuration,
                deployment and support, Levata supplies the technology layer
                ScanLoc8 runs on.
              </p>
              <a
                href="https://www.levata.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                Visit levata.com <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <img
              src={levataLogo}
              alt="Levata"
              className="h-14 w-auto shrink-0 md:h-20"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60 bg-primary/5">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="font-heading text-2xl font-bold md:text-3xl">
            Ready to start tracking?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
            Sign in to your workspace, or create an account to get your company
            set up in minutes.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {signedIn ? (
              <Button size="lg" asChild>
                <a href={appHref}>Open app</a>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link to="/signup">Create account</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/signin">Sign in</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>ScanLoc8 — UHF RFID tag scanning & tracking</span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://www.levata.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 transition-opacity hover:opacity-80"
            >
              <span className="text-[0.7rem] uppercase tracking-[0.2em]">
                Powered by
              </span>
              <img src={levataLogo} alt="Levata" className="h-4 w-auto" />
            </a>
            <Link to="/contact" className="hover:text-foreground">
              Contact us
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/signin" className="hover:text-foreground">
              Sign in
            </Link>
            <Link to="/signup" className="hover:text-foreground">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
