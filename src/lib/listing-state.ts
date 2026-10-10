import type { ListingStatus, ModerationStatus } from "./catalog";

export type ListingDisplayState =
  | "draft"
  | "in_review"
  | "rejected"
  | "live"
  | "paused"
  | "reserved"
  | "sold"
  | "swapped"
  | "archived";

/** Single source of truth for how the two state axes are presented. */
export function listingDisplayState(status: ListingStatus, moderation: ModerationStatus): ListingDisplayState {
  if (status === "draft") return "draft";
  if (status === "archived") return "archived";
  if (status === "reserved") return "reserved";
  if (status === "sold") return "sold";
  if (status === "swapped") return "swapped";
  if (moderation === "rejected") return "rejected";
  if (moderation !== "approved") return "in_review";
  return status === "paused" ? "paused" : "live";
}

export const DISPLAY_STATE_LABEL: Record<ListingDisplayState, string> = {
  draft: "Draft",
  in_review: "Awaiting review",
  rejected: "Needs changes",
  live: "Live",
  paused: "Paused",
  reserved: "Reserved",
  sold: "Sold",
  swapped: "Swapped",
  archived: "Archived",
};

export function isPubliclyVisible(status: ListingStatus, moderation: ModerationStatus): boolean {
  return moderation === "approved" && ["published", "paused", "reserved", "sold", "swapped"].includes(status);
}

/** Can a buyer start a new offer/purchase on this listing right now? */
export function isOfferable(status: ListingStatus, moderation: ModerationStatus): boolean {
  return status === "published" && moderation === "approved";
}

/** Owner actions available in the dashboard (the database enforces the same rules). */
export function ownerActions(status: ListingStatus, moderation: ModerationStatus) {
  const editable = !["reserved", "sold", "swapped", "archived"].includes(status);
  return {
    edit: editable,
    submit: status === "draft" || (["published", "paused"].includes(status) && moderation === "rejected"),
    pause: status === "published",
    resume: status === "paused",
    archive: ["draft", "published", "paused"].includes(status),
    markSold: ["published", "paused"].includes(status) && moderation === "approved",
    delete: status === "draft",
  };
}
