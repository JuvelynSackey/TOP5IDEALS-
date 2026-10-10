import { describe, expect, it } from "vitest";
import { describeCash, isConsistentCash } from "@/lib/cash";
import { formatCedis, minorToCedisInput, parseCedisToMinor } from "@/lib/money";
import { isOfferable, isPubliclyVisible, listingDisplayState, ownerActions } from "@/lib/listing-state";
import { offerActions, offerStatusLabel, transactionActions } from "@/lib/offers";
import { listingPath, parseListingParam, slugify } from "@/lib/slug";
import { formatGhanaPhone, normalizePhone } from "@/lib/phone";
import { fromDbError } from "@/lib/errors";
import { safeNextPath } from "@/lib/validation/auth";
import { redactForLogging } from "@/lib/logger";

describe("money", () => {
  it("parses cedis input into integer pesewas", () => {
    expect(parseCedisToMinor("8500")).toBe(850000);
    expect(parseCedisToMinor("8,500.5")).toBe(850050);
    expect(parseCedisToMinor("GH₵ 1 500.25")).toBe(150025);
    expect(parseCedisToMinor(0)).toBe(0);
  });

  it("rejects negative, malformed and over-precise amounts", () => {
    expect(parseCedisToMinor("-5")).toBeNull();
    expect(parseCedisToMinor("1.234")).toBeNull();
    expect(parseCedisToMinor("abc")).toBeNull();
    expect(parseCedisToMinor("")).toBeNull();
    expect(parseCedisToMinor("1e5")).toBeNull();
  });

  it("formats pesewas as GH₵", () => {
    expect(formatCedis(850000)).toBe("GH₵8,500");
    expect(formatCedis(850050)).toBe("GH₵8,500.50");
    expect(formatCedis(null)).toBe("—");
    expect(minorToCedisInput(150025)).toBe("1500.25");
    expect(minorToCedisInput(150000)).toBe("1500");
  });
});

describe("cash difference wording", () => {
  it("enforces zero ⇔ nobody pays", () => {
    expect(isConsistentCash({ amountMinor: 0, payer: "none" })).toBe(true);
    expect(isConsistentCash({ amountMinor: 100, payer: "none" })).toBe(false);
    expect(isConsistentCash({ amountMinor: 0, payer: "initiator" })).toBe(false);
    expect(isConsistentCash({ amountMinor: -1, payer: "initiator" })).toBe(false);
  });

  it("describes who pays from each perspective", () => {
    const terms = { amountMinor: 150000, payer: "initiator" as const };
    const names = { initiator: "Ama", recipient: "Kofi" };
    expect(describeCash(terms, "initiator", names)).toBe("You pay Kofi GH₵1,500");
    expect(describeCash(terms, "recipient", names)).toBe("Ama pays you GH₵1,500");
    expect(describeCash(terms, "observer", names)).toBe("Ama pays Kofi GH₵1,500");
    expect(describeCash({ amountMinor: 50000, payer: "recipient" }, "initiator", names)).toBe("Kofi pays you GH₵500");
    expect(describeCash({ amountMinor: 0, payer: "none" }, "initiator", names)).toMatch(/no cash/);
  });
});

describe("listing states", () => {
  it("never presents unapproved listings as live", () => {
    expect(listingDisplayState("published", "pending_review")).toBe("in_review");
    expect(listingDisplayState("published", "rejected")).toBe("rejected");
    expect(listingDisplayState("published", "approved")).toBe("live");
    expect(listingDisplayState("paused", "approved")).toBe("paused");
    expect(listingDisplayState("reserved", "approved")).toBe("reserved");
    expect(isPubliclyVisible("published", "pending_review")).toBe(false);
    expect(isPubliclyVisible("sold", "approved")).toBe(true);
    expect(isOfferable("reserved", "approved")).toBe(false);
    expect(isOfferable("published", "approved")).toBe(true);
  });

  it("only exposes valid owner transitions", () => {
    expect(ownerActions("reserved", "approved")).toMatchObject({ edit: false, archive: false, pause: false, markSold: false });
    expect(ownerActions("published", "approved")).toMatchObject({ pause: true, archive: true, markSold: true, submit: false });
    expect(ownerActions("published", "rejected")).toMatchObject({ submit: true, markSold: false });
    expect(ownerActions("draft", "not_submitted")).toMatchObject({ submit: true, delete: true });
  });
});

describe("offer state machine (client mirror)", () => {
  const future = new Date(Date.now() + 3600_000);
  const past = new Date(Date.now() - 1000);

  it("only lets the awaiting party accept or counter", () => {
    const recipient = offerActions({ status: "pending", awaitingParty: "recipient", expiresAt: future, viewerParty: "recipient" });
    expect(recipient).toMatchObject({ canAccept: true, canCounter: true, canReject: true, canCancel: false });
    const initiator = offerActions({ status: "pending", awaitingParty: "recipient", expiresAt: future, viewerParty: "initiator" });
    expect(initiator).toMatchObject({ canAccept: false, canCounter: false, canCancel: true, waitingOnOther: true });
    const stranger = offerActions({ status: "pending", awaitingParty: "recipient", expiresAt: future, viewerParty: null });
    expect(stranger).toMatchObject({ canAccept: false, canReject: false, canCancel: false });
  });

  it("disables acceptance of expired or closed offers", () => {
    expect(offerActions({ status: "pending", awaitingParty: "recipient", expiresAt: past, viewerParty: "recipient" })).toMatchObject({
      expired: true,
      canAccept: false,
      canCounter: false,
    });
    expect(offerActions({ status: "cancelled", awaitingParty: null, expiresAt: future, viewerParty: "recipient" }).canAccept).toBe(false);
    expect(offerStatusLabel("pending", 3, false)).toBe("Countered");
    expect(offerStatusLabel("pending", 1, true)).toBe("Expired");
  });

  it("requires both confirmations and routes disagreements to disputes", () => {
    expect(transactionActions({ status: "active", confirmedByMe: false, confirmedByOther: false, isParty: true })).toMatchObject({
      canConfirm: true,
      canCancel: true,
    });
    expect(transactionActions({ status: "active", confirmedByMe: false, confirmedByOther: true, isParty: true })).toMatchObject({
      canConfirm: true,
      canCancel: false,
      canDispute: true,
    });
    expect(transactionActions({ status: "active", confirmedByMe: true, confirmedByOther: false, isParty: true }).awaitingOther).toBe(true);
    expect(transactionActions({ status: "disputed", confirmedByMe: true, confirmedByOther: false, isParty: true }).canConfirm).toBe(false);
    expect(transactionActions({ status: "completed", confirmedByMe: true, confirmedByOther: true, isParty: true }).canReview).toBe(true);
    expect(transactionActions({ status: "completed", confirmedByMe: false, confirmedByOther: false, isParty: false }).canReview).toBe(false);
  });
});

describe("slugs", () => {
  it("builds and parses stable listing URLs", () => {
    expect(listingPath("iphone-14-pro-256gb-accra", "k3f9a2x1")).toBe("/phones/iphone-14-pro-256gb-accra-k3f9a2x1");
    expect(parseListingParam("iphone-14-pro-256gb-accra-k3f9a2x1")).toEqual({ slug: "iphone-14-pro-256gb-accra", key: "k3f9a2x1" });
    expect(parseListingParam("k3f9a2x1")).toEqual({ slug: "", key: "k3f9a2x1" });
    expect(parseListingParam("../etc/passwd")).toBeNull();
    expect(slugify("Kofi's Phones & More — Accra!")).toBe("kofi-s-phones-more-accra");
  });
});

describe("phone numbers", () => {
  it("normalises Ghana numbers to E.164 without hard-coding operator prefixes", () => {
    expect(normalizePhone("024 123 4567")).toBe("+233241234567");
    expect(normalizePhone("0591234567")).toBe("+233591234567");
    expect(normalizePhone("+233 20 123 4567")).toBe("+233201234567");
    expect(normalizePhone("233201234567")).toBe("+233201234567");
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+2332012345")).toBeNull();
    expect(formatGhanaPhone("+233241234567")).toBe("+233 24 123 4567");
  });
});

describe("security helpers", () => {
  it("only allows relative same-site redirects", () => {
    expect(safeNextPath("/dashboard/offers")).toBe("/dashboard/offers");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(undefined, "/")).toBe("/");
  });

  it("maps database business errors to safe messages", () => {
    expect(fromDbError({ code: "P0001", message: "listing_unavailable", details: "This listing is no longer available." })).toEqual({
      ok: false,
      code: "listing_unavailable",
      error: "This listing is no longer available.",
    });
    const leaked = fromDbError({ code: "XX000", message: 'relation "secret_table" does not exist' });
    expect(leaked.error).not.toMatch(/secret_table/);
    expect(fromDbError({ code: "42501", message: "permission denied for table profiles" }).code).toBe("forbidden");
  });

  it("redacts sensitive fields in logs", () => {
    const out = redactForLogging({ userId: "u1", password: "hunter2", nested: { accessToken: "abc", body: "private message" } }) as Record<
      string,
      unknown
    >;
    expect(out.password).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).accessToken).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).body).toBe("[redacted]");
    expect(out.userId).toBe("u1");
  });
});
