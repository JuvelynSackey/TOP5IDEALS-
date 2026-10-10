import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Store } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { Input } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { logoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Phone shops in Ghana",
  description: "Browse phone shops and dealers on Top5Ideals. Verified shops have had their business documents checked.",
  alternates: { canonical: "/shops" },
};

const PER_PAGE = 24;

export default async function ShopsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; verified?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Math.min(200, Number(params.page) || 1));
  const supabase = await createClient();
  let query = supabase
    .from("business_profiles")
    .select("id, business_name, slug, logo_path, city, area, description, verification_status, regions(name)", { count: "exact" })
    .order("verification_status", { ascending: false })
    .order("business_name")
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (q) query = query.ilike("business_name", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  if (params.verified === "1") query = query.eq("verification_status", "verified");
  const { data, count, error } = await query;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <PageHeader title="Phone shops" description="Dealers and shops selling on Top5Ideals. Look for the verified badge." />
      <form className="mb-6 flex max-w-lg gap-2" role="search">
        <label htmlFor="shop-q" className="sr-only">
          Search shops
        </label>
        <Input id="shop-q" name="q" defaultValue={q} placeholder="Search shop name…" type="search" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {error ? <p className="text-sm text-danger">We couldn&apos;t load shops right now.</p> : null}
      {!error && !data?.length ? <EmptyState icon={Store} title="No shops found" description={q ? "Try a different name." : "Phone businesses can create a storefront from their dashboard."} /> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((s) => (
          <li key={s.id}>
            <Link href={`/shop/${s.slug}`} className="flex h-full gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent">
              <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                {s.logo_path ? <Image src={logoUrl(s.logo_path)!} alt="" fill sizes="56px" className="object-cover" /> : <Store className="size-5 text-muted" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-medium">
                  <span className="truncate">{s.business_name}</span>
                  {s.verification_status === "verified" ? <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Verified business" /> : null}
                </span>
                <span className="block truncate text-xs text-muted">{[s.area, s.city, s.regions?.name].filter(Boolean).join(", ")}</span>
                {s.description ? <span className="mt-1 line-clamp-2 block text-sm text-muted">{s.description}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / PER_PAGE))} basePath="/shops" params={{ q: q || undefined, verified: params.verified }} />
    </div>
  );
}
