-- =============================================================================
-- Top5Ideals 1100 — Private listing images.
--
-- The listing-images bucket becomes PRIVATE. Files are served by the app route
-- /media/listings/<path>, which downloads them as the current visitor, so this
-- read rule decides who sees each photo:
--   * anyone, when the photo's listing is public (approved + published/paused/
--     reserved/sold/swapped);
--   * the listing owner and staff, always (drafts, review, rejected, archived);
--   * parties to an offer or transaction involving the listing (history stays
--     viewable after a listing is archived or taken down).
-- Upload/delete rules from migration 0900 are unchanged.
-- =============================================================================

create or replace function public.can_read_listing_image(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.listing_images li
    join public.listings l on l.id = li.listing_id
    where li.storage_path = p_name
      and (
        public.listing_is_public(l.status, l.moderation_status)
        or l.seller_id = auth.uid()
        or public.is_staff()
        or exists (
          select 1 from public.swap_offers o
          where auth.uid() in (o.initiator_id, o.recipient_id)
            and (o.listing_id = l.id
                 or exists (select 1 from public.swap_offer_items i where i.offer_id = o.id and i.listing_id = l.id))
        )
        or exists (
          select 1 from public.transaction_items ti
          join public.transactions t on t.id = ti.transaction_id
          where ti.listing_id = l.id and auth.uid() in (t.buyer_id, t.seller_id)
        )
      )
  );
$$;

revoke execute on function public.can_read_listing_image(text) from public, anon, authenticated;
grant execute on function public.can_read_listing_image(text) to anon, authenticated, service_role;

create policy "top5: read listing images of visible listings" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'listing-images' and public.can_read_listing_image(name));

update storage.buckets set public = false where id = 'listing-images';
