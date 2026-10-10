import { z } from "zod";
import { cedisAmount } from "./listing";

export const cashPayerEnum = z.enum(["none", "initiator", "recipient"]);

const message = z
  .string()
  .trim()
  .max(1000, { error: "Keep your note under 1,000 characters." })
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const cashFields = { cash: cedisAmount(), cashPayer: cashPayerEnum };

/** Cash terms: zero ⇔ nobody pays. Rejects ambiguous swaps before the DB does. */
function refineCash(v: { cash: number | null; cashPayer: z.infer<typeof cashPayerEnum> }, ctx: z.RefinementCtx) {
  const cash = v.cash ?? 0;
  if (cash > 0 && v.cashPayer === "none") {
    ctx.addIssue({ code: "custom", message: "Choose who pays the cash difference.", path: ["cashPayer"] });
  }
  if (cash === 0 && v.cashPayer !== "none") {
    ctx.addIssue({ code: "custom", message: "Enter the cash amount, or choose “no cash”.", path: ["cash"] });
  }
}

export const swapOfferSchema = z
  .object({
    ...cashFields,
    listingId: z.uuid(),
    offeredListingIds: z
      .array(z.uuid())
      .min(1, { error: "Choose at least one of your phones to offer." })
      .max(3, { error: "Offer at most three phones." }),
    message,
    idempotencyKey: z.uuid(),
  })
  .superRefine(refineCash)
  .transform((v) => ({ ...v, cash: v.cash ?? 0 }));
export type SwapOfferInput = z.input<typeof swapOfferSchema>;

export const purchaseOfferSchema = z.object({
  listingId: z.uuid(),
  amount: cedisAmount({ min: 100, required: true }),
  message,
  idempotencyKey: z.uuid(),
});
export type PurchaseOfferInput = z.input<typeof purchaseOfferSchema>;

export const counterOfferSchema = z
  .object({
    ...cashFields,
    offerId: z.uuid(),
    expectedVersion: z.coerce.number().int().min(1),
    message,
  })
  .superRefine(refineCash)
  .transform((v) => ({ ...v, cash: v.cash ?? 0 }));
export type CounterOfferInput = z.input<typeof counterOfferSchema>;

export const messageSchema = z.object({
  conversationId: z.uuid(),
  body: z.string().trim().min(1, { error: "Type a message." }).max(2000, { error: "Messages are limited to 2,000 characters." }),
  clientId: z.uuid(),
});

const rating = z.coerce.number().int().min(1, { error: "Choose 1–5 stars." }).max(5);
export const reviewSchema = z.object({
  transactionId: z.uuid(),
  overall: rating,
  communication: rating,
  accuracy: rating,
  experience: rating,
  comment: z
    .string()
    .trim()
    .max(1500)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type ReviewInput = z.input<typeof reviewSchema>;

export const reportSchema = z.object({
  targetType: z.enum(["listing", "user", "message", "review", "transaction"]),
  targetId: z.uuid(),
  reason: z.enum(["fraud", "stolen_device", "counterfeit", "misleading", "prohibited_item", "harassment", "spam", "other"], {
    error: "Choose a reason.",
  }),
  details: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type ReportInput = z.input<typeof reportSchema>;

export const disputeSchema = z.object({
  transactionId: z.uuid(),
  category: z.enum(["no_show", "not_as_described", "other_party_unresponsive", "payment_issue", "suspected_fraud", "other"], {
    error: "Choose what went wrong.",
  }),
  description: z.string().trim().min(10, { error: "Describe the problem in at least 10 characters." }).max(2000),
});
export type DisputeInput = z.input<typeof disputeSchema>;

/** Public search URL parameters. Anything unexpected is dropped, never passed through. */
export const searchParamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  brand: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  model: z.coerce.number().int().positive().optional(),
  min: z.coerce.number().min(0).max(1_000_000).optional(),
  max: z.coerce.number().min(0).max(1_000_000).optional(),
  storage: z.coerce.number().int().positive().max(4096).optional(),
  ram: z.coerce.number().int().positive().max(64).optional(),
  condition: z.enum(["new", "like_new", "excellent", "good", "fair", "refurbished"]).optional(),
  battery: z.coerce.number().int().min(50).max(100).optional(),
  region: z.string().regex(/^[a-z-]{2,40}$/).optional(),
  city: z.string().trim().max(80).optional(),
  seller: z.enum(["individual", "business"]).optional(),
  swap: z.enum(["1"]).optional(),
  verified: z.enum(["1"]).optional(),
  sort: z.enum(["recommended", "newest", "price_asc", "price_desc"]).optional(),
  page: z.coerce.number().int().min(1).max(200).optional(),
});
export type SearchParams = z.infer<typeof searchParamsSchema>;

export function parseSearchParams(raw: Record<string, string | string[] | undefined>): SearchParams {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") flat[k] = value;
  }
  const result: Record<string, unknown> = {};
  // Validate field-by-field so one bad parameter doesn't discard the rest.
  for (const [key, schema] of Object.entries(searchParamsSchema.shape)) {
    if (!(key in flat)) continue;
    const parsed = (schema as z.ZodType).safeParse(flat[key]);
    if (parsed.success && parsed.data !== undefined) result[key] = parsed.data;
  }
  return result as SearchParams;
}
