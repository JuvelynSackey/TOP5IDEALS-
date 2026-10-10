import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables, Views } from "@/lib/supabase/database.types";
import type { SearchParams } from "@/lib/validation/marketplace";
import { logger } from "@/lib/logger";

export type ListingCard = Views<"listing_cards">;
export type Brand = Tables<"brands">;
export type PhoneModel = Tables<"phone_models">;
export type Region = Tables<"regions">;

export const PAGE_SIZE = 24;

/** Small public catalogue tables — memoised per request. */
export const getCatalogue = cache(async () => {
  const supabase = await createClient();
  const [brands, models, regions] = await Promise.all([
    supabase.from("brands").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("phone_models").select("*").eq("is_active", true).order("release_year", { ascending: false, nullsFirst: false }).order("name"),
    supabase.from("regions").select("*").order("sort_order"),
  ]);
  if (brands.error || models.error || regions.error) {
    logger.error("catalogue.load_failed", { error: brands.error ?? models.error ?? regions.error });
    throw new Error("catalogue_unavailable");
  }
  return { brands: brands.data, models: models.data, regions: regions.data };
});

export interface SearchResult {
  total: number;
  items: ListingCard[];
  page: number;
  pageCount: number;
}

export async function searchListings(params: SearchParams, extra: { sellerId?: string; limit?: number } = {}): Promise<SearchResult> {
  const supabase = await createClient();
  const { brands, regions } = await getCatalogue();
  const limit = extra.limit ?? PAGE_SIZE;
  const page = params.page ?? 1;
  const brand = params.brand ? brands.find((b) => b.slug === params.brand) : undefined;
  const region = params.region ? regions.find((r) => r.slug === params.region) : undefined;

  const { data, error } = await supabase.rpc("search_listings", {
    p_query: params.q || undefined,
    p_brand_ids: brand ? [brand.id] : undefined,
    p_model_ids: params.model ? [params.model] : undefined,
    p_min_price: params.min !== undefined ? Math.round(params.min * 100) : undefined,
    p_max_price: params.max !== undefined ? Math.round(params.max * 100) : undefined,
    p_storage: params.storage ? [params.storage] : undefined,
    p_ram: params.ram ? [params.ram] : undefined,
    p_conditions: params.condition ? [params.condition] : undefined,
    p_min_battery: params.battery,
    p_region_ids: region ? [region.id] : undefined,
    p_city: params.city || undefined,
    p_seller_type: params.seller,
    p_swap_only: params.swap === "1",
    p_verified_only: params.verified === "1",
    p_seller_id: extra.sellerId,
    p_sort: params.sort ?? "recommended",
    p_limit: limit,
    p_offset: (page - 1) * limit,
  });
  if (error) {
    logger.error("search.failed", { code: error.code, message: error.message });
    throw new Error("search_failed");
  }
  const result = (data ?? { total: 0, items: [] }) as unknown as { total: number; items: ListingCard[] };
  return { total: result.total, items: result.items, page, pageCount: Math.max(1, Math.ceil(result.total / limit)) };
}

export async function getLatestListings(limit = 8): Promise<ListingCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listing_cards")
    .select("*")
    .eq("status", "published")
    .eq("moderation_status", "approved")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("listings_unavailable");
  return data;
}

export async function getSwapListings(limit = 8): Promise<ListingCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listing_cards")
    .select("*")
    .eq("status", "published")
    .eq("moderation_status", "approved")
    .eq("open_to_swap", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("listings_unavailable");
  return data;
}

export async function getFeaturedListings(limit = 8): Promise<ListingCard[]> {
  const supabase = await createClient();
  const { data: featured, error } = await supabase.from("featured_listings").select("listing_id, sort_order").order("sort_order").limit(limit);
  if (error) throw new Error("listings_unavailable");
  if (!featured.length) return [];
  const ids = featured.map((f) => f.listing_id);
  const { data, error: cardsError } = await supabase
    .from("listing_cards")
    .select("*")
    .in("id", ids)
    .eq("status", "published")
    .eq("moderation_status", "approved");
  if (cardsError) throw new Error("listings_unavailable");
  const order = new Map(ids.map((id, i) => [id, i]));
  return data.sort((a, b) => (order.get(a.id ?? "") ?? 0) - (order.get(b.id ?? "") ?? 0));
}

export async function getBrandCounts(): Promise<{ brand: Brand; count: number }[]> {
  const supabase = await createClient();
  const { brands } = await getCatalogue();
  const { data, error } = await supabase
    .from("listing_cards")
    .select("brand_id")
    .eq("status", "published")
    .eq("moderation_status", "approved")
    .limit(2000);
  if (error) throw new Error("listings_unavailable");
  const counts = new Map<number, number>();
  for (const row of data) if (row.brand_id) counts.set(row.brand_id, (counts.get(row.brand_id) ?? 0) + 1);
  return brands.map((brand) => ({ brand, count: counts.get(brand.id) ?? 0 }));
}

export async function getTrustedSellers(limit = 6) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_profiles")
    .select("id, business_name, slug, logo_path, city, verification_status, owner_id, regions(name)")
    .eq("verification_status", "verified")
    .order("verified_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("sellers_unavailable");
  return data;
}

export async function getListingByKey(key: string) {
  const supabase = await createClient();
  const { data: listing, error } = await supabase
    .from("listings")
    .select(
      "*, brands(name, slug), phone_models(name, slug, battery_health_supported), regions(name, slug), listing_images(id, storage_path, position, is_primary, width, height), listing_swap_brands(brand_id, brands(name))",
    )
    .eq("slug_key", key)
    .maybeSingle();
  if (error) {
    logger.error("listing.load_failed", { code: error.code });
    throw new Error("listing_unavailable");
  }
  if (!listing) return null;
  const { data: seller } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_path, account_type, verification_status, account_status, created_at, city, regions(name)")
    .eq("id", listing.seller_id)
    .maybeSingle();
  const { data: business } = await supabase
    .from("business_profiles")
    .select("business_name, slug, logo_path, verification_status")
    .eq("owner_id", listing.seller_id)
    .maybeSingle();
  listing.listing_images.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);
  return { listing, seller, business };
}

export type ListingDetail = NonNullable<Awaited<ReturnType<typeof getListingByKey>>>;

export async function getProfileTrust(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_profile_trust", { p_user_id: userId });
  if (error) return null;
  return data[0] ?? null;
}

export async function getPublicReviews(userId: string, limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, overall_rating, communication_rating, accuracy_rating, experience_rating, comment, created_at, edited_at, reviewer:profiles!reviews_reviewer_id_fkey(username, full_name, avatar_path)")
    .eq("reviewee_id", userId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data;
}
