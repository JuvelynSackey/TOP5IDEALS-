import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { formatCedis } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

const STATUS: Record<string, { label: string; tone: "info" | "success" | "warning" | "neutral" }> = {
  active: { label: "In progress", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  disputed: { label: "Under review", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default async function TransactionsPage() {
  const viewer = await requireViewer("/dashboard/transactions");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, transaction_type, status, cash_amount_minor, cash_payer, terms_snapshot, accepted_at, completed_at, buyer_id, seller_id, transaction_confirmations(user_id)")
    .or(`buyer_id.eq.${viewer.id},seller_id.eq.${viewer.id}`)
    .order("updated_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader title="Transactions" description="Accepted offers become exchanges. Both of you confirm when the exchange has happened." />
      {error ? <Alert tone="danger">We couldn&apos;t load your transactions. Refresh to try again.</Alert> : null}
      {!error && !data?.length ? (
        <EmptyState
          icon={Wallet}
          title="No exchanges yet"
          description="When an offer is accepted, the exchange appears here so you can track and confirm it."
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard/offers">View offers</Link>
            </Button>
          }
        />
      ) : null}
      <ul className="space-y-3">
        {(data ?? []).map((t) => {
          const snapshot = t.terms_snapshot as { target?: { title?: string } };
          const confirmedByMe = t.transaction_confirmations.some((c) => c.user_id === viewer.id);
          const s = STATUS[t.status]!;
          return (
            <li key={t.id}>
              <Link href={`/dashboard/transactions/${t.id}`} className="block rounded-xl border border-border bg-surface p-4 hover:border-border-strong">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <span className="text-xs text-muted">
                    {t.transaction_type === "swap" ? "Swap" : "Purchase"} · {t.seller_id === viewer.id ? "You're the seller" : "You're the buyer"} · accepted {formatDate(t.accepted_at)}
                  </span>
                </div>
                <p className="mt-2 font-medium">{snapshot.target?.title ?? "Phone"}</p>
                <p className="tabular text-sm text-muted">
                  {t.cash_payer === "none" ? "Straight swap" : `${formatCedis(Number(t.cash_amount_minor))} cash`}
                  {t.status === "active" ? (confirmedByMe ? " · You confirmed — waiting for the other party" : " · Waiting for your confirmation") : ""}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
