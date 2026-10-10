import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/display";
import { ModelForm } from "@/components/admin/admin-forms";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { cn } from "@/lib/utils";

export default async function AdminModelsPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  await requireAdmin();
  const { brand } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name, slug").order("sort_order");
  const active = brands?.find((b) => b.slug === brand) ?? brands?.[0];
  const { data: models } = active
    ? await supabase.from("phone_models").select("*").eq("brand_id", active.id).order("release_year", { ascending: false, nullsFirst: false }).order("name")
    : { data: [] };

  return (
    <>
      <PageHeader title="Phone models" description="The catalogue drives the sell wizard and search filters. Seeds are idempotent — see docs/DEPLOYMENT.md." />
      <nav aria-label="Brands" className="scrollbar-none mb-4 flex gap-1 overflow-x-auto">
        {(brands ?? []).map((b) => (
          <Link key={b.id} href={`/admin/models?brand=${b.slug}`} className={cn("shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium", b.id === active?.id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted")}>
            {b.name}
          </Link>
        ))}
      </nav>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add a model</CardTitle>
        </CardHeader>
        <CardContent>
          <ModelForm brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} />
        </CardContent>
      </Card>
      <ul className="space-y-2">
        {(models ?? []).map((m) => (
          <li key={m.id} className="rounded-xl border border-border bg-surface p-3">
            <ModelForm brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} model={m} />
          </li>
        ))}
      </ul>
    </>
  );
}
