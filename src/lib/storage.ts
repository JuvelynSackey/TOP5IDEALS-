export type PublicBucket = "avatars" | "business-logos";

/** Public CDN URL for a file in a public bucket (safe on server and client). */
export function publicStorageUrl(bucket: PublicBucket, path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${encoded}`;
}

/**
 * Listing photos live in a PRIVATE bucket and are served through the app route
 * /media/listings/<path> (see src/app/media/listings/[...path]/route.ts).
 * Photos that may not be public (drafts, dashboards, admin, offer history) must
 * be rendered with next/image `unoptimized`, because the optimiser does not
 * forward the visitor's cookies.
 */
export function listingImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `/media/listings/${path.split("/").map(encodeURIComponent).join("/")}`;
}
export const avatarUrl = (path: string | null | undefined) => publicStorageUrl("avatars", path);
export const logoUrl = (path: string | null | undefined) => publicStorageUrl("business-logos", path);

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
