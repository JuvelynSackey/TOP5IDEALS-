import Link from "next/link";
import { Alert, Card, CardContent, EmptyState, PageHeader } from "@/components/ui/display";
import { AddFeaturedForm } from "@/components/admin/admin-forms";
import { RemoveFeaturedButton } from "@/components/admin/admin-buttons";
import { formatDate } from "@/lib/format";
import { listingPath } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { Sparkles } from "lucide-react";

export default async function AdminFeaturedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("featured_listings")
    .select("id, starts_at, ends_at, listing:listings!featured_listings_listing_id_fkey(title, slug, slug_key, status, moderation_status)")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader title="Featured listings" description="Featured listings show in the homepage ‘Featured deals’ section. Only live, approved listings can be featured." />
      <Card className="mb-6">
        <CardContent>
          <AddFeaturedForm />
        </CardContent>
      </Card>
      {error ? <Alert tone="danger">Could not load featured listings.</Alert> : null}
      {!error && !data?.length ? <EmptyState icon={Sparkles} title="Nothing featured" /> : null}
      <ul className="space-y-2">
        {(data ?? []).map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
            <div>
              {f.listing ? (
                <Link href={listingPath(f.listing.slug, f.listing.slug_key)} className="font-medium hover:underline">
                  {f.listing.title}
                </Link>
              ) : (
                "Listing removed"
              )}
              <p className="text-xs text-muted">
                {formatDate(f.starts_at)} – {f.ends_at ? formatDate(f.ends_at) : "no end"}
                {f.listing && f.listing.status !== "published" ? ` · listing is ${f.listing.status} (hidden from homepage)` : ""}
              </p>
            </div>
            <RemoveFeaturedButton id={f.id} />
          </li>
        ))}
      </ul>
    </>
  );
}
