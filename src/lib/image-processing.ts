"use client";

import { IMAGE_MIME_TYPES } from "@/lib/storage";

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  extension: "webp" | "jpg";
  contentType: "image/webp" | "image/jpeg";
}

const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * Validate and downscale a photo in the browser before upload: longest side
 * ≤ 1600px, re-encoded as WebP (JPEG fallback). This strips metadata such as
 * GPS location and keeps uploads small on mobile data.
 */
export async function processImage(file: File, maxSide = 1600): Promise<ProcessedImage> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type) && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error("Use a JPEG, PNG or WebP photo.");
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error("This photo is larger than 20MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This photo couldn't be read. Try a JPEG or PNG.");
  }
  if (bitmap.width < 300 || bitmap.height < 300) {
    bitmap.close();
    throw new Error("This photo is too small. Use at least 300×300 pixels.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process this photo.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const toBlob = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob("image/webp", 0.82);
  let extension: "webp" | "jpg" = "webp";
  let contentType: "image/webp" | "image/jpeg" = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await toBlob("image/jpeg", 0.85);
    extension = "jpg";
    contentType = "image/jpeg";
  }
  if (!blob) throw new Error("Your browser couldn't process this photo.");
  if (blob.size > 5 * 1024 * 1024) throw new Error("This photo is still too large after compression.");
  return { blob, width, height, extension, contentType };
}

export function randomFileName(extension: string): string {
  return `${crypto.randomUUID().replace(/-/g, "")}.${extension}`;
}
