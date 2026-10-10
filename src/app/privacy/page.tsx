import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";
import { Alert } from "@/components/ui/display";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy notice" intro="What we collect, who can see it, and why.">
      <Alert tone="warning">This MVP summary describes how the software behaves. It must be reviewed against Ghana&apos;s Data Protection Act, 2012 (Act 843) before public launch.</Alert>
      <section>
        <h2>Public information</h2>
        <ul>
          <li>Your name, username, profile photo, city/region, bio, verification status, reviews and approved listings.</li>
          <li>Business storefront details, including a public phone number only if the business adds one.</li>
        </ul>
      </section>
      <section>
        <h2>Private information</h2>
        <ul>
          <li>Your email address and phone number are never shown publicly. Administrators can see email addresses for account support.</li>
          <li>Messages are visible only to the people in the conversation. Staff see a message only if it is reported to them.</li>
          <li>Verification documents are stored privately and viewed only by administrators through short-lived links.</li>
          <li>Photos are resized in your browser before upload, which removes embedded location data.</li>
        </ul>
      </section>
      <section>
        <h2>Analytics</h2>
        <p>
          We count listing views to show sellers how their listings perform. Anonymous visitors receive a random cookie identifier so a view is counted once per day; it is not linked to
          your identity.
        </p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>We use essential cookies for sign-in sessions, a view-counting identifier and your theme preference. We do not use advertising cookies.</p>
      </section>
    </ProsePage>
  );
}
