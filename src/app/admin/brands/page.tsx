import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/display";
import { BrandForm } from "@/components/admin/admin-forms";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";

export default async function AdminBrandsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("*").order("sort_order");
  return (
    <>
      <PageHeader title="Brands" description="Deactivate a brand instead of deleting it — existing listings keep their reference." />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add a brand</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandForm />
        </CardContent>
      </Card>
      <ul className="space-y-2">
        {(data ?? []).map((b) => (
          <li key={b.id} className="rounded-xl border border-border bg-surface p-3">
            <BrandForm brand={b} />
          </li>
        ))}
      </ul>
    </>
  );
}
