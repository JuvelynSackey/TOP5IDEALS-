import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  basePath,
  params,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  params: Record<string, string | number | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && k !== "page") sp.set(k, String(v));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const linkClass = "inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2";
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass} rel="prev">
          <ChevronLeft className="size-4" aria-hidden="true" /> Previous
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-40")} aria-disabled="true">
          <ChevronLeft className="size-4" aria-hidden="true" /> Previous
        </span>
      )}
      <span className="tabular px-2 text-sm text-muted" aria-current="page">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={linkClass} rel="next">
          Next <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-40")} aria-disabled="true">
          Next <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
