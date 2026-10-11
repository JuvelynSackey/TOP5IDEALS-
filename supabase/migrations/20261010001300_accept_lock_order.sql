-- =============================================================================
-- Top5Ideals 1300 — Deadlock-free offer acceptance.
--
-- Found by the real-Postgres race test on staging: two simultaneous
-- acceptances for the same phone sometimes failed with "deadlock detected"
-- (40P01) instead of a clean "offer_closed". Integrity always held (one
-- reservation), but the loser saw an unhelpful error and could be aborted
-- mid-flow.
--
-- Cause: accept_swap_offer locked its offer first and the listings second,
-- while reserving a listing fires a trigger that locks *other* offers
-- (listing → offer). Two acceptances could each hold what the other needed.
-- Fix: read the offer without a lock, lock all involved listings (ordered by
-- id), then lock the offer and re-run every check. The expected-version check
-- after locking guarantees the phone list read in step 1 is still current.
-- =============================================================================

create or replace function public.accept_swap_offer(p_offer_id uuid, p_expected_version integer)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(true);
  v_offer public.swap_offers;
  v_terms public.swap_offer_events;
  v_target public.listings;
  v_item_ids uuid[];
  v_all_ids uuid[];
  v_locked int;
  v_bad int;
  v_tx uuid;
  v_inserted int;
  v_offered jsonb;
begin
  -- 1. Unlocked read: who is involved and which phones are in these terms.
  select * into v_offer from public.swap_offers where id = p_offer_id;
  if not found or v_uid not in (coalesce(v_offer.initiator_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                 coalesce(v_offer.recipient_id, '00000000-0000-0000-0000-000000000000'::uuid)) then
    perform app_private.fail('not_found', 'Offer not found.');
  end if;
  if v_offer.status <> 'pending' then
    perform app_private.fail('offer_closed', 'This offer is no longer open.');
  end if;
  if p_expected_version is distinct from v_offer.current_version then
    perform app_private.fail('offer_changed', 'This offer changed while you were viewing it. Review the latest terms.');
  end if;

  -- 2. Lock the phones BEFORE the offer. Every other path (listing updates and
  --    the trigger that closes competing offers) locks listings, then offers;
  --    taking them in the same order prevents deadlocks between two
  --    simultaneous acceptances.
  select coalesce(array_agg(listing_id order by listing_id), '{}') into v_item_ids
  from public.swap_offer_items where offer_id = v_offer.id and version = p_expected_version;
  v_all_ids := array_append(v_item_ids, v_offer.listing_id);

  -- Lock every involved listing in a deterministic order.
  select count(*) into v_locked from (
    select id from public.listings where id = any (v_all_ids) order by id for update
  ) locked;
  if v_locked <> cardinality(v_all_ids) then
    perform app_private.fail('listing_unavailable', 'One of the phones in this deal is no longer available.');
  end if;

  -- 3. Lock the offer and re-validate everything now that nothing can change.
  v_offer := app_private.offer_for_update(p_offer_id, v_uid);
  if v_offer.status <> 'pending' then
    perform app_private.fail('offer_closed', 'This offer is no longer open.');
  end if;
  if v_offer.expires_at <= now() then
    perform app_private.fail('offer_expired', 'This offer has expired.');
  end if;
  if app_private.offer_party_of(v_offer, v_uid) <> v_offer.awaiting_party then
    perform app_private.fail('not_your_turn', 'Only the party receiving these terms can accept them.');
  end if;
  if p_expected_version is distinct from v_offer.current_version then
    perform app_private.fail('offer_changed', 'This offer changed while you were viewing it. Review the latest terms.');
  end if;
  if v_offer.initiator_id is null or v_offer.recipient_id is null then
    perform app_private.fail('offer_closed', 'This offer is no longer open.');
  end if;
  if exists (select 1 from public.profiles where id in (v_offer.initiator_id, v_offer.recipient_id) and account_status <> 'active') then
    perform app_private.fail('party_unavailable', 'The other party cannot complete deals right now.');
  end if;

  select * into v_target from public.listings where id = v_offer.listing_id;
  if v_target.status <> 'published' or v_target.moderation_status <> 'approved' or v_target.seller_id <> v_offer.recipient_id
     or (v_offer.offer_type = 'purchase' and not v_target.available_for_sale)
     or (v_offer.offer_type = 'swap' and not v_target.open_to_swap) then
    perform app_private.fail('listing_unavailable', 'This listing is no longer available.');
  end if;

  select count(*) into v_bad from public.listings
  where id = any (v_item_ids)
    and (seller_id <> v_offer.initiator_id or status <> 'published' or moderation_status <> 'approved');
  if v_bad > 0 then
    perform app_private.fail('offered_listing_unavailable', 'A phone offered in this swap is no longer available.');
  end if;

  if exists (select 1 from public.listing_reservations where listing_id = any (v_all_ids)) then
    perform app_private.fail('listing_unavailable', 'One of the phones in this deal is already reserved.');
  end if;

  v_terms := app_private.current_terms(v_offer.id, v_offer.current_version);

  select coalesce(jsonb_agg(app_private.listing_snapshot(x)), '[]') into v_offered from unnest(v_item_ids) x;

  insert into public.transactions (offer_id, transaction_type, listing_id, buyer_id, seller_id, agreed_version,
                                   cash_amount_minor, cash_payer, terms_snapshot, confirm_by)
  values (v_offer.id, v_offer.offer_type, v_target.id, v_offer.initiator_id, v_offer.recipient_id, v_offer.current_version,
          v_terms.cash_amount_minor, v_terms.cash_payer,
          jsonb_build_object(
            'target', app_private.listing_snapshot(v_target.id),
            'offered', v_offered,
            'cash_amount_minor', v_terms.cash_amount_minor,
            'cash_payer', v_terms.cash_payer,
            'currency', 'GHS',
            'version', v_offer.current_version
          ),
          now() + make_interval(days => app_private.setting_int('confirmation_window_days', 7)))
  returning id into v_tx;

  insert into public.listing_reservations (listing_id, transaction_id)
  select x, v_tx from unnest(v_all_ids) x
  on conflict (listing_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted <> cardinality(v_all_ids) then
    perform app_private.fail('listing_unavailable', 'One of the phones in this deal is already reserved.');
  end if;

  insert into public.transaction_items (transaction_id, listing_id, role, snapshot)
  select v_tx, v_target.id, 'target', app_private.listing_snapshot(v_target.id)
  union all
  select v_tx, x, 'offered', app_private.listing_snapshot(x) from unnest(v_item_ids) x;

  update public.swap_offers set status = 'accepted', awaiting_party = null where id = v_offer.id;
  insert into public.swap_offer_events (offer_id, version, event_type, actor_id)
  values (v_offer.id, v_offer.current_version, 'accepted', v_uid);

  -- Reserving the listings cancels every other open offer that involves them
  -- (see listings_after_availability_change).
  update public.listings set status = 'reserved' where id = any (v_all_ids);

  perform app_private.notify(
    app_private.other_party(v_offer, v_uid), 'offer_accepted', 'Your offer was accepted',
    'Arrange the exchange for ' || v_target.title || ' and confirm once it is done.',
    '/dashboard/transactions/' || v_tx::text, 'transaction', v_tx::text,
    'offer:' || v_offer.id::text || ':accepted'
  );
  perform app_private.log_audit(v_uid, 'offer.accepted', 'offer', v_offer.id::text,
    jsonb_build_object('transaction_id', v_tx, 'version', v_offer.current_version));
  return v_tx;
end;
$$;
