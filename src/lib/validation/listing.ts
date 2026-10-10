import { z } from "zod";
import { ACCESSORY_VALUES, DEVICE_CHECK_KEYS } from "@/lib/catalog";
import { MAX_AMOUNT_MINOR, parseCedisToMinor } from "@/lib/money";

export const conditionEnum = z.enum(["new", "like_new", "excellent", "good", "fair", "refurbished"], {
  error: "Choose the condition.",
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Cedis typed by a person → integer pesewas. */
export const cedisAmount = (opts: { min?: number; required?: boolean } = {}) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === undefined || v === null || v === "") {
        if (opts.required) {
          ctx.addIssue({ code: "custom", message: "Enter an amount in GH₵." });
          return z.NEVER;
        }
        return null;
      }
      const minor = parseCedisToMinor(v);
      if (minor === null) {
        ctx.addIssue({ code: "custom", message: "Enter a valid amount, e.g. 8500 or 8,500.50." });
        return z.NEVER;
      }
      if (minor < (opts.min ?? 0) || minor > MAX_AMOUNT_MINOR) {
        ctx.addIssue({ code: "custom", message: `Amount must be between GH₵${(opts.min ?? 0) / 100} and GH₵1,000,000.` });
        return z.NEVER;
      }
      return minor;
    });

export const phoneStepSchema = z
  .object({
    brandId: z.coerce.number().int().positive({ error: "Choose a brand." }),
    modelId: z.coerce.number().int().positive().optional().nullable(),
    customModel: optionalText(80),
    variant: optionalText(60),
    storageGb: z.coerce.number().int().min(1).max(4096).optional().nullable(),
    ramGb: z.coerce.number().int().min(1).max(64).optional().nullable(),
    color: optionalText(40),
  })
  .refine((v) => Boolean(v.modelId) || Boolean(v.customModel && v.customModel.length >= 2), {
    error: "Choose a model, or type the model name.",
    path: ["modelId"],
  });
export type PhoneStepInput = z.input<typeof phoneStepSchema>;

export const deviceChecksSchema = z.partialRecord(z.enum(DEVICE_CHECK_KEYS), z.enum(["working", "faulty", "not_tested"]));

export const conditionStepSchema = z
  .object({
    condition: conditionEnum,
    batteryHealthStatus: z.enum(["reported", "unknown", "not_applicable"]),
    batteryHealth: z.coerce.number().int().min(1).max(100).optional().nullable(),
    deviceChecks: deviceChecksSchema.default({}),
    networkLock: z.enum(["unlocked", "locked", "unknown"]),
    accessories: z.array(z.enum(ACCESSORY_VALUES)).max(ACCESSORY_VALUES.length).default([]),
    defects: optionalText(1000),
    warrantyDetails: optionalText(300),
  })
  .superRefine((v, ctx) => {
    if (v.batteryHealthStatus === "reported" && !v.batteryHealth) {
      ctx.addIssue({ code: "custom", message: "Enter the battery health percentage (1–100).", path: ["batteryHealth"] });
    }
  })
  .transform((v) => ({ ...v, batteryHealth: v.batteryHealthStatus === "reported" ? (v.batteryHealth ?? null) : null }));
export type ConditionStepInput = z.input<typeof conditionStepSchema>;

export const pricingStepSchema = z
  .object({
    price: cedisAmount({ min: 100, required: true }),
    isNegotiable: z.boolean(),
    availableForSale: z.boolean(),
    openToSwap: z.boolean(),
    swapBrandIds: z.array(z.coerce.number().int().positive()).max(10).default([]),
    swapNotes: optionalText(500),
    swapMaxCash: cedisAmount(),
  })
  .refine((v) => v.availableForSale || v.openToSwap, {
    error: "Choose at least one: sell, swap, or both.",
    path: ["availableForSale"],
  });
export type PricingStepInput = z.input<typeof pricingStepSchema>;

export const locationStepSchema = z.object({
  regionId: z.coerce.number().int().positive({ error: "Choose a region." }),
  city: z.string().trim().min(2, { error: "Enter the city or town." }).max(80),
  area: optionalText(80),
});
export type LocationStepInput = z.input<typeof locationStepSchema>;

export const detailsStepSchema = z.object({
  title: z.string().trim().min(3, { error: "Add a short title." }).max(120),
  description: z.string().trim().max(5000).default(""),
});
export type DetailsStepInput = z.input<typeof detailsStepSchema>;

export const uuidSchema = z.uuid({ error: "Invalid identifier." });
