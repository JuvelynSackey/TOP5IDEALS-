import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export interface Viewer {
  id: string;
  email: string | null;
  profile: Tables<"profiles">;
  isStaff: boolean;
  isAdmin: boolean;
  isActive: boolean;
  profileComplete: boolean;
}

/**
 * The signed-in user for this request, derived from the verified JWT
 * (getClaims validates the signature) — never from client-supplied ids.
 * Memoised per request with React cache().
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", sub).maybeSingle();
  if (!profile) return null;
  const isActive = profile.account_status === "active";
  return {
    id: sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    profile,
    isActive,
    isStaff: isActive && (profile.role === "moderator" || profile.role === "admin"),
    isAdmin: isActive && profile.role === "admin",
    profileComplete: profile.profile_completed_at !== null,
  };
});

export async function requireViewer(next = "/dashboard"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function requireCompleteProfile(next = "/dashboard"): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (!viewer.profileComplete) redirect(`/dashboard/profile?setup=1&next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function requireStaff(): Promise<Viewer> {
  const viewer = await requireViewer("/admin");
  if (!viewer.isStaff) redirect("/dashboard?denied=admin");
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireStaff();
  if (!viewer.isAdmin) redirect("/admin?denied=admin");
  return viewer;
}
