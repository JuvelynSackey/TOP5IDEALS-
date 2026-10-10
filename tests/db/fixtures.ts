import { randomUUID } from "node:crypto";
import { as, brandModel, createUser, putObject, q, type Db, type TestUser } from "./harness";

export interface World {
  db: Db;
  admin: TestUser;
  moderator: TestUser;
  seller: TestUser;
  buyer: TestUser;
  buyer2: TestUser;
  stranger: TestUser;
}

export async function makeWorld(db: Db): Promise<World> {
  return {
    db,
    admin: await createUser(db, "Admin", { role: "admin" }),
    moderator: await createUser(db, "Mod", { role: "moderator" }),
    seller: await createUser(db, "Seller"),
    buyer: await createUser(db, "Buyer"),
    buyer2: await createUser(db, "BuyerTwo"),
    stranger: await createUser(db, "Stranger"),
  };
}

export interface DraftOptions {
  model?: string;
  priceMinor?: number;
  openToSwap?: boolean;
  forSale?: boolean;
  negotiable?: boolean;
}

/** Create a draft listing as `owner` through the client path (RLS + grants). */
export async function createDraft(db: Db, owner: TestUser, opts: DraftOptions = {}): Promise<string> {
  const { brandId, modelId } = await brandModel(db, opts.model ?? "iphone-14-pro");
  const rows = await q<{ id: string }>(
    db,
    owner.id,
    `insert into public.listings (seller_id, brand_id, model_id, storage_gb, condition, price_minor, region_id, city,
                                  open_to_swap, available_for_sale, is_negotiable, description)
     values ($1, $2, $3, 256, 'excellent', $4, (select id from public.regions where slug = 'greater-accra'), 'Accra', $5, $6, $7,
             'Clean phone, no scratches')
     returning id`,
    [owner.id, brandId, modelId, opts.priceMinor ?? 850000, opts.openToSwap ?? true, opts.forSale ?? true, opts.negotiable ?? true],
  );
  return rows[0]!.id;
}

/** Upload (simulated) + attach a primary image. */
export async function addImage(db: Db, owner: TestUser, listingId: string): Promise<string> {
  const path = `${owner.id}/${listingId}/${randomUUID().replace(/-/g, "")}.webp`;
  await putObject(db, "listing-images", path, owner.id);
  await q(db, owner.id, `select public.add_listing_image($1, $2, 1200, 1600)`, [listingId, path]);
  return path;
}

/** Draft → images → submit → approved by a moderator. Returns listing id. */
export async function createLiveListing(w: World, owner: TestUser, opts: DraftOptions = {}): Promise<string> {
  const id = await createDraft(w.db, owner, opts);
  await addImage(w.db, owner, id);
  await q(w.db, owner.id, `select public.publish_listing($1)`, [id]);
  await q(w.db, w.moderator.id, `select public.moderate_listing($1, 'approve', null)`, [id]);
  return id;
}

export async function listingStatus(db: Db, id: string): Promise<{ status: string; moderation_status: string }> {
  const r = await db.query<{ status: string; moderation_status: string }>(
    `select status, moderation_status from public.listings where id = $1`,
    [id],
  );
  return r.rows[0]!;
}

export async function offerRow(db: Db, id: string) {
  const r = await db.query<{ status: string; current_version: number; awaiting_party: string | null }>(
    `select status, current_version, awaiting_party from public.swap_offers where id = $1`,
    [id],
  );
  return r.rows[0]!;
}

export async function swapOffer(
  w: World,
  from: TestUser,
  target: string,
  offered: string[],
  cash: number,
  payer: "none" | "initiator" | "recipient",
): Promise<string> {
  const rows = await q<{ id: string }>(
    w.db,
    from.id,
    `select public.create_swap_offer($1, $2::uuid[], $3, $4::public.cash_payer, 'Interested', $5) as id`,
    [target, offered, cash, payer, randomUUID()],
  );
  return rows[0]!.id;
}

export { as, q };
