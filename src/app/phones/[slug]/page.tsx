import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BadgeCheck, BatteryMedium, Calendar, Check, CircleHelp, MapPin, Repeat, ShieldAlert, Star, Store, X } from "lucide-react";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Avatar } from "@/components/ui/avatar";
import { Gallery } from "@/components/listings/gallery";
import { ListingActions, type OfferableItem } from "@/components/listings/listing-actions";
import { ViewRecorder } from "@/components/listings/view-recorder";
import {
  ACCESSORY_LABEL,
  CONDITION_LABEL,
  DEVICE_CHECKS,
  NETWORK_LOCK_LABEL,
  formatStorage,
  type DeviceCheckValue,
} from "@/lib/catalog";
import { DISPLAY_STATE_LABEL, isOfferable, isPubliclyVisible, listingDisplayState } from "@/lib/listing-state";
import { formatCedis } from "@/lib/money";
import { avatarUrl, listingImageUrl, logoUrl } from "@/lib/storage";
import { listingPath, parseListingParam } from "@/lib/slug";
import { formatDate } from "@/lib/format";
import { getSiteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { getListingByKey, getProfileTrust } from "@/server/queries";

type Params = { params: Promise<{ slug: string }> };

async function load(slugParam: string) {
  const parsed = parseListingParam(slugParam);
  if (!parsed) return null;
  const data = await getListingByKey(parsed.key);
  if (!data) return null;
  return { ...data, requestedSlug: parsed.slug };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const data = await load((await params).slug);
  // notFound() here (before streaming starts) produces a real 404 status.
  if (!data) notFound();
  const { listing } = data;
  const isPublic = isPubliclyVisible(listing.status, listing.moderation_status);
  const image = listingImageUrl(listing.listing_images[0]?.storage_path);
  const description = `${formatCedis(listing.price_minor)} · ${CONDITION_LABEL[listing.condition!] ?? ""} · ${listing.city ?? ""}${listing.open_to_swap ? " · Open to swaps" : ""}. ${listing.description.slice(0, 120)}`;
  return {
    title: listing.title,
    description,
    alternates: { canonical: listingPath(listing.slug, listing.slug_key) },
    robots: isPublic && listing.status === "published" ? undefined : { index: false },
    openGraph: { title: `${listing.title} — ${formatCedis(listing.price_minor)}`, description, images: image ? [{ url: image }] : undefined, type: "website" },
  };
}

export default async function ListingPage({ params }: Params) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const { listing, seller, business } = data;
  if (data.requestedSlug !== listing.slug) permanentRedirect(listingPath(listing.slug, listing.slug_key));

  const viewer = await getViewer();
  const isOwner = viewer?.id === listing.seller_id;
  const state = listingDisplayState(listing.status, listing.moderation_status);
  const offerable = isOfferable(listing.status, listing.moderation_status);
  const isPublic = isPubliclyVisible(listing.status, listing.moderation_status);
  const supabase = await createClient();

  const [trust, saved, mine] = await Promise.all([
    getProfileTrust(listing.seller_id),
    viewer && !isOwner
      ? supabase.from("favorites").select("listing_id").eq("user_id", viewer.id).eq("listing_id", listing.id).maybeSingle()
      : Promise.resolve({ data: null }),
    viewer && !isOwner && listing.open_to_swap && offerable
      ? supabase
          .from("listing_cards")
          .select("id, title, price_minor, primary_image_path")
          .eq("seller_id", viewer.id)
          .eq("status", "published")
          .eq("moderation_status", "approved")
          .limit(20)
      : Promise.resolve({ data: [] as { id: string | null; title: string | null; price_minor: number | null; primary_image_path: string | null }[] }),
  ]);

  const myListings: OfferableItem[] = (mine.data ?? [])
    .filter((l) => l.id && l.id !== listing.id)
    .map((l) => ({ id: l.id!, title: l.title ?? "Phone", priceMinor: l.price_minor, imageUrl: listingImageUrl(l.primary_image_path) }));
  const images = listing.listing_images.map((img) => ({ id: img.id, url: listingImageUrl(img.storage_path)! })).filter((i) => i.url);
  const sellerName = business?.business_name ?? seller?.full_name ?? seller?.username ?? "the seller";
  const verified = seller?.verification_status === "verified" || business?.verification_status === "verified";
  const modelName = listing.phone_models?.name ?? listing.custom_model ?? "";
  const checks = (listing.device_checks ?? {}) as Partial<Record<string, DeviceCheckValue>>;

  const jsonLd =
    isPublic && listing.price_minor
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: listing.title,
          brand: { "@type": "Brand", name: listing.brands?.name },
          model: modelName,
          image: images.map((i) => `${getSiteUrl()}${i.url}`),
          description: listing.description || undefined,
          offers: {
            "@type": "Offer",
            price: (listing.price_minor / 100).toFixed(2),
            priceCurrency: "GHS",
            url: `${getSiteUrl()}${listingPath(listing.slug, listing.slug_key)}`,
            availability: listing.status === "published" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
            itemCondition:
              listing.condition === "new"
                ? "https://schema.org/NewCondition"
                : listing.condition === "refurbished"
                  ? "https://schema.org/RefurbishedCondition"
                  : "https://schema.org/UsedCondition",
          },
        }
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:py-10 lg:pb-10">
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /> : null}
      {isPublic ? <ViewRecorder listingId={listing.id} /> : null}

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/buy" className="hover:text-foreground">
          Phones
        </Link>
        {" / "}
        {listing.brands ? (
          <Link href={`/buy?brand=${listing.brands.slug}`} className="hover:text-foreground">
            {listing.brands.name}
          </Link>
        ) : null}
      </nav>

      <StatusBanner state={state} isOwner={isOwner} isPublic={isPublic} />

      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0 space-y-8">
          <Gallery images={images} title={listing.title} unoptimized={!isPublic} />

          <section aria-labelledby="specs-heading">
            <h2 id="specs-heading" className="mb-3 text-lg font-semibold">
              Specifications
            </h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm sm:grid-cols-3">
              {[
                ["Brand", listing.brands?.name],
                ["Model", modelName],
                ["Variant", listing.variant],
                ["Storage", formatStorage(listing.storage_gb)],
                ["RAM", listing.ram_gb ? `${listing.ram_gb}GB` : null],
                ["Colour", listing.color],
                ["Condition", listing.condition ? CONDITION_LABEL[listing.condition] : null],
                [
                  "Battery health",
                  listing.battery_health_status === "reported"
                    ? `${listing.battery_health}% (seller-reported)`
                    : listing.battery_health_status === "not_applicable"
                      ? "Not applicable"
                      : "Not reported",
                ],
                ["Network", NETWORK_LOCK_LABEL[listing.network_lock]],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface p-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 font-medium">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>

          {listing.description ? (
            <section aria-labelledby="desc-heading">
              <h2 id="desc-heading" className="mb-2 text-lg font-semibold">
                Description
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{listing.description}</p>
            </section>
          ) : null}

          <section aria-labelledby="checks-heading" className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 id="checks-heading" className="mb-1 text-lg font-semibold">
                Device checks
              </h2>
              <p className="mb-3 text-xs text-muted">Reported by the seller — verify each one in person.</p>
              <ul className="space-y-1.5 text-sm">
                {DEVICE_CHECKS.map((c) => {
                  const v = checks[c.key] ?? "not_tested";
                  return (
                    <li key={c.key} className="flex items-center justify-between gap-2">
                      <span>{c.label}</span>
                      {v === "working" ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <Check className="size-4" aria-hidden="true" /> Working
                        </span>
                      ) : v === "faulty" ? (
                        <span className="inline-flex items-center gap-1 text-danger">
                          <X className="size-4" aria-hidden="true" /> Faulty
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted">
                          <CircleHelp className="size-4" aria-hidden="true" /> Not tested
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="space-y-5">
              <div>
                <h3 className="mb-2 font-semibold">In the box</h3>
                {listing.accessories.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {listing.accessories.map((a) => (
                      <li key={a}>
                        <Badge>{ACCESSORY_LABEL[a] ?? a}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Phone only — no accessories listed.</p>
                )}
              </div>
              <div>
                <h3 className="mb-1 font-semibold">Known defects</h3>
                <p className="text-sm text-muted">{listing.defects || "None declared by the seller."}</p>
              </div>
              {listing.warranty_details ? (
                <div>
                  <h3 className="mb-1 font-semibold">Warranty</h3>
                  <p className="text-sm text-muted">{listing.warranty_details}</p>
                </div>
              ) : null}
            </div>
          </section>

          {listing.open_to_swap ? (
            <section aria-labelledby="swap-heading" className="rounded-xl border border-accent/40 bg-accent-soft p-4">
              <h2 id="swap-heading" className="flex items-center gap-2 font-semibold">
                <Repeat className="size-4 text-accent" aria-hidden="true" /> Open to swaps
              </h2>
              <div className="mt-2 space-y-1 text-sm">
                {listing.listing_swap_brands.length ? (
                  <p>Prefers: {listing.listing_swap_brands.map((b) => b.brands?.name).filter(Boolean).join(", ")}</p>
                ) : null}
                {listing.swap_max_cash_minor ? <p>Cash difference up to about {formatCedis(listing.swap_max_cash_minor)} considered.</p> : null}
                {listing.swap_notes ? <p className="text-foreground/85">{listing.swap_notes}</p> : null}
                {!listing.listing_swap_brands.length && !listing.swap_notes && !listing.swap_max_cash_minor ? <p>The seller will consider any reasonable swap offer.</p> : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <div>
            <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{listing.title}</h1>
            <p className="tabular mt-3 text-3xl font-bold">{formatCedis(listing.price_minor)}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {listing.condition ? <Badge>{CONDITION_LABEL[listing.condition]}</Badge> : null}
              {listing.is_negotiable ? <Badge tone="info">Negotiable</Badge> : <Badge>Fixed price</Badge>}
              {listing.open_to_swap ? (
                <Badge tone="accent">
                  <Repeat aria-hidden="true" /> Swap OK
                </Badge>
              ) : null}
              {!listing.available_for_sale ? <Badge tone="warning">Swap only</Badge> : null}
              {listing.battery_health_status === "reported" ? (
                <Badge>
                  <BatteryMedium aria-hidden="true" /> {listing.battery_health}%
                </Badge>
              ) : null}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-4" aria-hidden="true" /> {[listing.area, listing.city, listing.regions?.name].filter(Boolean).join(", ")}
            </p>
            {listing.published_at ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <Calendar className="size-4" aria-hidden="true" /> Listed {formatDate(listing.published_at)}
              </p>
            ) : null}
          </div>

          <ListingActions
            listing={{
              id: listing.id,
              title: listing.title,
              priceMinor: listing.price_minor ?? 0,
              isNegotiable: listing.is_negotiable,
              availableForSale: listing.available_for_sale,
              openToSwap: listing.open_to_swap,
              offerable: offerable && !isOwner,
              sellerName,
            }}
            viewer={{ signedIn: Boolean(viewer), isOwner, profileComplete: Boolean(viewer?.profileComplete) }}
            initialSaved={Boolean(saved.data)}
            myListings={myListings}
          />

          {seller ? (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                {business ? (
                  <Avatar src={logoUrl(business.logo_path)} name={business.business_name} size={48} className="rounded-lg" />
                ) : (
                  <Avatar src={avatarUrl(seller.avatar_path)} name={seller.full_name || seller.username} size={48} />
                )}
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-semibold">
                    <span className="truncate">{sellerName}</span>
                    {verified ? <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Verified" /> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {business ? "Phone business" : "Individual seller"} · Member since {formatDate(seller.created_at)}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Rating</dt>
                  <dd className="flex items-center gap-1 font-medium">
                    {trust && Number(trust.review_count) > 0 ? (
                      <>
                        <Star className="size-4 fill-current text-warning" aria-hidden="true" /> {Number(trust.average_overall).toFixed(1)}{" "}
                        <span className="font-normal text-muted">({trust.review_count})</span>
                      </>
                    ) : (
                      <span className="font-normal text-muted">No reviews yet</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Completed deals</dt>
                  <dd className="tabular font-medium">{trust ? Number(trust.completed_transactions) : 0}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">
                {verified
                  ? "Verified means our team checked this seller's identity or business documents. It is not a guarantee of any phone's condition."
                  : "This seller has not been verified. Inspect the phone carefully and meet in a public place."}
              </p>
              <div className="mt-3 flex gap-3 text-sm">
                {business ? (
                  <Link href={`/shop/${business.slug}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                    <Store className="size-4" aria-hidden="true" /> Visit storefront
                  </Link>
                ) : seller.username ? (
                  <Link href={`/u/${seller.username}`} className="text-accent hover:underline">
                    View profile & reviews
                  </Link>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Alert tone="warning" title="Stay safe">
            Meet in a public place, test the phone and check its IMEI before paying. Never send money in advance.{" "}
            <Link href="/safety" className="font-medium underline">
              Safety guide
            </Link>
          </Alert>
        </aside>
      </div>
    </div>
  );
}

function StatusBanner({ state, isOwner, isPublic }: { state: ReturnType<typeof listingDisplayState>; isOwner: boolean; isPublic: boolean }) {
  if (state === "live") return null;
  if (!isPublic) {
    return (
      <Alert tone="info" className="mb-6" title={`${DISPLAY_STATE_LABEL[state]} — only you${isOwner ? "" : " and staff"} can see this page`}>
        {state === "in_review"
          ? "Our team is reviewing this listing. It will appear in search once approved."
          : state === "rejected"
            ? "This listing needs changes before it can go live. See the reason in your dashboard."
            : "This listing is not public."}
      </Alert>
    );
  }
  const text: Partial<Record<typeof state, string>> = {
    paused: "The seller has paused this listing. It can't receive offers right now.",
    reserved: "This phone is reserved — an offer has been accepted and the exchange is in progress.",
    sold: "This phone has been sold.",
    swapped: "This phone has been swapped.",
  };
  return (
    <Alert tone="warning" className="mb-6" title={`${DISPLAY_STATE_LABEL[state]}`}>
      <span className="inline-flex items-center gap-1.5">
        <ShieldAlert className="size-4" aria-hidden="true" /> {text[state] ?? "This listing is not available."}
      </span>
    </Alert>
  );
}
