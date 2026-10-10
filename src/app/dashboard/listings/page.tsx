import Image from "next/image";
import Link from "next/link";
import { ListOrdered, Plus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { ListingRowActions } from "@/components/dashboard/listing-row-actions";
import { DISPLAY_STATE_LABEL, listingDisplayState, type ListingDisplayState } from "@/lib/listing-state";
import { formatCedis } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { listingImageUrl } from "@/lib/storage";
import { listingPath } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { cn } from "@/lib/utils";

const TABS: { key: string; label: string; states: ListingDisplayState[] | null }[] = [
  { key: "all", label: "All", states: null },
  { key: "live", label: "Live", states: ["live"] },
  { key: "review", label: "In review", states: ["in_review", "rejected"] },
  { key: "drafts", label: "Drafts", states: ["draft"] },
  { key: "paused", label: "Paused", states: ["paused"] },
  { key: "deals", label: "Reserved / done", states: ["reserved", "sold", "swapped"] },
  { key: "archived", label: "Archived", states: ["archived"] },
];

const TONE: Record<ListingDisplayState, "neutral" | "accent" | "success" | "warning" | "danger" | "info"> = {
  draft: "neutral",
  in_review: "info",
  rejected: "danger",
  live: "success",
  paused: "warning",
  reserved: "accent",
  sold: "neutral",
  swapped: "neutral",
  archived: "neutral",
};

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer("/dashboard/listings");
  const { tab = "all" } = await searchParams;
  const supabase = await createClient();
  const { data: listings, error } = await supabase
    .from("listings")
    .select("id, title, slug, slug_key, price_minor, status, moderation_status, updated_at, published_at, listing_images(storage_path, is_primary), listing_moderation_events(decision, reason, created_at)")
    .eq("seller_id", viewer.id)
    .order("updated_at", { ascending: false })
    .limit(200);

  const active = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const rows = (listings ?? []).map((l) => ({ ...l, display: listingDisplayState(l.status, l.moderation_status) }));
  const filtered = active.states ? rows.filter((r) => active.states!.includes(r.display)) : rows;

  return (
    <>
      <PageHeader
        title="My listings"
        actions={
          <Button asChild>
            <Link href="/sell">
              <Plus aria-hidden="true" /> New listing
            </Link>
          </Button>
        }
      />
      <nav aria-label="Filter listings" className="scrollbar-none mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const count = t.states ? rows.filter((r) => t.states!.includes(r.display)).length : rows.length;
          return (
            <Link
              key={t.key}
              href={`/dashboard/listings?tab=${t.key}`}
              aria-current={t.key === active.key ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium",
                t.key === active.key ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground",
              )}
            >
              {t.label} <span className="tabular ml-1 text-xs opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      {error ? <Alert tone="danger">We couldn&apos;t load your listings. Refresh to try again.</Alert> : null}
      {!error && !filtered.length ? (
        <EmptyState
          icon={ListOrdered}
          title={rows.length ? "Nothing here" : "You haven't listed a phone yet"}
          description={rows.length ? "No listings match this filter." : "List your phone in a few steps and choose whether to sell, swap or both."}
          action={
            <Button asChild>
              <Link href="/sell">List a phone</Link>
            </Button>
          }
        />
      ) : null}

      <ul className="space-y-3">
        {filtered.map((l) => {
          const cover = l.listing_images.find((i) => i.is_primary) ?? l.listing_images[0];
          const rejection = l.display === "rejected" ? [...l.listing_moderation_events].filter((e) => e.decision === "rejected").sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : undefined;
          const publicHref = ["live", "paused", "reserved", "sold", "swapped"].includes(l.display) ? listingPath(l.slug, l.slug_key) : null;
          return (
            <li key={l.id} className="rounded-xl border border-border bg-surface p-3 sm:p-4">
              <div className="flex gap-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {cover ? (
                    <Image src={listingImageUrl(cover.storage_path)!} alt="" fill sizes="80px" className="object-cover" />
                  ) : (
                    <Smartphone className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[l.display]}>{DISPLAY_STATE_LABEL[l.display]}</Badge>
                    <span className="text-xs text-muted">Updated {formatDate(l.updated_at)}</span>
                  </div>
                  <h2 className="mt-1 truncate font-medium">
                    {publicHref ? (
                      <Link href={publicHref} className="hover:underline">
                        {l.title || "Untitled draft"}
                      </Link>
                    ) : (
                      l.title || "Untitled draft"
                    )}
                  </h2>
                  <p className="tabular text-sm text-muted">{formatCedis(l.price_minor)}</p>
                </div>
              </div>
              {rejection?.reason ? (
                <Alert tone="danger" className="mt-3" title="Moderator feedback">
                  {rejection.reason}
                </Alert>
              ) : null}
              {l.display === "in_review" ? <p className="mt-2 text-xs text-muted">Not public yet — our team is reviewing it.</p> : null}
              <div className="mt-3">
                <ListingRowActions id={l.id} status={l.status} moderation={l.moderation_status} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
