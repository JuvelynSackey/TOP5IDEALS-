import { Stars } from "@/components/reviews/review-list";

export function TrustSummary({ trust }: { trust: { review_count: number | null; average_overall: number | null; completed_transactions: number | null } | null }) {
  const reviews = Number(trust?.review_count ?? 0);
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <div>
        <dt className="text-xs text-muted">Rating</dt>
        <dd className="flex items-center gap-1.5 font-medium">
          {reviews ? (
            <>
              <Stars value={Number(trust?.average_overall ?? 0)} size={14} /> {Number(trust?.average_overall).toFixed(1)}
              <span className="font-normal text-muted">({reviews})</span>
            </>
          ) : (
            <span className="font-normal text-muted">No reviews yet</span>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Completed exchanges</dt>
        <dd className="tabular font-medium">{Number(trust?.completed_transactions ?? 0)}</dd>
      </div>
    </dl>
  );
}
