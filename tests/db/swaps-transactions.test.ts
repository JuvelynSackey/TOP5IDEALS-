import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, fails, q } from "./harness";
import { createDraft, createLiveListing, listingStatus, makeWorld, offerRow, swapOffer, type World } from "./fixtures";

let w: World;

beforeAll(async () => {
  w = await makeWorld(await createTestDb());
});

async function events(offerId: string) {
  const r = await w.db.query<{ version: number; event_type: string; cash_amount_minor: string | null; cash_payer: string | null }>(
    `select version, event_type, cash_amount_minor, cash_payer from public.swap_offer_events where offer_id = $1 order by id`,
    [offerId],
  );
  return r.rows.map((e) => ({ ...e, cash_amount_minor: e.cash_amount_minor === null ? null : Number(e.cash_amount_minor) }));
}

describe("creating swap offers", () => {
  it("creates a swap offer with an owned phone plus cash and notifies the seller", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer, target, [mine], 150000, "initiator");
    expect(await offerRow(w.db, offer)).toEqual({ status: "pending", current_version: 1, awaiting_party: "recipient" });
    expect(await events(offer)).toEqual([{ version: 1, event_type: "created", cash_amount_minor: 150000, cash_payer: "initiator" }]);
    const notes = await q<{ type: string }>(w.db, w.seller.id, `select type from public.notifications where entity_id = $1`, [offer]);
    expect(notes.map((n) => n.type)).toContain("offer_received");
    // A conversation for arranging the exchange is linked.
    const conv = await q(w.db, w.buyer.id, `select c.id from public.conversations c join public.swap_offers o on o.conversation_id = c.id where o.id = $1`, [offer]);
    expect(conv).toHaveLength(1);
  });

  it("is idempotent for retried submissions", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const key = randomUUID();
    const sql = `select public.create_swap_offer($1, $2::uuid[], 0, 'none', null, $3) as id`;
    const a = await q<{ id: string }>(w.db, w.buyer.id, sql, [target, [mine], key]);
    const b = await q<{ id: string }>(w.db, w.buyer.id, sql, [target, [mine], key]);
    expect(a[0]!.id).toBe(b[0]!.id);
    const count = await w.db.query<{ n: number }>(`select count(*)::int n from public.swap_offers where listing_id = $1`, [target]);
    expect(count.rows[0]!.n).toBe(1);
  });

  it("rejects a second open offer from the same buyer on the same listing", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    await swapOffer(w, w.buyer, target, [mine], 0, "none");
    const err = await fails(w.db, w.buyer.id, `select public.create_swap_offer($1, $2::uuid[], 0, 'none', null, $3)`, [target, [mine], randomUUID()]);
    expect(err).toBe("duplicate_offer");
  });

  it("rejects offering another person's phone", async () => {
    const target = await createLiveListing(w, w.seller);
    const notMine = await createLiveListing(w, w.stranger, { model: "pixel-8" });
    const err = await fails(w.db, w.buyer.id, `select public.create_swap_offer($1, $2::uuid[], 0, 'none', null, $3)`, [target, [notMine], randomUUID()]);
    expect(err).toBe("not_owner");
  });

  it("rejects offers on your own listing", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.seller, { model: "pixel-8" });
    const err = await fails(w.db, w.seller.id, `select public.create_swap_offer($1, $2::uuid[], 0, 'none', null, $3)`, [target, [mine], randomUUID()]);
    expect(err).toBe("own_listing");
  });

  it("rejects ineligible target and offered listings", async () => {
    const draft = await createDraft(w.db, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    expect(await fails(w.db, w.buyer.id, `select public.create_swap_offer($1, $2::uuid[], 0, 'none', null, $3)`, [draft, [mine], randomUUID()])).toBe(
      "listing_unavailable",
    );
    const target = await createLiveListing(w, w.seller);
    const myDraft = await createDraft(w.db, w.buyer, { model: "pixel-8" });
    expect(
      await fails(w.db, w.buyer.id, `select public.create_swap_offer($1, $2::uuid[], 0, 'none', null, $3)`, [target, [myDraft], randomUUID()]),
    ).toBe("offered_listing_unavailable");
    const saleOnly = await createLiveListing(w, w.seller, { openToSwap: false });
    expect(
      await fails(w.db, w.buyer.id, `select public.create_swap_offer($1, $2::uuid[], 0, 'none', null, $3)`, [saleOnly, [mine], randomUUID()]),
    ).toBe("swap_not_accepted");
  });

  it("rejects ambiguous or invalid cash terms", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const sql = `select public.create_swap_offer($1, $2::uuid[], $3, $4::public.cash_payer, null, $5)`;
    expect(await fails(w.db, w.buyer.id, sql, [target, [mine], 50000, "none", randomUUID()])).toBe("invalid_cash");
    expect(await fails(w.db, w.buyer.id, sql, [target, [mine], 0, "initiator", randomUUID()])).toBe("invalid_cash");
    expect(await fails(w.db, w.buyer.id, sql, [target, [mine], -100, "initiator", randomUUID()])).toBe("invalid_cash");
    expect(await fails(w.db, w.buyer.id, sql, [target, [mine], 100000001, "initiator", randomUUID()])).toBe("invalid_cash");
  });

  it("requires sign-in, an active account and a complete profile", async () => {
    const target = await createLiveListing(w, w.seller);
    expect(await fails(w.db, null, `select public.initiate_purchase($1, 850000, null, $2)`, [target, randomUUID()])).toMatch(
      /permission denied|not_authenticated/,
    );
    const incomplete = await createUser(w.db, "Incomplete", { complete: false });
    expect(await fails(w.db, incomplete.id, `select public.initiate_purchase($1, 850000, null, $2)`, [target, randomUUID()])).toBe(
      "profile_incomplete",
    );
  });
});

describe("purchase offers", () => {
  it("validates purchase amounts against price and negotiability", async () => {
    const fixed = await createLiveListing(w, w.seller, { negotiable: false, priceMinor: 500000 });
    expect(await fails(w.db, w.buyer.id, `select public.initiate_purchase($1, 450000, null, $2)`, [fixed, randomUUID()])).toBe("invalid_cash");
    expect(await fails(w.db, w.buyer.id, `select public.initiate_purchase($1, 600000, null, $2)`, [fixed, randomUUID()])).toBe("invalid_cash");
    await q(w.db, w.buyer.id, `select public.initiate_purchase($1, 500000, null, $2)`, [fixed, randomUUID()]);
    const swapOnly = await createLiveListing(w, w.seller, { forSale: false, openToSwap: true });
    expect(await fails(w.db, w.buyer.id, `select public.initiate_purchase($1, 500000, null, $2)`, [swapOnly, randomUUID()])).toBe("not_for_sale");
  });
});

describe("negotiation", () => {
  it("records counteroffers as new immutable versions and alternates turns", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer, target, [mine], 100000, "initiator");

    // The initiator cannot counter their own proposal.
    expect(await fails(w.db, w.buyer.id, `select public.counter_swap_offer($1, 1, 120000, 'initiator', null)`, [offer])).toBe("not_your_turn");
    // A third party cannot touch the offer at all.
    expect(await fails(w.db, w.stranger.id, `select public.counter_swap_offer($1, 1, 120000, 'initiator', null)`, [offer])).toBe("not_found");
    expect(await fails(w.db, w.stranger.id, `select public.accept_swap_offer($1, 1)`, [offer])).toBe("not_found");
    expect(await fails(w.db, w.stranger.id, `select public.reject_swap_offer($1, null)`, [offer])).toBe("not_found");
    expect(await q(w.db, w.stranger.id, `select * from public.swap_offers where id = $1`, [offer])).toHaveLength(0);
    expect(await q(w.db, w.stranger.id, `select * from public.swap_offer_events where offer_id = $1`, [offer])).toHaveLength(0);

    // Seller counters asking for more cash.
    await q(w.db, w.seller.id, `select public.counter_swap_offer($1, 1, 200000, 'initiator', 'Need a bit more')`, [offer]);
    expect(await offerRow(w.db, offer)).toEqual({ status: "pending", current_version: 2, awaiting_party: "initiator" });

    // Stale version is rejected.
    expect(await fails(w.db, w.buyer.id, `select public.accept_swap_offer($1, 1)`, [offer])).toBe("offer_changed");
    // Identical terms are not a counteroffer.
    expect(await fails(w.db, w.buyer.id, `select public.counter_swap_offer($1, 2, 200000, 'initiator', null)`, [offer])).toBe("no_change");

    // Buyer counters back.
    await q(w.db, w.buyer.id, `select public.counter_swap_offer($1, 2, 175000, 'initiator', null)`, [offer]);
    expect(await events(offer)).toEqual([
      { version: 1, event_type: "created", cash_amount_minor: 100000, cash_payer: "initiator" },
      { version: 2, event_type: "countered", cash_amount_minor: 200000, cash_payer: "initiator" },
      { version: 3, event_type: "countered", cash_amount_minor: 175000, cash_payer: "initiator" },
    ]);
    const items = await w.db.query<{ n: number }>(`select count(*)::int n from public.swap_offer_items where offer_id = $1`, [offer]);
    expect(items.rows[0]!.n).toBe(3);
  });

  it("refuses to rewrite or delete negotiation history even for privileged roles", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer, target, [mine], 100000, "initiator");
    await expect(w.db.query(`update public.swap_offer_events set cash_amount_minor = 1 where offer_id = $1`, [offer])).rejects.toThrow(/immutable/);
    await expect(w.db.query(`delete from public.swap_offer_events where offer_id = $1`, [offer])).rejects.toThrow(/immutable/);
    expect(await fails(w.db, w.buyer.id, `update public.swap_offer_events set message = 'x' where offer_id = $1`, [offer])).toMatch(
      /permission denied/,
    );
  });

  it("lets the awaiting party reject and only the initiator cancel", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer, target, [mine], 0, "none");
    expect(await fails(w.db, w.buyer.id, `select public.reject_swap_offer($1, null)`, [offer])).toBe("not_your_turn");
    expect(await fails(w.db, w.seller.id, `select public.cancel_swap_offer($1)`, [offer])).toBe("forbidden");
    await q(w.db, w.seller.id, `select public.reject_swap_offer($1, 'Not interested')`, [offer]);
    expect((await offerRow(w.db, offer)).status).toBe("rejected");
    expect(await fails(w.db, w.seller.id, `select public.accept_swap_offer($1, 1)`, [offer])).toBe("offer_closed");

    const offer2 = await swapOffer(w, w.buyer, target, [mine], 0, "none");
    await q(w.db, w.buyer.id, `select public.cancel_swap_offer($1)`, [offer2]);
    expect((await offerRow(w.db, offer2)).status).toBe("cancelled");
    expect(await fails(w.db, w.seller.id, `select public.accept_swap_offer($1, 1)`, [offer2])).toBe("offer_closed");
  });

  it("expires overdue offers and refuses to accept them", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer, target, [mine], 0, "none");
    await w.db.query(`update public.swap_offers set expires_at = now() - interval '1 minute' where id = $1`, [offer]);
    expect(await fails(w.db, w.seller.id, `select public.accept_swap_offer($1, 1)`, [offer])).toBe("offer_expired");
    const n = await q<{ n: number }>(w.db, w.stranger.id, `select public.expire_due_offers() as n`);
    expect(n[0]!.n).toBeGreaterThanOrEqual(1);
    expect((await offerRow(w.db, offer)).status).toBe("expired");
    expect(await fails(w.db, w.seller.id, `select public.accept_swap_offer($1, 1)`, [offer])).toBe("offer_closed");
  });

  it("cancels open offers when a listing involved is paused", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer, target, [mine], 0, "none");
    await q(w.db, w.buyer.id, `select public.pause_listing($1)`, [mine]);
    expect((await offerRow(w.db, offer)).status).toBe("cancelled");
  });
});

describe("acceptance, reservation and conflicts", () => {
  it("reserves both phones atomically and blocks conflicting deals", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const theirs = await createLiveListing(w, w.buyer2, { model: "pixel-8" });
    const offerA = await swapOffer(w, w.buyer, target, [mine], 150000, "initiator");
    const offerB = await swapOffer(w, w.buyer2, target, [theirs], 0, "none");
    const purchase = await q<{ id: string }>(w.db, w.stranger.id, `select public.initiate_purchase($1, 800000, null, $2) as id`, [target, randomUUID()]);

    const tx = await q<{ id: string }>(w.db, w.seller.id, `select public.accept_swap_offer($1, 1) as id`, [offerA]);
    expect(tx[0]!.id).toBeTruthy();
    expect((await listingStatus(w.db, target)).status).toBe("reserved");
    expect((await listingStatus(w.db, mine)).status).toBe("reserved");

    // Competing offers were closed and cannot be accepted.
    expect((await offerRow(w.db, offerB)).status).toBe("cancelled");
    expect((await offerRow(w.db, purchase[0]!.id)).status).toBe("cancelled");
    expect(await fails(w.db, w.seller.id, `select public.accept_swap_offer($1, 1)`, [offerB])).toBe("offer_closed");

    // The reserved phones cannot be offered or bought elsewhere.
    expect(await fails(w.db, w.buyer2.id, `select public.initiate_purchase($1, 800000, null, $2)`, [target, randomUUID()])).toBe(
      "listing_unavailable",
    );
    const other = await createLiveListing(w, w.stranger, { model: "pixel-9" });
    expect(await fails(w.db, w.buyer.id, `select public.create_swap_offer($1, $2::uuid[], 0, 'none', null, $3)`, [other, [mine], randomUUID()])).toBe(
      "offered_listing_unavailable",
    );
    // Owners cannot edit or archive a reserved listing.
    expect(await fails(w.db, w.seller.id, `update public.listings set price_minor = 100 where id = $1`, [target])).toBe("listing_locked");
    expect(await fails(w.db, w.seller.id, `select public.archive_listing($1)`, [target])).toBe("invalid_state");
  });

  it("refuses to accept when the offered phone was committed to another deal first", async () => {
    // Buyer offers the same phone to two sellers; the first acceptance wins.
    const t1 = await createLiveListing(w, w.seller);
    const t2 = await createLiveListing(w, w.stranger, { model: "pixel-9" });
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const o1 = await swapOffer(w, w.buyer, t1, [mine], 0, "none");
    const o2 = await swapOffer(w, w.buyer, t2, [mine], 0, "none");
    await q(w.db, w.seller.id, `select public.accept_swap_offer($1, 1)`, [o1]);
    expect((await offerRow(w.db, o2)).status).toBe("cancelled");
    expect(await fails(w.db, w.stranger.id, `select public.accept_swap_offer($1, 1)`, [o2])).toBe("offer_closed");
  });

  it("guarantees one reservation per listing even if state checks were bypassed", async () => {
    // Simulates the losing side of a race: the reservation row already exists.
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const o1 = await swapOffer(w, w.buyer, target, [mine], 0, "none");
    const tx = await q<{ id: string }>(w.db, w.seller.id, `select public.accept_swap_offer($1, 1) as id`, [o1]);
    await expect(
      w.db.query(`insert into public.listing_reservations (listing_id, transaction_id) values ($1, $2)`, [target, tx[0]!.id]),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("transaction completion", () => {
  async function acceptedDeal() {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer, target, [mine], 150000, "initiator");
    await q(w.db, w.seller.id, `select public.counter_swap_offer($1, 1, 200000, 'initiator', null)`, [offer]);
    const tx = await q<{ id: string }>(w.db, w.buyer.id, `select public.accept_swap_offer($1, 2) as id`, [offer]);
    return { target, mine, offer, tx: tx[0]!.id };
  }

  it("captures the agreed counteroffer terms and requires both confirmations", async () => {
    const { target, mine, offer, tx } = await acceptedDeal();
    const row = await q<{ cash_amount_minor: string; cash_payer: string; agreed_version: number; transaction_type: string }>(
      w.db,
      w.buyer.id,
      `select cash_amount_minor, cash_payer, agreed_version, transaction_type from public.transactions where id = $1`,
      [tx],
    );
    expect(Number(row[0]!.cash_amount_minor)).toBe(200000);
    expect(row[0]!.cash_payer).toBe("initiator");
    expect(row[0]!.agreed_version).toBe(2);

    expect(await q(w.db, w.stranger.id, `select * from public.transactions where id = $1`, [tx])).toHaveLength(0);
    expect(await fails(w.db, w.stranger.id, `select public.confirm_transaction($1, null)`, [tx])).toBe("not_found");

    const first = await q<{ s: string }>(w.db, w.buyer.id, `select public.confirm_transaction($1, null) as s`, [tx]);
    expect(first[0]!.s).toBe("active");
    // Re-confirming is harmless and still does not complete.
    const again = await q<{ s: string }>(w.db, w.buyer.id, `select public.confirm_transaction($1, null) as s`, [tx]);
    expect(again[0]!.s).toBe("active");
    expect((await listingStatus(w.db, target)).status).toBe("reserved");

    const second = await q<{ s: string }>(w.db, w.seller.id, `select public.confirm_transaction($1, 'Smooth swap') as s`, [tx]);
    expect(second[0]!.s).toBe("completed");
    expect((await listingStatus(w.db, target)).status).toBe("swapped");
    expect((await listingStatus(w.db, mine)).status).toBe("swapped");
    expect((await offerRow(w.db, offer)).status).toBe("completed");
  });

  it("makes agreed terms immutable, even for the database owner", async () => {
    const { tx } = await acceptedDeal();
    await expect(w.db.query(`update public.transactions set cash_amount_minor = 1 where id = $1`, [tx])).rejects.toThrow(/immutable/);
    expect(await fails(w.db, w.seller.id, `update public.transactions set cash_amount_minor = 1 where id = $1`, [tx])).toMatch(/permission denied/);
  });

  it("allows cancellation before any confirmation and releases listings", async () => {
    const { target, mine, tx } = await acceptedDeal();
    expect(await fails(w.db, w.buyer.id, `select public.cancel_transaction($1, 'no')`, [tx])).toBe("validation_failed");
    await q(w.db, w.buyer.id, `select public.cancel_transaction($1, 'Changed my mind')`, [tx]);
    expect((await listingStatus(w.db, target)).status).toBe("published");
    expect((await listingStatus(w.db, mine)).status).toBe("published");
    // Released listing can be dealt again.
    await q(w.db, w.buyer2.id, `select public.initiate_purchase($1, 850000, null, $2)`, [target, randomUUID()]);
  });

  it("forces a dispute when one party confirmed and the other refuses", async () => {
    const { target, tx } = await acceptedDeal();
    await q(w.db, w.buyer.id, `select public.confirm_transaction($1, null)`, [tx]);
    expect(await fails(w.db, w.seller.id, `select public.cancel_transaction($1, 'Buyer never came')`, [tx])).toBe("confirmation_exists");

    const dispute = await q<{ id: string }>(
      w.db,
      w.buyer.id,
      `select public.open_dispute($1, 'other_party_unresponsive', 'Seller stopped responding after I confirmed.') as id`,
      [tx],
    );
    expect(await fails(w.db, w.seller.id, `select public.confirm_transaction($1, null)`, [tx])).toBe("transaction_disputed");
    expect(await fails(w.db, w.buyer.id, `select public.resolve_dispute($1, 'complete', 'Trying to self-resolve')`, [dispute[0]!.id])).toBe(
      "forbidden",
    );
    // Visible to parties and staff only.
    expect(await q(w.db, w.stranger.id, `select * from public.disputes where id = $1`, [dispute[0]!.id])).toHaveLength(0);
    expect(await q(w.db, w.moderator.id, `select * from public.disputes where id = $1`, [dispute[0]!.id])).toHaveLength(1);

    await q(w.db, w.moderator.id, `select public.resolve_dispute($1, 'cancel', 'No evidence exchange took place')`, [dispute[0]!.id]);
    expect((await listingStatus(w.db, target)).status).toBe("published");
    const t = await w.db.query<{ status: string }>(`select status from public.transactions where id = $1`, [tx]);
    expect(t.rows[0]!.status).toBe("cancelled");
  });

  it("lets staff complete a disputed exchange or dismiss the dispute", async () => {
    const deal = await acceptedDeal();
    const d = await q<{ id: string }>(w.db, w.seller.id, `select public.open_dispute($1, 'no_show', 'Buyer did not show up twice.') as id`, [deal.tx]);
    await q(w.db, w.moderator.id, `select public.resolve_dispute($1, 'dismiss', 'Both parties agreed to reschedule')`, [d[0]!.id]);
    await q(w.db, w.seller.id, `select public.confirm_transaction($1, null)`, [deal.tx]);
    const d2 = await q<{ id: string }>(w.db, w.seller.id, `select public.open_dispute($1, 'other_party_unresponsive', 'Buyer has the phone but will not confirm.') as id`, [deal.tx]);
    await q(w.db, w.admin.id, `select public.resolve_dispute($1, 'complete', 'Evidence shows the exchange happened')`, [d2[0]!.id]);
    expect((await listingStatus(w.db, deal.target)).status).toBe("swapped");
  });
});

describe("purchase completion", () => {
  it("marks the listing sold after a purchase completes", async () => {
    const target = await createLiveListing(w, w.seller, { openToSwap: false });
    const offer = await q<{ id: string }>(w.db, w.buyer.id, `select public.initiate_purchase($1, 800000, 'Can we meet at Accra Mall?', $2) as id`, [
      target,
      randomUUID(),
    ]);
    const tx = await q<{ id: string }>(w.db, w.seller.id, `select public.accept_swap_offer($1, 1) as id`, [offer[0]!.id]);
    await q(w.db, w.seller.id, `select public.confirm_transaction($1, null)`, [tx[0]!.id]);
    await q(w.db, w.buyer.id, `select public.confirm_transaction($1, null)`, [tx[0]!.id]);
    expect((await listingStatus(w.db, target)).status).toBe("sold");
  });
});
