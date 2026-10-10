"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, fromDbError, ok, type ActionResult } from "@/lib/errors";
import { counterOfferSchema, disputeSchema, reviewSchema } from "@/lib/validation/marketplace";

function issues(error: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) (out[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  return out;
}

async function client() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, signedIn: Boolean(data?.claims?.sub) };
}

function revalidateDeals(offerId?: string, txId?: string) {
  revalidatePath("/dashboard/offers");
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard");
  if (offerId) revalidatePath(`/dashboard/offers/${offerId}`);
  if (txId) revalidatePath(`/dashboard/transactions/${txId}`);
}

export async function counterOfferAction(input: unknown): Promise<ActionResult<{ version: number }>> {
  const parsed = counterOfferSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", issues(parsed.error));
  const { supabase, signedIn } = await client();
  if (!signedIn) return fail("not_authenticated", "Please sign in.");
  const v = parsed.data;
  const { data, error } = await supabase.rpc("counter_swap_offer", {
    p_offer_id: v.offerId,
    p_expected_version: v.expectedVersion,
    p_cash_amount_minor: v.cash,
    p_cash_payer: v.cashPayer,
    p_message: v.message ?? "",
  });
  if (error || data === null) return fromDbError(error ?? {}, "We couldn't send your counteroffer.");
  revalidateDeals(v.offerId);
  return ok({ version: data }, "Counteroffer sent.");
}

export async function acceptOfferAction(offerId: unknown, expectedVersion: unknown): Promise<ActionResult<{ transactionId: string }>> {
  const parsed = z.object({ offerId: z.uuid(), expectedVersion: z.number().int().min(1) }).safeParse({ offerId, expectedVersion });
  if (!parsed.success) return fail("validation_failed", "Invalid request.");
  const { supabase, signedIn } = await client();
  if (!signedIn) return fail("not_authenticated", "Please sign in.");
  const { data, error } = await supabase.rpc("accept_swap_offer", { p_offer_id: parsed.data.offerId, p_expected_version: parsed.data.expectedVersion });
  if (error || !data) return fromDbError(error ?? {}, "We couldn't accept this offer.");
  revalidateDeals(parsed.data.offerId, data);
  return ok({ transactionId: data }, "Offer accepted. The phones are now reserved for this exchange.");
}

export async function rejectOfferAction(offerId: unknown, message: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(offerId);
  if (!id.success) return fail("validation_failed", "Invalid request.");
  const { supabase, signedIn } = await client();
  if (!signedIn) return fail("not_authenticated", "Please sign in.");
  const { error } = await supabase.rpc("reject_swap_offer", { p_offer_id: id.data, p_message: message.slice(0, 1000) });
  if (error) return fromDbError(error, "We couldn't decline this offer.");
  revalidateDeals(id.data);
  return ok(undefined, "Offer declined.");
}

export async function cancelOfferAction(offerId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(offerId);
  if (!id.success) return fail("validation_failed", "Invalid request.");
  const { supabase, signedIn } = await client();
  if (!signedIn) return fail("not_authenticated", "Please sign in.");
  const { error } = await supabase.rpc("cancel_swap_offer", { p_offer_id: id.data });
  if (error) return fromDbError(error, "We couldn't cancel this offer.");
  revalidateDeals(id.data);
  return ok(undefined, "Offer withdrawn.");
}

export async function confirmTransactionAction(transactionId: unknown, note: string): Promise<ActionResult<{ status: string }>> {
  const id = z.uuid().safeParse(transactionId);
  if (!id.success) return fail("validation_failed", "Invalid request.");
  const { supabase, signedIn } = await client();
  if (!signedIn) return fail("not_authenticated", "Please sign in.");
  const { data, error } = await supabase.rpc("confirm_transaction", { p_transaction_id: id.data, p_note: note.slice(0, 500) });
  if (error || !data) return fromDbError(error ?? {}, "We couldn't record your confirmation.");
  revalidateDeals(undefined, id.data);
  return ok(
    { status: data },
    data === "completed" ? "Exchange completed. You can now leave a review." : "Confirmation recorded. Waiting for the other party to confirm.",
  );
}

export async function cancelTransactionAction(transactionId: unknown, reason: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(transactionId);
  if (!id.success) return fail("validation_failed", "Invalid request.");
  const { supabase, signedIn } = await client();
  if (!signedIn) return fail("not_authenticated", "Please sign in.");
  const { error } = await supabase.rpc("cancel_transaction", { p_transaction_id: id.data, p_reason: reason });
  if (error) return fromDbError(error, "We couldn't cancel this exchange.");
  revalidateDeals(undefined, id.data);
  return ok(undefined, "Exchange cancelled. The phones are available again.");
}

export async function openDisputeAction(input: unknown): Promise<ActionResult<{ disputeId: string }>> {
  const parsed = disputeSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", issues(parsed.error));
  const { supabase, signedIn } = await client();
  if (!signedIn) return fail("not_authenticated", "Please sign in.");
  const { data, error } = await supabase.rpc("open_dispute", {
    p_transaction_id: parsed.data.transactionId,
    p_category: parsed.data.category,
    p_description: parsed.data.description,
  });
  if (error || !data) return fromDbError(error ?? {}, "We couldn't report this problem.");
  revalidateDeals(undefined, parsed.data.transactionId);
  return ok({ disputeId: data }, "Problem reported. Our team will review it and contact you both.");
}

export async function submitReviewAction(input: unknown, reviewId?: string): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please rate every category.", issues(parsed.error));
  const { supabase, signedIn } = await client();
  if (!signedIn) return fail("not_authenticated", "Please sign in.");
  const v = parsed.data;
  const args = {
    p_overall: v.overall,
    p_communication: v.communication,
    p_accuracy: v.accuracy,
    p_experience: v.experience,
    p_comment: v.comment ?? "",
  };
  const { error } = reviewId
    ? await supabase.rpc("update_review", { p_review_id: z.uuid().parse(reviewId), ...args })
    : await supabase.rpc("create_review", { p_transaction_id: v.transactionId, ...args });
  if (error) return fromDbError(error, "We couldn't save your review.");
  revalidateDeals(undefined, v.transactionId);
  revalidatePath("/dashboard/reviews");
  return ok(undefined, reviewId ? "Review updated." : "Thanks for your review.");
}
