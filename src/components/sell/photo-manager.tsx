"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, RotateCcw, Star, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/client";
import { processImage, randomFileName, type ProcessedImage } from "@/lib/image-processing";
import { listingImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { addListingImageAction, removeListingImageAction, reorderImagesAction, setPrimaryImageAction } from "@/app/actions/listings";

export interface SavedImage {
  id: string;
  storagePath: string;
  isPrimary: boolean;
}

interface PendingUpload {
  key: string;
  name: string;
  stage: "processing" | "uploading" | "saving" | "failed";
  error?: string;
  processed?: ProcessedImage;
  path?: string;
  previewUrl?: string;
}

const MAX_IMAGES = 10;

export function PhotoManager({
  listingId,
  userId,
  images,
  onChange,
  disabled,
}: {
  listingId: string;
  userId: string;
  images: SavedImage[];
  onChange: (images: SavedImage[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [busy, setBusy] = useState(false);
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const update = (key: string, patch: Partial<PendingUpload>) => setPending((p) => p.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  async function uploadOne(upload: PendingUpload, file?: File) {
    let processed = upload.processed;
    try {
      if (!processed) {
        if (!file) throw new Error("Choose the photo again.");
        update(upload.key, { stage: "processing", error: undefined });
        processed = await processImage(file);
        update(upload.key, { processed, previewUrl: URL.createObjectURL(processed.blob) });
      }
      const path = upload.path ?? `${userId}/${listingId}/${randomFileName(processed.extension)}`;
      update(upload.key, { stage: "uploading", path, error: undefined });
      const { error: uploadError } = await getBrowserClient()
        .storage.from("listing-images")
        .upload(path, processed.blob, { contentType: processed.contentType, upsert: false, cacheControl: "31536000" });
      // "Duplicate" means a previous attempt uploaded the file before failing to link it.
      if (uploadError && !/exists|duplicate/i.test(uploadError.message)) throw new Error(uploadError.message || "Upload failed.");
      update(upload.key, { stage: "saving" });
      const result = await addListingImageAction(listingId, path, processed.width, processed.height);
      if (!result.ok) throw new Error(result.error);
      onChange([...imagesRef.current, { id: result.data.id, storagePath: result.data.storagePath, isPrimary: result.data.isPrimary }]);
      setPending((p) => p.filter((u) => u.key !== upload.key));
    } catch (error) {
      update(upload.key, { stage: "failed", error: (error as Error).message || "Upload failed. Check your connection and retry." });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length - pending.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > list.length) toast.warning(`You can add up to ${MAX_IMAGES} photos.`);
    const uploads = list.map((f) => ({ key: crypto.randomUUID(), name: f.name, stage: "processing" as const }));
    setPending((p) => [...p, ...uploads]);
    // Sequential uploads are gentler on slow mobile connections.
    for (let i = 0; i < uploads.length; i++) await uploadOne(uploads[i]!, list[i]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, onSuccess: () => void) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.ok) toast.error(result.error ?? "Something went wrong.");
    else onSuccess();
  }

  const remove = (img: SavedImage) =>
    run(
      async () => {
        const r = await removeListingImageAction(img.id);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      () => {
        const rest = images.filter((i) => i.id !== img.id);
        if (img.isPrimary && rest[0]) rest[0] = { ...rest[0], isPrimary: true };
        onChange(rest);
      },
    );

  const makePrimary = (img: SavedImage) =>
    run(
      async () => {
        const r = await setPrimaryImageAction(img.id);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      () => onChange(images.map((i) => ({ ...i, isPrimary: i.id === img.id }))),
    );

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target]!, next[index]!];
    void run(
      async () => {
        const r = await reorderImagesAction(listingId, next.map((i) => i.id));
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      () => onChange(next),
    );
  };

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Listing photos">
        {images.map((img, i) => (
          <li key={img.id} className={cn("overflow-hidden rounded-xl border bg-surface", img.isPrimary ? "border-accent" : "border-border")}>
            <div className="relative aspect-square bg-surface-2">
              <Image src={listingImageUrl(img.storagePath)!} alt={`Photo ${i + 1}`} fill sizes="(max-width: 640px) 50vw, 200px" className="object-cover" unoptimized />
              {img.isPrimary ? (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                  <Star className="size-3" aria-hidden="true" /> Cover
                </span>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-1 p-1.5">
              <div className="flex">
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={busy || disabled || i === 0} aria-label={`Move photo ${i + 1} earlier`}>
                  <ArrowLeft aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={busy || disabled || i === images.length - 1} aria-label={`Move photo ${i + 1} later`}>
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
              <div className="flex">
                {!img.isPrimary ? (
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => makePrimary(img)} disabled={busy || disabled} aria-label={`Use photo ${i + 1} as cover`}>
                    <Star aria-hidden="true" />
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(img)} disabled={busy || disabled} aria-label={`Remove photo ${i + 1}`}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
          </li>
        ))}
        {pending.map((u) => (
          <li key={u.key} className="overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface">
            <div className="relative flex aspect-square items-center justify-center bg-surface-2">
              {u.previewUrl ? <Image src={u.previewUrl} alt="" fill sizes="200px" className="object-cover opacity-50" unoptimized /> : null}
              <div className="relative z-10 flex flex-col items-center gap-1 px-2 text-center text-xs font-medium" role="status">
                {u.stage === "failed" ? (
                  <>
                    <TriangleAlert className="size-5 text-danger" aria-hidden="true" />
                    <span className="text-danger">{u.error}</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="size-5 animate-spin text-accent" aria-hidden="true" />
                    {u.stage === "processing" ? "Optimising…" : u.stage === "uploading" ? "Uploading…" : "Saving…"}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-1 p-1.5">
              <span className="truncate px-1 text-xs text-muted">{u.name}</span>
              {u.stage === "failed" ? (
                <div className="flex shrink-0">
                  {u.processed ? (
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => void uploadOne(u)} aria-label={`Retry ${u.name}`}>
                      <RotateCcw aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPending((p) => p.filter((x) => x.key !== u.key))} aria-label={`Dismiss ${u.name}`}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
        {images.length + pending.length < MAX_IMAGES ? (
          <li>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong text-sm font-medium text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
            >
              <ImagePlus className="size-6" aria-hidden="true" />
              Add photos
              <span className="text-xs font-normal">{images.length}/{MAX_IMAGES}</span>
            </button>
          </li>
        ) : null}
      </ul>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <p className="text-xs text-muted">
        Clear, well-lit photos of the front, back, sides and screen (switched on) sell faster. Photos are resized and location data is removed before upload.
      </p>
    </div>
  );
}
