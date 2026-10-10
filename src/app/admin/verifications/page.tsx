import { CheckCircle2 } from "lucide-react";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { VerificationButtons } from "@/components/admin/admin-buttons";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";

export default async function AdminVerificationsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verification_requests")
    .select("id, kind, submitted_note, document_paths, created_at, user:profiles!verification_requests_user_id_fkey(username, full_name, created_at), business:business_profiles!verification_requests_business_profile_id_fkey(business_name, slug, city)")
    .eq("status", "pending")
    .order("created_at")
    .limit(50);

  return (
    <>
      <PageHeader title="Verification requests" description="Administrators only. You cannot review your own request." />
      {error ? <Alert tone="danger">Could not load requests.</Alert> : null}
      {!error && !data?.length ? <EmptyState icon={CheckCircle2} title="No pending requests" /> : null}
      <ul className="space-y-4">
        {(data ?? []).map((r) => (
          <li key={r.id} className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{r.kind === "business" ? "Business" : "Individual"}</Badge>
              <span className="font-medium">
                {r.user?.full_name} (@{r.user?.username})
              </span>
              <span className="text-xs text-muted">submitted {formatDateTime(r.created_at)}</span>
            </div>
            {r.business ? (
              <p>
                Business: {r.business.business_name} · /shop/{r.business.slug} · {r.business.city}
              </p>
            ) : null}
            {r.submitted_note ? <p className="rounded-lg bg-surface-2 px-3 py-2">{r.submitted_note}</p> : null}
            <VerificationButtons requestId={r.id} paths={r.document_paths} />
          </li>
        ))}
      </ul>
    </>
  );
}
