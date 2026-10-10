import { createClient as createAnonymousClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Serves listing photos from the PRIVATE listing-images bucket. The file is
 * downloaded as the visitor, so the storage read rule (migration 1100) decides
 * access: anyone for public listings; owner, staff and offer parties otherwise.
 * Public photos are cacheable; everything else is private and never cached.
 */
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp)$/;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

function imageResponse(blob: Blob, cacheControl: string) {
  const type = TYPES.has(blob.type) ? blob.type : "application/octet-stream";
  return new Response(blob, {
    headers: {
      "Content-Type": type,
      "Cache-Control": cacheControl,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(_request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const name = (await ctx.params).path.join("/");
  if (!PATH.test(name)) return notFound();

  // 1. Anonymous read: succeeds only for photos of public listings.
  const { supabaseUrl, supabaseKey } = getPublicEnv();
  const anonymous = createAnonymousClient<Database>(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const publicRead = await anonymous.storage.from("listing-images").download(name);
  if (publicRead.data) {
    // Short shared-cache lifetime so takedowns propagate within minutes.
    return imageResponse(publicRead.data, "public, max-age=300, s-maxage=600, stale-while-revalidate=60");
  }

  // 2. Read as the signed-in visitor (owner, staff, offer parties).
  const supabase = await createClient();
  const privateRead = await supabase.storage.from("listing-images").download(name);
  if (privateRead.data) return imageResponse(privateRead.data, "private, no-store");

  if (privateRead.error && !/not found|object not found|400|404/i.test(privateRead.error.message)) {
    logger.warn("media.listing_image_failed", { message: privateRead.error.message });
  }
  return notFound();
}
