import Image from "next/image";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { ModerateButtons } from "@/components/admin/admin-buttons";
import { CONDITION_LABEL, formatStorage } from "@/lib/catalog";
import { formatCedis } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { listingImageUrl } from "@/lib/storage";
import { listingPath } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "pending", label: "Awaiting review" },
  { key: "rejected", label: "Rejected" },
  { key: "live", label: "Live" },
];

export default async function AdminListingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "pending" } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("listings")
    .select(
      "id, title, slug, slug_key, description, defects, condition, storage_gb, price_minor, battery_health, battery_health_status, open_to_swap, city, status, moderation_status, updated_at, seller:profiles!listings_seller_id_fkey(username, full_name, verification_status, created_at), listing_images(storage_path, position)",
    )
    .limit(50);
  if (tab === "rejected") query = query.eq("moderation_status", "rejected").in("status", ["published", "paused"]).order("updated_at", { ascending: false });
  else if (tab === "live") query = query.eq("moderation_status", "approved").eq("status", "published").order("published_at", { ascending: false });
  else query = query.eq("moderation_status", "pending_review").in("status", ["published", "paused"]).order("updated_at", { ascending: true });
  const { data, error } = await query;

  return (
    <>
      <PageHeader title="Listing moderation" description="Oldest submissions first. Only approved listings appear publicly — including on direct URLs." />
      <nav className="mb-4 flex gap-1" aria-label="Moderation queues">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/listings?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined} className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", t.key === tab ? "border-accent bg-accent-soft text-accent" : "border-border text-muted")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {error ? <Alert tone="danger">Could not load listings.</Alert> : null}
      {!error && !data?.length ? <EmptyState icon={CheckCircle2} title="Queue is clear" /> : null}
      <ul className="space-y-4">
        {(data ?? []).map((l) => (
          <li key={l.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{l.title}</h2>
                <p className="tabular text-sm text-muted">
                  {formatCedis(l.price_minor)} · {l.condition ? CONDITION_LABEL[l.condition] : "—"} · {formatStorage(l.storage_gb) || "—"} · {l.city}
                  {l.battery_health_status === "reported" ? ` · battery ${l.battery_health}%` : ""}
                  {l.open_to_swap ? " · swap" : ""}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Seller {l.seller?.full_name} (@{l.seller?.username}) · {l.seller?.verification_status} · updated {formatDateTime(l.updated_at)}
                </p>
              </div>
              <Badge tone={l.moderation_status === "pending_review" ? "info" : l.moderation_status === "rejected" ? "danger" : "success"}>{l.moderation_status.replace("_", " ")}</Badge>
            </div>
            <ul className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
              {[...l.listing_images].sort((a, b) => a.position - b.position).map((img) => (
                <li key={img.storage_path} className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  <a href={listingImageUrl(img.storage_path)!} target="_blank" rel="noreferrer">
                    <Image src={listingImageUrl(img.storage_path)!} alt="Listing photo" fill sizes="96px" className="object-cover" unoptimized />
                  </a>
                </li>
              ))}
            </ul>
            {l.description ? <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm">{l.description}</p> : null}
            {l.defects ? <p className="mt-2 text-sm text-warning">Defects: {l.defects}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ModerateButtons listingId={l.id} canApprove={l.moderation_status !== "approved"} />
              <Link href={listingPath(l.slug, l.slug_key)} className="text-sm text-accent hover:underline">
                Open listing page
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
