"use client";

import { useEffect } from "react";
import { recordViewAction } from "@/app/actions/marketplace";

/** Records one (server-deduplicated) view after the page has rendered. */
export function ViewRecorder({ listingId }: { listingId: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      recordViewAction(listingId).catch(() => {
        // View counting is best-effort and must never disrupt browsing.
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [listingId]);
  return null;
}
