import Link from "next/link";
import { Star } from "lucide-react";
import { Alert, EmptyState, PageHeader, Stat } from "@/components/ui/display";
import { ReviewList, type ReviewItem } from "@/components/reviews/review-list";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { getProfileTrust } from "@/server/queries";

const SELECT =
  "id, transaction_id, overall_rating, communication_rating, accuracy_rating, experience_rating, comment, created_at, edited_at, is_hidden, reviewer:profiles!reviews_reviewer_id_fkey(username, full_name), reviewee:profiles!reviews_reviewee_id_fkey(username, full_name)";

export default async function ReviewsPage() {
  const viewer = await requireViewer("/dashboard/reviews");
  const supabase = await createClient();
  const [received, given, trust] = await Promise.all([
    supabase.from("reviews").select(SELECT).eq("reviewee_id", viewer.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("reviews").select(SELECT).eq("reviewer_id", viewer.id).order("created_at", { ascending: false }).limit(100),
    getProfileTrust(viewer.id),
  ]);
  const name = (p: { username: string | null; full_name: string } | null) => (p ? p.full_name || `@${p.username}` : "Deleted user");
  const map = (rows: NonNullable<typeof received.data>, who: "reviewer" | "reviewee"): ReviewItem[] =>
    rows.map((r) => ({ ...r, author: who === "reviewer" ? name(r.reviewer) : `You → ${name(r.reviewee)}` }));

  return (
    <>
      <PageHeader title="Reviews" description="Reviews can only be left by the other party in a completed exchange." />
      {received.error || given.error ? <Alert tone="danger" className="mb-4">We couldn&apos;t load all reviews.</Alert> : null}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Average rating" value={trust && Number(trust.review_count) ? Number(trust.average_overall).toFixed(1) : "—"} hint="One review per person counted" />
        <Stat label="Reviews received" value={Number(trust?.review_count ?? 0)} />
        <Stat label="Completed exchanges" value={Number(trust?.completed_transactions ?? 0)} />
      </div>
      <section aria-labelledby="received-heading" className="mb-8">
        <h2 id="received-heading" className="mb-3 text-lg font-semibold">
          About you
        </h2>
        {received.data?.length ? (
          <ReviewList reviews={map(received.data, "reviewer")} />
        ) : (
          <EmptyState icon={Star} title="No reviews yet" description="After an exchange completes, the other party can review you." />
        )}
      </section>
      <section aria-labelledby="given-heading">
        <h2 id="given-heading" className="mb-3 text-lg font-semibold">
          Written by you
        </h2>
        {given.data?.length ? (
          <>
            <ReviewList reviews={map(given.data, "reviewee")} />
            <p className="mt-2 text-xs text-muted">
              You can edit a review for 14 days from its{" "}
              <Link href="/dashboard/transactions" className="text-accent hover:underline">
                transaction page
              </Link>
              .
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">You haven&apos;t written any reviews yet.</p>
        )}
      </section>
    </>
  );
}
