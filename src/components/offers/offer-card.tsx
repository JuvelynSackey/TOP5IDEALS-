import Image from "next/image";
import Link from "next/link";
import { ArrowLeftRight, Clock, ShoppingBag, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { describeCash } from "@/lib/cash";
import { formatCedis } from "@/lib/money";
import { timeAgo, timeUntil } from "@/lib/format";
import { listingImageUrl } from "@/lib/storage";
import { offerActions, offerStatusLabel } from "@/lib/offers";
import { currentItems, currentTerms, displayName, type OfferRow } from "@/server/deals";

export function OfferCard({ offer, viewerId }: { offer: OfferRow; viewerId: string }) {
  const party = offer.initiator_id === viewerId ? "initiator" : offer.recipient_id === viewerId ? "recipient" : null;
  const terms = currentTerms(offer);
  const items = currentItems(offer);
  const actions = offerActions({ status: offer.status, awaitingParty: offer.awaiting_party, expiresAt: offer.expires_at, viewerParty: party });
  const other = party === "initiator" ? offer.recipient : offer.initiator;
  const names = { initiator: party === "initiator" ? "You" : displayName(offer.initiator), recipient: party === "recipient" ? "You" : displayName(offer.recipient) };
  const targetImage = offer.listing?.listing_images.find((i) => i.is_primary)?.storage_path;
  const label = offerStatusLabel(offer.status, offer.current_version, actions.expired);
  const tone = actions.myTurn ? "accent" : offer.status === "accepted" || offer.status === "completed" ? "success" : offer.status === "disputed" ? "warning" : offer.status === "pending" ? "info" : "neutral";

  return (
    <Link href={`/dashboard/offers/${offer.id}`} className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={tone}>{actions.myTurn ? "Your turn" : label}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            {offer.offer_type === "swap" ? <ArrowLeftRight className="size-3.5" aria-hidden="true" /> : <ShoppingBag className="size-3.5" aria-hidden="true" />}
            {offer.offer_type === "swap" ? "Swap" : "Purchase"} · {party === "initiator" ? "Sent" : "Received"} · {timeAgo(offer.created_at)}
          </span>
        </div>
        {offer.status === "pending" && !actions.expired ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Clock className="size-3.5" aria-hidden="true" /> {timeUntil(offer.expires_at)}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Thumb path={items[0]?.image_path ?? null} empty={offer.offer_type === "purchase"} />
        <ArrowLeftRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <Thumb path={targetImage ?? null} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {offer.offer_type === "swap" ? `${items.map((i) => i.title).join(" + ")} → ${offer.listing?.title ?? "listing"}` : offer.listing?.title ?? "Listing"}
          </p>
          <p className="text-sm text-muted">
            {offer.offer_type === "purchase" ? `${names.initiator === "You" ? "You offer" : `${names.initiator} offers`} ${formatCedis(terms.amountMinor)}` : describeCash(terms, party ?? "observer", names)}
          </p>
          <p className="text-xs text-muted">With {displayName(other)}</p>
        </div>
      </div>
    </Link>
  );
}

function Thumb({ path, empty }: { path: string | null; empty?: boolean }) {
  const url = listingImageUrl(path);
  return (
    <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
      {url ? <Image src={url} alt="" fill sizes="56px" className="object-cover" unoptimized /> : empty ? <span className="text-lg font-semibold text-muted">GH₵</span> : <Smartphone className="size-5 text-muted" aria-hidden="true" />}
    </span>
  );
}
