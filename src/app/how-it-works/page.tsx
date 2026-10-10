import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = {
  title: "How it works",
  description: "How buying, selling and swapping phones works on Top5Ideals — moderation, offers, counteroffers, reservations, confirmation and reviews.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <ProsePage title="How Top5Ideals works" intro="Buying, selling and swapping all follow the same transparent steps.">
      <section>
        <h2>Selling</h2>
        <ul>
          <li>List your phone in six guided steps: phone, condition, photos, price and swap preferences, location, preview.</li>
          <li>Our moderators review every new listing (and material edits) before it appears in search. You&apos;re notified either way.</li>
          <li>Pause, resume or archive your listing any time from your dashboard.</li>
        </ul>
      </section>
      <section id="buying">
        <h2>Buying</h2>
        <ul>
          <li>Search by brand, model, storage, condition, battery health, price and location.</li>
          <li>Message the seller or make a purchase offer. If the price is fixed, your offer must match it.</li>
          <li>When the seller accepts, the phone is reserved for you. Meet, inspect and pay in person — Top5Ideals does not process payments.</li>
        </ul>
      </section>
      <section id="swaps">
        <h2>Swapping</h2>
        <ul>
          <li>Open a phone marked “Open to swaps” and choose <em>Make swap offer</em>.</li>
          <li>Pick one to three of your own approved listings to offer. You can only offer phones you have listed — this stops people offering phones they don&apos;t own.</li>
          <li>Set the cash difference and explicitly choose who pays it: you, the other person, or nobody.</li>
          <li>The other person can accept, decline or counter. Each counteroffer is a new version; the full history stays visible to both of you.</li>
          <li>Offers expire after 72 hours without a response.</li>
        </ul>
      </section>
      <section>
        <h2>Completing an exchange</h2>
        <ul>
          <li>Acceptance reserves every phone in the deal and closes other open offers on them.</li>
          <li>Either side can cancel before anyone confirms. After one side confirms, disagreements go to our team as a dispute.</li>
          <li>The exchange completes when both sides confirm. Phones are then marked sold or swapped.</li>
          <li>Both of you can then leave a review — reviews are only possible for completed exchanges.</li>
        </ul>
      </section>
      <p>
        Ready? <Link href="/sell" className="text-accent hover:underline">List a phone</Link> or <Link href="/swap" className="text-accent hover:underline">browse swap deals</Link>.
      </p>
    </ProsePage>
  );
}
