import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service & Data Processing — ScanLoc8" },
      { name: "description", content: "The terms for using ScanLoc8, including the data processing terms that apply to customer companies under UK GDPR." },
      { property: "og:title", content: "Terms of Service & Data Processing — ScanLoc8" },
      { property: "og:description", content: "The terms for using ScanLoc8, including the data processing terms that apply to customer companies under UK GDPR." },
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

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <div>
          <Link to="/" className="text-sm text-primary hover:underline">← Back to ScanLoc8</Link>
          <h1 className="mt-4 font-heading text-3xl font-bold text-foreground">Terms of Service & Data Processing</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: 20 October 2026</p>
        </div>

        <Section title="The service">
          <p>ScanLoc8 is an RFID tag scanning, tracking and locating service, powered by Levata. These terms apply to every company and user with a ScanLoc8 account. By using the service you accept them.</p>
          <p>Contact: <a className="text-primary hover:underline" href="mailto:simon.barnsley@levata.com">simon.barnsley@levata.com</a></p>
        </Section>

        <Section title="Accounts and acceptable use">
          <ul className="list-disc space-y-1 pl-5">
            <li>Accounts are created for registered companies only. You are responsible for keeping sign-in details confidential and for everything done under your accounts.</li>
            <li>Admin accounts must use two-step sign-in. Passwords must meet the published minimum strength.</li>
            <li>You must not use the service unlawfully, attempt to access another company's data, or interfere with the service's operation.</li>
            <li>We may suspend access where we reasonably believe security or these terms are at risk.</li>
          </ul>
        </Section>

        <Section title="Your data">
          <p>Your company owns the operational data it puts into ScanLoc8 — items, tag numbers, locations, maps and scan history. You can export it at any time using the built-in export, and it is deleted in line with the retention settings below.</p>
          <p>We do not sell your data or use it for advertising. We use it only to provide and secure the service.</p>
        </Section>

        <Section title="Availability and liability">
          <p>We aim to keep ScanLoc8 available and reliable, but the service is provided "as is" and we do not guarantee uninterrupted operation. RFID reading depends on your hardware, network and environment, which are outside our control.</p>
          <p>Nothing in these terms limits liability that cannot be limited by law. Otherwise, to the extent permitted by law, we are not liable for indirect or consequential losses, and our total liability is limited to the fees paid for the service in the 12 months before the claim.</p>
        </Section>

        <h2 className="font-heading text-2xl font-bold text-foreground pt-4">Data Processing Terms (DPA)</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          These data processing terms form part of the agreement between ScanLoc8 (powered by Levata) as <strong>processor</strong> and each customer company as <strong>controller</strong>, under UK GDPR Article 28. They apply automatically to every customer company using the service.
        </p>

        <Section title="1. Subject matter and duration">
          <p>Processing of personal data contained in the operational data a customer company stores in ScanLoc8, for the duration of that company's use of the service.</p>
        </Section>

        <Section title="2. Nature and purpose of processing">
          <p>Hosting, storing, displaying and transmitting tag, item, location, user and alert data solely to provide the ScanLoc8 service, including sending alert emails the customer configures.</p>
        </Section>

        <Section title="3. Categories of data and data subjects">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Data subjects:</strong> the customer company's authorised users (employees or contractors given accounts).</li>
            <li><strong>Personal data:</strong> user names, work email addresses, roles, sign-in records and alert notifications. Operational RFID data (tag numbers, items, locations) is not normally personal data; if a customer links tags to people, the customer remains controller of that data.</li>
          </ul>
        </Section>

        <Section title="4. Our obligations as processor">
          <ul className="list-disc space-y-1 pl-5">
            <li>Process personal data only on the customer's documented instructions, including these terms and the customer's use of the service's features.</li>
            <li>Ensure people with access are bound by confidentiality.</li>
            <li>Apply appropriate technical and organisational measures: encrypted connections, access controls, per-company data separation, two-step sign-in for admins, and strong password rules.</li>
            <li>Assist the customer, where reasonably possible, with data subject requests (access, correction, deletion) using the service's built-in tools.</li>
            <li>Notify the customer without undue delay after becoming aware of a personal data breach affecting their data.</li>
            <li>On request at the end of the service, return or delete the customer's data.</li>
          </ul>
        </Section>

        <Section title="5. Sub-processors">
          <p>The customer authorises the use of the sub-processors needed to run the service, currently: Lovable Cloud (application hosting, database, authentication and file storage) and the email delivery provider used for account and alert emails. We will inform customers of any intended new sub-processor and give them the opportunity to object.</p>
        </Section>

        <Section title="6. International transfers">
          <p>Where data is processed outside the UK, we rely on an adequacy regulation or appropriate safeguards such as the UK International Data Transfer Agreement or standard contractual clauses.</p>
        </Section>

        <Section title="7. Retention and deletion">
          <ul className="list-disc space-y-1 pl-5">
            <li>Read alerts are automatically deleted after 90 days (adjustable per company).</li>
            <li>Scan history is automatically deleted after 365 days (adjustable per company).</li>
            <li>Contact enquiries are delivered by email and not stored in the service.</li>
            <li>Account data is kept while the account is active and deleted when the account or company is removed.</li>
          </ul>
        </Section>

        <Section title="8. Audits">
          <p>We will make available reasonable information necessary to demonstrate compliance with these terms and allow for audits subject to reasonable notice, confidentiality and cost arrangements.</p>
        </Section>

        <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          These terms are a starting template prepared for ScanLoc8 and are not legal advice. Have a solicitor review them before relying on them with customers.
        </p>
      </div>
    </div>
  );
}
