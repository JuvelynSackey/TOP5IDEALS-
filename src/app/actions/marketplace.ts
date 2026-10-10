"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, fromDbError, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { purchaseOfferSchema, reportSchema, swapOfferSchema } from "@/lib/validation/marketplace";

function issues(error: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) (out[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  return out;
}

async function requireSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  return { supabase, uid: typeof uid === "string" ? uid : null };
}

export async function toggleFavoriteAction(listingId: unknown, save: unknown): Promise<ActionResult<{ saved: boolean }>> {
  const id = z.uuid().safeParse(listingId);
  const shouldSave = z.boolean().safeParse(save);
  if (!id.success || !shouldSave.success) return fail("validation_failed", "Invalid request.");
  const { supabase, uid } = await requireSession();
  if (!uid) return fail("not_authenticated", "Sign in to save phones.");
  if (shouldSave.data) {
    const { error } = await supabase.from("favorites").insert({ user_id: uid, listing_id: id.data });
    if (error && error.code !== "23505") return fromDbError(error, "We couldn't save this phone.");
  } else {
    const { error } = await supabase.from("favorites").delete().eq("user_id", uid).eq("listing_id", id.data);
    if (error) return fromDbError(error, "We couldn't remove this phone.");
  }
  revalidatePath("/dashboard/favorites");
  return ok({ saved: shouldSave.data });
}

export async function startConversationAction(input: { listingId?: string; recipientId?: string }): Promise<ActionResult<{ conversationId: string }>> {
  const parsed = z
    .object({ listingId: z.uuid().optional(), recipientId: z.uuid().optional() })
    .refine((v) => v.listingId || v.recipientId)
    .safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Invalid request.");
  const { supabase, uid } = await requireSession();
  if (!uid) return fail("not_authenticated", "Sign in to message sellers.");
  const { data, error } = await supabase.rpc("start_conversation", {
    p_recipient_id: parsed.data.recipientId,
    p_listing_id: parsed.data.listingId,
  });
  if (error || !data) return fromDbError(error ?? {}, "We couldn't open this conversation.");
  return ok({ conversationId: data });
}

export async function createSwapOfferAction(input: unknown): Promise<ActionResult<{ offerId: string }>> {
  const parsed = swapOfferSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", issues(parsed.error));
  const { supabase, uid } = await requireSession();
  if (!uid) return fail("not_authenticated", "Sign in to make an offer.");
  const v = parsed.data;
  const { data, error } = await supabase.rpc("create_swap_offer", {
    p_listing_id: v.listingId,
    p_offered_listing_ids: v.offeredListingIds,
    p_cash_amount_minor: v.cash,
    p_cash_payer: v.cashPayer,
    p_message: v.message ?? "",
    p_idempotency_key: v.idempotencyKey,
  });
  if (error || !data) {
    logger.info("offer.create_rejected", { code: error?.message });
    return fromDbError(error ?? {}, "We couldn't send your offer.");
  }
  revalidatePath("/dashboard/offers");
  return ok({ offerId: data }, "Offer sent. The seller has been notified.");
}

export async function initiatePurchaseAction(input: unknown): Promise<ActionResult<{ offerId: string }>> {
  const parsed = purchaseOfferSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", issues(parsed.error));
  const { supabase, uid } = await requireSession();
  if (!uid) return fail("not_authenticated", "Sign in to make an offer.");
  const { data, error } = await supabase.rpc("initiate_purchase", {
    p_listing_id: parsed.data.listingId,
    p_amount_minor: parsed.data.amount!,
    p_message: parsed.data.message ?? "",
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error || !data) return fromDbError(error ?? {}, "We couldn't send your offer.");
  revalidatePath("/dashboard/offers");
  return ok({ offerId: data }, "Offer sent. The seller has been notified.");
}

export async function reportAction(input: unknown): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please choose a reason.", issues(parsed.error));
  const { supabase, uid } = await requireSession();
  if (!uid) return fail("not_authenticated", "Sign in to report content.");
  const { error } = await supabase.rpc("create_report", {
    p_target_type: parsed.data.targetType,
    p_target_id: parsed.data.targetId,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details ?? "",
  });
  if (error) return fromDbError(error, "We couldn't submit your report.");
  return ok(undefined, "Thanks — our team will review this report.");
}

export async function blockUserAction(userId: unknown, block: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(userId);
  const shouldBlock = z.boolean().safeParse(block);
  if (!id.success || !shouldBlock.success) return fail("validation_failed", "Invalid request.");
  const { supabase, uid } = await requireSession();
  if (!uid) return fail("not_authenticated", "Please sign in.");
  if (uid === id.data) return fail("validation_failed", "You can't block yourself.");
  const { error } = shouldBlock.data
    ? await supabase.from("user_blocks").insert({ blocker_id: uid, blocked_id: id.data })
    : await supabase.from("user_blocks").delete().eq("blocker_id", uid).eq("blocked_id", id.data);
  if (error && error.code !== "23505") return fromDbError(error);
  return ok(undefined, shouldBlock.data ? "User blocked. They can no longer message you or send offers." : "User unblocked.");
}

const VIEWER_COOKIE = "t5_vid";

/** Records a deduplicated view. Anonymous visitors get a random, non-identifying id cookie. */
export async function recordViewAction(listingId: unknown): Promise<void> {
  const id = z.uuid().safeParse(listingId);
  if (!id.success) return;
  const jar = await cookies();
  let anon = jar.get(VIEWER_COOKIE)?.value;
  if (!anon || !z.uuid().safeParse(anon).success) {
    anon = randomUUID();
    jar.set(VIEWER_COOKIE, anon, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_listing_view", { p_listing_id: id.data, p_anonymous_key: anon });
  if (error) logger.warn("listing.view_record_failed", { code: error.code });
}

