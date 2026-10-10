import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";
import { Alert } from "@/components/ui/display";

export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of use" intro="The rules for using Top5Ideals.">
      <Alert tone="warning">This is a plain-language summary prepared for the MVP. It has not been reviewed by a lawyer and must be replaced with reviewed terms before public launch.</Alert>
      <section>
        <h2>Our role</h2>
        <p>
          Top5Ideals is a listing and negotiation platform. Sales and swaps are agreements between users. We do not own, inspect, hold or deliver phones, and we do not process or hold
          payments.
        </p>
      </section>
      <section>
        <h2>Your responsibilities</h2>
        <ul>
          <li>List only phones you own and have the right to sell or swap. Do not list stolen, counterfeit or blacklisted devices.</li>
          <li>Describe condition, defects and accessories honestly, using your own photos.</li>
          <li>Respect other users. Harassment, spam and fraud lead to suspension.</li>
          <li>Confirm an exchange only when you have received what was agreed.</li>
        </ul>
      </section>
      <section>
        <h2>Moderation</h2>
        <p>We review listings before publication and may reject or remove listings, hide reviews, and suspend accounts that break these rules. Decisions are logged.</p>
      </section>
      <section>
        <h2>Reviews</h2>
        <p>Reviews may only be left after a completed exchange and must describe that exchange. Reviewers can edit their review for 14 days.</p>
      </section>
    </ProsePage>
  );
}
