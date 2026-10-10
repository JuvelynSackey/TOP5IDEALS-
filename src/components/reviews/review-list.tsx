import { Star } from "lucide-react";
import { formatDate } from "@/lib/format";

export interface ReviewItem {
  id: string;
  overall_rating: number;
  communication_rating: number;
  accuracy_rating: number;
  experience_rating: number;
  comment: string | null;
  created_at: string;
  edited_at: string | null;
  author: string;
}

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} style={{ width: size, height: size }} className={n <= Math.round(value) ? "fill-current text-warning" : "text-border-strong"} aria-hidden="true" />
      ))}
    </span>
  );
}

export function ReviewList({ reviews }: { reviews: ReviewItem[] }) {
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Stars value={r.overall_rating} />
            <span className="text-xs text-muted">
              {r.author} · {formatDate(r.created_at)}
              {r.edited_at ? " · edited" : ""}
            </span>
          </div>
          {r.comment ? <p className="mt-2 text-sm">{r.comment}</p> : null}
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <div>
              <dt className="inline">Communication </dt>
              <dd className="inline font-medium text-foreground">{r.communication_rating}/5</dd>
            </div>
            <div>
              <dt className="inline">Item accuracy </dt>
              <dd className="inline font-medium text-foreground">{r.accuracy_rating}/5</dd>
            </div>
            <div>
              <dt className="inline">Experience </dt>
              <dd className="inline font-medium text-foreground">{r.experience_rating}/5</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
