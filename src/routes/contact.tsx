import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import scanLoc8Logo from "@/assets/scanloc8-logo.jpg.asset.json";
import levataLogo from "@/assets/levata-logo-white.svg";
import { contactSchema, sendContactEnquiry } from "@/lib/contact.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact ScanLoc8 — Talk to us about RFID tracking" },
      { name: "description", content: "Get in touch with the ScanLoc8 team about UHF RFID tag scanning, tracking and locating for your warehouse." },
      { property: "og:title", content: "Contact ScanLoc8" },
      { property: "og:description", content: "Questions, demos or pricing — send us a message and we'll get back to you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

const field = "w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function ContactPage() {
  const send = useServerFn(sendContactEnquiry);
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", message: "", website: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { errs[String(i.path[0])] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setStatus("sending");
    try {
      await send({ data: parsed.data });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/"><img src={scanLoc8Logo.url} alt="ScanLoc8" className="h-16 w-auto rounded md:h-20" /></Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to home</Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-12 px-4 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <div className="mb-8 flex items-center gap-3">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Powered by</span>
            <img src={levataLogo} alt="Levata" className="h-5 w-auto" />
          </div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-primary">Contact us</p>
          <h1 className="font-heading text-4xl font-bold leading-tight sm:text-5xl">Let's talk about<br />your RFID tracking.</h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">Questions about ScanLoc8, a demo for your team, or setting up readers across several sites? Send us a message and we'll get back to you.</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-6 sm:p-8">
          {status === "sent" ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto size-14 text-primary" />
              <h2 className="mt-4 font-heading text-2xl font-semibold">Thanks, {form.name.split(" ")[0]}.</h2>
              <p className="mt-2 text-sm text-muted-foreground">Your message has been sent. We'll be in touch soon.</p>
              <Button asChild className="mt-6"><Link to="/">Back to home</Link></Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name *" error={errors["name"]}><input className={field} value={form.name} onChange={set("name")} maxLength={100} autoComplete="name" /></Field>
                <Field label="Email *" error={errors["email"]}><input type="email" className={field} value={form.email} onChange={set("email")} maxLength={255} autoComplete="email" /></Field>
                <Field label="Company"><input className={field} value={form.company} onChange={set("company")} maxLength={120} autoComplete="organization" /></Field>
                <Field label="Phone"><input type="tel" className={field} value={form.phone} onChange={set("phone")} maxLength={40} autoComplete="tel" /></Field>
              </div>
              <Field label="Message *" error={errors["message"]}><textarea className={`${field} min-h-36`} value={form.message} onChange={set("message")} maxLength={2000} /></Field>
              <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={set("website")} />
              {status === "error" && <p className="text-sm text-destructive">Sorry, your message couldn't be sent. Please try again shortly.</p>}
              <p className="text-xs text-muted-foreground">
                We'll only use your details to reply to your enquiry. See our{" "}
                <Link to="/privacy" className="text-primary hover:underline">privacy policy</Link>.
              </p>
              <Button type="submit" size="lg" disabled={status === "sending"} className="w-full sm:w-auto">
                {status === "sending" ? <><Loader2 className="animate-spin" /> Sending…</> : <>Send message <Send /></>}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}
