import type { OfferStatus } from "./catalog";

export type OfferParty = "initiator" | "recipient";

export interface OfferStateInput {
  status: OfferStatus;
  awaitingParty: OfferParty | null;
  expiresAt: string | Date;
  viewerParty: OfferParty | null;
  now?: Date;
}

/** Mirrors the server-side state machine so the UI only offers valid actions. */
export function offerActions({ status, awaitingParty, expiresAt, viewerParty, now = new Date() }: OfferStateInput) {
  const open = status === "pending";
  const expired = open && new Date(expiresAt).getTime() <= now.getTime();
  const myTurn = open && !expired && viewerParty !== null && awaitingParty === viewerParty;
  return {
    expired,
    myTurn,
    canAccept: myTurn,
    canCounter: myTurn,
    canReject: open && viewerParty !== null && awaitingParty === viewerParty,
    canCancel: open && viewerParty === "initiator",
    waitingOnOther: open && !expired && viewerParty !== null && awaitingParty !== viewerParty,
  };
}

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  pending: "Open",
  accepted: "Accepted",
  rejected: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  completed: "Completed",
  disputed: "Under review",
};

export function offerStatusLabel(status: OfferStatus, currentVersion: number, expired: boolean): string {
  if (status === "pending" && expired) return "Expired";
  if (status === "pending" && currentVersion > 1) return "Countered";
  return OFFER_STATUS_LABEL[status];
}

export type TransactionUiStatus = "active" | "completed" | "cancelled" | "disputed";

/** Completion rule: both parties must confirm; disputes block confirmation. */
export function transactionActions(input: {
  status: TransactionUiStatus;
  confirmedByMe: boolean;
  confirmedByOther: boolean;
  isParty: boolean;
}) {
  const { status, confirmedByMe, confirmedByOther, isParty } = input;
  const active = status === "active" && isParty;
  return {
    canConfirm: active && !confirmedByMe,
    canCancel: active && !confirmedByMe && !confirmedByOther,
    canDispute: active,
    canReview: status === "completed" && isParty,
    awaitingOther: active && confirmedByMe && !confirmedByOther,
  };
}
