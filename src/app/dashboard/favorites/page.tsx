import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, PageHeader } from "@/components/ui/display";
import { ListingGrid } from "@/components/listings/listing-card";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export default async function FavoritesPage() {
  const viewer = await requireViewer("/dashboard/favorites");
  const supabase = await createClient();
  const { data: favs, error } = await supabase.from("favorites").select("listing_id, created_at").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(200);
  const ids = (favs ?? []).map((f) => f.listing_id);
  const { data: cards } = ids.length ? await supabase.from("listing_cards").select("*").in("id", ids) : { data: [] };
  const order = new Map(ids.map((id, i) => [id, i]));
  const listings = (cards ?? []).sort((a, b) => (order.get(a.id ?? "") ?? 0) - (order.get(b.id ?? "") ?? 0));
  const hidden = ids.length - listings.length;

  return (
    <>
      <PageHeader title="Saved phones" description="Phones you've saved. Unavailable ones are marked so you don't miss changes." />
      {error ? <Alert tone="danger">We couldn&apos;t load your saved phones.</Alert> : null}
      {hidden > 0 ? <Alert tone="info" className="mb-4">{hidden} saved phone{hidden === 1 ? " is" : "s are"} no longer public and can&apos;t be shown.</Alert> : null}
      {!error && !listings.length ? (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Tap Save on any listing to keep track of it here."
          action={
            <Button asChild variant="outline">
              <Link href="/buy">Browse phones</Link>
            </Button>
          }
        />
      ) : (
        <ListingGrid listings={listings} />
      )}
    </>
  );
}
