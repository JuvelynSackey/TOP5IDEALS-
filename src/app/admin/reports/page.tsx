import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { ReportButtons } from "@/components/admin/admin-buttons";
import { REPORT_REASONS } from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "open" } = await searchParams;
  const supabase = await createClient();
  const statuses: ("open" | "reviewing" | "resolved" | "dismissed")[] = status === "closed" ? ["resolved", "dismissed"] : ["open", "reviewing"];
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, target_type, reason, details, evidence, status, resolution_note, created_at, handled_at, listing:listings!reports_listing_id_fkey(title, slug, slug_key), reported:profiles!reports_reported_user_id_fkey(id, username, full_name, account_status), reporter:profiles!reports_reporter_id_fkey(username)",
    )
    .in("status", statuses)
    .order("created_at", { ascending: status !== "closed" })
    .limit(100);

  return (
    <>
      <PageHeader title="Reports" description="Reports are private. Evidence contains only the reported item — never whole conversations." />
      <nav className="mb-4 flex gap-1" aria-label="Report status">
        {[
          ["open", "Open"],
          ["closed", "Closed"],
        ].map(([key, label]) => (
          <Link key={key} href={`/admin/reports?status=${key}`} className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", key === status ? "border-accent bg-accent-soft text-accent" : "border-border text-muted")}>
            {label}
          </Link>
        ))}
      </nav>
      {error ? <Alert tone="danger">Could not load reports.</Alert> : null}
      {!error && !data?.length ? <EmptyState icon={CheckCircle2} title="No reports here" /> : null}
      <ul className="space-y-3">
        {(data ?? []).map((r) => {
          const evidence = (r.evidence ?? {}) as Record<string, unknown>;
          return (
            <li key={r.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.status === "open" ? "warning" : "neutral"}>{r.status}</Badge>
                <Badge>{r.target_type}</Badge>
                <span className="font-medium">{REPORT_REASONS.find((x) => x.value === r.reason)?.label}</span>
                <span className="text-xs text-muted">
                  {formatDateTime(r.created_at)} · by @{r.reporter?.username ?? "deleted"}
                </span>
              </div>
              {r.listing ? (
                <p className="mt-2">
                  Listing:{" "}
                  <Link href={`/phones/${r.listing.slug}-${r.listing.slug_key}`} className="text-accent hover:underline">
                    {r.listing.title}
                  </Link>
                </p>
              ) : null}
              {r.reported ? (
                <p className="mt-1">
                  User: {r.reported.full_name} (@{r.reported.username}) · {r.reported.account_status} ·{" "}
                  <Link href={`/admin/users?q=${r.reported.username ?? ""}`} className="text-accent hover:underline">
                    manage
                  </Link>
                </p>
              ) : null}
              {r.details ? <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2">{r.details}</p> : null}
              {typeof evidence.body === "string" ? <p className="mt-2 rounded-lg border border-border px-3 py-2">Reported message: “{evidence.body}”</p> : null}
              {typeof evidence.comment === "string" ? <p className="mt-2 rounded-lg border border-border px-3 py-2">Reported review: “{evidence.comment}”</p> : null}
              {r.resolution_note ? <p className="mt-2 text-muted">Resolution: {r.resolution_note}</p> : null}
              {r.status === "open" || r.status === "reviewing" ? (
                <div className="mt-3">
                  <ReportButtons reportId={r.id} status={r.status} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
