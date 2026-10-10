"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prominent search with native suggestions (brands, models, regions). */
export function HeroSearch({ suggestions }: { suggestions: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const value = q.trim();
        router.push(value ? `/buy?q=${encodeURIComponent(value)}` : "/buy");
      }}
      className="flex w-full max-w-2xl items-center gap-2 rounded-xl border border-border-strong bg-surface p-1.5 shadow-soft focus-within:border-accent"
    >
      <label htmlFor="hero-search" className="sr-only">
        Search by brand, model, storage or location
      </label>
      <Search className="ml-2 size-5 shrink-0 text-muted" aria-hidden="true" />
      <input
        id="hero-search"
        type="search"
        list="hero-search-suggestions"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="iPhone 14 Pro 256GB, Galaxy S23, Kumasi…"
        maxLength={120}
        enterKeyHint="search"
        className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
      />
      <datalist id="hero-search-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <Button type="submit" className="shrink-0">
        Search
      </Button>
    </form>
  );
}
