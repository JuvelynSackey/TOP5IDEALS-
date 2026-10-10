import { CheckCircle2 } from "lucide-react";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { DisputeButtons } from "@/components/admin/admin-buttons";
import { DISPUTE_CATEGORIES } from "@/lib/catalog";
import { describeCash, type CashPayer } from "@/lib/cash";
import { formatCedis } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDisputesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("disputes")
    .select(
      `id, category, description, status, created_at, opened_by,
       transaction:transactions!disputes_transaction_id_fkey(id, transaction_type, status, cash_amount_minor, cash_payer, terms_snapshot, accepted_at, confirm_by, buyer_id, seller_id,
         buyer:profiles!transactions_buyer_id_fkey(username, full_name), seller:profiles!transactions_seller_id_fkey(username, full_name),
         transaction_confirmations(user_id, confirmed_at))`,
    )
    .eq("status", "open")
    .order("created_at")
    .limit(100);

  return (
    <>
      <PageHeader title="Disputes & incomplete exchanges" description="Decide each case from the agreed terms, confirmations and the parties' accounts. Message contents are not shown here." />
      {error ? <Alert tone="danger">Could not load disputes.</Alert> : null}
      {!error && !data?.length ? <EmptyState icon={CheckCircle2} title="No open disputes" /> : null}
      <ul className="space-y-4">
        {(data ?? []).map((d) => {
          const tx = d.transaction;
          if (!tx) return null;
          const snapshot = tx.terms_snapshot as { target?: { title?: string }; offered?: { title?: string }[] };
          const names = { initiator: tx.buyer?.full_name ?? "Buyer", recipient: tx.seller?.full_name ?? "Seller" };
          return (
            <li key={d.id} className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">Open</Badge>
                <span className="font-medium">{DISPUTE_CATEGORIES.find((c) => c.value === d.category)?.label}</span>
                <span className="text-xs text-muted">
                  {formatDateTime(d.created_at)} · opened by {d.opened_by === tx.buyer_id ? names.initiator + " (buyer)" : names.recipient + " (seller)"}
                </span>
              </div>
              <p className="rounded-lg bg-surface-2 px-3 py-2">{d.description}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-muted">Deal: </span>
                  {tx.transaction_type === "swap" ? `${snapshot.offered?.map((o) => o.title).join(" + ")} ⇄ ${snapshot.target?.title}` : `Purchase of ${snapshot.target?.title}`}
                </p>
                <p>
                  <span className="text-muted">Cash: </span>
                  {tx.transaction_type === "purchase" ? formatCedis(Number(tx.cash_amount_minor)) : describeCash({ amountMinor: Number(tx.cash_amount_minor), payer: tx.cash_payer as CashPayer }, "observer", names)}
                </p>
                <p>
                  <span className="text-muted">Accepted: </span>
                  {formatDateTime(tx.accepted_at)} · confirm by {formatDateTime(tx.confirm_by)}
                </p>
                <p>
                  <span className="text-muted">Confirmed: </span>
                  {tx.transaction_confirmations.length
                    ? tx.transaction_confirmations.map((c) => `${c.user_id === tx.buyer_id ? "buyer" : "seller"} (${formatDateTime(c.confirmed_at)})`).join(", ")
                    : "nobody"}
                </p>
              </div>
              <DisputeButtons disputeId={d.id} />
            </li>
          );
        })}
      </ul>
    </>
  );
}
