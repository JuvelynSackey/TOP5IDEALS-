import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SellWizard, type ExistingListing, type WizardValues } from "@/components/sell/sell-wizard";
import { PageHeader } from "@/components/ui/display";
import type { DeviceCheckValue } from "@/lib/catalog";
import { minorToCedisInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { requireCompleteProfile } from "@/server/auth";
import { getCatalogue } from "@/server/queries";

export const metadata: Metadata = { title: "Sell or swap your phone", robots: { index: false } };

export default async function SellPage({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  const { listing: listingParam } = await searchParams;
  const viewer = await requireCompleteProfile(listingParam ? `/sell?listing=${listingParam}` : "/sell");
  const catalogue = await getCatalogue();
  let existing: ExistingListing | null = null;

  if (listingParam) {
    const id = z.uuid().safeParse(listingParam);
    if (!id.success) notFound();
    const supabase = await createClient();
    const { data: l } = await supabase
      .from("listings")
      .select("*, listing_images(id, storage_path, is_primary, position), listing_swap_brands(brand_id)")
      .eq("id", id.data)
      .eq("seller_id", viewer.id)
      .maybeSingle();
    if (!l) notFound();
    const values: WizardValues = {
      phone: {
        brandId: String(l.brand_id),
        modelId: l.model_id ? String(l.model_id) : "",
        customModel: l.custom_model ?? "",
        variant: l.variant ?? "",
        storageGb: l.storage_gb ? String(l.storage_gb) : "",
        ramGb: l.ram_gb ? String(l.ram_gb) : "",
        color: l.color ?? "",
      },
      condition: {
        condition: l.condition ?? "",
        batteryHealthStatus: l.battery_health_status,
        batteryHealth: l.battery_health ? String(l.battery_health) : "",
        deviceChecks: (l.device_checks ?? {}) as Record<string, DeviceCheckValue>,
        networkLock: l.network_lock,
        accessories: l.accessories,
        defects: l.defects ?? "",
        warrantyDetails: l.warranty_details ?? "",
      },
      pricing: {
        price: minorToCedisInput(l.price_minor),
        isNegotiable: l.is_negotiable,
        availableForSale: l.available_for_sale,
        openToSwap: l.open_to_swap,
        swapBrandIds: l.listing_swap_brands.map((b) => b.brand_id),
        swapNotes: l.swap_notes ?? "",
        swapMaxCash: minorToCedisInput(l.swap_max_cash_minor),
      },
      location: { regionId: l.region_id ? String(l.region_id) : "", city: l.city ?? "", area: l.area ?? "" },
      details: { title: l.status === "draft" && l.title === "" ? "" : l.title, description: l.description },
    };
    existing = {
      id: l.id,
      updatedAt: l.updated_at,
      status: l.status,
      moderationStatus: l.moderation_status,
      images: l.listing_images
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ id: i.id, storagePath: i.storage_path, isPrimary: i.is_primary })),
      values,
    };
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <PageHeader
        title={existing ? (existing.status === "draft" ? "Continue your listing" : "Edit listing") : "Sell or swap your phone"}
        description="Six short steps. Your progress is saved as you go."
        className="mx-auto max-w-3xl"
      />
      <SellWizard
        catalogue={{
          brands: catalogue.brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
          models: catalogue.models.map((m) => ({
            id: m.id,
            brand_id: m.brand_id,
            name: m.name,
            storage_options_gb: m.storage_options_gb,
            ram_options_gb: m.ram_options_gb,
            battery_health_supported: m.battery_health_supported,
          })),
          regions: catalogue.regions.map((r) => ({ id: r.id, name: r.name })),
        }}
        userId={viewer.id}
        existing={existing}
        defaultLocation={{ regionId: viewer.profile.region_id ? String(viewer.profile.region_id) : "", city: viewer.profile.city ?? "" }}
      />
    </div>
  );
}

