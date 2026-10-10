import Image from "next/image";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { CONDITION_LABEL, formatStorage, type ListingCondition } from "@/lib/catalog";
import { formatCedis } from "@/lib/money";
import { listingImageUrl } from "@/lib/storage";
import { listingPath } from "@/lib/slug";

export function PhoneTile({
  snapshot,
  caption,
}: {
  snapshot: { title: string; slug?: string; slug_key?: string; image_path?: string | null; price_minor?: number | null; storage_gb?: number | null; condition?: string | null };
  caption: string;
}) {
  const url = listingImageUrl(snapshot.image_path ?? null);
  const body = (
    <>
      <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
        {url ? <Image src={url} alt="" fill sizes="64px" className="object-cover" unoptimized /> : <Smartphone className="size-5 text-muted" aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-wide text-muted">{caption}</span>
        <span className="block truncate font-medium">{snapshot.title}</span>
        <span className="block text-xs text-muted">
          {[snapshot.storage_gb ? formatStorage(snapshot.storage_gb) : null, snapshot.condition ? CONDITION_LABEL[snapshot.condition as ListingCondition] : null, snapshot.price_minor ? `listed at ${formatCedis(snapshot.price_minor)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </>
  );
  return snapshot.slug && snapshot.slug_key ? (
    <Link href={listingPath(snapshot.slug, snapshot.slug_key)} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-border-strong">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">{body}</div>
  );
}
