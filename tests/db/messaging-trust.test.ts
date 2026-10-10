import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, fails, putObject, q } from "./harness";
import { createLiveListing, listingStatus, makeWorld, offerRow, swapOffer, type World } from "./fixtures";

let w: World;

beforeAll(async () => {
  w = await makeWorld(await createTestDb());
});

describe("messaging", () => {
  it("reuses one conversation per pair and listing", async () => {
    const listing = await createLiveListing(w, w.seller);
    const a = await q<{ id: string }>(w.db, w.buyer.id, `select public.start_conversation(null, $1) as id`, [listing]);
    const b = await q<{ id: string }>(w.db, w.buyer.id, `select public.start_conversation(null, $1) as id`, [listing]);
    const c = await q<{ id: string }>(w.db, w.seller.id, `select public.start_conversation($1, $2) as id`, [w.buyer.id, listing]);
    expect(a[0]!.id).toBe(b[0]!.id);
    expect(c[0]!.id).toBe(a[0]!.id);
  });

  it("keeps conversations private to members", async () => {
    const listing = await createLiveListing(w, w.seller);
    const conv = (await q<{ id: string }>(w.db, w.buyer.id, `select public.start_conversation(null, $1) as id`, [listing]))[0]!.id;
    await q(w.db, w.buyer.id, `select public.send_message($1, 'Is it still available?', $2)`, [conv, randomUUID()]);

    expect(await q(w.db, w.stranger.id, `select * from public.messages where conversation_id = $1`, [conv])).toHaveLength(0);
    expect(await q(w.db, w.stranger.id, `select * from public.conversations where id = $1`, [conv])).toHaveLength(0);
    expect(await q(w.db, w.admin.id, `select * from public.messages where conversation_id = $1`, [conv])).toHaveLength(0);
    expect(await fails(w.db, null, `select * from public.messages`)).toMatch(/permission denied/);
    expect(await fails(w.db, w.stranger.id, `select public.send_message($1, 'spam', $2)`, [conv, randomUUID()])).toBe("not_found");
    expect(
      await fails(w.db, w.stranger.id, `insert into public.messages (conversation_id, sender_id, body, client_id) values ($1, $2, 'x', $3)`, [
        conv,
        w.stranger.id,
        randomUUID(),
      ]),
    ).toMatch(/permission denied/);

    const seen = await q<{ body: string }>(w.db, w.seller.id, `select body from public.messages where conversation_id = $1`, [conv]);
    expect(seen.map((m) => m.body)).toEqual(["Is it still available?"]);
  });

  it("treats retried sends as idempotent and tracks unread counts", async () => {
    const listing = await createLiveListing(w, w.seller);
    const conv = (await q<{ id: string }>(w.db, w.buyer2.id, `select public.start_conversation(null, $1) as id`, [listing]))[0]!.id;
    const clientId = randomUUID();
    await q(w.db, w.buyer2.id, `select public.send_message($1, 'Hello', $2)`, [conv, clientId]);
    await q(w.db, w.buyer2.id, `select public.send_message($1, 'Hello', $2)`, [conv, clientId]);
    const count = await w.db.query<{ n: number }>(`select count(*)::int n from public.messages where conversation_id = $1`, [conv]);
    expect(count.rows[0]!.n).toBe(1);

    const inbox = await q<{ id: string; unread_count: string }>(w.db, w.seller.id, `select * from public.list_conversations()`);
    expect(Number(inbox.find((c) => c.id === conv)!.unread_count)).toBe(1);
    await q(w.db, w.seller.id, `select public.mark_conversation_read($1)`, [conv]);
    const after = await q<{ id: string; unread_count: string }>(w.db, w.seller.id, `select * from public.list_conversations()`);
    expect(Number(after.find((c) => c.id === conv)!.unread_count)).toBe(0);
    // A stranger's inbox never includes it.
    expect((await q<{ id: string }>(w.db, w.stranger.id, `select * from public.list_conversations()`)).map((c) => c.id)).not.toContain(conv);
  });

  it("validates message length", async () => {
    const listing = await createLiveListing(w, w.seller);
    const conv = (await q<{ id: string }>(w.db, w.buyer.id, `select public.start_conversation(null, $1) as id`, [listing]))[0]!.id;
    expect(await fails(w.db, w.buyer.id, `select public.send_message($1, '   ', $2)`, [conv, randomUUID()])).toBe("validation_failed");
    expect(await fails(w.db, w.buyer.id, `select public.send_message($1, $2, $3)`, [conv, "x".repeat(2001), randomUUID()])).toBe(
      "validation_failed",
    );
  });

  it("rate limits message bursts", async () => {
    const spammer = await createUser(w.db, "Spammer");
    const conv = (await q<{ id: string }>(w.db, spammer.id, `select public.start_conversation($1, null) as id`, [w.seller.id]))[0]!.id;
    for (let i = 0; i < 20; i++) {
      await q(w.db, spammer.id, `select public.send_message($1, 'hi', $2)`, [conv, randomUUID()]);
    }
    expect(await fails(w.db, spammer.id, `select public.send_message($1, 'hi', $2)`, [conv, randomUUID()])).toBe("rate_limited");
  });

  it("enforces blocks in both directions", async () => {
    const pest = await createUser(w.db, "Pest");
    const conv = (await q<{ id: string }>(w.db, pest.id, `select public.start_conversation($1, null) as id`, [w.buyer.id]))[0]!.id;
    await q(w.db, w.buyer.id, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [w.buyer.id, pest.id]);
    expect(await fails(w.db, pest.id, `select public.send_message($1, 'hello?', $2)`, [conv, randomUUID()])).toBe("blocked");
    expect(await fails(w.db, w.buyer.id, `select public.send_message($1, 'hello?', $2)`, [conv, randomUUID()])).toBe("blocked");
    expect(await fails(w.db, pest.id, `select public.start_conversation($1, null)`, [w.buyer.id])).toBe("blocked");
    // Blocks are private to the blocker.
    expect(await q(w.db, pest.id, `select * from public.user_blocks where blocked_id = $1`, [pest.id])).toHaveLength(0);
  });
});

describe("notifications", () => {
  it("are private, deduplicated and can be marked read", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer, target, [mine], 0, "none");
    expect(await q(w.db, w.stranger.id, `select * from public.notifications where entity_id = $1`, [offer])).toHaveLength(0);
    const mineNotes = await q<{ id: string }>(w.db, w.seller.id, `select id from public.notifications where entity_id = $1`, [offer]);
    expect(mineNotes).toHaveLength(1);
    await q(w.db, w.seller.id, `update public.notifications set read_at = now() where id = $1`, [mineNotes[0]!.id]);
    expect(await fails(w.db, w.seller.id, `update public.notifications set title = 'x' where id = $1`, [mineNotes[0]!.id])).toMatch(
      /permission denied/,
    );
    expect(await fails(w.db, w.seller.id, `insert into public.notifications (user_id, type, title) values ($1, 'message', 'fake')`, [w.seller.id])).toMatch(
      /permission denied/,
    );
  });

  it("respects in-app preferences", async () => {
    const quiet = await createUser(w.db, "Quiet");
    await q(w.db, quiet.id, `insert into public.notification_preferences (user_id, type, in_app) values ($1, 'offer_received', false)`, [quiet.id]);
    const target = await createLiveListing(w, quiet);
    const mine = await createLiveListing(w, w.buyer2, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer2, target, [mine], 0, "none");
    expect(await q(w.db, quiet.id, `select * from public.notifications where entity_id = $1`, [offer])).toHaveLength(0);
    expect(await fails(w.db, w.buyer.id, `insert into public.notification_preferences (user_id, type) values ($1, 'message')`, [quiet.id])).toMatch(
      /row-level security/,
    );
  });
});

describe("reviews", () => {
  async function completedSwap() {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    const offer = await swapOffer(w, w.buyer, target, [mine], 0, "none");
    const tx = (await q<{ id: string }>(w.db, w.seller.id, `select public.accept_swap_offer($1, 1) as id`, [offer]))[0]!.id;
    return tx;
  }

  it("requires a completed transaction, a party, and one review per reviewer", async () => {
    const tx = await completedSwap();
    const review = `select public.create_review($1, 5::smallint, 5::smallint, 4::smallint, 5::smallint, 'Great swap') as id`;
    expect(await fails(w.db, w.buyer.id, review, [tx])).toBe("review_not_eligible");
    await q(w.db, w.buyer.id, `select public.confirm_transaction($1, null)`, [tx]);
    await q(w.db, w.seller.id, `select public.confirm_transaction($1, null)`, [tx]);

    expect(await fails(w.db, w.stranger.id, review, [tx])).toBe("not_found");
    const r = await q<{ id: string }>(w.db, w.buyer.id, review, [tx]);
    expect(await fails(w.db, w.buyer.id, review, [tx])).toBe("already_reviewed");
    expect(
      await fails(w.db, w.seller.id, `select public.create_review($1, 9::smallint, 5::smallint, 5::smallint, 5::smallint, null)`, [tx]),
    ).toBe("validation_failed");
    await q(w.db, w.seller.id, `select public.create_review($1, 4::smallint, 4::smallint, 4::smallint, 4::smallint, 'Smooth')`, [tx]);

    // Reviewee is derived server-side; reviews cannot be inserted or edited directly.
    const row = await q<{ reviewee_id: string }>(w.db, null, `select reviewee_id from public.reviews where id = $1`, [r[0]!.id]);
    expect(row[0]!.reviewee_id).toBe(w.seller.id);
    expect(await fails(w.db, w.buyer.id, `update public.reviews set overall_rating = 1 where id = $1`, [r[0]!.id])).toMatch(/permission denied/);
    expect(
      await fails(w.db, w.stranger.id, `select public.update_review($1, 1::smallint, 1::smallint, 1::smallint, 1::smallint, 'x')`, [r[0]!.id]),
    ).toBe("not_found");
    await q(w.db, w.buyer.id, `select public.update_review($1, 4::smallint, 5::smallint, 4::smallint, 5::smallint, 'Edited')`, [r[0]!.id]);

    const trust = await q<{ review_count: string; average_overall: string; completed_transactions: string }>(
      w.db,
      null,
      `select * from public.get_profile_trust($1)`,
      [w.seller.id],
    );
    expect(Number(trust[0]!.review_count)).toBeGreaterThanOrEqual(1);
    expect(Number(trust[0]!.completed_transactions)).toBeGreaterThanOrEqual(1);
  });

  it("lets staff hide abusive reviews with a reason", async () => {
    const tx = await completedSwap();
    await q(w.db, w.buyer.id, `select public.confirm_transaction($1, null)`, [tx]);
    await q(w.db, w.seller.id, `select public.confirm_transaction($1, null)`, [tx]);
    const id = (await q<{ id: string }>(w.db, w.seller.id, `select public.create_review($1, 1::smallint, 1::smallint, 1::smallint, 1::smallint, 'abuse') as id`, [tx]))[0]!.id;
    expect(await fails(w.db, w.buyer.id, `select public.set_review_hidden($1, true, 'Abusive language')`, [id])).toBe("forbidden");
    await q(w.db, w.moderator.id, `select public.set_review_hidden($1, true, 'Abusive language')`, [id]);
    expect(await q(w.db, null, `select * from public.reviews where id = $1`, [id])).toHaveLength(0);
  });
});

describe("reports", () => {
  it("lets users report listings and keeps reports private", async () => {
    const listing = await createLiveListing(w, w.seller);
    const id = (await q<{ id: string }>(w.db, w.buyer.id, `select public.create_report('listing', $1, 'stolen_device', 'IMEI blocked') as id`, [listing]))[0]!.id;
    expect(await q(w.db, w.buyer.id, `select * from public.reports where id = $1`, [id])).toHaveLength(1);
    expect(await q(w.db, w.seller.id, `select * from public.reports where id = $1`, [id])).toHaveLength(0);
    expect(await q(w.db, w.moderator.id, `select * from public.reports where id = $1`, [id])).toHaveLength(1);
    expect(await fails(w.db, w.buyer.id, `select public.resolve_report($1, 'dismissed', 'x')`, [id])).toBe("forbidden");
    await q(w.db, w.moderator.id, `select public.resolve_report($1, 'resolved', 'Listing removed')`, [id]);
  });

  it("only lets members report messages and snapshots just that message", async () => {
    const conv = (await q<{ id: string }>(w.db, w.buyer.id, `select public.start_conversation($1, null) as id`, [w.stranger.id]))[0]!.id;
    const msg = (await q<{ id: string }>(w.db, w.buyer.id, `select (public.send_message($1, 'Pay me via momo first', $2)).id as id`, [conv, randomUUID()]))[0]!.id;
    expect(await fails(w.db, w.seller.id, `select public.create_report('message', $1, 'fraud', null)`, [msg])).toBe("not_found");
    const rep = (await q<{ id: string }>(w.db, w.stranger.id, `select public.create_report('message', $1, 'fraud', null) as id`, [msg]))[0]!.id;
    const ev = await q<{ evidence: { body: string } }>(w.db, w.moderator.id, `select evidence from public.reports where id = $1`, [rep]);
    expect(ev[0]!.evidence.body).toBe("Pay me via momo first");
  });
});

describe("verification", () => {
  it("lets users request verification but never approve themselves", async () => {
    const applicant = await createUser(w.db, "Applicant");
    const doc = `${applicant.id}/${randomUUID().replace(/-/g, "")}.pdf`;
    await putObject(w.db, "verification-docs", doc, applicant.id);
    expect(await fails(w.db, applicant.id, `select public.submit_verification_request('individual', 'Ghana Card', $1)`, [[`${w.buyer.id}/abcdefgh12.pdf`]])).toBe(
      "validation_failed",
    );
    const id = (await q<{ id: string }>(w.db, applicant.id, `select public.submit_verification_request('individual', 'Ghana Card', $1) as id`, [[doc]]))[0]!.id;
    expect(await fails(w.db, applicant.id, `select public.submit_verification_request('individual', 'again', $1)`, [[doc]])).toBe("duplicate_request");
    expect(await fails(w.db, applicant.id, `select public.review_verification($1, true, null)`, [id])).toBe("forbidden");
    expect(await fails(w.db, w.moderator.id, `select public.review_verification($1, true, null)`, [id])).toBe("forbidden");
    expect(await q(w.db, w.stranger.id, `select * from public.verification_requests where id = $1`, [id])).toHaveLength(0);
    await q(w.db, w.admin.id, `select public.review_verification($1, true, 'Documents match')`, [id]);
    const p = await q<{ verification_status: string }>(w.db, null, `select verification_status from public.profiles where id = $1`, [applicant.id]);
    expect(p[0]!.verification_status).toBe("verified");
  });

  it("does not verify a business just because it created a profile", async () => {
    const shop = await createUser(w.db, "Shop");
    await q(w.db, shop.id, `insert into public.business_profiles (owner_id, business_name, slug) values ($1, 'Kofi Phones', $2)`, [
      shop.id,
      `kofi-phones-${shop.id.slice(0, 6)}`,
    ]);
    const bp = await q<{ verification_status: string }>(w.db, null, `select verification_status from public.business_profiles where owner_id = $1`, [shop.id]);
    expect(bp[0]!.verification_status).toBe("unverified");
    expect(await fails(w.db, shop.id, `update public.business_profiles set verification_status = 'verified' where owner_id = $1`, [shop.id])).toMatch(
      /permission denied/,
    );
    const prof = await q<{ account_type: string }>(w.db, null, `select account_type from public.profiles where id = $1`, [shop.id]);
    expect(prof[0]!.account_type).toBe("business");
  });
});

describe("suspension", () => {
  it("blocks restricted actions for suspended accounts and pauses their listings", async () => {
    const bad = await createUser(w.db, "BadActor");
    const listing = await createLiveListing(w, bad);
    const target = await createLiveListing(w, w.seller);
    const offer = await swapOffer(w, bad, target, [listing], 0, "none");

    expect(await fails(w.db, w.moderator.id, `select public.set_account_status($1, 'suspended', 'Fraud reports')`, [bad.id])).toBe("forbidden");
    await q(w.db, w.admin.id, `select public.set_account_status($1, 'suspended', 'Multiple fraud reports')`, [bad.id]);

    expect((await listingStatus(w.db, listing)).status).toBe("paused");
    expect((await offerRow(w.db, offer)).status).toBe("cancelled");
    expect(await fails(w.db, bad.id, `select public.initiate_purchase($1, 850000, null, $2)`, [target, randomUUID()])).toBe("account_suspended");
    expect(await fails(w.db, bad.id, `select public.start_conversation($1, null)`, [w.seller.id])).toBe("account_suspended");
    expect(await fails(w.db, bad.id, `select public.resume_listing($1)`, [listing])).toBe("account_suspended");
    expect(
      await fails(w.db, bad.id, `insert into public.listings (seller_id, brand_id, model_id) select $1, brand_id, id from public.phone_models where slug = 'iphone-13'`, [
        bad.id,
      ]),
    ).toMatch(/row-level security/);
    await q(w.db, bad.id, `update public.listings set price_minor = 1000 where id = $1`, [listing]);
    const price = await w.db.query<{ price_minor: string }>(`select price_minor from public.listings where id = $1`, [listing]);
    expect(Number(price.rows[0]!.price_minor)).toBe(850000);
    // Admin accounts cannot be suspended through the app.
    expect(await fails(w.db, w.admin.id, `select public.set_account_status($1, 'suspended', 'test test')`, [w.admin.id])).toBe("forbidden");
  });
});

describe("admin directory", () => {
  it("returns emails to admins only and is closed to regular users", async () => {
    expect(await fails(w.db, w.buyer.id, `select * from public.admin_list_users()`)).toBe("forbidden");
    const mod = await q<{ email: string | null }>(w.db, w.moderator.id, `select * from public.admin_list_users()`);
    expect(mod.every((u) => u.email === null)).toBe(true);
    const adm = await q<{ email: string | null }>(w.db, w.admin.id, `select * from public.admin_list_users()`);
    expect(adm.some((u) => u.email !== null)).toBe(true);
  });
});
