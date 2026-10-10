"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "./confirm-button";
import { deleteDraftAction, listingTransitionAction } from "@/app/actions/listings";
import { ownerActions } from "@/lib/listing-state";
import type { ListingStatus, ModerationStatus } from "@/lib/catalog";

export function ListingRowActions({ id, status, moderation }: { id: string; status: ListingStatus; moderation: ModerationStatus }) {
  const router = useRouter();
  const a = ownerActions(status, moderation);
  const refresh = () => router.refresh();
  return (
    <div className="flex flex-wrap gap-2">
      {a.edit ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`/sell?listing=${id}`}>
            <Pencil aria-hidden="true" /> {status === "draft" ? "Continue" : "Edit"}
          </Link>
        </Button>
      ) : null}
      {a.submit && status !== "draft" ? (
        <ConfirmButton label="Resubmit" title="Resubmit for review?" description="Make sure you've addressed the moderator's feedback first." confirmLabel="Resubmit" variant="primary" action={() => listingTransitionAction(id, "publish")} onDone={refresh} />
      ) : null}
      {a.pause ? (
        <ConfirmButton label="Pause" title="Pause this listing?" description="It will be hidden from search and any open offers on it will be closed." confirmLabel="Pause listing" action={() => listingTransitionAction(id, "pause")} onDone={refresh} />
      ) : null}
      {a.resume ? <ConfirmButton label="Resume" title="Resume this listing?" confirmLabel="Resume" variant="primary" action={() => listingTransitionAction(id, "resume")} onDone={refresh} /> : null}
      {a.markSold ? (
        <ConfirmButton
          label="Sold elsewhere"
          title="Mark as sold outside Top5Ideals?"
          description="Use this only if you sold the phone without using an offer here. It closes open offers and can't be undone. Sales outside the platform can't be reviewed."
          confirmLabel="Mark as sold"
          action={() => listingTransitionAction(id, "sold")}
          onDone={refresh}
        />
      ) : null}
      {a.archive ? (
        <ConfirmButton label="Archive" title="Archive this listing?" description="Archived listings are hidden permanently and can't be edited." confirmLabel="Archive" danger action={() => listingTransitionAction(id, "archive")} onDone={refresh} />
      ) : null}
      {a.delete ? (
        <ConfirmButton label="Delete draft" title="Delete this draft?" description="The draft and its photos will be removed." confirmLabel="Delete" danger variant="ghost" action={() => deleteDraftAction(id)} onDone={refresh} />
      ) : null}
    </div>
  );
}
