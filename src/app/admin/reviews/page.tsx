import { Alert, Badge, PageHeader } from "@/components/ui/display";
import { ReviewVisibilityButton } from "@/components/admin/admin-buttons";
import { Stars } from "@/components/reviews/review-list";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function AdminReviewsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, overall_rating, comment, is_hidden, created_at, reviewer:profiles!reviews_reviewer_id_fkey(username), reviewee:profiles!reviews_reviewee_id_fkey(username)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader title="Reviews" description="Hide reviews that contain abuse, personal data or are clearly manipulated. Ratings themselves are never edited." />
      {error ? <Alert tone="danger">Could not load reviews.</Alert> : null}
      <ul className="space-y-3">
        {(data ?? []).map((r) => (
          <li key={r.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-sm sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.overall_rating} size={14} />
                {r.is_hidden ? <Badge tone="danger">Hidden</Badge> : null}
                <span className="text-xs text-muted">
                  @{r.reviewer?.username ?? "deleted"} → @{r.reviewee?.username ?? "deleted"} · {formatDateTime(r.created_at)}
                </span>
              </div>
              {r.comment ? <p>{r.comment}</p> : <p className="text-muted">No comment</p>}
            </div>
            <ReviewVisibilityButton reviewId={r.id} hidden={r.is_hidden} />
          </li>
        ))}
      </ul>
    </>
  );
}
