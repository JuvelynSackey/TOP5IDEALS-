"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { forgotPasswordSchema, resetPasswordSchema, safeNextPath, signInSchema, signUpSchema } from "@/lib/validation/auth";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  // Prefer the configured canonical site URL; fall back to the request host.
  return process.env.NEXT_PUBLIC_SITE_URL ? getSiteUrl() : host ? `${proto}://${host}` : getSiteUrl();
}

export async function signUpAction(input: unknown): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", fieldErrors(parsed.error.issues));
  const { email, password, fullName, accountType } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent("/dashboard/profile?setup=1")}`,
      data: { full_name: fullName, account_type: accountType },
    },
  });
  if (error) {
    logger.warn("auth.signup_failed", { status: error.status, code: error.code });
    if (error.code === "weak_password") return fail("weak_password", "Choose a stronger password.");
    if (error.status === 429 || error.code === "over_email_send_rate_limit") return fail("rate_limited", "Too many attempts. Please wait and try again.");
    // Generic message: never reveal whether the email is already registered.
    return fail("signup_failed", "We couldn't create your account. Check your details and try again.");
  }
  return ok({ needsConfirmation: !data.session });
}

export async function signInAction(input: unknown, next?: string): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", fieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return fail("email_not_confirmed", "Confirm your email address first — check your inbox for the link.");
    if (error.status === 429) return fail("rate_limited", "Too many attempts. Please wait a few minutes and try again.");
    return fail("invalid_credentials", "Incorrect email or password.");
  }
  return ok({ redirectTo: safeNextPath(next, "/dashboard") });
}

export async function signOutAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    logger.warn("auth.signout_failed", { status: error.status });
    return fail("signout_failed", "We couldn't sign you out. Please try again.");
  }
  return ok(undefined);
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Enter a valid email address.", fieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
  });
  if (error) logger.warn("auth.reset_request_failed", { status: error.status });
  if (error?.status === 429) return fail("rate_limited", "Too many requests. Please wait and try again.");
  // Same response whether or not the account exists (prevents enumeration).
  return ok(undefined, "If an account exists for that email, we've sent a reset link.");
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("validation_failed", "Please fix the highlighted fields.", fieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("not_authenticated", "Your reset link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return fail("same_password", "Choose a password you haven't used before.");
    if (error.code === "weak_password") return fail("weak_password", "Choose a stronger password.");
    return fail("reset_failed", "We couldn't update your password. Request a new link and try again.");
  }
  return ok(undefined, "Your password has been updated.");
}
