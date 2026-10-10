import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/auth";
import { logger } from "@/lib/logger";

/** PKCE callback for email confirmation, magic links and password recovery. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), "/dashboard");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    logger.warn("auth.callback_failed", { status: error.status, code: error.code });
  }
  return NextResponse.redirect(new URL("/auth/login?error=link_invalid", url.origin));
}
