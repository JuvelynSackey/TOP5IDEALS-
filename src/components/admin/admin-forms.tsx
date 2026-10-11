"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form-controls";
import { Switch } from "@/components/ui/primitives";
import { addFeaturedAction, saveBrandAction, saveModelAction, updateSettingAction } from "@/app/actions/admin";
import type { ActionResult } from "@/lib/errors";

function useSubmit() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "Saved");
        onOk?.();
        router.refresh();
      }
    });
  return { pending, run };
}

export function AddFeaturedForm() {
  const { pending, run } = useSubmit();
  const [key, setKey] = useState("");
  const [days, setDays] = useState("7");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addFeaturedAction({ listingKey: key, days }), () => setKey(""));
      }}
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="feature-key">Listing URL or key</Label>
        <Input id="feature-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="/phones/iphone-14-pro-256gb-accra-k3f9a2x1" />
      </div>
      <div className="space-y-1.5 sm:w-32">
        <Label htmlFor="feature-days">Days</Label>
        <Input id="feature-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      </div>
      <Button type="submit" loading={pending} disabled={!key}>
        Feature
      </Button>
    </form>
  );
}

export function BrandForm({ brand }: { brand?: { id: number; name: string; slug: string; sort_order: number; is_active: boolean } }) {
  const { pending, run } = useSubmit();
  const [v, setV] = useState({ name: brand?.name ?? "", slug: brand?.slug ?? "", sortOrder: String(brand?.sort_order ?? 100), isActive: brand?.is_active ?? true });
  const id = brand ? `brand-${brand.id}` : "brand-new";
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveBrandAction({ id: brand?.id, ...v }), () => !brand && setV({ name: "", slug: "", sortOrder: "100", isActive: true }));
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`${id}-name`} className="text-xs">Name</Label>
        <Input id={`${id}-name`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-slug`} className="text-xs">Slug</Label>
        <Input id={`${id}-slug`} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-sort`} className="text-xs">Order</Label>
        <Input id={`${id}-sort`} inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: e.target.value })} />
      </div>
      <label className="flex h-11 items-center gap-2 text-xs">
        <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} aria-label="Active" /> Active
      </label>
      <Button type="submit" size="md" variant={brand ? "outline" : "primary"} loading={pending}>
        {brand ? "Save" : "Add brand"}
      </Button>
    </form>
  );
}

export function ModelForm({
  brands,
  model,
}: {
  brands: { id: number; name: string }[];
  model?: { id: number; brand_id: number; name: string; slug: string; release_year: number | null; storage_options_gb: number[]; ram_options_gb: number[]; battery_health_supported: boolean; is_active: boolean };
}) {
  const { pending, run } = useSubmit();
  const blank = { brandId: String(brands[0]?.id ?? ""), name: "", slug: "", releaseYear: "", storage: "", ram: "", batteryHealthSupported: false, isActive: true };
  const [v, setV] = useState(
    model
      ? {
          brandId: String(model.brand_id),
          name: model.name,
          slug: model.slug,
          releaseYear: model.release_year ? String(model.release_year) : "",
          storage: model.storage_options_gb.join(", "),
          ram: model.ram_options_gb.join(", "),
          batteryHealthSupported: model.battery_health_supported,
          isActive: model.is_active,
        }
      : blank,
  );
  const id = model ? `model-${model.id}` : "model-new";
  return (
    <form
      className="grid gap-2 sm:grid-cols-3 lg:grid-cols-[120px_1fr_1fr_80px_1fr_80px_auto_auto] lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveModelAction({ id: model?.id, ...v }), () => !model && setV(blank));
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`${id}-brand`} className="text-xs">Brand</Label>
        <Select id={`${id}-brand`} value={v.brandId} onChange={(e) => setV({ ...v, brandId: e.target.value })} disabled={Boolean(model)}>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-name`} className="text-xs">Name</Label>
        <Input id={`${id}-name`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-slug`} className="text-xs">Slug</Label>
        <Input id={`${id}-slug`} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-year`} className="text-xs">Year</Label>
        <Input id={`${id}-year`} inputMode="numeric" value={v.releaseYear} onChange={(e) => setV({ ...v, releaseYear: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-storage`} className="text-xs">Storage GB (comma separated)</Label>
        <Input id={`${id}-storage`} value={v.storage} onChange={(e) => setV({ ...v, storage: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-ram`} className="text-xs">RAM GB</Label>
        <Input id={`${id}-ram`} value={v.ram} onChange={(e) => setV({ ...v, ram: e.target.value })} />
      </div>
      <div className="flex h-11 items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <Switch checked={v.batteryHealthSupported} onCheckedChange={(c) => setV({ ...v, batteryHealthSupported: c })} aria-label="Shows battery health" /> Battery %
        </label>
        <label className="flex items-center gap-1.5">
          <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} aria-label="Active" /> Active
        </label>
      </div>
      <Button type="submit" variant={model ? "outline" : "primary"} loading={pending}>
        {model ? "Save" : "Add model"}
      </Button>
    </form>
  );
}

export function SettingRow({ settingKey, description, value }: { settingKey: string; description: string; value: boolean | number | string }) {
  const { pending, run } = useSubmit();
  const [v, setV] = useState(String(value));
  const isBool = typeof value === "boolean";
  const isText = typeof value === "string";
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-sm font-medium">{settingKey}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {isBool ? (
          <Switch checked={v === "true"} onCheckedChange={(c) => setV(String(c))} aria-label={settingKey} />
        ) : isText ? (
          <Input className="w-full sm:w-80" value={v} onChange={(e) => setV(e.target.value)} aria-label={settingKey} />
        ) : (
          <Input className="w-24" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} aria-label={settingKey} />
        )}
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          onClick={() => run(() => updateSettingAction(settingKey, isBool ? v === "true" : isText ? v.trim() : Number(v)))}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
