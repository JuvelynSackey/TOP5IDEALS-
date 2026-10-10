import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, q } from "./harness";
import { addImage, createDraft, createLiveListing, makeWorld, swapOffer, type World } from "./fixtures";

let w: World;

beforeAll(async () => {
  w = await makeWorld(await createTestDb());
});

const canRead = async (uid: string | null, path: string) =>
  (await q(w.db, uid, `select name from storage.objects where bucket_id = 'listing-images' and name = $1`, [path])).length === 1;

async function imageOf(listingId: string): Promise<string> {
  const r = await w.db.query<{ storage_path: string }>(`select storage_path from public.listing_images where listing_id = $1 and is_primary`, [listingId]);
  return r.rows[0]!.storage_path;
}

describe("private listing images", () => {
  it("makes the bucket private", async () => {
    const r = await w.db.query<{ public: boolean }>(`select public from storage.buckets where id = 'listing-images'`);
    expect(r.rows[0]!.public).toBe(false);
  });

  it("hides draft and pending photos from everyone but the owner and staff", async () => {
    const draft = await createDraft(w.db, w.seller);
    const path = await addImage(w.db, w.seller, draft);
    expect(await canRead(null, path)).toBe(false);
    expect(await canRead(w.stranger.id, path)).toBe(false);
    expect(await canRead(w.seller.id, path)).toBe(true);
    expect(await canRead(w.moderator.id, path)).toBe(true);

    await q(w.db, w.seller.id, `select public.publish_listing($1)`, [draft]);
    expect(await canRead(null, path)).toBe(false);
  });

  it("shows photos of approved listings to everyone and hides them again after a takedown", async () => {
    const live = await createLiveListing(w, w.seller);
    const path = await imageOf(live);
    expect(await canRead(null, path)).toBe(true);
    expect(await canRead(w.stranger.id, path)).toBe(true);

    await q(w.db, w.moderator.id, `select public.moderate_listing($1, 'reject', 'Stock photos are not allowed')`, [live]);
    expect(await canRead(null, path)).toBe(false);
    expect(await canRead(w.seller.id, path)).toBe(true);
  });

  it("keeps photos visible to offer parties after the listing leaves the marketplace", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    await swapOffer(w, w.buyer, target, [mine], 0, "none");
    const path = await imageOf(target);
    await q(w.db, w.seller.id, `select public.archive_listing($1)`, [target]);
    expect(await canRead(null, path)).toBe(false);
    expect(await canRead(w.buyer.id, path)).toBe(true);
    expect(await canRead(w.buyer2.id, path)).toBe(false);
  });

  it("does not expose unlinked uploads", async () => {
    const draft = await createDraft(w.db, w.seller);
    const path = `${w.seller.id}/${draft}/${randomUUID().replace(/-/g, "")}.webp`;
    await w.db.query(`insert into storage.objects (bucket_id, name, owner, owner_id) values ('listing-images', $1, $2::uuid, ($2::uuid)::text)`, [path, w.seller.id]);
    expect(await canRead(null, path)).toBe(false);
    expect(await canRead(w.stranger.id, path)).toBe(false);
    expect(await canRead(w.seller.id, path)).toBe(true); // owner-folder rule from 0900
  });
});
