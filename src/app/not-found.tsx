import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <SearchX className="size-10 text-muted" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-semibold">We couldn&apos;t find that</h1>
      <p className="mt-2 text-sm text-muted">The page may have moved, or the listing may no longer be available or not yet approved.</p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href="/buy">Browse phones</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
