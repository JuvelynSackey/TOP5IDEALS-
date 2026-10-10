/**
 * Typed results for server actions and a mapping from database business-rule
 * codes (raised by RPCs as MESSAGE) to user-facing text. Internal details
 * (SQL, constraint names, stack traces) never reach the browser.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(code: string, error: string, fieldErrors?: Record<string, string[]>): { ok: false; error: string; code: string; fieldErrors?: Record<string, string[]> } {
  return { ok: false, code, error, fieldErrors };
}

const MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in to continue.",
  profile_missing: "Your profile could not be found. Please sign out and in again.",
  profile_incomplete: "Please complete your profile first.",
  account_suspended: "Your account is suspended. Contact support if you believe this is a mistake.",
  forbidden: "You do not have permission to do that.",
  not_found: "We could not find that. It may have been removed.",
  rate_limited: "You're doing that too often. Please wait a moment and try again.",
  validation_failed: "Some details are not valid. Please check and try again.",
  invalid_state: "This can't be done in its current state. Refresh and try again.",
  listing_locked: "This listing can no longer be edited.",
  listing_incomplete: "Add the missing details before publishing.",
  listing_unavailable: "This phone is no longer available.",
  offered_listing_unavailable: "One of the phones you offered is no longer available.",
  too_many_images: "A listing can have at most 10 photos.",
  own_listing: "You can't make an offer on your own listing.",
  not_owner: "You can only offer phones listed on your own account.",
  not_for_sale: "This phone is available for swap only.",
  swap_not_accepted: "This seller isn't accepting swaps for this phone.",
  invalid_cash: "Check the cash amount and who pays it.",
  duplicate_offer: "You already have an open offer on this listing.",
  offer_closed: "This offer is no longer open.",
  offer_expired: "This offer has expired.",
  offer_changed: "This offer changed while you were viewing it. Review the latest terms.",
  not_your_turn: "You're waiting for the other party to respond.",
  no_change: "Your counteroffer has the same terms as the current offer.",
  negotiation_limit: "This negotiation has reached its limit.",
  party_unavailable: "The other party can't complete deals right now.",
  transaction_disputed: "This exchange is under dispute review.",
  confirmation_exists: "A party has already confirmed this exchange. Report a problem instead.",
  already_disputed: "A dispute is already open for this exchange.",
  review_not_eligible: "You can review only after both parties confirm the exchange.",
  already_reviewed: "You have already reviewed this exchange.",
  edit_window_closed: "Reviews can only be edited for a limited time.",
  duplicate_request: "You already have a verification request under review.",
  blocked: "You can't interact with this user.",
  invalid_recipient: "You can't message yourself.",
  recipient_unavailable: "This user isn't accepting messages.",
  immutable: "Agreed terms and history can't be changed.",
};

interface DbErrorLike {
  message?: string;
  details?: string | null;
  code?: string;
}

/** Map a Supabase/PostgREST error to an ActionResult failure. */
export function fromDbError(error: DbErrorLike, fallback = "Something went wrong. Please try again."): { ok: false; error: string; code: string } {
  const code = error.message ?? "unknown";
  if (error.code === "P0001" && MESSAGES[code]) {
    // Prefer the specific server detail when it is a business-rule message.
    const detail = error.details && error.details !== code ? error.details : MESSAGES[code];
    return { ok: false, code, error: detail ?? fallback };
  }
  if (MESSAGES[code]) return { ok: false, code, error: MESSAGES[code] };
  if (error.code === "23505") return { ok: false, code: "duplicate", error: "That already exists." };
  if (error.code === "42501") return { ok: false, code: "forbidden", error: MESSAGES.forbidden! };
  if (error.code === "23514") return { ok: false, code: "validation_failed", error: MESSAGES.validation_failed! };
  return { ok: false, code: "unknown", error: fallback };
}

export function messageForCode(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Please try again.";
}
