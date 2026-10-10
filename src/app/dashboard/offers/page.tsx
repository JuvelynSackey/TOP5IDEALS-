import Link from "next/link";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, PageHeader } from "@/components/ui/display";
import { OfferCard } from "@/components/offers/offer-card";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { listMyOffers, type OfferRow } from "@/server/deals";
import { cn } from "@/lib/utils";

type Tab = { key: string; label: string; match: (o: OfferRow, uid: string) => boolean };

const isOpen = (o: OfferRow) => o.status === "pending" && new Date(o.expires_at) > new Date();

const TABS: Tab[] = [
  {
    key: "awaiting",
    label: "Needs reply",
    match: (o, uid) => isOpen(o) && ((o.awaiting_party === "recipient" && o.recipient_id === uid) || (o.awaiting_party === "initiator" && o.initiator_id === uid)),
  },
  { key: "received", label: "Received", match: (o, uid) => o.recipient_id === uid },
  { key: "sent", label: "Sent", match: (o, uid) => o.initiator_id === uid },
  { key: "countered", label: "Counteroffers", match: (o) => isOpen(o) && o.current_version > 1 },
  { key: "accepted", label: "Accepted", match: (o) => o.status === "accepted" },
  { key: "completed", label: "Completed", match: (o) => o.status === "completed" },
  { key: "reported", label: "Reported", match: (o) => o.status === "disputed" },
  { key: "closed", label: "Expired / closed", match: (o) => ["rejected", "cancelled", "expired"].includes(o.status) || (o.status === "pending" && !isOpen(o)) },
];

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer("/dashboard/offers");
  const { tab = "awaiting" } = await searchParams;
  const supabase = await createClient();
  await supabase.rpc("expire_due_offers");
  let offers: OfferRow[] = [];
  let failed = false;
  try {
    offers = await listMyOffers(viewer.id);
  } catch {
    failed = true;
  }
  const active = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const filtered = offers.filter((o) => active.match(o, viewer.id));

  return (
    <>
      <PageHeader title="Offers & swaps" description="Every proposal and counteroffer is kept in the offer's history." />
      <nav aria-label="Filter offers" className="scrollbar-none mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/offers?tab=${t.key}`}
            aria-current={t.key === active.key ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium",
              t.key === active.key ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground",
            )}
          >
            {t.label} <span className="tabular ml-1 text-xs opacity-70">{offers.filter((o) => t.match(o, viewer.id)).length}</span>
          </Link>
        ))}
      </nav>
      {failed ? <Alert tone="danger">We couldn&apos;t load your offers. Refresh to try again.</Alert> : null}
      {!failed && !filtered.length ? (
        <EmptyState
          icon={Repeat}
          title="No offers here"
          description={offers.length ? "Nothing matches this filter right now." : "Find a phone you like and make a purchase or swap offer."}
          action={
            <Button asChild variant="outline">
              <Link href="/swap">Explore swap deals</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((o) => (
            <li key={o.id}>
              <OfferCard offer={o} viewerId={viewer.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
