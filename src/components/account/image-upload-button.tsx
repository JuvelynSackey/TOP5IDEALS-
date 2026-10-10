"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/client";
import { processImage, randomFileName } from "@/lib/image-processing";

/** Uploads one image to `<bucket>/<uid>/<random>` and reports the path. */
export function ImageUploadButton({
  bucket,
  userId,
  label,
  onUploaded,
  maxSide = 600,
}: {
  bucket: "avatars" | "business-logos";
  userId: string;
  label: string;
  onUploaded: (path: string) => Promise<void> | void;
  maxSide?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const processed = await processImage(file, maxSide);
      const path = `${userId}/${randomFileName(processed.extension)}`;
      const { error } = await getBrowserClient().storage.from(bucket).upload(path, processed.blob, { contentType: processed.contentType, upsert: false });
      if (error) throw new Error(error.message);
      await onUploaded(path);
    } catch (error) {
      toast.error((error as Error).message || "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} loading={busy}>
        {busy ? null : <Upload aria-hidden="true" />} {label}
      </Button>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void handle(e.target.files?.[0])} />
    </>
  );
}
