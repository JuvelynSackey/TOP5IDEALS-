"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, fromDbError, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import {
  conditionStepSchema,
  detailsStepSchema,
  locationStepSchema,
  phoneStepSchema,
  pricingStepSchema,
} from "@/lib/validation/listing";

function issues(error: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) (out[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  return out;
}

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  return { supabase, uid: typeof uid === "string" ? uid : null };
}

const idSchema = z.uuid();

/** Step 1 creates the server-side draft so photos can be attached to it. */
export async function createDraftAction(input: unknown): Promise<ActionResult<{ id: string; updatedAt: string }>> {
  const parsed = phoneStepSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", issues(parsed.error));
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in to continue.");
  const v = parsed.data;
  const { data, error } = await supabase
    .from("listings")
    .insert({
      seller_id: uid,
      brand_id: v.brandId,
      model_id: v.modelId ?? null,
      custom_model: v.modelId ? null : v.customModel,
      variant: v.variant,
      storage_gb: v.storageGb ?? null,
      ram_gb: v.ramGb ?? null,
      color: v.color,
      title: "",
    })
    .select("id, updated_at")
    .single();
  if (error || !data) {
    logger.warn("listing.draft_create_failed", { code: error?.code });
    if (error?.code === "42501") return fail("profile_incomplete", "Complete your profile (username and location) before listing a phone.");
    return fromDbError(error ?? {}, "We couldn't save your draft.");
  }
  revalidatePath("/dashboard/listings");
  return ok({ id: data.id, updatedAt: data.updated_at });
}

type Step = "phone" | "condition" | "pricing" | "location" | "details";

function toPatch(step: Step, raw: unknown): { patch: TablesUpdate<"listings">; swapBrands?: number[] } | { error: ReturnType<typeof issues> } {
  switch (step) {
    case "phone": {
      const p = phoneStepSchema.safeParse(raw);
      if (!p.success) return { error: issues(p.error) };
      const v = p.data;
      return {
        patch: {
          brand_id: v.brandId,
          model_id: v.modelId ?? null,
          custom_model: v.modelId ? null : v.customModel,
          variant: v.variant,
          storage_gb: v.storageGb ?? null,
          ram_gb: v.ramGb ?? null,
          color: v.color,
        },
      };
    }
    case "condition": {
      const p = conditionStepSchema.safeParse(raw);
      if (!p.success) return { error: issues(p.error) };
      const v = p.data;
      return {
        patch: {
          condition: v.condition,
          battery_health_status: v.batteryHealthStatus,
          battery_health: v.batteryHealth,
          device_checks: v.deviceChecks,
          network_lock: v.networkLock,
          accessories: v.accessories,
          defects: v.defects,
          warranty_details: v.warrantyDetails,
        },
      };
    }
    case "pricing": {
      const p = pricingStepSchema.safeParse(raw);
      if (!p.success) return { error: issues(p.error) };
      const v = p.data;
      return {
        patch: {
          price_minor: v.price,
          is_negotiable: v.isNegotiable,
          available_for_sale: v.availableForSale,
          open_to_swap: v.openToSwap,
          swap_notes: v.openToSwap ? v.swapNotes : null,
          swap_max_cash_minor: v.openToSwap ? v.swapMaxCash : null,
        },
        swapBrands: v.openToSwap ? v.swapBrandIds : [],
      };
    }
    case "location": {
      const p = locationStepSchema.safeParse(raw);
      if (!p.success) return { error: issues(p.error) };
      return { patch: { region_id: p.data.regionId, city: p.data.city, area: p.data.area } };
    }
    case "details": {
      const p = detailsStepSchema.safeParse(raw);
      if (!p.success) return { error: issues(p.error) };
      return { patch: { title: p.data.title, description: p.data.description } };
    }
  }
}

/**
 * Save one wizard step. Uses optimistic concurrency: the update only applies
 * if the listing has not changed since the client last loaded it.
 */
export async function saveListingStepAction(
  listingId: unknown,
  step: Step,
  raw: unknown,
  expectedUpdatedAt: unknown,
): Promise<ActionResult<{ updatedAt: string }>> {
  const id = idSchema.safeParse(listingId);
  const expected = z.string().min(10).safeParse(expectedUpdatedAt);
  if (!id.success || !expected.success) return fail("validation_failed", "Invalid request.");
  const result = toPatch(step, raw);
  if ("error" in result) return fail("validation_failed", "Please fix the highlighted fields.", result.error);
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in to continue.");

  const { data, error } = await supabase
    .from("listings")
    .update(result.patch)
    .eq("id", id.data)
    .eq("seller_id", uid)
    .eq("updated_at", expected.data)
    .select("updated_at")
    .maybeSingle();
  if (error) return fromDbError(error, "We couldn't save your changes.");
  if (!data) {
    return fail("stale", "This listing was changed in another tab or device. Reload the page to continue with the latest version.");
  }
  if (result.swapBrands) {
    const { error: brandsError } = await supabase.rpc("set_listing_swap_brands", { p_listing_id: id.data, p_brand_ids: result.swapBrands });
    if (brandsError) return fromDbError(brandsError, "Saved, but we couldn't update your preferred swap brands.");
  }
  const { data: fresh } = await supabase.from("listings").select("updated_at").eq("id", id.data).single();
  revalidatePath("/dashboard/listings");
  return ok({ updatedAt: fresh?.updated_at ?? data.updated_at });
}

export async function addListingImageAction(
  listingId: unknown,
  path: unknown,
  width: unknown,
  height: unknown,
): Promise<ActionResult<{ id: string; storagePath: string; isPrimary: boolean; position: number }>> {
  const parsed = z
    .object({ listingId: z.uuid(), path: z.string().min(10).max(300), width: z.number().int().positive().max(10000), height: z.number().int().positive().max(10000) })
    .safeParse({ listingId, path, width, height });
  if (!parsed.success) return fail("validation_failed", "Invalid image.");
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in to continue.");
  const { data, error } = await supabase.rpc("add_listing_image", {
    p_listing_id: parsed.data.listingId,
    p_storage_path: parsed.data.path,
    p_width: parsed.data.width,
    p_height: parsed.data.height,
  });
  if (error || !data) return fromDbError(error ?? {}, "We couldn't attach this photo.");
  return ok({ id: data.id, storagePath: data.storage_path, isPrimary: data.is_primary, position: data.position });
}

export async function removeListingImageAction(imageId: unknown): Promise<ActionResult> {
  const id = idSchema.safeParse(imageId);
  if (!id.success) return fail("validation_failed", "Invalid image.");
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in to continue.");
  const { data: path, error } = await supabase.rpc("remove_listing_image", { p_image_id: id.data });
  if (error) return fromDbError(error, "We couldn't remove this photo.");
  if (path) {
    const { error: storageError } = await supabase.storage.from("listing-images").remove([path]);
    // The row is gone, so the photo is no longer shown. A leftover file is
    // picked up by the orphaned-image clean-up (see docs/DEPLOYMENT.md).
    if (storageError) logger.warn("listing.image_file_delete_failed", { message: storageError.message });
  }
  return ok(undefined);
}

export async function setPrimaryImageAction(imageId: unknown): Promise<ActionResult> {
  const id = idSchema.safeParse(imageId);
  if (!id.success) return fail("validation_failed", "Invalid image.");
  const { supabase } = await session();
  const { error } = await supabase.rpc("set_primary_listing_image", { p_image_id: id.data });
  if (error) return fromDbError(error, "We couldn't update the cover photo.");
  return ok(undefined);
}

export async function reorderImagesAction(listingId: unknown, imageIds: unknown): Promise<ActionResult> {
  const parsed = z.object({ listingId: z.uuid(), imageIds: z.array(z.uuid()).max(10) }).safeParse({ listingId, imageIds });
  if (!parsed.success) return fail("validation_failed", "Invalid request.");
  const { supabase } = await session();
  const { error } = await supabase.rpc("reorder_listing_images", { p_listing_id: parsed.data.listingId, p_image_ids: parsed.data.imageIds });
  if (error) return fromDbError(error, "We couldn't reorder your photos.");
  return ok(undefined);
}

type Transition = "publish" | "pause" | "resume" | "archive" | "sold";
const RPC: Record<Transition, "publish_listing" | "pause_listing" | "resume_listing" | "archive_listing" | "mark_listing_sold_elsewhere"> = {
  publish: "publish_listing",
  pause: "pause_listing",
  resume: "resume_listing",
  archive: "archive_listing",
  sold: "mark_listing_sold_elsewhere",
};

export async function listingTransitionAction(
  listingId: unknown,
  transition: Transition,
): Promise<ActionResult<{ status: string; moderationStatus: string }>> {
  const id = idSchema.safeParse(listingId);
  if (!id.success || !(transition in RPC)) return fail("validation_failed", "Invalid request.");
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in to continue.");
  const { data, error } = await supabase.rpc(RPC[transition], { p_listing_id: id.data });
  if (error || !data) return fromDbError(error ?? {}, "We couldn't update this listing.");
  revalidatePath("/dashboard/listings");
  revalidatePath("/dashboard");
  const messages: Record<Transition, string> = {
    publish: data.moderation_status === "approved" ? "Your listing is live." : "Submitted for review. We'll notify you when it's live.",
    pause: "Listing paused. Open offers on it were closed.",
    resume: "Listing resumed.",
    archive: "Listing archived.",
    sold: "Marked as sold.",
  };
  return ok({ status: data.status, moderationStatus: data.moderation_status }, messages[transition]);
}

export async function deleteDraftAction(listingId: unknown): Promise<ActionResult> {
  const id = idSchema.safeParse(listingId);
  if (!id.success) return fail("validation_failed", "Invalid request.");
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in to continue.");
  const { data: images } = await supabase.from("listing_images").select("storage_path").eq("listing_id", id.data);
  const { data, error } = await supabase.from("listings").delete().eq("id", id.data).eq("status", "draft").select("id");
  if (error) return fromDbError(error, "We couldn't delete this draft.");
  if (!data?.length) return fail("invalid_state", "Only drafts can be deleted. Archive published listings instead.");
  if (images?.length) {
    const { error: storageError } = await supabase.storage.from("listing-images").remove(images.map((i) => i.storage_path));
    if (storageError) logger.warn("listing.draft_files_delete_failed", { message: storageError.message });
  }
  revalidatePath("/dashboard/listings");
  return ok(undefined, "Draft deleted.");
}

/** Current version token, used after photo operations (which may bump it). */
export async function getListingVersionAction(listingId: unknown): Promise<ActionResult<{ updatedAt: string; status: string; moderationStatus: string }>> {
  const id = idSchema.safeParse(listingId);
  if (!id.success) return fail("validation_failed", "Invalid request.");
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in to continue.");
  const { data, error } = await supabase
    .from("listings")
    .select("updated_at, status, moderation_status")
    .eq("id", id.data)
    .eq("seller_id", uid)
    .maybeSingle();
  if (error || !data) return fail("not_found", "Listing not found.");
  return ok({ updatedAt: data.updated_at, status: data.status, moderationStatus: data.moderation_status });
}
