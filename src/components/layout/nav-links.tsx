"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/buy", label: "Buy" },
  { href: "/swap", label: "Swap" },
  { href: "/shops", label: "Shops" },
  { href: "/sell", label: "Sell" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground",
              active && "text-accent hover:text-accent",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
