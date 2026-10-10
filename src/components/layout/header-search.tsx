"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function HeaderSearch({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  return (
    <form
      role="search"
      className={cn("relative w-full max-w-md", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/buy?q=${encodeURIComponent(q)}` : "/buy");
      }}
    >
      <label htmlFor="header-search" className="sr-only">
        Search phones
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        id="header-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search iPhone 14, Galaxy S23, Kumasi…"
        autoFocus={autoFocus}
        maxLength={120}
        enterKeyHint="search"
        className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-ring"
      />
    </form>
  );
}
