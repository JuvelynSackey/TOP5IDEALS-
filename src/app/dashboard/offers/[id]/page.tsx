import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowDown, Clock, MessageCircle, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/display";
import { OfferResponder } from "@/components/offers/offer-responder";
import { PhoneTile } from "@/components/offers/phone-tile";
import { describeCash, type CashPayer } from "@/lib/cash";
import { formatCedis } from "@/lib/money";
import { formatDateTime, timeUntil } from "@/lib/format";
import { offerActions, offerStatusLabel } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { currentItems, currentTerms, displayName, getOffer, type Snapshot } from "@/server/deals";

const EVENT_LABEL: Record<string, string> = {
  created: "Offer made",
  countered: "Counteroffer",
  accepted: "Accepted",
  rejected: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  completed: "Exchange completed",
  disputed: "Problem reported",
  dispute_resolved: "Dispute resolved",
};

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("/dashboard/offers");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  await supabase.rpc("expire_due_offers");
  const offer = await getOffer(id.data);
  if (!offer) notFound();

  const party = offer.initiator_id === viewer.id ? "initiator" : offer.recipient_id === viewer.id ? "recipient" : null;
  const actions = offerActions({ status: offer.status, awaitingParty: offer.awaiting_party, expiresAt: offer.expires_at, viewerParty: party });
  const terms = currentTerms(offer);
  const items = currentItems(offer);
  const names = {
    initiator: party === "initiator" ? "You" : displayName(offer.initiator),
    recipient: party === "recipient" ? "You" : displayName(offer.recipient),
  };
  const nameOf = (actorId: string | null) => (actorId === null ? "Top5Ideals" : actorId === viewer.id ? "You" : actorId === offer.initiator_id ? displayName(offer.initiator) : actorId === offer.recipient_id ? displayName(offer.recipient) : "Top5Ideals team");
  const target: Snapshot | null = offer.listing
    ? {
        id: offer.listing.id,
        title: offer.listing.title,
        slug: offer.listing.slug,
        slug_key: offer.listing.slug_key,
        price_minor: offer.listing.price_minor,
        image_path: offer.listing.listing_images.find((i) => i.is_primary)?.storage_path ?? null,
      }
    : null;
  const tx = offer.transactions;
  const events = [...offer.swap_offer_events].sort((a, b) => a.id - b.id);
  const summary = offer.offer_type === "purchase" ? `${names.initiator === "You" ? "You pay" : `${names.initiator} pays`} ${names.recipient === "You" ? "you" : names.recipient} ${formatCedis(terms.amountMinor)}` : describeCash(terms, party ?? "observer", names);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            <Link href="/dashboard/offers" className="hover:text-foreground">
              Offers
            </Link>{" "}
            / {offer.offer_type === "swap" ? "Swap offer" : "Purchase offer"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{offer.listing?.title ?? "Offer"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={actions.myTurn ? "accent" : "neutral"}>{actions.myTurn ? "Your turn to respond" : offerStatusLabel(offer.status, offer.current_version, actions.expired)}</Badge>
            {offer.status === "pending" && !actions.expired ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Clock className="size-3.5" aria-hidden="true" /> Expires {formatDateTime(offer.expires_at)} ({timeUntil(offer.expires_at)})
              </span>
            ) : null}
          </div>
        </div>
        {offer.conversation_id ? (
          <Button asChild variant="outline">
            <Link href={`/dashboard/messages/${offer.conversation_id}`}>
              <MessageCircle aria-hidden="true" /> Message {party === "initiator" ? names.recipient : names.initiator}
            </Link>
          </Button>
        ) : null}
      </div>

      {actions.waitingOnOther ? <Alert tone="info">Waiting for {party === "initiator" ? names.recipient : names.initiator} to respond to the latest terms.</Alert> : null}
      {actions.expired || offer.status === "expired" ? <Alert tone="warning">This offer expired before anyone responded. You can start a new offer from the listing.</Alert> : null}
      {tx ? (
        <Alert
          tone={tx.status === "completed" ? "success" : tx.status === "disputed" ? "warning" : "info"}
          title={tx.status === "completed" ? "Exchange completed" : tx.status === "disputed" ? "A problem was reported" : tx.status === "cancelled" ? "Exchange cancelled" : "Offer accepted — arrange the exchange"}
          action={
            <Button asChild size="sm">
              <Link href={`/dashboard/transactions/${tx.id}`}>Open exchange</Link>
            </Button>
          }
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Current terms (version {offer.current_version})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {offer.offer_type === "swap" ? (
            <>
              <div className="space-y-2">
                {items.map((it) => (
                  <PhoneTile key={it.id} snapshot={it} caption={`${names.initiator} give${names.initiator === "You" ? "" : "s"}`} />
                ))}
              </div>
              <ArrowDown className="mx-auto size-4 text-muted" aria-hidden="true" />
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <ShoppingBag className="size-5 text-accent" aria-hidden="true" />
              <span className="text-sm">Cash purchase · paid in person after inspection</span>
            </div>
          )}
          {target ? <PhoneTile snapshot={target} caption={`${names.recipient} give${names.recipient === "You" ? "" : "s"}`} /> : <Alert tone="warning">The listing is no longer visible.</Alert>}
          <div className="rounded-xl border border-accent bg-accent-soft p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Cash</p>
            <p className="mt-0.5 font-semibold">{summary}</p>
          </div>
          {party && offer.status === "pending" ? (
            <div className="pt-2">
              <OfferResponder
                offerId={offer.id}
                offerType={offer.offer_type}
                version={offer.current_version}
                party={party}
                canAccept={actions.canAccept}
                canCounter={actions.canCounter}
                canReject={actions.canReject}
                canCancel={actions.canCancel}
                terms={terms}
                names={names}
                listingPriceMinor={offer.listing?.price_minor ?? null}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Negotiation history</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative space-y-5 border-l border-border pl-5">
            {events.map((e) => {
              const proposal = e.event_type === "created" || e.event_type === "countered";
              const metadata = (e.metadata ?? {}) as { reason?: string };
              return (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[26px] top-1 size-3 rounded-full border-2 border-background bg-accent" aria-hidden="true" />
                  <p className="text-sm font-medium">
                    {EVENT_LABEL[e.event_type] ?? e.event_type}
                    {proposal ? <span className="font-normal text-muted"> · v{e.version}</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {nameOf(e.actor_id)} · {formatDateTime(e.created_at)}
                  </p>
                  {proposal ? (
                    <p className="mt-1 text-sm">
                      {offer.offer_type === "purchase"
                        ? `Price: ${formatCedis(Number(e.cash_amount_minor))}`
                        : describeCash({ amountMinor: Number(e.cash_amount_minor ?? 0), payer: (e.cash_payer ?? "none") as CashPayer }, party ?? "observer", names)}
                    </p>
                  ) : null}
                  {metadata.reason === "listing_unavailable" ? <p className="mt-1 text-sm text-muted">Closed automatically because a phone in this deal became unavailable.</p> : null}
                  {metadata.reason === "account_suspended" ? <p className="mt-1 text-sm text-muted">Closed because an account was suspended.</p> : null}
                  {e.message ? <p className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">“{e.message}”</p> : null}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
