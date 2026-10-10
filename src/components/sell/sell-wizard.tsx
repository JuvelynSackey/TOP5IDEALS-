"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, CircleCheck, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, PrefixedInput, Select, Textarea } from "@/components/ui/form-controls";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Checkbox, Switch } from "@/components/ui/primitives";
import { PhotoManager, type SavedImage } from "./photo-manager";
import {
  ACCESSORIES,
  CONDITIONS,
  CONDITION_LABEL,
  DEVICE_CHECKS,
  DEVICE_CHECK_VALUES,
  NETWORK_LOCK_LABEL,
  RAM_CHOICES,
  STORAGE_CHOICES,
  formatStorage,
  type DeviceCheckValue,
  type ListingCondition,
  type ListingStatus,
  type ModerationStatus,
} from "@/lib/catalog";
import { DISPLAY_STATE_LABEL, listingDisplayState } from "@/lib/listing-state";
import { formatCedis, parseCedisToMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  conditionStepSchema,
  detailsStepSchema,
  locationStepSchema,
  phoneStepSchema,
  pricingStepSchema,
} from "@/lib/validation/listing";
import {
  createDraftAction,
  getListingVersionAction,
  listingTransitionAction,
  saveListingStepAction,
} from "@/app/actions/listings";

export interface WizardCatalogue {
  brands: { id: number; name: string; slug: string }[];
  models: { id: number; brand_id: number; name: string; storage_options_gb: number[]; ram_options_gb: number[]; battery_health_supported: boolean }[];
  regions: { id: number; name: string }[];
}

export interface WizardValues {
  phone: { brandId: string; modelId: string; customModel: string; variant: string; storageGb: string; ramGb: string; color: string };
  condition: {
    condition: ListingCondition | "";
    batteryHealthStatus: "reported" | "unknown" | "not_applicable";
    batteryHealth: string;
    deviceChecks: Record<string, DeviceCheckValue>;
    networkLock: "unlocked" | "locked" | "unknown";
    accessories: string[];
    defects: string;
    warrantyDetails: string;
  };
  pricing: { price: string; isNegotiable: boolean; availableForSale: boolean; openToSwap: boolean; swapBrandIds: number[]; swapNotes: string; swapMaxCash: string };
  location: { regionId: string; city: string; area: string };
  details: { title: string; description: string };
}

export interface ExistingListing {
  id: string;
  updatedAt: string;
  status: ListingStatus;
  moderationStatus: ModerationStatus;
  images: SavedImage[];
  values: WizardValues;
}

const STEPS = ["Phone", "Condition", "Photos", "Price & swap", "Location", "Preview"] as const;

export const EMPTY_VALUES: WizardValues = {
  phone: { brandId: "", modelId: "", customModel: "", variant: "", storageGb: "", ramGb: "", color: "" },
  condition: {
    condition: "",
    batteryHealthStatus: "unknown",
    batteryHealth: "",
    deviceChecks: {},
    networkLock: "unknown",
    accessories: [],
    defects: "",
    warrantyDetails: "",
  },
  pricing: { price: "", isNegotiable: true, availableForSale: true, openToSwap: false, swapBrandIds: [], swapNotes: "", swapMaxCash: "" },
  location: { regionId: "", city: "", area: "" },
  details: { title: "", description: "" },
};

type Errors = Record<string, string[] | undefined>;

function flatten(error: { issues: { path: PropertyKey[]; message: string }[] }): Errors {
  const out: Errors = {};
  for (const i of error.issues) (out[String(i.path[0] ?? "form")] ??= []).push(i.message);
  return out;
}

function storageKey(listingId: string | null) {
  return `top5:sell:${listingId ?? "new"}`;
}

export function SellWizard({
  catalogue,
  userId,
  existing,
  defaultLocation,
}: {
  catalogue: WizardCatalogue;
  userId: string;
  existing: ExistingListing | null;
  defaultLocation: { regionId: string; city: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState(existing ? (existing.status === "draft" ? 0 : 5) : 0);
  const [listingId, setListingId] = useState<string | null>(existing?.id ?? null);
  const [version, setVersion] = useState<string | null>(existing?.updatedAt ?? null);
  const [status, setStatus] = useState<{ status: ListingStatus; moderation: ModerationStatus }>({
    status: existing?.status ?? "draft",
    moderation: existing?.moderationStatus ?? "not_submitted",
  });
  const [values, setValues] = useState<WizardValues>(() => {
    const base = existing?.values ?? { ...EMPTY_VALUES, location: { ...EMPTY_VALUES.location, ...defaultLocation } };
    return base;
  });
  const [images, setImages] = useState<SavedImage[]>(existing?.images ?? []);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [restored, setRestored] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Restore unsaved input after an interrupted session (local only, never secrets).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(existing?.id ?? null));
      if (raw) {
        const saved = JSON.parse(raw) as { values: WizardValues; step: number };
        if (saved?.values?.phone) {
          // Restoring from an external store (localStorage) after hydration is
          // intentional: reading it during render would break SSR hydration.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setValues(saved.values);
          if (!existing) setStep(0);
          setRestored(true);
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey(existing?.id ?? null));
    }
  }, [existing]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(listingId), JSON.stringify({ values, step }));
    } catch {
      // Storage may be unavailable (private mode). Server drafts still persist.
    }
  }, [values, step, listingId]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const brand = catalogue.brands.find((b) => String(b.id) === values.phone.brandId);
  const brandModels = useMemo(() => catalogue.models.filter((m) => String(m.brand_id) === values.phone.brandId), [catalogue.models, values.phone.brandId]);
  const model = catalogue.models.find((m) => String(m.id) === values.phone.modelId);
  const storageOptions = model?.storage_options_gb.length ? model.storage_options_gb : STORAGE_CHOICES;
  const ramOptions = model?.ram_options_gb.length ? model.ram_options_gb : RAM_CHOICES;
  const display = listingDisplayState(status.status, status.moderation);
  const locked = ["reserved", "sold", "swapped", "archived"].includes(status.status);
  const isDraft = status.status === "draft";

  function set<K extends keyof WizardValues>(section: K, patch: Partial<WizardValues[K]>) {
    setValues((v) => ({ ...v, [section]: { ...v[section], ...patch } }));
  }

  function suggestedTitle() {
    return [brand?.name, model?.name ?? values.phone.customModel, values.phone.storageGb ? formatStorage(Number(values.phone.storageGb)) : null, values.phone.color || null]
      .filter(Boolean)
      .join(" ");
  }

  function phonePayload() {
    const p = values.phone;
    return {
      brandId: p.brandId,
      modelId: p.modelId || null,
      customModel: p.customModel || null,
      variant: p.variant || null,
      storageGb: p.storageGb || null,
      ramGb: p.ramGb || null,
      color: p.color || null,
    };
  }

  function stepPayload(index: number): { step: "phone" | "condition" | "pricing" | "location" | "details"; data: unknown; schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } } } | null {
    switch (index) {
      case 0:
        return { step: "phone", data: phonePayload(), schema: phoneStepSchema };
      case 1:
        return {
          step: "condition",
          data: { ...values.condition, batteryHealth: values.condition.batteryHealth || null },
          schema: conditionStepSchema,
        };
      case 3:
        return {
          step: "pricing",
          data: { ...values.pricing, swapMaxCash: values.pricing.swapMaxCash || null },
          schema: pricingStepSchema,
        };
      case 4:
        return { step: "location", data: values.location, schema: locationStepSchema };
      case 5:
        return { step: "details", data: { title: values.details.title || suggestedTitle(), description: values.details.description }, schema: detailsStepSchema };
      default:
        return null;
    }
  }

  async function refreshVersion(id: string) {
    const r = await getListingVersionAction(id);
    if (r.ok) {
      setVersion(r.data.updatedAt);
      setStatus({ status: r.data.status as ListingStatus, moderation: r.data.moderationStatus as ModerationStatus });
      return r.data.updatedAt;
    }
    return version;
  }

  /** Validate + persist the current step. Returns true when it is safe to move on. */
  async function saveCurrent(): Promise<boolean> {
    setErrors({});
    setFormError(null);
    if (step === 2) {
      if (!images.length) {
        setFormError("Add at least one photo. The first photo is used as the cover.");
        return false;
      }
      if (listingId) await refreshVersion(listingId);
      return true;
    }
    const payload = stepPayload(step);
    if (!payload) return true;
    const check = payload.schema.safeParse(payload.data);
    if (!check.success) {
      setErrors(flatten(check.error!));
      setFormError("Please fix the highlighted fields.");
      return false;
    }
    if (!listingId) {
      const r = await createDraftAction(payload.data);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
        if (r.code === "profile_incomplete") router.push("/dashboard/profile?setup=1&next=/sell");
        return false;
      }
      try {
        window.localStorage.removeItem(storageKey(null));
      } catch {
        /* storage unavailable */
      }
      setListingId(r.data.id);
      setVersion(r.data.updatedAt);
      window.history.replaceState(null, "", `/sell?listing=${r.data.id}`);
      return true;
    }
    const currentVersion = version ?? (await refreshVersion(listingId));
    const r = await saveListingStepAction(listingId, payload.step, payload.data, currentVersion);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setFormError(r.error);
      return false;
    }
    setVersion(r.data.updatedAt);
    if (step === 5 && !values.details.title) set("details", { title: suggestedTitle() });
    return true;
  }

  function next() {
    startTransition(async () => {
      if (await saveCurrent()) setStep((s) => Math.min(s + 1, STEPS.length - 1));
    });
  }

  function back() {
    setErrors({});
    setFormError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function finish(submitForReview: boolean) {
    startTransition(async () => {
      if (!(await saveCurrent())) return;
      if (!listingId) return;
      if (submitForReview) {
        const r = await listingTransitionAction(listingId, "publish");
        if (!r.ok) {
          setFormError(r.error);
          return;
        }
        setStatus({ status: r.data.status as ListingStatus, moderation: r.data.moderationStatus as ModerationStatus });
        toast.success(r.message ?? "Submitted");
      } else {
        await refreshVersion(listingId);
        toast.success("Changes saved");
      }
      try {
        window.localStorage.removeItem(storageKey(listingId));
      } catch {
        /* storage unavailable */
      }
      setSubmitted(true);
      router.refresh();
    });
  }

  function startOver() {
    setSubmitted(false);
    setListingId(null);
    setVersion(null);
    setStatus({ status: "draft", moderation: "not_submitted" });
    setValues({ ...EMPTY_VALUES, location: { ...EMPTY_VALUES.location, ...defaultLocation } });
    setImages([]);
    setStep(0);
    setRestored(false);
    router.replace("/sell");
  }

  if (locked) {
    return (
      <Alert tone="warning" title={`This listing is ${DISPLAY_STATE_LABEL[display].toLowerCase()}`}>
        Reserved, sold, swapped and archived listings can&apos;t be edited.{" "}
        <Link href="/dashboard/listings" className="font-medium underline">
          Back to my listings
        </Link>
      </Alert>
    );
  }

  if (submitted) {
    const live = status.moderation === "approved" && status.status === "published";
    return (
      <Card className="mx-auto max-w-xl p-6 text-center sm:p-8">
        {live ? <CircleCheck className="mx-auto size-12 text-success" aria-hidden="true" /> : <Clock className="mx-auto size-12 text-accent" aria-hidden="true" />}
        <h2 className="mt-4 text-2xl font-semibold">{live ? "Your listing is live" : status.moderation === "pending_review" ? "Submitted for review" : "Saved"}</h2>
        <p className="mt-2 text-sm text-muted">
          {live
            ? "Buyers can now find it in search."
            : status.moderation === "pending_review"
              ? "Our moderators check every listing before it appears publicly — usually within a few hours. We'll notify you as soon as it's approved or if anything needs changing."
              : "Your draft is saved. You can publish it whenever you're ready."}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/dashboard/listings">Go to my listings</Link>
          </Button>
          <Button variant="outline" onClick={startOver}>
            List another phone
          </Button>
        </div>
      </Card>
    );
  }

  const err = (key: string) => errors[key]?.[0];

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 grid grid-cols-6 gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="space-y-1.5">
            <div className={cn("h-1.5 rounded-full", i <= step ? "bg-accent" : "bg-border")} />
            <span className={cn("hidden text-xs sm:block", i === step ? "font-medium text-foreground" : "text-muted")} aria-current={i === step ? "step" : undefined}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {restored ? (
        <Alert tone="info" className="mb-4">
          We restored what you were entering before. Unsaved changes are kept on this device until you continue.
        </Alert>
      ) : null}
      {!isDraft ? (
        <Alert tone={status.moderation === "rejected" ? "warning" : "info"} className="mb-4" title={`Editing a listing that is ${DISPLAY_STATE_LABEL[display].toLowerCase()}`}>
          Changes to the phone details, condition, description or photos of an approved listing send it back for review. Price, swap and location changes do not.
        </Alert>
      ) : null}

      <Card className="p-4 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-semibold outline-none">
          {["Which phone are you selling?", "What condition is it in?", "Add photos", "Price and swap preferences", "Where is the phone?", "Preview and publish"][step]}
        </h2>
        {formError ? (
          <Alert tone="danger" className="mt-4">
            {formError}
          </Alert>
        ) : null}

        <div className="mt-6 space-y-5">
          {step === 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="brand" label="Brand" required error={err("brandId")}>
                  <Select value={values.phone.brandId} onChange={(e) => set("phone", { brandId: e.target.value, modelId: "", customModel: "" })}>
                    <option value="">Choose brand…</option>
                    {catalogue.brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="model" label="Model" required error={err("modelId")}>
                  <Select value={values.phone.modelId} onChange={(e) => set("phone", { modelId: e.target.value })} disabled={!values.phone.brandId}>
                    <option value="">{values.phone.brandId ? "Choose model…" : "Choose a brand first"}</option>
                    {brandModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                    {values.phone.brandId ? <option value="">My model isn&apos;t listed</option> : null}
                  </Select>
                </Field>
              </div>
              {values.phone.brandId && !values.phone.modelId ? (
                <Field id="customModel" label="Model name" hint="Type the exact model if it's not in the list." error={err("customModel")}>
                  <Input value={values.phone.customModel} onChange={(e) => set("phone", { customModel: e.target.value })} maxLength={80} />
                </Field>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="storage" label="Storage" error={err("storageGb")}>
                  <Select value={values.phone.storageGb} onChange={(e) => set("phone", { storageGb: e.target.value })}>
                    <option value="">Not sure</option>
                    {storageOptions.map((s) => (
                      <option key={s} value={s}>
                        {formatStorage(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="ram" label="RAM" error={err("ramGb")}>
                  <Select value={values.phone.ramGb} onChange={(e) => set("phone", { ramGb: e.target.value })}>
                    <option value="">Not sure</option>
                    {ramOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}GB
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="color" label="Colour" error={err("color")}>
                  <Input value={values.phone.color} onChange={(e) => set("phone", { color: e.target.value })} maxLength={40} placeholder="e.g. Deep Purple" />
                </Field>
              </div>
              <Field id="variant" label="Variant (optional)" hint="e.g. Dual SIM, UK version, 5G." error={err("variant")}>
                <Input value={values.phone.variant} onChange={(e) => set("phone", { variant: e.target.value })} maxLength={60} />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  Condition <span className="text-danger">*</span>
                </legend>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={values.condition.condition === c.value}
                      onClick={() => set("condition", { condition: c.value })}
                      className={cn(
                        "rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-ring",
                        values.condition.condition === c.value ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-2",
                      )}
                    >
                      <span className="block text-sm font-medium">{c.label}</span>
                      <span className="block text-xs text-muted">{c.description}</span>
                    </button>
                  ))}
                </div>
                {err("condition") ? <p className="mt-1 text-xs font-medium text-danger" role="alert">{err("condition")}</p> : null}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="batteryStatus" label="Battery health" hint={model?.battery_health_supported ? "Find it in Settings → Battery." : "Many Android phones don't show this — choose “Not shown”."}>
                  <Select
                    value={values.condition.batteryHealthStatus}
                    onChange={(e) => set("condition", { batteryHealthStatus: e.target.value as WizardValues["condition"]["batteryHealthStatus"], batteryHealth: "" })}
                  >
                    <option value="unknown">I don&apos;t know</option>
                    <option value="reported">I know the percentage</option>
                    <option value="not_applicable">Not shown on this phone</option>
                  </Select>
                </Field>
                {values.condition.batteryHealthStatus === "reported" ? (
                  <Field id="batteryHealth" label="Battery health (%)" error={err("batteryHealth")} required>
                    <Input inputMode="numeric" value={values.condition.batteryHealth} onChange={(e) => set("condition", { batteryHealth: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                  </Field>
                ) : null}
              </div>

              <fieldset>
                <legend className="text-sm font-medium">Device checks</legend>
                <p className="mb-3 text-xs text-muted">Only mark something “Working” if you have tested it. “Not tested” is always fine.</p>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {DEVICE_CHECKS.map((c) => (
                    <div key={c.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm" id={`check-${c.key}`}>
                        {c.label}
                      </span>
                      <div className="flex gap-1" role="radiogroup" aria-labelledby={`check-${c.key}`}>
                        {DEVICE_CHECK_VALUES.map((v) => {
                          const current = values.condition.deviceChecks[c.key] ?? "not_tested";
                          return (
                            <button
                              key={v.value}
                              type="button"
                              role="radio"
                              aria-checked={current === v.value}
                              onClick={() => set("condition", { deviceChecks: { ...values.condition.deviceChecks, [c.key]: v.value } })}
                              className={cn(
                                "rounded-md border px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring",
                                current === v.value
                                  ? v.value === "faulty"
                                    ? "border-danger bg-danger-soft text-danger"
                                    : v.value === "working"
                                      ? "border-success bg-success-soft text-success"
                                      : "border-border-strong bg-surface-2"
                                  : "border-border text-muted hover:text-foreground",
                              )}
                            >
                              {v.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              <Field id="networkLock" label="Network">
                <Select value={values.condition.networkLock} onChange={(e) => set("condition", { networkLock: e.target.value as WizardValues["condition"]["networkLock"] })}>
                  {Object.entries(NETWORK_LOCK_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Included accessories</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ACCESSORIES.map((a) => {
                    const checked = values.condition.accessories.includes(a.value);
                    return (
                      <label key={a.value} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm", checked ? "border-accent bg-accent-soft" : "border-border")}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            set("condition", {
                              accessories: v === true ? [...values.condition.accessories, a.value] : values.condition.accessories.filter((x) => x !== a.value),
                            })
                          }
                        />
                        {a.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <Field id="defects" label="Known defects" hint="Be honest — undisclosed defects are the most common cause of disputes." error={err("defects")}>
                <Textarea value={values.condition.defects} onChange={(e) => set("condition", { defects: e.target.value })} maxLength={1000} rows={3} placeholder="e.g. small scratch on the back, Face ID not working" />
              </Field>
              <Field id="warranty" label="Warranty (optional)" error={err("warrantyDetails")}>
                <Input value={values.condition.warrantyDetails} onChange={(e) => set("condition", { warrantyDetails: e.target.value })} maxLength={300} placeholder="e.g. Shop warranty until March 2027" />
              </Field>
            </>
          ) : null}

          {step === 2 && listingId ? <PhotoManager listingId={listingId} userId={userId} images={images} onChange={setImages} disabled={pending} /> : null}

          {step === 3 ? (
            <>
              <Field id="price" label="Asking price (GH₵)" required error={err("price")}>
                <PrefixedInput prefix="GH₵" inputMode="decimal" value={values.pricing.price} onChange={(e) => set("pricing", { price: e.target.value })} placeholder="8,500" />
              </Field>
              <ToggleRow id="negotiable" label="Price is negotiable" description="Buyers can offer less than your asking price." checked={values.pricing.isNegotiable} onChange={(v) => set("pricing", { isNegotiable: v })} />
              <ToggleRow id="forSale" label="Available to buy" description="Accept purchase offers in cash." checked={values.pricing.availableForSale} onChange={(v) => set("pricing", { availableForSale: v })} />
              <ToggleRow id="swap" label="Open to swaps" description="Accept another phone, with or without cash on top." checked={values.pricing.openToSwap} onChange={(v) => set("pricing", { openToSwap: v })} />
              {err("availableForSale") ? <p className="text-xs font-medium text-danger" role="alert">{err("availableForSale")}</p> : null}
              {values.pricing.openToSwap ? (
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">Preferred brands (optional)</legend>
                    <div className="flex flex-wrap gap-2">
                      {catalogue.brands.map((b) => {
                        const on = values.pricing.swapBrandIds.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              set("pricing", { swapBrandIds: on ? values.pricing.swapBrandIds.filter((x) => x !== b.id) : [...values.pricing.swapBrandIds, b.id].slice(0, 10) })
                            }
                            className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", on ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground")}
                          >
                            {b.name}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <Field id="swapNotes" label="What would you swap for?" error={err("swapNotes")}>
                    <Textarea value={values.pricing.swapNotes} onChange={(e) => set("pricing", { swapNotes: e.target.value })} maxLength={500} rows={2} placeholder="e.g. iPhone 15 or Galaxy S24, good condition" />
                  </Field>
                  <Field id="swapMaxCash" label="Largest cash difference you'd consider (GH₵, optional)" hint="Shown as a guide only. Every offer still states exactly who pays." error={err("swapMaxCash")}>
                    <Input inputMode="decimal" value={values.pricing.swapMaxCash} onChange={(e) => set("pricing", { swapMaxCash: e.target.value })} />
                  </Field>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Alert tone="info">Only your region, city and a general area are shown. Never publish your home address — agree a public meeting place in messages.</Alert>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="region" label="Region" required error={err("regionId")}>
                  <Select value={values.location.regionId} onChange={(e) => set("location", { regionId: e.target.value })}>
                    <option value="">Choose region…</option>
                    {catalogue.regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="city" label="City or town" required error={err("city")}>
                  <Input value={values.location.city} onChange={(e) => set("location", { city: e.target.value })} maxLength={80} placeholder="e.g. Accra" />
                </Field>
              </div>
              <Field id="area" label="Area (optional)" hint="A neighbourhood or landmark, e.g. East Legon or Adum." error={err("area")}>
                <Input value={values.location.area} onChange={(e) => set("location", { area: e.target.value })} maxLength={80} />
              </Field>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <Field id="title" label="Title" required hint="Leave as suggested or make it more specific." error={err("title")}>
                <Input value={values.details.title || suggestedTitle()} onChange={(e) => set("details", { title: e.target.value })} maxLength={120} />
              </Field>
              <Field id="description" label="Description" hint="Usage history, why you're selling, repairs, what's included." error={err("description")}>
                <Textarea value={values.details.description} onChange={(e) => set("details", { description: e.target.value })} maxLength={5000} rows={6} />
              </Field>
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">Summary</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <Summary label="Phone" value={[brand?.name, model?.name ?? values.phone.customModel].filter(Boolean).join(" ")} />
                  <Summary label="Storage" value={values.phone.storageGb ? formatStorage(Number(values.phone.storageGb)) : "—"} />
                  <Summary label="Condition" value={values.condition.condition ? CONDITION_LABEL[values.condition.condition] : "—"} />
                  <Summary label="Price" value={formatCedis(parseCedisToMinor(values.pricing.price))} />
                  <Summary label="Options" value={[values.pricing.availableForSale ? "For sale" : null, values.pricing.openToSwap ? "Open to swaps" : null].filter(Boolean).join(" · ")} />
                  <Summary label="Photos" value={`${images.length}`} />
                  <Summary label="Location" value={[values.location.area, values.location.city].filter(Boolean).join(", ") || "—"} />
                  <Summary label="Status" value={<Badge>{DISPLAY_STATE_LABEL[display]}</Badge>} />
                </dl>
              </div>
              <p className="flex items-start gap-2 text-xs text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                Our moderators review listings before they appear in search. You&apos;ll get a notification when it&apos;s live — or if anything needs changing.
              </p>
            </>
          ) : null}
        </div>

        <div className="mt-8 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={back} disabled={step === 0 || pending}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next} loading={pending}>
              {listingId ? "Save and continue" : "Continue"}
            </Button>
          ) : isDraft || status.moderation === "rejected" ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {!isDraft ? (
                <Button type="button" variant="outline" onClick={() => finish(false)} loading={pending}>
                  Save without resubmitting
                </Button>
              ) : null}
              <Button type="button" onClick={() => finish(true)} loading={pending}>
                <Check aria-hidden="true" /> {isDraft ? "Submit for review" : "Resubmit for review"}
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={() => finish(false)} loading={pending}>
              Save changes
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function ToggleRow({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value || "—"}</dd>
    </div>
  );
}
