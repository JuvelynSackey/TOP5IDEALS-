/**
 * Real-Postgres concurrency test against a NON-PRODUCTION Supabase project.
 * PGlite (used by tests/db) is single-connection, so true parallel acceptance
 * can only be exercised here.
 *
 * Required env: SUPABASE_TEST_URL, SUPABASE_TEST_PUBLISHABLE_KEY,
 *   TEST_SELLER_EMAIL/PASSWORD, TEST_BUYER_EMAIL/PASSWORD, TEST_BUYER2_EMAIL/PASSWORD,
 *   TEST_TARGET_LISTING_ID (seller's live listing, open to sale)
 * Run with: npx vitest run tests/integration
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const configured = Boolean(url && key && process.env.TEST_SELLER_EMAIL && process.env.TEST_BUYER_EMAIL && process.env.TEST_BUYER2_EMAIL && process.env.TEST_TARGET_LISTING_ID);

async function signIn(email: string, password: string) {
  const client = createClient<Database>(url!, key!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

describe.skipIf(!configured)("concurrent acceptance on real Postgres", () => {
  it("never reserves the same listing for two transactions", async () => {
    const seller = await signIn(process.env.TEST_SELLER_EMAIL!, process.env.TEST_SELLER_PASSWORD!);
    const buyer = await signIn(process.env.TEST_BUYER_EMAIL!, process.env.TEST_BUYER_PASSWORD!);
    const buyer2 = await signIn(process.env.TEST_BUYER2_EMAIL!, process.env.TEST_BUYER2_PASSWORD!);
    const listing = process.env.TEST_TARGET_LISTING_ID!;
    const { data: row } = await seller.from("listings").select("price_minor").eq("id", listing).single();
    const price = row!.price_minor!;

    const a = await buyer.rpc("initiate_purchase", { p_listing_id: listing, p_amount_minor: price, p_message: "", p_idempotency_key: randomUUID() });
    const b = await buyer2.rpc("initiate_purchase", { p_listing_id: listing, p_amount_minor: price, p_message: "", p_idempotency_key: randomUUID() });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();

    // Fire both acceptances at the same time on separate connections.
    const results = await Promise.all([
      seller.rpc("accept_swap_offer", { p_offer_id: a.data!, p_expected_version: 1 }),
      seller.rpc("accept_swap_offer", { p_offer_id: b.data!, p_expected_version: 1 }),
    ]);
    const succeeded = results.filter((r) => !r.error);
    try {
      expect(succeeded).toHaveLength(1);
      // The loser must get a clean business error — never a deadlock (40P01).
      expect(results.find((r) => r.error)?.error?.message).toMatch(/^(listing_unavailable|offer_closed)$/);
    } finally {
      // Always release the listing so a failed run can't leave it reserved.
      for (const winner of succeeded) {
        await seller.rpc("cancel_transaction", { p_transaction_id: winner.data!, p_reason: "integration test cleanup" });
      }
    }
  });
});
