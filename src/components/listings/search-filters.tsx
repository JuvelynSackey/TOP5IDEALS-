"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form-controls";
import { Checkbox } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CONDITIONS, RAM_CHOICES, STORAGE_CHOICES, formatStorage } from "@/lib/catalog";

interface Option {
  id: number;
  name: string;
  slug: string;
}
interface ModelOption {
  id: number;
  name: string;
  brand_id: number;
}

const FILTER_KEYS = ["q", "brand", "model", "min", "max", "storage", "ram", "condition", "battery", "region", "city", "seller", "swap", "verified"];

export function SearchFilters({
  brands,
  models,
  regions,
  lockSwap = false,
}: {
  brands: Option[];
  models: ModelOption[];
  regions: Option[];
  lockSwap?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""])),
  );

  const brandId = brands.find((b) => b.slug === values.brand)?.id;
  const brandModels = useMemo(() => (brandId ? models.filter((m) => m.brand_id === brandId) : []), [brandId, models]);
  const activeCount = FILTER_KEYS.filter((k) => k !== "q" && params.get(k)).length;

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value, ...(key === "brand" ? { model: "" } : {}) }));
  }

  function apply(next: Record<string, string> = values) {
    const sp = new URLSearchParams();
    for (const key of FILTER_KEYS) if (next[key]) sp.set(key, next[key]!);
    const sort = params.get("sort");
    if (sort) sp.set("sort", sort);
    if (lockSwap) sp.delete("swap");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
    setOpen(false);
  }

  function clear() {
    const cleared = Object.fromEntries(FILTER_KEYS.map((k) => [k, k === "q" ? values.q ?? "" : ""]));
    setValues(cleared);
    apply(cleared);
  }

  const form = (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="f-q">Keywords</Label>
        <Input id="f-q" type="search" value={values.q} onChange={(e) => set("q", e.target.value)} placeholder="Model, storage, colour…" maxLength={120} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-brand">Brand</Label>
          <Select id="f-brand" value={values.brand} onChange={(e) => set("brand", e.target.value)}>
            <option value="">Any brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-model">Model</Label>
          <Select id="f-model" value={values.model} onChange={(e) => set("model", e.target.value)} disabled={!brandModels.length}>
            <option value="">{brandModels.length ? "Any model" : "Choose a brand"}</option>
            {brandModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Price (GH₵)</legend>
        <div className="grid grid-cols-2 gap-3">
          <Input aria-label="Minimum price in cedis" inputMode="numeric" placeholder="Min" value={values.min} onChange={(e) => set("min", e.target.value.replace(/[^\d]/g, ""))} />
          <Input aria-label="Maximum price in cedis" inputMode="numeric" placeholder="Max" value={values.max} onChange={(e) => set("max", e.target.value.replace(/[^\d]/g, ""))} />
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-storage">Storage</Label>
          <Select id="f-storage" value={values.storage} onChange={(e) => set("storage", e.target.value)}>
            <option value="">Any</option>
            {STORAGE_CHOICES.map((s) => (
              <option key={s} value={s}>
                {formatStorage(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-ram">RAM</Label>
          <Select id="f-ram" value={values.ram} onChange={(e) => set("ram", e.target.value)}>
            <option value="">Any</option>
            {RAM_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s}GB
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-condition">Condition</Label>
          <Select id="f-condition" value={values.condition} onChange={(e) => set("condition", e.target.value)}>
            <option value="">Any</option>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-battery">Battery health</Label>
          <Select id="f-battery" value={values.battery} onChange={(e) => set("battery", e.target.value)}>
            <option value="">Any</option>
            {[95, 90, 85, 80].map((b) => (
              <option key={b} value={b}>
                {b}%+ (reported)
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-region">Region</Label>
          <Select id="f-region" value={values.region} onChange={(e) => set("region", e.target.value)}>
            <option value="">All of Ghana</option>
            {regions.map((r) => (
              <option key={r.id} value={r.slug}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-city">City / area</Label>
          <Input id="f-city" value={values.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Kumasi" maxLength={80} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-seller">Seller type</Label>
        <Select id="f-seller" value={values.seller} onChange={(e) => set("seller", e.target.value)}>
          <option value="">Anyone</option>
          <option value="individual">Individuals</option>
          <option value="business">Phone shops</option>
        </Select>
      </div>
      <div className="space-y-3">
        {!lockSwap ? (
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={values.swap === "1"} onCheckedChange={(v) => set("swap", v === true ? "1" : "")} />
            Open to swaps
          </label>
        ) : null}
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox checked={values.verified === "1"} onCheckedChange={(v) => set("verified", v === true ? "1" : "")} />
          Verified sellers only
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" loading={pending}>
          Show results
        </Button>
        <Button type="button" variant="ghost" onClick={clear}>
          Clear
        </Button>
      </div>
    </form>
  );

  return (
    <>
      <div className="lg:hidden">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <SlidersHorizontal aria-hidden="true" /> Filters{activeCount ? ` (${activeCount})` : ""}
            </Button>
          </DialogTrigger>
          <DialogContent side="bottom">
            <DialogTitle className="mb-4">Filter phones</DialogTitle>
            {form}
          </DialogContent>
        </Dialog>
      </div>
      <aside className="hidden lg:block" aria-label="Filters">
        <div className="sticky top-20 rounded-xl border border-border bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Filters</h2>
            {activeCount ? (
              <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
                <X className="size-3" aria-hidden="true" /> Clear all
              </button>
            ) : null}
          </div>
          {form}
        </div>
      </aside>
    </>
  );
}

export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="sort" className="shrink-0 text-xs text-muted">
        Sort
      </Label>
      <Select
        id="sort"
        className="h-9 w-auto min-w-40 text-sm"
        value={params.get("sort") ?? "recommended"}
        onChange={(e) => {
          const sp = new URLSearchParams(params.toString());
          sp.set("sort", e.target.value);
          sp.delete("page");
          router.push(`${pathname}?${sp.toString()}`);
        }}
      >
        <option value="recommended">Recommended</option>
        <option value="newest">Newest</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
      </Select>
    </div>
  );
}
