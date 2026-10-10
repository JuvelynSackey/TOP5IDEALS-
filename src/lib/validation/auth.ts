import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." }));

export const passwordSchema = z
  .string()
  .min(8, { error: "Use at least 8 characters." })
  .max(72, { error: "Use at most 72 characters." })
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), { error: "Include at least one letter and one number." });

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, { error: "Enter your name." }).max(100),
  email: emailSchema,
  password: passwordSchema,
  accountType: z.enum(["individual", "business"]),
  acceptTerms: z.literal(true, { error: "You must accept the terms to continue." }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password." }).max(72),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: "Passwords do not match.", path: ["confirm"] });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, { error: "3–30 characters: lowercase letters, numbers and underscores." });

export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(20)
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. 024 123 4567." });
      return z.NEVER;
    }
    return normalized;
  });

export const profileSchema = z.object({
  username: usernameSchema,
  fullName: z.string().trim().min(2, { error: "Enter your name." }).max(100),
  regionId: z.coerce.number().int().positive({ error: "Choose your region." }),
  city: z.string().trim().min(2, { error: "Enter your city or town." }).max(80),
  bio: z.string().trim().max(600).optional().transform((v) => v || null),
  phone: optionalPhoneSchema,
});
export type ProfileInput = z.input<typeof profileSchema>;

export const businessProfileSchema = z.object({
  businessName: z.string().trim().min(2, { error: "Enter your business name." }).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: "Use lowercase letters, numbers and single hyphens." })
    .min(3)
    .max(60),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  regionId: z.coerce.number().int().positive({ error: "Choose a region." }),
  city: z.string().trim().min(2).max(80),
  area: z.string().trim().max(80).optional().transform((v) => v || null),
  publicPhone: optionalPhoneSchema,
});
export type BusinessProfileInput = z.input<typeof businessProfileSchema>;

/** Only allow same-site relative redirects after auth (prevents open redirects). */
export function safeNextPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value.slice(0, 500);
}
