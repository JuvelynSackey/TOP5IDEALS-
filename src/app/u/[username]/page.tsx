import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, MapPin, Smartphone } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, EmptyState } from "@/components/ui/display";
import { ListingGrid } from "@/components/listings/listing-card";
import { ReviewList } from "@/components/reviews/review-list";
import { ContactSellerButton } from "@/components/profiles/contact-seller-button";
import { TrustSummary } from "@/components/profiles/trust-summary";
import { avatarUrl } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { getProfileTrust, getPublicReviews, searchListings } from "@/server/queries";

type Props = { params: Promise<{ username: string }> };

async function loadProfile(username: string) {
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_path, bio, city, created_at, verification_status, account_status, regions(name), business_profiles(slug)")
    .eq("username", username)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await loadProfile((await params).username);
  if (!p) notFound();
  return { title: `${p.full_name || p.username} on Top5Ideals`, alternates: { canonical: `/u/${p.username}` } };
}

export default async function PublicProfilePage({ params }: Props) {
  const profile = await loadProfile((await params).username);
  if (!profile) notFound();
  if (profile.business_profiles?.slug) redirect(`/shop/${profile.business_profiles.slug}`);
  const [viewer, trust, reviews, listings] = await Promise.all([
    getViewer(),
    getProfileTrust(profile.id),
    getPublicReviews(profile.id, 10),
    searchListings({ sort: "newest" }, { sellerId: profile.id, limit: 12 }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <section className="mb-8 flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:p-8">
        <Avatar src={avatarUrl(profile.avatar_path)} name={profile.full_name || profile.username} size={88} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              {profile.full_name || profile.username}
              {profile.verification_status === "verified" ? (
                <Badge tone="accent">
                  <BadgeCheck aria-hidden="true" /> Verified
                </Badge>
              ) : null}
            </h1>
            <p className="text-sm text-muted">
              @{profile.username} · Member since {formatDate(profile.created_at)}
            </p>
            {profile.city ? (
              <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-4" aria-hidden="true" /> {[profile.city, profile.regions?.name].filter(Boolean).join(", ")}
              </p>
            ) : null}
          </div>
          {profile.bio ? <p className="max-w-2xl text-sm">{profile.bio}</p> : null}
          <TrustSummary trust={trust} />
          {viewer?.id !== profile.id && profile.account_status === "active" ? <ContactSellerButton userId={profile.id} signedIn={Boolean(viewer)} /> : null}
        </div>
      </section>
      <section aria-labelledby="user-listings" className="mb-10">
        <h2 id="user-listings" className="mb-4 text-xl font-semibold">
          Listings
        </h2>
        {listings.items.length ? <ListingGrid listings={listings.items} /> : <EmptyState icon={Smartphone} title="No live listings" />}
      </section>
      <section aria-labelledby="user-reviews">
        <h2 id="user-reviews" className="mb-4 text-xl font-semibold">
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
