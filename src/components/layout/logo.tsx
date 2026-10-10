import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" className="fill-foreground" />
      <rect x="10.5" y="6.5" width="11" height="19" rx="2.5" className="fill-none stroke-background" strokeWidth="2" />
      <path d="M8 13.5h6.5M17.5 18.5H24" className="stroke-accent" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m12 11.5 2.5 2-2.5 2M20 16.5l-2.5 2 2.5 2" className="fill-none stroke-accent" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 rounded-md font-display text-[15px] font-bold tracking-tight", className)} aria-label="Top5Ideals home">
      <LogoMark />
      <span>
        TOP5<span className="text-accent">IDEALS</span>
      </span>
    </Link>
  );
}
