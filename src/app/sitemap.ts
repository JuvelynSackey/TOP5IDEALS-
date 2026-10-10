import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { listingPath } from "@/lib/slug";

export const revalidate = 3600;

/** Public pages only: live, approved listings and storefronts (anonymous client, RLS applies). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const staticPages: MetadataRoute.Sitemap = ["", "/buy", "/swap", "/shops", "/sell", "/how-it-works", "/safety"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "daily",
    priority: p === "" ? 1 : 0.7,
  }));
  if (!isSupabaseConfigured()) return staticPages;
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const [listings, shops] = await Promise.all([
    supabase.from("listings").select("slug, slug_key, updated_at").eq("status", "published").eq("moderation_status", "approved").order("updated_at", { ascending: false }).limit(5000),
    supabase.from("business_profiles").select("slug, updated_at").limit(2000),
  ]);
  return [
    ...staticPages,
    ...(listings.data ?? []).map((l) => ({ url: `${base}${listingPath(l.slug, l.slug_key)}`, lastModified: l.updated_at, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...(shops.data ?? []).map((s) => ({ url: `${base}/shop/${s.slug}`, lastModified: s.updated_at, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
