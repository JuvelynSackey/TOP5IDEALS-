import { describe, expect, it } from "vitest";
import { profileSchema, signUpSchema } from "@/lib/validation/auth";
import { conditionStepSchema, phoneStepSchema, pricingStepSchema } from "@/lib/validation/listing";
import { counterOfferSchema, parseSearchParams, purchaseOfferSchema, reviewSchema, swapOfferSchema } from "@/lib/validation/marketplace";

const uuid = "4f1c2b7e-8a9d-4c3b-9e2f-1a2b3c4d5e6f";
const uuid2 = "5f1c2b7e-8a9d-4c3b-9e2f-1a2b3c4d5e6f";

describe("auth schemas", () => {
  it("validates sign-up input", () => {
    const good = signUpSchema.safeParse({ fullName: "Ama Mensah", email: " AMA@Example.com ", password: "secret123", accountType: "individual", acceptTerms: true });
    expect(good.success && good.data.email).toBe("ama@example.com");
    expect(signUpSchema.safeParse({ fullName: "A", email: "x", password: "short", accountType: "individual", acceptTerms: true }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "Ama", email: "a@b.co", password: "lettersonly", accountType: "individual", acceptTerms: true }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "Ama", email: "a@b.co", password: "secret123", accountType: "admin", acceptTerms: true }).success).toBe(false);
  });

  it("normalises usernames and phone numbers in profiles", () => {
    const r = profileSchema.parse({ username: "Ama_GH", fullName: "Ama Mensah", regionId: "1", city: "Accra", phone: "024 123 4567" });
    expect(r.username).toBe("ama_gh");
    expect(r.phone).toBe("+233241234567");
    expect(profileSchema.safeParse({ username: "a b", fullName: "Ama", regionId: 1, city: "Accra" }).success).toBe(false);
    expect(profileSchema.safeParse({ username: "ama", fullName: "Ama", regionId: 1, city: "Accra", phone: "123" }).success).toBe(false);
  });
});

describe("listing schemas", () => {
  it("requires a model or a custom model name", () => {
    expect(phoneStepSchema.safeParse({ brandId: 1 }).success).toBe(false);
    expect(phoneStepSchema.safeParse({ brandId: 1, modelId: 5 }).success).toBe(true);
    expect(phoneStepSchema.safeParse({ brandId: 12, customModel: "Fold X" }).success).toBe(true);
  });

  it("requires battery percentage only when reported and validates range", () => {
    const base = { condition: "good", networkLock: "unknown", accessories: [], deviceChecks: {} };
    expect(conditionStepSchema.safeParse({ ...base, batteryHealthStatus: "reported" }).success).toBe(false);
    expect(conditionStepSchema.safeParse({ ...base, batteryHealthStatus: "reported", batteryHealth: 120 }).success).toBe(false);
    const ok = conditionStepSchema.parse({ ...base, batteryHealthStatus: "unknown", batteryHealth: 90 });
    expect(ok.batteryHealth).toBeNull();
    expect(conditionStepSchema.safeParse({ ...base, batteryHealthStatus: "unknown", deviceChecks: { biometrics: "perfect" } }).success).toBe(false);
    expect(conditionStepSchema.safeParse({ ...base, batteryHealthStatus: "unknown", accessories: ["jetpack"] }).success).toBe(false);
  });

  it("converts prices to pesewas and requires sale or swap", () => {
    const r = pricingStepSchema.parse({ price: "8,500", isNegotiable: true, availableForSale: true, openToSwap: false });
    expect(r.price).toBe(850000);
    expect(pricingStepSchema.safeParse({ price: "0.50", isNegotiable: false, availableForSale: true, openToSwap: false }).success).toBe(false);
    expect(pricingStepSchema.safeParse({ price: "100", isNegotiable: false, availableForSale: false, openToSwap: false }).success).toBe(false);
  });
});

describe("offer schemas", () => {
  it("rejects ambiguous cash differences", () => {
    const base = { listingId: uuid, offeredListingIds: [uuid2], idempotencyKey: uuid };
    expect(swapOfferSchema.safeParse({ ...base, cash: "1500", cashPayer: "none" }).success).toBe(false);
    expect(swapOfferSchema.safeParse({ ...base, cash: "", cashPayer: "initiator" }).success).toBe(false);
    expect(swapOfferSchema.safeParse({ ...base, cash: "-10", cashPayer: "initiator" }).success).toBe(false);
    const straight = swapOfferSchema.parse({ ...base, cash: "", cashPayer: "none" });
    expect(straight.cash).toBe(0);
    const topUp = swapOfferSchema.parse({ ...base, cash: "1,500", cashPayer: "initiator" });
    expect(topUp.cash).toBe(150000);
    expect(swapOfferSchema.safeParse({ ...base, offeredListingIds: [], cash: "", cashPayer: "none" }).success).toBe(false);
  });

  it("validates counteroffers and purchases", () => {
    expect(counterOfferSchema.safeParse({ offerId: uuid, expectedVersion: 2, cash: "200", cashPayer: "recipient" }).success).toBe(true);
    expect(counterOfferSchema.safeParse({ offerId: uuid, expectedVersion: 0, cash: "200", cashPayer: "recipient" }).success).toBe(false);
    expect(purchaseOfferSchema.safeParse({ listingId: uuid, amount: "", idempotencyKey: uuid }).success).toBe(false);
    expect(purchaseOfferSchema.parse({ listingId: uuid, amount: "8500", idempotencyKey: uuid }).amount).toBe(850000);
  });

  it("validates review ratings", () => {
    expect(reviewSchema.safeParse({ transactionId: uuid, overall: 6, communication: 5, accuracy: 5, experience: 5 }).success).toBe(false);
    expect(reviewSchema.safeParse({ transactionId: uuid, overall: 5, communication: 5, accuracy: 5, experience: 5 }).success).toBe(true);
  });
});

describe("search params", () => {
  it("keeps valid filters and drops invalid ones independently", () => {
    const r = parseSearchParams({ q: "iphone", min: "1000", max: "abc", condition: "excellent", sort: "drop table", region: "greater-accra", swap: "1" });
    expect(r).toEqual({ q: "iphone", min: 1000, condition: "excellent", region: "greater-accra", swap: "1" });
  });
});
