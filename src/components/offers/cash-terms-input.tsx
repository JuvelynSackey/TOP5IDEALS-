"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/form-controls";
import { describeCash, type CashPayer } from "@/lib/cash";
import { parseCedisToMinor } from "@/lib/money";

/**
 * Cash-difference editor. The payer must always be chosen explicitly, and the
 * resulting sentence ("You pay Kofi GH₵1,500") is shown before submitting.
 */
export function CashTermsInput({
  amount,
  payer,
  onAmountChange,
  onPayerChange,
  perspective,
  names,
  amountError,
  payerError,
  idPrefix = "cash",
}: {
  amount: string;
  payer: CashPayer;
  onAmountChange: (v: string) => void;
  onPayerChange: (v: CashPayer) => void;
  perspective: "initiator" | "recipient";
  names: { initiator: string; recipient: string };
  amountError?: string;
  payerError?: string;
  idPrefix?: string;
}) {
  const otherName = perspective === "initiator" ? names.recipient : names.initiator;
  const options: { value: CashPayer; label: string }[] = [
    { value: "none", label: "No cash — straight swap" },
    { value: perspective, label: `I add cash` },
    { value: perspective === "initiator" ? "recipient" : "initiator", label: `${otherName} adds cash` },
  ];
  const minor = parseCedisToMinor(amount) ?? 0;
  const preview = payer === "none" ? describeCash({ amountMinor: 0, payer: "none" }, perspective, names) : minor > 0 ? describeCash({ amountMinor: minor, payer }, perspective, names) : null;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Cash difference</legend>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-describedby={payerError ? `${idPrefix}-payer-error` : undefined}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={payer === o.value}
            onClick={() => {
              onPayerChange(o.value);
              if (o.value === "none") onAmountChange("");
            }}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              payer === o.value ? "border-accent bg-accent-soft font-medium" : "border-border-strong hover:bg-surface-2",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {payerError ? (
        <p id={`${idPrefix}-payer-error`} className="text-xs font-medium text-danger" role="alert">
          {payerError}
        </p>
      ) : null}
      {payer !== "none" ? (
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-amount`} className="text-sm font-medium">
            Amount (GH₵)
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">GH₵</span>
            <Input
              id={`${idPrefix}-amount`}
              inputMode="decimal"
              className="pl-12"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="1,500"
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? `${idPrefix}-amount-error` : undefined}
            />
          </div>
          {amountError ? (
            <p id={`${idPrefix}-amount-error`} className="text-xs font-medium text-danger" role="alert">
              {amountError}
            </p>
          ) : null}
        </div>
      ) : null}
      {preview ? (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium" aria-live="polite">
          {preview}
        </p>
      ) : null}
    </fieldset>
  );
}
