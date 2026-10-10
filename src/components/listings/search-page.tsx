import Link from "next/link";
import { Suspense } from "react";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { ListingGrid } from "@/components/listings/listing-card";
import { SearchFilters, SortSelect } from "@/components/listings/search-filters";
import { parseSearchParams } from "@/lib/validation/marketplace";
import { getCatalogue, searchListings } from "@/server/queries";

/** Shared server-rendered search experience for /buy and /swap. */
export async function SearchPage({
  rawParams,
  basePath,
  title,
  intro,
  swapOnly = false,
}: {
  rawParams: Record<string, string | string[] | undefined>;
  basePath: string;
  title: string;
  intro: React.ReactNode;
  swapOnly?: boolean;
}) {
  const params = parseSearchParams(rawParams);
  if (swapOnly) params.swap = "1";
  const [{ brands, models, regions }, result] = await Promise.all([getCatalogue(), searchListings(params)]);
  const heading = params.q ? `Results for “${params.q}”` : title;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">{heading}</h1>
        <div className="mt-1 text-sm text-muted">{intro}</div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Suspense fallback={null}>
          <SearchFilters
            brands={brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
            models={models.map((m) => ({ id: m.id, name: m.name, brand_id: m.brand_id }))}
            regions={regions.map((r) => ({ id: r.id, name: r.name, slug: r.slug }))}
            lockSwap={swapOnly}
          />
        </Suspense>
        <section aria-label="Results" aria-live="polite">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="tabular text-sm text-muted">
              {result.total === 0 ? "No phones found" : `${result.total.toLocaleString("en-GH")} phone${result.total === 1 ? "" : "s"}`}
            </p>
            <Suspense fallback={null}>
              <SortSelect />
            </Suspense>
          </div>
          {result.items.length ? (
            <>
              <ListingGrid listings={result.items} priorityCount={4} />
              <Pagination page={result.page} pageCount={result.pageCount} basePath={basePath} params={{ ...params, swap: swapOnly ? undefined : params.swap }} />
            </>
          ) : (
            <EmptyState
              icon={SearchX}
              title="No phones match your search"
              description="Try fewer filters, a different spelling, or search all of Ghana."
              action={
                <Button asChild variant="outline">
                  <Link href={basePath}>Clear all filters</Link>
                </Button>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
