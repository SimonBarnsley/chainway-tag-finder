import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — ScanLoc8" },
      { name: "description", content: "How ScanLoc8 collects, uses, stores and protects personal data under UK GDPR." },
      { property: "og:title", content: "Privacy Policy — ScanLoc8" },
      { property: "og:description", content: "How ScanLoc8 collects, uses, stores and protects personal data under UK GDPR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-xl font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <div>
          <Link to="/" className="text-sm text-primary hover:underline">← Back to ScanLoc8</Link>
          <h1 className="mt-4 font-heading text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: 20 October 2026</p>
        </div>

        <Section title="Who we are">
          <p>ScanLoc8 is an RFID tag scanning and tracking service, powered by Levata. We are the data controller for website enquiries and account details, and a data processor for the operational data our customer companies store in ScanLoc8.</p>
          <p>Contact: <a className="text-primary hover:underline" href="mailto:simon.barnsley@levata.com">simon.barnsley@levata.com</a></p>
        </Section>

        <Section title="What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Account details:</strong> name, email address, company, role and password (stored securely, never readable by us).</li>
            <li><strong>Contact enquiries:</strong> name, email, company, phone number and your message.</li>
            <li><strong>Operational data:</strong> RFID tag numbers, items, locations, scan times and reader details entered by your company.</li>
            <li><strong>Alerts:</strong> rule alerts sent to chosen users, in the app and by email.</li>
            <li><strong>Technical data:</strong> sign-in records and basic logs needed to keep the service secure.</li>
          </ul>
        </Section>

        <Section title="Why we use it (lawful basis)">
          <ul className="list-disc space-y-1 pl-5">
            <li>To provide the service to your company — <em>contract</em>.</li>
            <li>To reply to enquiries — <em>legitimate interests</em>.</li>
            <li>To keep accounts and data secure — <em>legitimate interests</em> and <em>legal obligation</em>.</li>
          </ul>
          <p>We do not sell personal data or use it for advertising. We only use cookies and browser storage needed to keep you signed in.</p>
        </Section>

        <Section title="Who processes it for us">
          <p>Our hosting, database and email sending providers process data on our behalf under contract, with appropriate safeguards for any transfer outside the UK.</p>
        </Section>

        <Section title="How long we keep it">
          <p>Account data is kept while the account is active and deleted when the account is removed. Contact enquiries are kept for up to 12 months. Operational data is kept for as long as your company's agreement requires.</p>
        </Section>

        <Section title="Security">
          <p>Data is encrypted in transit (HTTPS) and at rest. Each company's data is kept separate, access is role-based, administrators use two-step sign-in, and fixed readers use per-company keys.</p>
        </Section>

        <Section title="Your rights">
          <p>You can ask to access, correct, delete or export your personal data, or object to or restrict its use. Email us and we will respond within one month. You can also complain to the Information Commissioner's Office (ico.org.uk).</p>
        </Section>
      </div>
    </div>
  );
}
