"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Flag, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/display";
import { Field, Select, Textarea } from "@/components/ui/form-controls";
import { Checkbox } from "@/components/ui/primitives";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { DISPUTE_CATEGORIES, type DisputeCategory } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { cancelTransactionAction, confirmTransactionAction, openDisputeAction, submitReviewAction } from "@/app/actions/deals";

const CHECKLIST = [
  "I received the phone(s) / payment exactly as agreed",
  "I tested the phone and its condition matches the listing",
  "Accounts (iCloud / Google) are signed out and the phone is not locked",
];

export function TransactionActions({
  transactionId,
  canConfirm,
  canCancel,
  canDispute,
  suggestUnresponsive,
}: {
  transactionId: string;
  canConfirm: boolean;
  canCancel: boolean;
  canDispute: boolean;
  suggestUnresponsive: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<DisputeCategory | "">(suggestUnresponsive ? "other_party_unresponsive" : "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const r = await confirmTransactionAction(transactionId, note);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(r.message ?? "Confirmed");
      setConfirmOpen(false);
      router.refresh();
    });
  };

  const dispute = () => {
    setError(null);
    startTransition(async () => {
      const r = await openDisputeAction({ transactionId, category, description });
      if (!r.ok) {
        setError(r.fieldErrors?.description?.[0] ?? r.error);
        return;
      }
      toast.success(r.message ?? "Reported");
      setDisputeOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {canConfirm ? (
        <Button onClick={() => setConfirmOpen(true)}>
          <CheckCircle2 aria-hidden="true" /> Confirm exchange completed
        </Button>
      ) : null}
      {canDispute ? (
        <Button variant="outline" onClick={() => setDisputeOpen(true)}>
          <Flag aria-hidden="true" /> Report a problem
        </Button>
      ) : null}
      {canCancel ? (
        <ConfirmButton
          label="Cancel exchange"
          size="md"
          variant="ghost"
          danger
          title="Cancel this exchange?"
          description="Both phones become available again and the other party is notified. You can only cancel before anyone confirms."
          confirmLabel="Cancel exchange"
          reason={{ label: "Reason", required: true, placeholder: "e.g. We couldn't agree on a meeting place." }}
          action={(reason) => cancelTransactionAction(transactionId, reason)}
          onDone={() => router.refresh()}
        />
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent side="bottom">
          <DialogHeader>
            <DialogTitle>Confirm the exchange</DialogTitle>
            <DialogDescription>Only confirm once you have everything that was agreed. The exchange completes when both of you confirm, and you can&apos;t undo this.</DialogDescription>
          </DialogHeader>
          {error ? <Alert tone="danger" className="mb-3">{error}</Alert> : null}
          <ul className="space-y-2">
            {CHECKLIST.map((item, i) => (
              <li key={item}>
                <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm", checked[i] ? "border-accent bg-accent-soft" : "border-border")}>
                  <Checkbox checked={checked[i]} onCheckedChange={(v) => setChecked((c) => c.map((x, j) => (j === i ? v === true : x)))} className="mt-0.5" />
                  {item}
                </label>
              </li>
            ))}
          </ul>
          <Field id="confirm-note" label="Note (optional)" className="mt-3">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Not yet
            </Button>
            <Button onClick={confirm} loading={pending} disabled={!checked.every(Boolean)}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent side="bottom">
          <DialogHeader>
            <DialogTitle>Report a problem with this exchange</DialogTitle>
            <DialogDescription>The exchange is paused while our team reviews it. Neither side can complete it until the dispute is resolved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field id="dispute-category" label="What went wrong?" required>
              <Select value={category} onChange={(e) => setCategory(e.target.value as DisputeCategory)}>
                <option value="">Choose…</option>
                {DISPUTE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="dispute-description" label="Details" required hint="Dates, what was agreed and what happened. At least 10 characters.">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={5} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisputeOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={dispute} loading={pending} disabled={!category || description.trim().length < 10}>
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const CATEGORIES = [
  ["overall", "Overall"],
  ["communication", "Communication"],
  ["accuracy", "Item accuracy"],
  ["experience", "Exchange experience"],
] as const;

export function ReviewForm({
  transactionId,
  otherName,
  existing,
}: {
  transactionId: string;
  otherName: string;
  existing?: { id: string; overall: number; communication: number; accuracy: number; experience: number; comment: string | null; editable: boolean };
}) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Record<string, number>>({
    overall: existing?.overall ?? 0,
    communication: existing?.communication ?? 0,
    accuracy: existing?.accuracy ?? 0,
    experience: existing?.experience ?? 0,
  });
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [editing, setEditing] = useState(!existing);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (existing && !editing) {
    return (
      <div className="space-y-2">
        <p className="text-sm">
          You rated {otherName} <strong>{existing.overall}/5</strong>.
        </p>
        {existing.comment ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">“{existing.comment}”</p> : null}
        {existing.editable ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit review
          </Button>
        ) : null}
      </div>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = await submitReviewAction({ transactionId, ...ratings, comment }, existing?.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(r.message ?? "Review saved");
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {CATEGORIES.map(([key, label]) => (
        <fieldset key={key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <legend className="text-sm font-medium">{label}</legend>
          <div className="flex gap-1" role="radiogroup" aria-label={`${label} rating`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={ratings[key] === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => setRatings((r) => ({ ...r, [key]: n }))}
                className="rounded p-1 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Star className={cn("size-6", (ratings[key] ?? 0) >= n ? "fill-current text-warning" : "text-border-strong")} aria-hidden="true" />
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <Field id="review-comment" label="Written feedback (optional)" hint="Public. Describe the exchange — not personal details.">
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1500} rows={3} />
      </Field>
      <Button onClick={submit} loading={pending} disabled={Object.values(ratings).some((v) => v < 1)}>
        {existing ? "Update review" : `Review ${otherName}`}
      </Button>
    </div>
  );
}
