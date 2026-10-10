import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, MapPin, Phone, Smartphone } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Alert, Badge, EmptyState } from "@/components/ui/display";
import { ListingGrid } from "@/components/listings/listing-card";
import { Pagination } from "@/components/ui/pagination";
import { ReviewList } from "@/components/reviews/review-list";
import { ContactSellerButton } from "@/components/profiles/contact-seller-button";
import { TrustSummary } from "@/components/profiles/trust-summary";
import { SortSelect } from "@/components/listings/search-filters";
import { logoUrl } from "@/lib/storage";
import { formatGhanaPhone } from "@/lib/phone";
import { parseSearchParams } from "@/lib/validation/marketplace";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { getProfileTrust, getPublicReviews, searchListings } from "@/server/queries";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function loadShop(slug: string) {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_profiles")
    .select("*, regions(name), owner:profiles!business_profiles_owner_id_fkey(id, account_status, created_at)")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await loadShop((await params).slug);
  if (!shop) notFound();
  return {
    title: `${shop.business_name} — phones in ${shop.city ?? "Ghana"}`,
    description: shop.description?.slice(0, 160) ?? `Phones from ${shop.business_name} on Top5Ideals.`,
    alternates: { canonical: `/shop/${shop.slug}` },
    openGraph: { images: shop.logo_path ? [{ url: logoUrl(shop.logo_path)! }] : undefined },
  };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const shop = await loadShop((await params).slug);
  if (!shop || !shop.owner) notFound();
  const filters = parseSearchParams(await searchParams);
  const [viewer, trust, reviews, results] = await Promise.all([
    getViewer(),
    getProfileTrust(shop.owner_id),
    getPublicReviews(shop.owner_id, 6),
    searchListings(filters, { sellerId: shop.owner_id }),
  ]);
  const verified = shop.verification_status === "verified";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <section className="mb-8 flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-start sm:p-8">
        <Avatar src={logoUrl(shop.logo_path)} name={shop.business_name} size={88} className="rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold sm:text-3xl">
              {shop.business_name}
              {verified ? (
                <Badge tone="accent">
                  <BadgeCheck aria-hidden="true" /> Verified business
                </Badge>
              ) : null}
            </h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <MapPin className="size-4" aria-hidden="true" /> {[shop.area, shop.city, shop.regions?.name].filter(Boolean).join(", ") || "Ghana"}
            </p>
          </div>
          {shop.description ? <p className="max-w-2xl whitespace-pre-line text-sm text-foreground/85">{shop.description}</p> : null}
          <TrustSummary trust={trust} />
          <div className="flex flex-wrap gap-2">
            {viewer?.id !== shop.owner_id ? <ContactSellerButton userId={shop.owner_id} signedIn={Boolean(viewer)} label="Message shop" /> : null}
            {shop.public_phone ? (
              <a href={`tel:${shop.public_phone}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-border-strong px-4 text-sm font-medium hover:bg-surface-2">
                <Phone className="size-4" aria-hidden="true" /> {formatGhanaPhone(shop.public_phone)}
              </a>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            {verified
              ? "Verified means our team checked this business's registration documents. It doesn't certify individual phones — inspect before you pay."
              : "This business has not been verified yet."}
          </p>
        </div>
      </section>
      {shop.owner.account_status !== "active" ? <Alert tone="warning" className="mb-6">This shop is currently unavailable.</Alert> : null}

      <section aria-labelledby="shop-listings" className="mb-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="shop-listings" className="text-xl font-semibold">
            Phones for sale <span className="tabular text-base font-normal text-muted">({results.total})</span>
          </h2>
          <SortSelect />
        </div>
        {results.items.length ? (
          <>
            <ListingGrid listings={results.items} />
            <Pagination page={results.page} pageCount={results.pageCount} basePath={`/shop/${shop.slug}`} params={filters} />
          </>
        ) : (
          <EmptyState icon={Smartphone} title="No live listings" description="This shop has no phones listed right now." />
        )}
      </section>

      <section aria-labelledby="shop-reviews">
        <h2 id="shop-reviews" className="mb-4 text-xl font-semibold">
          Reviews
        </h2>
        {reviews.length ? (
          <ReviewList reviews={reviews.map((r) => ({ ...r, author: r.reviewer?.full_name || (r.reviewer?.username ? `@${r.reviewer.username}` : "Former member") }))} />
        ) : (
          <p className="text-sm text-muted">No reviews yet. Reviews come only from completed exchanges.</p>
        )}
      </section>
    </div>
  );
}
