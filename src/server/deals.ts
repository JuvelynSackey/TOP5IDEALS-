import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CashPayer } from "@/lib/cash";

export const OFFER_SELECT = `
  id, offer_type, status, current_version, awaiting_party, expires_at, created_at, updated_at, closed_at,
  initiator_id, recipient_id, conversation_id,
  listing:listings!swap_offers_listing_id_fkey(id, title, slug, slug_key, price_minor, status, listing_images(storage_path, is_primary)),
  initiator:profiles!swap_offers_initiator_id_fkey(id, username, full_name, avatar_path),
  recipient:profiles!swap_offers_recipient_id_fkey(id, username, full_name, avatar_path),
  swap_offer_items(version, listing_id, snapshot),
  swap_offer_events(id, version, event_type, actor_id, cash_amount_minor, cash_payer, message, metadata, created_at),
  transactions(id, status)
`;

export interface Snapshot {
  id: string;
  title: string;
  slug: string;
  slug_key: string;
  brand?: string;
  model?: string;
  storage_gb?: number | null;
  condition?: string | null;
  price_minor?: number | null;
  image_path?: string | null;
}

export async function listMyOffers(uid: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("swap_offers")
    .select(OFFER_SELECT)
    .or(`initiator_id.eq.${uid},recipient_id.eq.${uid}`)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("offers_unavailable");
  return data;
}

export async function getOffer(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("swap_offers").select(OFFER_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error("offer_unavailable");
  return data;
}

export type OfferRow = NonNullable<Awaited<ReturnType<typeof getOffer>>>;

export function currentTerms(offer: OfferRow): { amountMinor: number; payer: CashPayer; message: string | null } {
  const proposal = offer.swap_offer_events
    .filter((e) => e.version === offer.current_version && (e.event_type === "created" || e.event_type === "countered"))
    .at(-1);
  return {
    amountMinor: Number(proposal?.cash_amount_minor ?? 0),
    payer: (proposal?.cash_payer ?? "none") as CashPayer,
    message: proposal?.message ?? null,
  };
}

export function currentItems(offer: OfferRow): Snapshot[] {
  return offer.swap_offer_items.filter((i) => i.version === offer.current_version).map((i) => i.snapshot as unknown as Snapshot);
}

export function displayName(p: { username: string | null; full_name: string } | null | undefined): string {
  if (!p) return "Deleted user";
  return p.full_name || (p.username ? `@${p.username}` : "Member");
}
