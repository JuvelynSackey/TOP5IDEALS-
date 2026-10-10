import { formatCedis } from "./money";

export type CashPayer = "none" | "initiator" | "recipient";
export type Perspective = "initiator" | "recipient" | "observer";

export interface CashTerms {
  amountMinor: number;
  payer: CashPayer;
}

/** True when amount and payer agree (zero ⇔ none). Mirrors the DB constraint. */
export function isConsistentCash({ amountMinor, payer }: CashTerms): boolean {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return false;
  return (amountMinor === 0) === (payer === "none");
}

/**
 * Human sentence describing who pays whom, from the reader's perspective.
 * Used everywhere cash differences appear so wording never drifts.
 */
export function describeCash(
  terms: CashTerms,
  perspective: Perspective,
  names: { initiator: string; recipient: string } = { initiator: "The offerer", recipient: "The seller" },
): string {
  if (!isConsistentCash(terms)) return "Invalid cash terms";
  if (terms.payer === "none") return "Straight swap — no cash changes hands";
  const amount = formatCedis(terms.amountMinor);
  const payerIsInitiator = terms.payer === "initiator";
  if (perspective === "initiator") {
    return payerIsInitiator ? `You pay ${names.recipient} ${amount}` : `${names.recipient} pays you ${amount}`;
  }
  if (perspective === "recipient") {
    return payerIsInitiator ? `${names.initiator} pays you ${amount}` : `You pay ${names.initiator} ${amount}`;
  }
  return payerIsInitiator ? `${names.initiator} pays ${names.recipient} ${amount}` : `${names.recipient} pays ${names.initiator} ${amount}`;
}
