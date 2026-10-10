"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, fromDbError, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { businessProfileSchema, profileSchema } from "@/lib/validation/auth";
import type { NotificationType } from "@/lib/catalog";

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

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", issues(parsed.error));
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in.");
  const v = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({ username: v.username, full_name: v.fullName, region_id: v.regionId, city: v.city, bio: v.bio })
    .eq("id", uid);
  if (error) {
    if (error.code === "23505") return fail("username_taken", "That username is taken.", { username: ["That username is taken."] });
    return fromDbError(error, "We couldn't save your profile.");
  }
  const { error: contactError } = await supabase.from("profile_contacts").update({ phone_e164: v.phone }).eq("user_id", uid);
  if (contactError) return fromDbError(contactError, "Profile saved, but we couldn't save your phone number.");
  revalidatePath("/", "layout");
  return ok(undefined, "Profile saved.");
}

const avatarPath = (uid: string) => new RegExp(`^${uid}/[A-Za-z0-9_-]{8,64}\\.(jpg|jpeg|png|webp)$`);

export async function setAvatarAction(path: unknown): Promise<ActionResult> {
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in.");
  const p = z.string().regex(avatarPath(uid)).nullable().safeParse(path);
  if (!p.success) return fail("validation_failed", "Invalid image.");
  const { data: current } = await supabase.from("profiles").select("avatar_path").eq("id", uid).single();
  const { error } = await supabase.from("profiles").update({ avatar_path: p.data }).eq("id", uid);
  if (error) return fromDbError(error, "We couldn't update your photo.");
  if (current?.avatar_path && current.avatar_path !== p.data) {
    const { error: removeError } = await supabase.storage.from("avatars").remove([current.avatar_path]);
    if (removeError) logger.warn("avatar.old_file_delete_failed", { message: removeError.message });
  }
  revalidatePath("/", "layout");
  return ok(undefined, "Photo updated.");
}

export async function saveBusinessProfileAction(input: unknown, logoPath?: string | null): Promise<ActionResult> {
  const parsed = businessProfileSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", issues(parsed.error));
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in.");
  if (logoPath !== undefined && logoPath !== null && !avatarPath(uid).test(logoPath)) return fail("validation_failed", "Invalid logo.");
  const v = parsed.data;
  const row = {
    business_name: v.businessName,
    slug: v.slug,
    description: v.description,
    region_id: v.regionId,
    city: v.city,
    area: v.area,
    public_phone: v.publicPhone,
    ...(logoPath !== undefined ? { logo_path: logoPath } : {}),
  };
  const { data: existing } = await supabase.from("business_profiles").select("id").eq("owner_id", uid).maybeSingle();
  const { error } = existing
    ? await supabase.from("business_profiles").update(row).eq("owner_id", uid)
    : await supabase.from("business_profiles").insert({ owner_id: uid, ...row });
  if (error) {
    if (error.code === "23505") return fail("slug_taken", "That storefront address is taken.", { slug: ["That storefront address is taken."] });
    return fromDbError(error, "We couldn't save your storefront.");
  }
  revalidatePath("/dashboard/storefront");
  revalidatePath(`/shop/${v.slug}`);
  return ok(undefined, existing ? "Storefront updated." : "Storefront created. Request verification to earn the verified badge.");
}

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionResult> {
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in.");
  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).is("read_at", null);
  if (ids?.length) {
    const parsed = z.array(z.uuid()).max(200).safeParse(ids);
    if (!parsed.success) return fail("validation_failed", "Invalid request.");
    query = query.in("id", parsed.data);
  }
  const { error } = await query;
  if (error) return fromDbError(error, "We couldn't update your notifications.");
  revalidatePath("/dashboard/notifications");
  return ok(undefined, ids?.length ? undefined : "All caught up.");
}

const NOTIFICATION_TYPES = [
  "message",
  "offer_received",
  "offer_countered",
  "offer_accepted",
  "offer_rejected",
  "offer_cancelled",
  "offer_expired",
  "listing_approved",
  "listing_rejected",
  "listing_sold",
  "listing_swapped",
  "transaction_update",
  "verification_update",
  "review_received",
  "dispute_update",
  "report_update",
] as const satisfies readonly NotificationType[];

export async function saveNotificationPreferencesAction(prefs: unknown): Promise<ActionResult> {
  const parsed = z.array(z.object({ type: z.enum(NOTIFICATION_TYPES), inApp: z.boolean(), email: z.boolean() })).max(NOTIFICATION_TYPES.length).safeParse(prefs);
  if (!parsed.success) return fail("validation_failed", "Invalid preferences.");
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in.");
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(parsed.data.map((p) => ({ user_id: uid, type: p.type, in_app: p.inApp, email: p.email })), { onConflict: "user_id,type" });
  if (error) return fromDbError(error, "We couldn't save your preferences.");
  return ok(undefined, "Preferences saved.");
}

export async function submitVerificationAction(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ kind: z.enum(["individual", "business"]), note: z.string().trim().max(1000).optional(), paths: z.array(z.string().max(300)).min(1).max(5) })
    .safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Upload at least one document.");
  const { supabase, uid } = await session();
  if (!uid) return fail("not_authenticated", "Please sign in.");
  const { error } = await supabase.rpc("submit_verification_request", {
    p_kind: parsed.data.kind,
    p_note: parsed.data.note ?? "",
    p_document_paths: parsed.data.paths,
  });
  if (error) return fromDbError(error, "We couldn't submit your request.");
  revalidatePath("/dashboard/verification");
  return ok(undefined, "Submitted. We'll notify you when an administrator has reviewed your documents.");
}
