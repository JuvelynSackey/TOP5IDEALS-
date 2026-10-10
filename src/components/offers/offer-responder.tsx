"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { CashTermsInput } from "./cash-terms-input";
import { describeCash, type CashPayer } from "@/lib/cash";
import { formatCedis, minorToCedisInput } from "@/lib/money";
import { acceptOfferAction, cancelOfferAction, counterOfferAction, rejectOfferAction } from "@/app/actions/deals";

export function OfferResponder({
  offerId,
  offerType,
  version,
  party,
  canAccept,
  canCounter,
  canReject,
  canCancel,
  terms,
  names,
  listingPriceMinor,
}: {
  offerId: string;
  offerType: "swap" | "purchase";
  version: number;
  party: "initiator" | "recipient";
  canAccept: boolean;
  canCounter: boolean;
  canReject: boolean;
  canCancel: boolean;
  terms: { amountMinor: number; payer: CashPayer };
  names: { initiator: string; recipient: string };
  listingPriceMinor: number | null;
}) {
  const router = useRouter();
  const [counterOpen, setCounterOpen] = useState(false);
  const [payer, setPayer] = useState<CashPayer>(offerType === "purchase" ? "initiator" : terms.payer);
  const [amount, setAmount] = useState(minorToCedisInput(terms.amountMinor || null));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const summary = offerType === "purchase" ? `${names.initiator === "You" ? "You pay" : `${names.initiator} pays`} ${formatCedis(terms.amountMinor)}` : describeCash(terms, party, names);

  const counter = () => {
    setError(null);
    startTransition(async () => {
      const r = await counterOfferAction({ offerId, expectedVersion: version, cash: payer === "none" ? "" : amount, cashPayer: payer, message: note });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setError(r.error);
        return;
      }
      toast.success(r.message ?? "Counteroffer sent");
      setCounterOpen(false);
      router.refresh();
    });
  };

  if (!canAccept && !canCounter && !canReject && !canCancel) return null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {canAccept ? (
        <ConfirmButton
          label={
            <>
              <Check aria-hidden="true" /> Accept
            </>
          }
          variant="primary"
          size="md"
          title="Accept these terms?"
          description="Accepting reserves the phones in this deal and closes other open offers on them. You then arrange the exchange and both confirm when it's done."
          confirmLabel="Accept offer"
          action={() => acceptOfferAction(offerId, version)}
          onDone={(r) => {
            if (r.ok && r.data && typeof r.data === "object" && "transactionId" in r.data) router.push(`/dashboard/transactions/${(r.data as { transactionId: string }).transactionId}`);
            else router.refresh();
          }}
        >
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium">{summary}</p>
        </ConfirmButton>
      ) : null}
      {canCounter ? (
        <Button variant="outline" onClick={() => setCounterOpen(true)}>
          <Repeat aria-hidden="true" /> Counteroffer
        </Button>
      ) : null}
      {canReject ? (
        <ConfirmButton
          label={
            <>
              <X aria-hidden="true" /> Decline
            </>
          }
          size="md"
          danger
          title="Decline this offer?"
          description="The offer will be closed. The other party will be notified."
          confirmLabel="Decline"
          reason={{ label: "Message (optional)", placeholder: "e.g. Thanks, but I'm looking for an iPhone." }}
          action={(reason) => rejectOfferAction(offerId, reason)}
          onDone={() => router.refresh()}
        />
      ) : null}
      {canCancel ? (
        <ConfirmButton
          label="Withdraw offer"
          size="md"
          variant="ghost"
          danger
          title="Withdraw your offer?"
          confirmLabel="Withdraw"
          action={() => cancelOfferAction(offerId)}
          onDone={() => router.refresh()}
        />
      ) : null}

      <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
        <DialogContent side="bottom">
          <DialogHeader>
            <DialogTitle>Make a counteroffer</DialogTitle>
            <DialogDescription>Your counteroffer becomes a new version in the history. The previous terms are kept.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {offerType === "purchase" ? (
              <Field id="counter-amount" label="Price (GH₵)" hint={listingPriceMinor ? `Asking price ${formatCedis(listingPriceMinor)}` : undefined} error={errors.cash?.[0]}>
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            ) : (
              <CashTermsInput
                amount={amount}
                payer={payer}
                onAmountChange={setAmount}
                onPayerChange={setPayer}
                perspective={party}
                names={names}
                amountError={errors.cash?.[0]}
                payerError={errors.cashPayer?.[0]}
                idPrefix="counter"
              />
            )}
            <Field id="counter-note" label="Message (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCounterOpen(false)}>
              Cancel
            </Button>
            <Button onClick={counter} loading={pending}>
              Send counteroffer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
