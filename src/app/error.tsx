"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Only the opaque digest is logged client-side; details stay in server logs.
    console.error("page_error", error.digest ?? "client");
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center" role="alert">
      <TriangleAlert className="size-10 text-warning" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">This may be a connection problem. Your data is safe — nothing was submitted twice. Try again in a moment.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted">Reference: {error.digest}</p> : null}
      <Button className="mt-6" onClick={reset}>
        <RotateCcw aria-hidden="true" /> Try again
      </Button>
    </div>
  );
}
