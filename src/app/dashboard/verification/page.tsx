import { BadgeCheck, Clock } from "lucide-react";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/display";
import { VerificationForm } from "@/components/account/verification-form";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { requireCompleteProfile } from "@/server/auth";

export default async function VerificationPage() {
  const viewer = await requireCompleteProfile("/dashboard/verification");
  const supabase = await createClient();
  const [{ data: requests }, { data: business }] = await Promise.all([
    supabase.from("verification_requests").select("id, kind, status, reviewer_note, created_at, reviewed_at").eq("user_id", viewer.id).order("created_at", { ascending: false }),
    supabase.from("business_profiles").select("id, verification_status").eq("owner_id", viewer.id).maybeSingle(),
  ]);
  const pending = requests?.find((r) => r.status === "pending");
  const verified = viewer.profile.verification_status === "verified";

  return (
    <>
      <PageHeader title="Verification" description="Verified sellers get a badge on their listings and profile." />
      <Alert tone="info" className="mb-6" title="What verification means">
        An administrator has checked your identity (or business) documents. It does not certify any individual phone, and buyers are still advised to inspect before paying. Documents are stored privately and seen only by administrators.
      </Alert>
      {verified ? (
        <Alert tone="success" className="mb-6" title="You're verified">
          <span className="inline-flex items-center gap-1">
            <BadgeCheck className="size-4" aria-hidden="true" /> Since {formatDate(viewer.profile.verified_at)}
            {business?.verification_status === "verified" ? " · business verified" : ""}
          </span>
        </Alert>
      ) : null}
      {pending ? (
        <Alert tone="info" className="mb-6" title="Your request is being reviewed">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden="true" /> Submitted {formatDate(pending.created_at)}. We&apos;ll notify you when it&apos;s reviewed.
          </span>
        </Alert>
      ) : (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{verified ? "Request business verification" : "Request verification"}</CardTitle>
          </CardHeader>
          <CardContent>
            <VerificationForm userId={viewer.id} hasBusiness={Boolean(business)} />
          </CardContent>
        </Card>
      )}
      {requests?.length ? (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="mb-3 text-lg font-semibold">
            History
          </h2>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "info"}>{r.status}</Badge>
                  <span>{r.kind === "business" ? "Business" : "Identity"}</span>
                  <span className="text-xs text-muted">{formatDate(r.created_at)}</span>
                </div>
                {r.reviewer_note ? <p className="mt-1 text-muted">Reviewer note: {r.reviewer_note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
