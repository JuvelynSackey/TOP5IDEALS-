import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = {
  title: "Safety guide",
  description: "How to buy, sell and swap phones safely in Ghana: meeting in public, testing the phone, checking IMEI and avoiding advance-payment scams.",
  alternates: { canonical: "/safety" },
};

export default function SafetyPage() {
  return (
    <ProsePage
      title="Trade safely on Top5Ideals"
      intro="Top5Ideals connects buyers, sellers and swappers. We review listings and act on reports, but we do not hold money or inspect phones — so these habits matter on every deal."
    >
      <section>
        <h2>Meet safely</h2>
        <ul>
          <li>Meet in a busy, well-lit public place during the day — a shopping mall, bank lobby or a busy station.</li>
          <li>Bring a friend if you can, and tell someone where you are going.</li>
          <li>Never share your home address in a listing. Agree the meeting point in Top5Ideals messages so there is a record.</li>
        </ul>
      </section>
      <section>
        <h2>Test the phone before money or phones change hands</h2>
        <ul>
          <li>Dial *#06# and check the IMEI matches the box/receipt. Ask the seller about network blacklisting.</li>
          <li>Make sure iCloud (Find My) or Google accounts are signed out and the phone can be reset.</li>
          <li>Test calls, mobile data, Wi-Fi, cameras, speakers, microphone, charging, buttons and Face ID or fingerprint.</li>
          <li>On iPhones, check battery health under Settings → Battery. Many Android phones don&apos;t show it — that&apos;s normal.</li>
          <li>Compare the condition with the listing&apos;s photos, declared defects and accessories.</li>
        </ul>
      </section>
      <section>
        <h2>Avoid common scams</h2>
        <ul>
          <li>Never send a mobile money deposit or “holding fee” before seeing the phone.</li>
          <li>Be wary of prices far below market value, sellers who refuse to meet, or pressure to decide quickly.</li>
          <li>Don&apos;t share one-time codes, PINs or passwords with anyone.</li>
          <li>Keep conversations on Top5Ideals. Moving to another app removes your record.</li>
        </ul>
      </section>
      <section>
        <h2>How swaps protect you</h2>
        <ul>
          <li>Every swap offer states exactly who pays any cash difference and how much. Counteroffers are recorded as new versions — nothing is overwritten.</li>
          <li>Accepting an offer reserves both phones so neither can be sold to someone else meanwhile.</li>
          <li>An exchange completes only when <strong>both</strong> of you confirm. If the other person won&apos;t confirm, report a problem and our team reviews it.</li>
          <li>Confirming on Top5Ideals does not verify that money was paid. Only confirm once you actually have what was agreed.</li>
        </ul>
      </section>
      <section>
        <h2>What “verified” means</h2>
        <p>
          A verified badge means an administrator checked identity or business registration documents. It does not guarantee a seller&apos;s honesty or the authenticity or condition of
          any phone. Always inspect before you pay.
        </p>
      </section>
      <section>
        <h2>Report a problem</h2>
        <p>Use “Report” on any listing, user, message or exchange. Reports are private. If you are in danger or have been robbed, contact the Ghana Police Service first.</p>
      </section>
    </ProsePage>
  );
}
