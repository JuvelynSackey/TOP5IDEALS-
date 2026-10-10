"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, fromDbError, ok, type ActionResult } from "@/lib/errors";

/**
 * Administrative actions. Each one runs as the signed-in staff member: the
 * database re-checks the role (is_staff / is_admin) and logs to admin_actions.
 * Hiding a button is never the only control.
 */
async function client() {
  return createClient();
}

const uuid = z.uuid();
const reasonSchema = z.string().trim().max(1000);

export async function moderateListingAction(listingId: string, decision: "approve" | "reject", reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(listingId).success || !["approve", "reject"].includes(decision)) return fail("validation_failed", "Invalid request.");
  const supabase = await client();
  const { error } = await supabase.rpc("moderate_listing", { p_listing_id: listingId, p_decision: decision, p_reason: reasonSchema.parse(reason) });
  if (error) return fromDbError(error, "Moderation failed.");
  revalidatePath("/admin/listings");
  revalidatePath("/admin");
  return ok(undefined, decision === "approve" ? "Listing approved and published." : "Listing rejected. The seller has been told why.");
}

export async function setAccountStatusAction(userId: string, status: "active" | "suspended", reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(userId).success || !["active", "suspended"].includes(status)) return fail("validation_failed", "Invalid request.");
  const supabase = await client();
  const { error } = await supabase.rpc("set_account_status", { p_user_id: userId, p_status: status, p_reason: reasonSchema.parse(reason) });
  if (error) return fromDbError(error, "We couldn't update this account.");
  revalidatePath("/admin/users");
  return ok(undefined, status === "suspended" ? "Account suspended. Live listings paused and open offers closed." : "Account reinstated.");
}

export async function resolveReportAction(reportId: string, status: "reviewing" | "resolved" | "dismissed", note: string): Promise<ActionResult> {
  if (!uuid.safeParse(reportId).success || !["reviewing", "resolved", "dismissed"].includes(status)) return fail("validation_failed", "Invalid request.");
  const supabase = await client();
  const { error } = await supabase.rpc("resolve_report", { p_report_id: reportId, p_status: status, p_note: reasonSchema.parse(note) });
  if (error) return fromDbError(error, "We couldn't update this report.");
  revalidatePath("/admin/reports");
  return ok(undefined, "Report updated.");
}

export async function resolveDisputeAction(disputeId: string, outcome: "complete" | "cancel" | "dismiss", note: string): Promise<ActionResult> {
  if (!uuid.safeParse(disputeId).success || !["complete", "cancel", "dismiss"].includes(outcome)) return fail("validation_failed", "Invalid request.");
  const supabase = await client();
  const { error } = await supabase.rpc("resolve_dispute", { p_dispute_id: disputeId, p_outcome: outcome, p_note: reasonSchema.parse(note) });
  if (error) return fromDbError(error, "We couldn't resolve this dispute.");
  revalidatePath("/admin/transactions");
  return ok(undefined, "Dispute resolved. Both parties have been notified.");
}

export async function reviewVerificationAction(requestId: string, approve: boolean, note: string): Promise<ActionResult> {
  if (!uuid.safeParse(requestId).success) return fail("validation_failed", "Invalid request.");
  const supabase = await client();
  const { error } = await supabase.rpc("review_verification", { p_request_id: requestId, p_approve: approve, p_note: reasonSchema.parse(note) });
  if (error) return fromDbError(error, "We couldn't record this decision.");
  revalidatePath("/admin/verifications");
  return ok(undefined, approve ? "Verified." : "Request rejected.");
}

/** Short-lived signed URL for a private verification document (admins only via storage RLS). */
export async function verificationDocumentUrlAction(path: string): Promise<ActionResult<{ url: string }>> {
  if (!/^[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp|pdf)$/.test(path)) return fail("validation_failed", "Invalid document.");
  const supabase = await client();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return fail("forbidden", "Administrator permission is required.");
  const { data, error } = await supabase.storage.from("verification-docs").createSignedUrl(path, 120);
  if (error || !data) return fail("not_found", "Document not available.");
  return ok({ url: data.signedUrl });
}

export async function setReviewHiddenAction(reviewId: string, hidden: boolean, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(reviewId).success) return fail("validation_failed", "Invalid request.");
  const supabase = await client();
  const { error } = await supabase.rpc("set_review_hidden", { p_review_id: reviewId, p_hidden: hidden, p_reason: reasonSchema.parse(reason) });
  if (error) return fromDbError(error, "We couldn't update this review.");
  revalidatePath("/admin/reviews");
  return ok(undefined, hidden ? "Review hidden." : "Review restored.");
}

export async function addFeaturedAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ listingKey: z.string().trim().regex(/[a-z0-9]{8}$/), days: z.coerce.number().int().min(1).max(90) }).safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Paste a listing URL or its 8-character key, and choose 1–90 days.");
  const key = parsed.data.listingKey.slice(-8);
  const supabase = await client();
  const { data: listing } = await supabase.from("listings").select("id").eq("slug_key", key).maybeSingle();
  if (!listing) return fail("not_found", "Listing not found.");
  const endsAt = new Date(Date.now() + parsed.data.days * 86400_000).toISOString();
  const { error } = await supabase.from("featured_listings").insert({ listing_id: listing.id, ends_at: endsAt });
  if (error) return fromDbError(error, "We couldn't feature this listing.");
  revalidatePath("/admin/featured");
  revalidatePath("/");
  return ok(undefined, "Listing featured.");
}

export async function removeFeaturedAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("validation_failed", "Invalid request.");
  const supabase = await client();
  const { error } = await supabase.from("featured_listings").delete().eq("id", id);
  if (error) return fromDbError(error, "We couldn't remove this feature.");
  revalidatePath("/admin/featured");
  revalidatePath("/");
  return ok(undefined, "Removed from featured.");
}

const slugRule = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: "Use lowercase letters, numbers and hyphens." });

export async function saveBrandAction(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ id: z.coerce.number().int().positive().optional(), name: z.string().trim().min(1).max(60), slug: slugRule, sortOrder: z.coerce.number().int().min(0).max(1000), isActive: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("validation_failed", parsed.error.issues[0]?.message ?? "Invalid brand.");
  const supabase = await client();
  const v = parsed.data;
  const row = { name: v.name, slug: v.slug, sort_order: v.sortOrder, is_active: v.isActive };
  const { error } = v.id ? await supabase.from("brands").update(row).eq("id", v.id) : await supabase.from("brands").insert(row);
  if (error) return fromDbError(error, "We couldn't save this brand.");
  revalidatePath("/admin/brands");
  return ok(undefined, "Brand saved.");
}

const numberList = z
  .string()
  .trim()
  .transform((s) => (s ? s.split(/[,\s]+/).map(Number) : []))
  .pipe(z.array(z.number().int().positive().max(4096)).max(12));

export async function saveModelAction(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.coerce.number().int().positive().optional(),
      brandId: z.coerce.number().int().positive(),
      name: z.string().trim().min(1).max(80),
      slug: slugRule,
      releaseYear: z.union([z.literal(""), z.coerce.number().int().min(2000).max(2100)]),
      storage: numberList,
      ram: numberList,
      batteryHealthSupported: z.boolean(),
      isActive: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("validation_failed", parsed.error.issues[0]?.message ?? "Invalid model.");
  const supabase = await client();
  const v = parsed.data;
  const row = {
    name: v.name,
    slug: v.slug,
    release_year: v.releaseYear === "" ? null : v.releaseYear,
    storage_options_gb: v.storage,
    ram_options_gb: v.ram,
    battery_health_supported: v.batteryHealthSupported,
    is_active: v.isActive,
  };
  const { error } = v.id ? await supabase.from("phone_models").update(row).eq("id", v.id) : await supabase.from("phone_models").insert({ ...row, brand_id: v.brandId });
  if (error) return fromDbError(error, "We couldn't save this model.");
  revalidatePath("/admin/models");
  return ok(undefined, "Model saved.");
}

export async function updateSettingAction(key: string, value: unknown): Promise<ActionResult> {
  const schemas: Record<string, z.ZodType> = {
    auto_approve_verified_sellers: z.boolean(),
    offer_expiry_hours: z.number().int().min(1).max(720),
    confirmation_window_days: z.number().int().min(1).max(60),
    review_edit_window_days: z.number().int().min(0).max(90),
  };
  const schema = schemas[key];
  if (!schema || !schema.safeParse(value).success) return fail("validation_failed", "Invalid setting value.");
  const supabase = await client();
  const { data, error } = await supabase.from("app_settings").update({ value: value as never }).eq("key", key).select("key");
  if (error) return fromDbError(error, "We couldn't save this setting.");
  if (!data?.length) return fail("forbidden", "Administrator permission is required.");
  revalidatePath("/admin/settings");
  return ok(undefined, "Setting saved.");
}
