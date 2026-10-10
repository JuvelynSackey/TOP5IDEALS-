import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, BatteryMedium, MapPin, Repeat, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { CONDITION_LABEL, formatStorage, type ListingCondition } from "@/lib/catalog";
import { formatCedis } from "@/lib/money";
import { listingImageUrl } from "@/lib/storage";
import { listingPath } from "@/lib/slug";
import type { ListingCard as ListingCardData } from "@/server/queries";
import { cn } from "@/lib/utils";

export function ListingCard({ listing, priority = false, className }: { listing: ListingCardData; priority?: boolean; className?: string }) {
  if (!listing.id || !listing.slug || !listing.slug_key) return null;
  const image = listingImageUrl(listing.primary_image_path);
  const verified = listing.seller_verification === "verified" || listing.business_verification === "verified";
  const unavailable = listing.status !== "published";
  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong", className)}>
      <div className="relative aspect-[4/5] overflow-hidden bg-surface-2">
        {image ? (
          <Image
            src={image}
            alt={listing.title ?? "Phone photo"}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Smartphone className="size-10 text-muted" aria-hidden="true" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {listing.open_to_swap ? (
            <Badge tone="accent" className="bg-accent text-accent-foreground">
              <Repeat aria-hidden="true" /> Swap
            </Badge>
          ) : null}
          {unavailable ? <Badge className="bg-background/90">{listing.status === "reserved" ? "Reserved" : "Unavailable"}</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="tabular text-lg font-semibold leading-none">
          {formatCedis(listing.price_minor)}
          {listing.is_negotiable ? <span className="ml-1.5 align-middle text-xs font-normal text-muted">Negotiable</span> : null}
        </p>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">
          <Link href={listingPath(listing.slug, listing.slug_key)} className="after:absolute after:inset-0 focus-visible:outline-none">
            {listing.title}
          </Link>
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {listing.condition ? <span>{CONDITION_LABEL[listing.condition as ListingCondition]}</span> : null}
          {listing.storage_gb ? <span>· {formatStorage(listing.storage_gb)}</span> : null}
          {listing.battery_health_status === "reported" && listing.battery_health ? (
            <span className="inline-flex items-center gap-0.5">
              · <BatteryMedium className="size-3.5" aria-hidden="true" /> {listing.battery_health}%
            </span>
          ) : null}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{listing.city}</span>
          </span>
          {verified ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-accent">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Verified</span>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ListingGrid({ listings, priorityCount = 0 }: { listings: ListingCardData[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {listings.map((l, i) => (
        <li key={l.id} className="flex">
          <ListingCard listing={l} priority={i < priorityCount} className="w-full" />
        </li>
      ))}
    </ul>
  );
}

export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" aria-label="Loading phones">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="aspect-[4/5] animate-pulse bg-surface-2" />
          <div className="space-y-2 p-3">
            <div className="h-5 w-24 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
          </div>
        </li>
      ))}
    </ul>
  );
}
