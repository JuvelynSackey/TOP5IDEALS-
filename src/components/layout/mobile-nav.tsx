"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, Repeat, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/buy", label: "Buy", icon: Search, match: (p: string) => p.startsWith("/buy") || p.startsWith("/phones") },
  { href: "/sell", label: "Sell", icon: PlusCircle, match: (p: string) => p.startsWith("/sell") },
  { href: "/swap", label: "Swap", icon: Repeat, match: (p: string) => p.startsWith("/swap") },
  { href: "/dashboard", label: "Profile", icon: User, match: (p: string) => p.startsWith("/dashboard") },
];

/** Bottom navigation on phones. Hidden on listing pages, which have their own action bar. */
export function MobileNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/phones/") || pathname.startsWith("/dashboard/messages/")) return null;
  return (
    <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted",
                  active && "text-accent",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
