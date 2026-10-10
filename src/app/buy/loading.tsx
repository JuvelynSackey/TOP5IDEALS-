import { ListingGridSkeleton } from "@/components/listings/listing-card";
import { Skeleton } from "@/components/ui/display";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10" role="status" aria-label="Loading phones">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Skeleton className="hidden h-[560px] lg:block" />
        <ListingGridSkeleton />
      </div>
    </div>
  );
}
