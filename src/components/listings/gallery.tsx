"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

export function Gallery({ images, title, unoptimized = false }: { images: { url: string; id: string }[]; title: string; unoptimized?: boolean }) {
  const [index, setIndex] = useState(0);
  if (!images.length) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl border border-border bg-surface-2">
        <Smartphone className="size-12 text-muted" aria-hidden="true" />
      </div>
    );
  }
  const current = images[index]!;
  const go = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);
  return (
    <div className="space-y-3" role="region" aria-roledescription="carousel" aria-label={`${title} photos`}>
      <div
        className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-2"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(-1);
          if (e.key === "ArrowRight") go(1);
        }}
      >
        <Image src={current.url} alt={`${title} — photo ${index + 1} of ${images.length}`} fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-contain" unoptimized={unoptimized} />
        {images.length > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 shadow-soft hover:bg-background" aria-label="Previous photo">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 shadow-soft hover:bg-background" aria-label="Next photo">
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            <span className="tabular absolute bottom-2 right-2 rounded-md bg-background/85 px-2 py-0.5 text-xs font-medium" aria-live="polite">
              {index + 1} / {images.length}
            </span>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <ul className="scrollbar-none flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={cn("relative block size-16 overflow-hidden rounded-lg border-2 bg-surface-2", i === index ? "border-accent" : "border-transparent opacity-70 hover:opacity-100")}
              >
                <Image src={img.url} alt="" fill sizes="64px" className="object-cover" unoptimized={unoptimized} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
