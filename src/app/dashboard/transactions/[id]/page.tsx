import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CheckCircle2, Circle, MessageCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/display";
import { PhoneTile } from "@/components/offers/phone-tile";
import { ReviewForm, TransactionActions } from "@/components/transactions/transaction-actions";
import { DISPUTE_CATEGORIES } from "@/lib/catalog";
import { describeCash, type CashPayer } from "@/lib/cash";
import { formatCedis } from "@/lib/money";
import { formatDate, formatDateTime, isPast, isWithinDays } from "@/lib/format";
import { transactionActions } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { displayName, type Snapshot } from "@/server/deals";

const STATUS_TEXT = {
  active: "In progress",
  completed: "Completed",
  disputed: "Under review",
  cancelled: "Cancelled",
} as const;

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("/dashboard/transactions");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("transactions")
    .select(
      `*, buyer:profiles!transactions_buyer_id_fkey(id, username, full_name), seller:profiles!transactions_seller_id_fkey(id, username, full_name),
       transaction_confirmations(user_id, confirmed_at, note), disputes(id, category, description, status, resolution_note, created_at, resolved_at, opened_by),
       swap_offers(conversation_id)`,
    )
    .eq("id", id.data)
    .maybeSingle();
  if (!tx) notFound();

  const { data: myReview } = await supabase
    .from("reviews")
    .select("id, overall_rating, communication_rating, accuracy_rating, experience_rating, comment, created_at")
    .eq("transaction_id", tx.id)
    .eq("reviewer_id", viewer.id)
    .maybeSingle();

  const isBuyer = tx.buyer_id === viewer.id;
  const isParty = isBuyer || tx.seller_id === viewer.id;
  const me = isBuyer ? "initiator" : "recipient";
  const names = { initiator: isBuyer ? "You" : displayName(tx.buyer), recipient: isBuyer ? displayName(tx.seller) : "You" };
  const otherName = isBuyer ? displayName(tx.seller) : displayName(tx.buyer);
  const confirmedByMe = tx.transaction_confirmations.some((c) => c.user_id === viewer.id);
  const confirmedByOther = tx.transaction_confirmations.some((c) => c.user_id !== viewer.id && (c.user_id === tx.buyer_id || c.user_id === tx.seller_id));
  const actions = transactionActions({ status: tx.status, confirmedByMe, confirmedByOther, isParty });
  const overdue = isPast(tx.confirm_by);
  const snapshot = tx.terms_snapshot as unknown as { target: Snapshot; offered: Snapshot[] };
  const cash = { amountMinor: Number(tx.cash_amount_minor), payer: tx.cash_payer as CashPayer };
  const conversationId = tx.swap_offers?.conversation_id;
  const reviewEditable = myReview ? isWithinDays(myReview.created_at, 14) : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            <Link href="/dashboard/transactions" className="hover:text-foreground">
              Transactions
            </Link>{" "}
            / {tx.transaction_type === "swap" ? "Swap" : "Purchase"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{snapshot.target?.title ?? "Exchange"}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={tx.status === "completed" ? "success" : tx.status === "disputed" ? "warning" : tx.status === "active" ? "info" : "neutral"}>{STATUS_TEXT[tx.status]}</Badge>
            <span className="text-xs text-muted">Accepted {formatDateTime(tx.accepted_at)}</span>
          </div>
        </div>
        {conversationId ? (
          <Button asChild variant="outline">
            <Link href={`/dashboard/messages/${conversationId}`}>
              <MessageCircle aria-hidden="true" /> Message {otherName}
            </Link>
          </Button>
        ) : null}
      </div>

      {tx.status === "active" && actions.awaitingOther ? (
        <Alert tone="info" title={`Waiting for ${otherName} to confirm`}>
          {overdue
            ? `It's past the confirmation window (${formatDate(tx.confirm_by)}). If ${otherName} received what was agreed but won't confirm, report a problem and our team will review it. A single confirmation never completes an exchange on its own.`
            : `They have until about ${formatDate(tx.confirm_by)} before you can escalate. The exchange completes only when both of you confirm.`}
        </Alert>
      ) : null}
      {tx.status === "active" && !confirmedByMe && confirmedByOther ? (
        <Alert tone="info" title={`${otherName} has confirmed`}>
          Confirm once you have received what was agreed — or report a problem if something is wrong.
        </Alert>
      ) : null}
      {tx.status === "disputed" ? <Alert tone="warning" title="Under review">A problem was reported. Our team will review it and notify you both. Confirmation and cancellation are paused.</Alert> : null}
      {tx.status === "cancelled" ? <Alert tone="info" title="Cancelled">{tx.cancel_reason ?? "This exchange was cancelled."}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Agreed terms</CardTitle>
          <p className="text-xs text-muted">Locked when the offer was accepted (version {tx.agreed_version}). These cannot be changed.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapshot.offered?.map((o) => <PhoneTile key={o.id} snapshot={o} caption={`${names.initiator} give${names.initiator === "You" ? "" : "s"}`} />)}
          {snapshot.target ? <PhoneTile snapshot={snapshot.target} caption={`${names.recipient} give${names.recipient === "You" ? "" : "s"}`} /> : null}
          <div className="rounded-xl border border-accent bg-accent-soft p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Cash</p>
            <p className="mt-0.5 font-semibold">
              {tx.transaction_type === "purchase" ? `${names.initiator === "You" ? "You pay" : `${names.initiator} pays`} ${formatCedis(cash.amountMinor)}` : describeCash(cash, me, names)}
            </p>
            <p className="mt-1 text-xs text-muted">Paid in person. Top5Ideals does not collect or hold payments, and confirming here does not mean money has been verified.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Confirmations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: names.initiator === "You" ? "You (buyer / offerer)" : `${names.initiator} (buyer / offerer)`, id: tx.buyer_id },
            { label: names.recipient === "You" ? "You (seller)" : `${names.recipient} (seller)`, id: tx.seller_id },
          ].map((p) => {
            const c = tx.transaction_confirmations.find((x) => x.user_id === p.id);
            return (
              <div key={p.label} className="flex items-center gap-2 text-sm">
                {c ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" /> : <Circle className="size-5 text-muted" aria-hidden="true" />}
                <span className="font-medium">{p.label}</span>
                <span className="text-muted">{c ? `confirmed ${formatDateTime(c.confirmed_at)}` : "not confirmed yet"}</span>
              </div>
            );
          })}
          {isParty ? (
            <div className="pt-2">
              <TransactionActions
                transactionId={tx.id}
                canConfirm={actions.canConfirm}
                canCancel={actions.canCancel}
                canDispute={actions.canDispute}
                suggestUnresponsive={actions.awaitingOther && overdue}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {tx.disputes.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Reported problems</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tx.disputes.map((d) => (
              <div key={d.id} className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={d.status === "open" ? "warning" : "neutral"}>{d.status === "open" ? "Open" : "Resolved"}</Badge>
                  <span className="font-medium">{DISPUTE_CATEGORIES.find((c) => c.value === d.category)?.label}</span>
                  <span className="text-xs text-muted">{formatDateTime(d.created_at)} · by {d.opened_by === viewer.id ? "you" : otherName}</span>
                </div>
                <p className="text-foreground/85">{d.description}</p>
                {d.resolution_note ? <p className="rounded-lg bg-surface-2 px-3 py-2">Resolution: {d.resolution_note}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {actions.canReview ? (
        <Card>
          <CardHeader>
            <CardTitle>{myReview ? "Your review" : `How was your exchange with ${otherName}?`}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReviewForm
              transactionId={tx.id}
              otherName={otherName}
              existing={
                myReview
                  ? {
                      id: myReview.id,
                      overall: myReview.overall_rating,
                      communication: myReview.communication_rating,
                      accuracy: myReview.accuracy_rating,
                      experience: myReview.experience_rating,
                      comment: myReview.comment,
                      editable: reviewEditable,
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      ) : null}

      {tx.status === "active" ? (
        <Alert tone="warning" title="Before you meet">
          <span className="inline-flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Meet in a busy public place, test every function, check the IMEI (*#06#) and make sure iCloud/Google accounts are removed before money or phones change hands.
          </span>
        </Alert>
      ) : null}
    </div>
  );
}
