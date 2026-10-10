import Image from "next/image";
import { cn } from "@/lib/utils";

export function Avatar({ src, name, size = 40, className }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-medium text-muted", className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
    >
      {src ? <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" /> : <span aria-hidden="true">{initials || "?"}</span>}
    </span>
  );
}
