"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/transactions", label: "Disputes" },
  { href: "/admin/swaps", label: "Swap monitor" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/featured", label: "Featured" },
  { href: "/admin/users", label: "Users", adminOnly: false },
  { href: "/admin/verifications", label: "Verifications", adminOnly: true },
  { href: "/admin/brands", label: "Brands", adminOnly: true },
  { href: "/admin/models", label: "Models", adminOnly: true },
  { href: "/admin/settings", label: "Settings", adminOnly: true },
];

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="scrollbar-none -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.filter((i) => isAdmin || !i.adminOnly).map((i) => {
          const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
          return (
            <li key={i.href} className="shrink-0">
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn("block rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground", active && "bg-accent-soft text-accent")}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
