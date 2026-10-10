import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/auth";
import { logger } from "@/lib/logger";

const TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Token-hash confirmation endpoint (works across devices, unlike PKCE).
 * Configure the Supabase email templates to link to
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<path>
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const fallbackNext = type === "recovery" ? "/auth/reset-password" : "/dashboard/profile?setup=1";
  const next = safeNextPath(url.searchParams.get("next"), fallbackNext);
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    logger.warn("auth.confirm_failed", { status: error.status, code: error.code });
  }
  return NextResponse.redirect(new URL("/auth/login?error=link_invalid", url.origin));
}
