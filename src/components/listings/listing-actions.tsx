"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Flag, Heart, MessageCircle, Repeat, Settings2, Share2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/primitives";
import { CashTermsInput } from "@/components/offers/cash-terms-input";
import { REPORT_REASONS, type ReportReason } from "@/lib/catalog";
import { describeCash, type CashPayer } from "@/lib/cash";
import { formatCedis, minorToCedisInput, parseCedisToMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  createSwapOfferAction,
  initiatePurchaseAction,
  reportAction,
  startConversationAction,
  toggleFavoriteAction,
} from "@/app/actions/marketplace";

export interface OfferableItem {
  id: string;
  title: string;
  priceMinor: number | null;
  imageUrl: string | null;
}

export interface ListingActionsProps {
  listing: {
    id: string;
    title: string;
    priceMinor: number;
    isNegotiable: boolean;
    availableForSale: boolean;
    openToSwap: boolean;
    offerable: boolean;
    sellerName: string;
  };
  viewer: { signedIn: boolean; isOwner: boolean; profileComplete: boolean };
  initialSaved: boolean;
  myListings: OfferableItem[];
}

type DialogName = "buy" | "swap" | "report" | null;

export function ListingActions(props: ListingActionsProps) {
  const [dialog, setDialog] = useState<DialogName>(null);
  const gate = useGate(props.viewer);
  return (
    <>
      <ActionButtons {...props} onOpen={setDialog} layout="stack" />
      {!props.viewer.isOwner ? (
        <div className="flex justify-between lg:hidden">
          <ShareButton title={props.listing.title} />
          <Button variant="ghost" size="sm" onClick={() => gate(() => setDialog("report"))}>
            <Flag aria-hidden="true" /> Report listing
          </Button>
        </div>
      ) : null}
      <MobileActionBar {...props} onOpen={setDialog} />
      <PurchaseDialog {...props} open={dialog === "buy"} onOpenChange={(o) => setDialog(o ? "buy" : null)} />
      <SwapDialog {...props} open={dialog === "swap"} onOpenChange={(o) => setDialog(o ? "swap" : null)} />
      <ReportDialog targetType="listing" targetId={props.listing.id} open={dialog === "report"} onOpenChange={(o) => setDialog(o ? "report" : null)} />
    </>
  );
}

function useGate(viewer: ListingActionsProps["viewer"]) {
  const pathname = usePathname();
  const router = useRouter();
  return (fn: () => void) => {
    if (!viewer.signedIn) {
      router.push(`/auth/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!viewer.profileComplete) {
      router.push(`/dashboard/profile?setup=1&next=${encodeURIComponent(pathname)}`);
      return;
    }
    fn();
  };
}

function ActionButtons({
  listing,
  viewer,
  initialSaved,
  onOpen,
  layout,
}: ListingActionsProps & { onOpen: (d: DialogName) => void; layout: "stack" | "bar" }) {
  const router = useRouter();
  const gate = useGate(viewer);
  const [saved, setSaved] = useState(initialSaved);
  const [saving, startSaving] = useTransition();
  const [messaging, startMessaging] = useTransition();

  if (viewer.isOwner) {
    return (
      <div className={cn(layout === "stack" ? "hidden lg:grid" : "flex", "gap-2")}>
        <Button asChild variant="outline" className="w-full">
          <Link href="/dashboard/listings">
            <Settings2 aria-hidden="true" /> Manage this listing
          </Link>
        </Button>
      </div>
    );
  }

  const toggleSave = () =>
    gate(() =>
      startSaving(async () => {
        const next = !saved;
        setSaved(next);
        const r = await toggleFavoriteAction(listing.id, next);
        if (!r.ok) {
          setSaved(!next);
          toast.error(r.error);
        } else toast.success(next ? "Saved to your favourites" : "Removed from favourites");
      }),
    );

  const message = () =>
    gate(() =>
      startMessaging(async () => {
        const r = await startConversationAction({ listingId: listing.id });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        router.push(`/dashboard/messages/${r.data.conversationId}`);
      }),
    );

  if (layout === "bar") {
    return (
      <div className="flex flex-1 gap-2">
        <Button variant="outline" size="icon" onClick={toggleSave} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save phone"} disabled={saving}>
          <Heart className={cn(saved && "fill-current text-danger")} aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" onClick={message} loading={messaging} aria-label="Message seller">
          {messaging ? null : <MessageCircle aria-hidden="true" />}
        </Button>
        {listing.offerable && listing.openToSwap ? (
          <Button variant={listing.availableForSale ? "outline" : "primary"} className="flex-1" onClick={() => gate(() => onOpen("swap"))}>
            <Repeat aria-hidden="true" /> Swap
          </Button>
        ) : null}
        {listing.offerable && listing.availableForSale ? (
          <Button className="flex-1" onClick={() => gate(() => onOpen("buy"))}>
            <ShoppingBag aria-hidden="true" /> Buy
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="hidden space-y-2 lg:block">
      {listing.offerable && listing.availableForSale ? (
        <Button size="lg" className="w-full" onClick={() => gate(() => onOpen("buy"))}>
          <ShoppingBag aria-hidden="true" /> {listing.isNegotiable ? "Make an offer to buy" : "Request to buy"}
        </Button>
      ) : null}
      {listing.offerable && listing.openToSwap ? (
        <Button size="lg" variant={listing.availableForSale ? "outline" : "primary"} className="w-full" onClick={() => gate(() => onOpen("swap"))}>
          <Repeat aria-hidden="true" /> Make swap offer
        </Button>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={message} loading={messaging}>
          {messaging ? null : <MessageCircle aria-hidden="true" />} Message
        </Button>
        <Button variant="secondary" onClick={toggleSave} aria-pressed={saved} disabled={saving}>
          <Heart className={cn(saved && "fill-current text-danger")} aria-hidden="true" /> {saved ? "Saved" : "Save"}
        </Button>
      </div>
      <div className="flex justify-between pt-1">
        <ShareButton title={listing.title} />
        <Button variant="ghost" size="sm" onClick={() => gate(() => onOpen("report"))}>
          <Flag aria-hidden="true" /> Report listing
        </Button>
      </div>
    </div>
  );
}

function MobileActionBar(props: ListingActionsProps & { onOpen: (d: DialogName) => void }) {
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="tabular text-lg font-semibold leading-none">{formatCedis(props.listing.priceMinor)}</p>
          {props.listing.isNegotiable ? <p className="text-xs text-muted">Negotiable</p> : null}
        </div>
        <ActionButtons {...props} layout="bar" />
      </div>
    </div>
  );
}

export function ShareButton({ title }: { title: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        const url = window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          toast.success("Link copied");
        } catch (error) {
          if ((error as Error).name !== "AbortError") toast.error("Couldn't share this link. Copy it from the address bar instead.");
        }
      }}
    >
      <Share2 aria-hidden="true" /> Share
    </Button>
  );
}

function PurchaseDialog({ listing, open, onOpenChange }: ListingActionsProps & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState(minorToCedisInput(listing.priceMinor));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [key] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setFieldError(undefined);
    startTransition(async () => {
      const r = await initiatePurchaseAction({ listingId: listing.id, amount, message: note, idempotencyKey: key });
      if (!r.ok) {
        setFieldError(r.fieldErrors?.amount?.[0]);
        setError(r.error);
        return;
      }
      toast.success(r.message ?? "Offer sent");
      onOpenChange(false);
      router.push(`/dashboard/offers/${r.data.offerId}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="bottom">
        <DialogHeader>
          <DialogTitle>{listing.isNegotiable ? "Make an offer" : "Request to buy"}</DialogTitle>
          <DialogDescription>
            {listing.sellerName} will be asked to accept. Nothing is paid through Top5Ideals — you pay in person after inspecting the phone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field
            id="purchase-amount"
            label="Your offer (GH₵)"
            hint={listing.isNegotiable ? `Asking price ${formatCedis(listing.priceMinor)}. Offers can't exceed it.` : "This seller has fixed the price."}
            error={fieldError}
          >
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} readOnly={!listing.isNegotiable} />
          </Field>
          <Field id="purchase-note" label="Message (optional)" hint="Suggest where and when to meet.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} disabled={parseCedisToMinor(amount) === null}>
            Send offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwapDialog({ listing, myListings, open, onOpenChange }: ListingActionsProps & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [payer, setPayer] = useState<CashPayer>("none");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  // One key per offer attempt: retries after a network failure cannot create duplicates.
  const [key] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const names = { initiator: "You", recipient: listing.sellerName };
  const minor = parseCedisToMinor(amount) ?? 0;
  const cashValid = payer === "none" || minor > 0;
  const chosen = myListings.filter((l) => selected.includes(l.id));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = await createSwapOfferAction({
        listingId: listing.id,
        offeredListingIds: selected,
        cash: payer === "none" ? "" : amount,
        cashPayer: payer,
        message: note,
        idempotencyKey: key,
      });
      if (!r.ok) {
        setFieldErrors(r.fieldErrors ?? {});
        setError(r.error);
        return;
      }
      toast.success(r.message ?? "Swap offer sent");
      onOpenChange(false);
      router.push(`/dashboard/offers/${r.data.offerId}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="bottom" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Make a swap offer</DialogTitle>
          <DialogDescription>Step {step} of 3 · {step === 1 ? "Choose your phone" : step === 2 ? "Cash difference" : "Review"}</DialogDescription>
        </DialogHeader>
        {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}

        {step === 1 ? (
          myListings.length ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm text-muted">Offer up to three of your live listings. Only phones you have listed — and that our team approved — can be offered.</legend>
              {myListings.map((item) => {
                const checked = selected.includes(item.id);
                return (
                  <label key={item.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-2.5", checked ? "border-accent bg-accent-soft" : "border-border")}>
                    <Checkbox
                      checked={checked}
                      disabled={!checked && selected.length >= 3}
                      onCheckedChange={(v) => setSelected((s) => (v === true ? [...s, item.id] : s.filter((x) => x !== item.id)))}
                    />
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
                      {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="tabular text-xs text-muted">Listed at {formatCedis(item.priceMinor)}</span>
                    </span>
                  </label>
                );
              })}
              {fieldErrors.offeredListingIds ? <p className="text-xs font-medium text-danger">{fieldErrors.offeredListingIds[0]}</p> : null}
            </fieldset>
          ) : (
            <Alert
              tone="info"
              title="List your phone first"
              action={
                <Button asChild size="sm">
                  <Link href="/sell">List a phone</Link>
                </Button>
              }
            >
              To keep swaps trustworthy, you can only offer phones you have listed and that have been approved.
            </Alert>
          )
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {listing.sellerName}&apos;s phone is listed at <span className="tabular font-medium text-foreground">{formatCedis(listing.priceMinor)}</span>. Listed prices are the owners&apos; asking prices, not verified valuations.
            </p>
            <CashTermsInput
              amount={amount}
              payer={payer}
              onAmountChange={setAmount}
              onPayerChange={setPayer}
              perspective="initiator"
              names={names}
              amountError={fieldErrors.cash?.[0]}
              payerError={fieldErrors.cashPayer?.[0]}
            />
            <Field id="swap-note" label="Message (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} placeholder="Why it's a good trade, where you can meet…" />
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">You give</p>
              <ul className="mt-1 space-y-0.5">
                {chosen.map((c) => (
                  <li key={c.id} className="font-medium">
                    {c.title}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">You get</p>
              <p className="mt-1 font-medium">{listing.title}</p>
            </div>
            <div className="rounded-lg border border-accent bg-accent-soft p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Cash</p>
              <p className="mt-1 font-semibold">{describeCash({ amountMinor: payer === "none" ? 0 : minor, payer }, "initiator", names)}</p>
            </div>
            <p className="text-xs text-muted">The offer stays open for 72 hours. {listing.sellerName} can accept, decline or counter. Nothing is reserved until an offer is accepted.</p>
          </div>
        ) : null}

        <DialogFooter>
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={!selected.length}>
              Continue
            </Button>
          ) : step === 2 ? (
            <Button onClick={() => setStep(3)} disabled={!cashValid}>
              Review offer
            </Button>
          ) : (
            <Button onClick={submit} loading={pending}>
              Send swap offer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReportDialog({
  targetType,
  targetId,
  open,
  onOpenChange,
}: {
  targetType: "listing" | "user" | "message" | "review" | "transaction";
  targetId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = await reportAction({ targetType, targetId, reason, details });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(r.message ?? "Report submitted");
      setReason("");
      setDetails("");
      onOpenChange(false);
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="bottom">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>Reports are private. The person you report is not told who reported them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field id={`report-reason-${targetId}`} label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              <option value="">Choose a reason…</option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`report-details-${targetId}`} label="Details (optional)">
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={4} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={pending} disabled={!reason}>
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
