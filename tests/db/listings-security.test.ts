import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, fails, putObject, q } from "./harness";
import { addImage, createDraft, createLiveListing, listingStatus, makeWorld, type World } from "./fixtures";

let w: World;

beforeAll(async () => {
  w = await makeWorld(await createTestDb());
});

describe("profiles", () => {
  it("lets a user update their own public profile fields", async () => {
    await q(w.db, w.buyer.id, `update public.profiles set bio = 'Phone lover in Kumasi' where id = $1`, [w.buyer.id]);
    const rows = await q<{ bio: string }>(w.db, null, `select bio from public.profiles where id = $1`, [w.buyer.id]);
    expect(rows[0]!.bio).toBe("Phone lover in Kumasi");
  });

  it("refuses self-promotion to admin (column privilege)", async () => {
    const err = await fails(w.db, w.buyer.id, `update public.profiles set role = 'admin' where id = $1`, [w.buyer.id]);
    expect(err).toMatch(/permission denied/);
  });

  it("refuses self-verification and un-suspension", async () => {
    expect(await fails(w.db, w.buyer.id, `update public.profiles set verification_status = 'verified' where id = $1`, [w.buyer.id])).toMatch(
      /permission denied/,
    );
    expect(await fails(w.db, w.buyer.id, `update public.profiles set account_status = 'active' where id = $1`, [w.buyer.id])).toMatch(
      /permission denied/,
    );
  });

  it("silently ignores updates to another user's profile (RLS)", async () => {
    await q(w.db, w.stranger.id, `update public.profiles set bio = 'hacked' where id = $1`, [w.buyer.id]);
    const rows = await q<{ bio: string }>(w.db, null, `select bio from public.profiles where id = $1`, [w.buyer.id]);
    expect(rows[0]!.bio).not.toBe("hacked");
  });

  it("keeps phone numbers private to their owner", async () => {
    await q(w.db, w.seller.id, `update public.profile_contacts set phone_e164 = '+233241234567' where user_id = $1`, [w.seller.id]);
    expect(await q(w.db, w.stranger.id, `select * from public.profile_contacts where user_id = $1`, [w.seller.id])).toHaveLength(0);
    expect(await fails(w.db, null, `select * from public.profile_contacts`)).toMatch(/permission denied/);
    const own = await q<{ phone_e164: string }>(w.db, w.seller.id, `select phone_e164 from public.profile_contacts where user_id = $1`, [
      w.seller.id,
    ]);
    expect(own[0]!.phone_e164).toBe("+233241234567");
  });

  it("enforces lowercase unique usernames", async () => {
    expect(await fails(w.db, w.buyer.id, `update public.profiles set username = 'Bad Name' where id = $1`, [w.buyer.id])).toMatch(
      /check constraint/,
    );
    expect(
      await fails(w.db, w.buyer.id, `update public.profiles set username = $2 where id = $1`, [w.buyer.id, w.seller.username]),
    ).toMatch(/duplicate key/);
  });

  it("does not let audit logs be read by ordinary users", async () => {
    expect(await q(w.db, w.buyer.id, `select * from public.audit_logs`)).toHaveLength(0);
  });
});

describe("listings", () => {
  it("requires a completed profile to create a listing", async () => {
    const incomplete = await createUser(w.db, "Newbie", { complete: false });
    const err = await fails(
      w.db,
      incomplete.id,
      `insert into public.listings (seller_id, brand_id, model_id) select $1, brand_id, id from public.phone_models where slug = 'iphone-13'`,
      [incomplete.id],
    );
    expect(err).toMatch(/row-level security/);
  });

  it("forces new client listings into draft regardless of the payload", async () => {
    const err = await fails(
      w.db,
      w.seller.id,
      `insert into public.listings (seller_id, brand_id, model_id, status) select $1, brand_id, id, 'published' from public.phone_models where slug = 'iphone-13'`,
      [w.seller.id],
    );
    expect(err).toMatch(/permission denied/);
  });

  it("cannot create a listing for someone else", async () => {
    const err = await fails(
      w.db,
      w.stranger.id,
      `insert into public.listings (seller_id, brand_id, model_id) select $1, brand_id, id from public.phone_models where slug = 'iphone-13'`,
      [w.seller.id],
    );
    expect(err).toMatch(/row-level security/);
  });

  it("hides drafts and pending listings from the public and other users", async () => {
    const id = await createDraft(w.db, w.seller);
    expect(await q(w.db, null, `select id from public.listings where id = $1`, [id])).toHaveLength(0);
    expect(await q(w.db, w.stranger.id, `select id from public.listings where id = $1`, [id])).toHaveLength(0);
    expect(await q(w.db, w.seller.id, `select id from public.listings where id = $1`, [id])).toHaveLength(1);

    await addImage(w.db, w.seller, id);
    await q(w.db, w.seller.id, `select public.publish_listing($1)`, [id]);
    expect(await listingStatus(w.db, id)).toEqual({ status: "published", moderation_status: "pending_review" });
    expect(await q(w.db, null, `select id from public.listings where id = $1`, [id])).toHaveLength(0);
    expect(await q(w.db, null, `select id from public.listing_cards where id = $1`, [id])).toHaveLength(0);
  });

  it("requires a photo before publishing", async () => {
    const id = await createDraft(w.db, w.seller);
    expect(await fails(w.db, w.seller.id, `select public.publish_listing($1)`, [id])).toBe("listing_incomplete");
  });

  it("does not let another user modify, publish or delete a listing", async () => {
    const id = await createDraft(w.db, w.seller);
    await q(w.db, w.stranger.id, `update public.listings set price_minor = 100 where id = $1`, [id]);
    await q(w.db, w.stranger.id, `delete from public.listings where id = $1`, [id]);
    const rows = await w.db.query<{ price_minor: string }>(`select price_minor from public.listings where id = $1`, [id]);
    expect(Number(rows.rows[0]!.price_minor)).toBe(850000);
    expect(await fails(w.db, w.stranger.id, `select public.publish_listing($1)`, [id])).toBe("not_found");
    expect(await fails(w.db, w.stranger.id, `select public.pause_listing($1)`, [id])).toBe("not_found");
  });

  it("does not let owners change status or moderation directly", async () => {
    const id = await createDraft(w.db, w.seller);
    expect(await fails(w.db, w.seller.id, `update public.listings set status = 'published' where id = $1`, [id])).toMatch(
      /permission denied/,
    );
    expect(await fails(w.db, w.seller.id, `update public.listings set moderation_status = 'approved' where id = $1`, [id])).toMatch(
      /permission denied/,
    );
  });

  it("publishes publicly only after moderator approval", async () => {
    const id = await createLiveListing(w, w.seller);
    expect(await listingStatus(w.db, id)).toEqual({ status: "published", moderation_status: "approved" });
    expect(await q(w.db, null, `select id from public.listing_cards where id = $1`, [id])).toHaveLength(1);
  });

  it("sends material edits of an approved listing back to review", async () => {
    const id = await createLiveListing(w, w.seller);
    await q(w.db, w.seller.id, `update public.listings set description = 'Updated description' where id = $1`, [id]);
    expect((await listingStatus(w.db, id)).moderation_status).toBe("pending_review");
    expect(await q(w.db, null, `select id from public.listings where id = $1`, [id])).toHaveLength(0);
  });

  it("allows price edits without re-review", async () => {
    const id = await createLiveListing(w, w.seller);
    await q(w.db, w.seller.id, `update public.listings set price_minor = 800000 where id = $1`, [id]);
    expect((await listingStatus(w.db, id)).moderation_status).toBe("approved");
  });

  it("validates battery health, accessories and device checks", async () => {
    const id = await createDraft(w.db, w.seller);
    expect(
      await fails(w.db, w.seller.id, `update public.listings set battery_health_status = 'reported', battery_health = 140 where id = $1`, [id]),
    ).toMatch(/check constraint/);
    expect(await fails(w.db, w.seller.id, `update public.listings set battery_health_status = 'reported' where id = $1`, [id])).toMatch(
      /check constraint/,
    );
    expect(await fails(w.db, w.seller.id, `update public.listings set accessories = '{jetpack}' where id = $1`, [id])).toMatch(
      /check constraint/,
    );
    expect(
      await fails(w.db, w.seller.id, `update public.listings set device_checks = '{"biometrics":"perfect"}' where id = $1`, [id]),
    ).toMatch(/check constraint/);
    await q(w.db, w.seller.id, `update public.listings set battery_health_status = 'reported', battery_health = 88,
      device_checks = '{"biometrics":"not_tested","display":"working"}' where id = $1`, [id]);
  });

  it("supports pause / resume / archive transitions and rejects invalid ones", async () => {
    const id = await createLiveListing(w, w.seller);
    await q(w.db, w.seller.id, `select public.pause_listing($1)`, [id]);
    expect(await fails(w.db, w.seller.id, `select public.pause_listing($1)`, [id])).toBe("invalid_state");
    await q(w.db, w.seller.id, `select public.resume_listing($1)`, [id]);
    await q(w.db, w.seller.id, `select public.archive_listing($1)`, [id]);
    expect(await fails(w.db, w.seller.id, `select public.resume_listing($1)`, [id])).toBe("invalid_state");
    expect(await fails(w.db, w.seller.id, `update public.listings set title = 'Changed title' where id = $1`, [id])).toBe("listing_locked");
  });

  it("generates a stable slug key and a descriptive slug", async () => {
    const id = await createDraft(w.db, w.seller);
    const before = await w.db.query<{ slug: string; slug_key: string }>(`select slug, slug_key from public.listings where id = $1`, [id]);
    expect(before.rows[0]!.slug).toBe("iphone-14-pro-256gb-accra");
    await q(w.db, w.seller.id, `update public.listings set city = 'Kumasi' where id = $1`, [id]);
    const after = await w.db.query<{ slug: string; slug_key: string }>(`select slug, slug_key from public.listings where id = $1`, [id]);
    expect(after.rows[0]!.slug_key).toBe(before.rows[0]!.slug_key);
    expect(after.rows[0]!.slug).toBe("iphone-14-pro-256gb-kumasi");
  });
});

describe("listing images and storage", () => {
  it("rejects linking an image path in another user's folder", async () => {
    const id = await createDraft(w.db, w.seller);
    const path = `${w.stranger.id}/${id}/${randomUUID().replace(/-/g, "")}.webp`;
    await putObject(w.db, "listing-images", path, w.stranger.id);
    expect(await fails(w.db, w.seller.id, `select public.add_listing_image($1, $2)`, [id, path])).toBe("validation_failed");
  });

  it("rejects linking an image that was never uploaded", async () => {
    const id = await createDraft(w.db, w.seller);
    const path = `${w.seller.id}/${id}/${randomUUID().replace(/-/g, "")}.webp`;
    expect(await fails(w.db, w.seller.id, `select public.add_listing_image($1, $2)`, [id, path])).toBe("validation_failed");
  });

  it("enforces exactly one primary image and promotes another on removal", async () => {
    const id = await createDraft(w.db, w.seller);
    await addImage(w.db, w.seller, id);
    await addImage(w.db, w.seller, id);
    const imgs = await q<{ id: string; is_primary: boolean }>(w.db, w.seller.id,
      `select id, is_primary from public.listing_images where listing_id = $1 order by position`, [id]);
    expect(imgs.filter((i) => i.is_primary)).toHaveLength(1);
    await q(w.db, w.seller.id, `select public.set_primary_listing_image($1)`, [imgs[1]!.id]);
    await q(w.db, w.seller.id, `select public.remove_listing_image($1)`, [imgs[1]!.id]);
    const left = await q<{ is_primary: boolean }>(w.db, w.seller.id, `select is_primary from public.listing_images where listing_id = $1`, [id]);
    expect(left).toEqual([{ is_primary: true }]);
  });

  it("blocks storage uploads into another user's folder or listing", async () => {
    const id = await createDraft(w.db, w.seller);
    const insert = `insert into storage.objects (bucket_id, name, owner, owner_id) values ('listing-images', $1, $2::uuid, ($2::uuid)::text)`;
    expect(await fails(w.db, w.stranger.id, insert, [`${w.seller.id}/${id}/abcdefgh12.webp`, w.stranger.id])).toMatch(/row-level security/);
    expect(await fails(w.db, w.stranger.id, insert, [`${w.stranger.id}/${id}/abcdefgh12.webp`, w.stranger.id])).toMatch(/row-level security/);
    await q(w.db, w.seller.id, insert, [`${w.seller.id}/${id}/abcdefgh12.webp`, w.seller.id]);
  });

  it("does not allow overwriting or deleting someone else's files", async () => {
    const id = await createDraft(w.db, w.seller);
    const path = await addImage(w.db, w.seller, id);
    await q(w.db, w.stranger.id, `delete from storage.objects where name = $1`, [path]);
    await q(w.db, w.stranger.id, `update storage.objects set owner_id = $2 where name = $1`, [path, w.stranger.id]);
    const r = await w.db.query<{ owner_id: string }>(`select owner_id from storage.objects where name = $1`, [path]);
    expect(r.rows[0]!.owner_id).toBe(w.seller.id);
  });

  it("keeps verification documents private", async () => {
    const path = `${w.seller.id}/${randomUUID().replace(/-/g, "")}.pdf`;
    await q(w.db, w.seller.id, `insert into storage.objects (bucket_id, name, owner, owner_id) values ('verification-docs', $1, $2::uuid, ($2::uuid)::text)`, [
      path,
      w.seller.id,
    ]);
    expect(await q(w.db, w.stranger.id, `select name from storage.objects where name = $1`, [path])).toHaveLength(0);
    expect(await q(w.db, w.moderator.id, `select name from storage.objects where name = $1`, [path])).toHaveLength(0);
    expect(await q(w.db, w.admin.id, `select name from storage.objects where name = $1`, [path])).toHaveLength(1);
    expect(await q(w.db, w.seller.id, `select name from storage.objects where name = $1`, [path])).toHaveLength(1);
  });
});

describe("search", () => {
  it("finds approved listings by text and filters, and never drafts", async () => {
    const live = await createLiveListing(w, w.seller, { model: "galaxy-s23", priceMinor: 650000 });
    const draft = await createDraft(w.db, w.seller, { model: "galaxy-s23" });
    const res = await q<{ r: { total: number; items: { id: string }[] } }>(
      w.db,
      null,
      `select public.search_listings(p_query => 'galax s23', p_max_price => 700000) as r`,
    );
    const ids = res[0]!.r.items.map((i) => i.id);
    expect(ids).toContain(live);
    expect(ids).not.toContain(draft);

    const none = await q<{ r: { total: number } }>(w.db, null, `select public.search_listings(p_query => 'galaxy', p_min_price => 99000000) as r`);
    expect(none[0]!.r.total).toBe(0);
  });

  it("filters by region, condition and swap availability and paginates", async () => {
    const res = await q<{ r: { total: number; items: unknown[] } }>(
      w.db,
      null,
      `select public.search_listings(p_region_ids => array[(select id from public.regions where slug='greater-accra')]::smallint[],
         p_conditions => '{excellent}', p_swap_only => true, p_sort => 'price_asc', p_limit => 1) as r`,
    );
    expect(res[0]!.r.total).toBeGreaterThan(0);
    expect(res[0]!.r.items).toHaveLength(1);
  });

  it("treats tsquery syntax characters as plain text", async () => {
    const res = await q<{ r: { total: number } }>(w.db, null, `select public.search_listings(p_query => $1) as r`, ["iphone & | ! ( ) :*"]);
    expect(res[0]!.r.total).toBeGreaterThanOrEqual(0);
  });
});

describe("favorites", () => {
  it("lets users save/unsave visible listings only and keeps favorites private", async () => {
    const live = await createLiveListing(w, w.seller);
    const draft = await createDraft(w.db, w.seller);
    await q(w.db, w.buyer.id, `insert into public.favorites (user_id, listing_id) values ($1, $2)`, [w.buyer.id, live]);
    expect(await fails(w.db, w.buyer.id, `insert into public.favorites (user_id, listing_id) values ($1, $2)`, [w.buyer.id, live])).toMatch(
      /duplicate key/,
    );
    expect(await fails(w.db, w.buyer.id, `insert into public.favorites (user_id, listing_id) values ($1, $2)`, [w.buyer.id, draft])).toMatch(
      /row-level security/,
    );
    expect(await fails(w.db, w.buyer.id, `insert into public.favorites (user_id, listing_id) values ($1, $2)`, [w.stranger.id, live])).toMatch(
      /row-level security/,
    );
    expect(await q(w.db, w.stranger.id, `select * from public.favorites where user_id = $1`, [w.buyer.id])).toHaveLength(0);
    await q(w.db, w.buyer.id, `delete from public.favorites where listing_id = $1`, [live]);
    expect(await q(w.db, w.buyer.id, `select * from public.favorites where listing_id = $1`, [live])).toHaveLength(0);
  });
});

describe("views and seller analytics", () => {
  it("deduplicates views per viewer per day and excludes the owner", async () => {
    const id = await createLiveListing(w, w.seller);
    const anon = randomUUID();
    await q(w.db, null, `select public.record_listing_view($1, $2)`, [id, anon]);
    await q(w.db, null, `select public.record_listing_view($1, $2)`, [id, anon]);
    await q(w.db, w.buyer.id, `select public.record_listing_view($1, null)`, [id]);
    await q(w.db, w.seller.id, `select public.record_listing_view($1, null)`, [id]);
    await q(w.db, null, `select public.record_listing_view($1, 'not-a-uuid')`, [id]);
    const perf = await q<{ listing_id: string; views_total: string }>(w.db, w.seller.id, `select * from public.get_listing_performance()`);
    expect(Number(perf.find((p) => p.listing_id === id)!.views_total)).toBe(2);
  });

  it("scopes analytics to the caller", async () => {
    const perf = await q<{ listing_id: string }>(w.db, w.stranger.id, `select * from public.get_listing_performance()`);
    expect(perf).toHaveLength(0);
    expect(await fails(w.db, w.stranger.id, `select * from public.listing_views`)).toMatch(/permission denied/);
    expect(await fails(w.db, w.seller.id, `select public.get_marketplace_stats()`)).toBe("forbidden");
    const stats = await q<{ s: { listings_live: number } }>(w.db, w.moderator.id, `select public.get_marketplace_stats() as s`);
    expect(stats[0]!.s.listings_live).toBeGreaterThan(0);
    expect(await fails(w.db, null, `select public.get_seller_dashboard()`)).toMatch(/permission denied|not_authenticated/);
  });
});

describe("moderation", () => {
  it("only staff can moderate, and rejection reasons are visible to the seller but not the public", async () => {
    const id = await createDraft(w.db, w.seller);
    await addImage(w.db, w.seller, id);
    await q(w.db, w.seller.id, `select public.publish_listing($1)`, [id]);
    expect(await fails(w.db, w.buyer.id, `select public.moderate_listing($1, 'approve', null)`, [id])).toBe("forbidden");
    expect(await fails(w.db, w.moderator.id, `select public.moderate_listing($1, 'reject', '')`, [id])).toBe("validation_failed");
    await q(w.db, w.moderator.id, `select public.moderate_listing($1, 'reject', 'Photos do not show the device')`, [id]);
    expect((await listingStatus(w.db, id)).moderation_status).toBe("rejected");
    const seen = await q<{ reason: string }>(w.db, w.seller.id, `select reason from public.listing_moderation_events where listing_id = $1 and decision = 'rejected'`, [id]);
    expect(seen[0]!.reason).toBe("Photos do not show the device");
    expect(await q(w.db, w.stranger.id, `select * from public.listing_moderation_events where listing_id = $1`, [id])).toHaveLength(0);
    const notes = await q<{ type: string }>(w.db, w.seller.id, `select type from public.notifications where entity_id = $1`, [id]);
    expect(notes.map((n) => n.type)).toContain("listing_rejected");

    // Resubmission goes back to the queue.
    await q(w.db, w.seller.id, `update public.listings set description = 'Clear photos added' where id = $1`, [id]);
    await q(w.db, w.seller.id, `select public.publish_listing($1)`, [id]);
    expect((await listingStatus(w.db, id)).moderation_status).toBe("pending_review");
  });

  it("prevents moderators approving their own listings", async () => {
    const id = await createDraft(w.db, w.moderator);
    await addImage(w.db, w.moderator, id);
    await q(w.db, w.moderator.id, `select public.publish_listing($1)`, [id]);
    expect(await fails(w.db, w.moderator.id, `select public.moderate_listing($1, 'approve', null)`, [id])).toBe("forbidden");
  });

  it("only staff manage featured listings, and only for live listings", async () => {
    const live = await createLiveListing(w, w.seller);
    expect(await fails(w.db, w.seller.id, `insert into public.featured_listings (listing_id) values ($1)`, [live])).toMatch(/row-level security/);
    await q(w.db, w.moderator.id, `insert into public.featured_listings (listing_id) values ($1)`, [live]);
    expect(await q(w.db, null, `select * from public.featured_listings where listing_id = $1`, [live])).toHaveLength(1);
    const draft = await createDraft(w.db, w.seller);
    expect(await fails(w.db, w.moderator.id, `insert into public.featured_listings (listing_id) values ($1)`, [draft])).toBe("invalid_state");
  });
});
