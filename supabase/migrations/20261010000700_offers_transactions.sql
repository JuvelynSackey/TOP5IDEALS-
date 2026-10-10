-- =============================================================================
-- Top5Ideals 0700 — Offers (swap + purchase), negotiation history,
-- transactions, reservations, confirmations and disputes.
--
-- OFFER STATE MACHINE (swap_offers.status)
--   pending   → open; awaiting_party must respond (accept / counter / reject).
--               "Countered" is pending with current_version > 1.
--   accepted  → terms agreed; a transaction exists and listings are reserved.
--   rejected  → declined by the awaiting party.            (terminal)
--   cancelled → withdrawn by initiator, or a listing became
--               unavailable / was reserved by another deal. (terminal)
--   expired   → nobody responded before expires_at.        (terminal)
--   completed → the transaction completed.                 (terminal)
--   disputed  → the transaction is under dispute review.
--
-- Negotiation history is append-only: every proposal (created/countered) is a
-- swap_offer_events row carrying the full cash terms for that version, and the
-- offered items for each version are stored in swap_offer_items.
--
-- CASH DIFFERENCE: cash_amount_minor >= 0 in pesewas, cash_payer in
-- (none | initiator | recipient). amount = 0 ⇔ payer = none. For purchases the
-- initiator (buyer) always pays the full agreed amount.
--
-- CONCURRENCY: acceptance locks every involved listing row (ordered by id to
-- avoid deadlocks), re-validates eligibility, and inserts one
-- listing_reservations row per listing (PRIMARY KEY listing_id). A listing can
-- therefore never be reserved by two transactions, even under concurrent
-- requests.
-- =============================================================================

create table public.swap_offers (
  id uuid primary key default gen_random_uuid(),
  offer_type public.offer_type not null,
  listing_id uuid not null references public.listings (id) on delete restrict,
  initiator_id uuid references public.profiles (id) on delete set null,
  recipient_id uuid references public.profiles (id) on delete set null,
  status public.offer_status not null default 'pending',
  current_version integer not null default 1 check (current_version between 1 and 50),
  awaiting_party public.offer_party,
  expires_at timestamptz not null,
  idempotency_key uuid not null,
  conversation_id uuid references public.conversations (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (initiator_id, idempotency_key),
  check (initiator_id <> recipient_id),
  check ((status = 'pending') = (awaiting_party is not null))
);
create unique index swap_offers_one_open_per_buyer on public.swap_offers (listing_id, initiator_id) where status = 'pending';
create index swap_offers_initiator_idx on public.swap_offers (initiator_id, status, updated_at desc);
create index swap_offers_recipient_idx on public.swap_offers (recipient_id, status, updated_at desc);
create index swap_offers_listing_idx on public.swap_offers (listing_id, status);
create index swap_offers_expiry_idx on public.swap_offers (expires_at) where status = 'pending';

create table public.swap_offer_items (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.swap_offers (id) on delete cascade,
  version integer not null,
  listing_id uuid not null references public.listings (id) on delete restrict,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (offer_id, version, listing_id)
);
create index swap_offer_items_listing_idx on public.swap_offer_items (listing_id);

create table public.swap_offer_events (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.swap_offers (id) on delete cascade,
  version integer not null,
  event_type public.offer_event_type not null,
  actor_id uuid references public.profiles (id) on delete set null,
  cash_amount_minor bigint check (cash_amount_minor is null or cash_amount_minor between 0 and 100000000),
  cash_payer public.cash_payer,
  message text check (message is null or char_length(message) <= 1000),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (event_type not in ('created', 'countered') or (cash_amount_minor is not null and cash_payer is not null)),
  check (cash_amount_minor is null or ((cash_amount_minor = 0) = (cash_payer = 'none')))
);
create unique index swap_offer_events_one_proposal_per_version on public.swap_offer_events (offer_id, version)
  where event_type in ('created', 'countered');
create index swap_offer_events_offer_idx on public.swap_offer_events (offer_id, id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.swap_offers (id),
  transaction_type public.offer_type not null,
  listing_id uuid references public.listings (id) on delete set null,
  buyer_id uuid references public.profiles (id) on delete set null,
  seller_id uuid references public.profiles (id) on delete set null,
  agreed_version integer not null,
  cash_amount_minor bigint not null check (cash_amount_minor between 0 and 100000000),
  cash_payer public.cash_payer not null,
  currency char(3) not null default 'GHS',
  terms_snapshot jsonb not null,
  status public.transaction_status not null default 'active',
  accepted_at timestamptz not null default now(),
  confirm_by timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((cash_amount_minor = 0) = (cash_payer = 'none'))
);
create index transactions_buyer_idx on public.transactions (buyer_id, status);
create index transactions_seller_idx on public.transactions (seller_id, status);
create index transactions_status_idx on public.transactions (status, updated_at desc);

create table public.transaction_items (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  role text not null check (role in ('target', 'offered')),
  snapshot jsonb not null
);
create index transaction_items_tx_idx on public.transaction_items (transaction_id);

-- One row per listing currently committed to a transaction. The primary key is
-- the hard guarantee against double selling/swapping.
create table public.listing_reservations (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.transaction_confirmations (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  confirmed_at timestamptz not null default now(),
  unique (transaction_id, user_id)
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id),
  opened_by uuid references public.profiles (id) on delete set null,
  category public.dispute_category not null,
  description text not null check (char_length(description) between 10 and 2000),
  status public.dispute_status not null default 'open',
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index disputes_one_open_per_transaction on public.disputes (transaction_id) where status = 'open';
create index disputes_status_idx on public.disputes (status, created_at);

create trigger swap_offers_updated_at before update on public.swap_offers for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger disputes_updated_at before update on public.disputes for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Immutability guards
-- ---------------------------------------------------------------------------
create or replace function public.prevent_history_rewrite()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'immutable', detail = 'Negotiation history cannot be deleted.';
  end if;
  -- Only the FK-driven "actor/user deleted" nulling is allowed.
  if (to_jsonb(new) - 'actor_id' - 'user_id') is distinct from (to_jsonb(old) - 'actor_id' - 'user_id') then
    raise exception using errcode = 'P0001', message = 'immutable', detail = 'Negotiation history cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger swap_offer_events_immutable before update or delete on public.swap_offer_events
  for each row execute function public.prevent_history_rewrite();
create trigger swap_offer_items_immutable before update or delete on public.swap_offer_items
  for each row execute function public.prevent_history_rewrite();
create trigger transaction_confirmations_immutable before update or delete on public.transaction_confirmations
  for each row execute function public.prevent_history_rewrite();

create or replace function public.transactions_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.offer_id, new.transaction_type, new.agreed_version, new.cash_amount_minor, new.cash_payer,
      new.currency, new.terms_snapshot, new.accepted_at, new.created_at)
     is distinct from
     (old.offer_id, old.transaction_type, old.agreed_version, old.cash_amount_minor, old.cash_payer,
      old.currency, old.terms_snapshot, old.accepted_at, old.created_at) then
    raise exception using errcode = 'P0001', message = 'immutable', detail = 'Agreed transaction terms cannot be changed.';
  end if;
  if old.status in ('completed', 'cancelled') and new.status is distinct from old.status then
    raise exception using errcode = 'P0001', message = 'immutable', detail = 'A closed transaction cannot change state.';
  end if;
  return new;
end;
$$;

create trigger transactions_guard before update on public.transactions
  for each row execute function public.transactions_guard();

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.listing_snapshot(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', l.id, 'title', l.title, 'slug', l.slug, 'slug_key', l.slug_key,
    'brand', b.name, 'model', coalesce(m.name, l.custom_model), 'storage_gb', l.storage_gb,
    'condition', l.condition, 'battery_health', l.battery_health, 'price_minor', l.price_minor,
    'currency', l.currency, 'seller_id', l.seller_id,
    'image_path', (select storage_path from public.listing_images where listing_id = l.id and is_primary limit 1)
  )
  from public.listings l
  join public.brands b on b.id = l.brand_id
  left join public.phone_models m on m.id = l.model_id
  where l.id = p_listing_id;
$$;

create or replace function app_private.validate_cash_terms(
  p_type public.offer_type, p_amount bigint, p_payer public.cash_payer, p_listing public.listings
)
returns void
language plpgsql
as $$
begin
  if p_amount is null or p_payer is null then
    perform app_private.fail('invalid_cash', 'Enter the cash amount and who pays it.');
  end if;
  if p_amount < 0 or p_amount > 100000000 then
    perform app_private.fail('invalid_cash', 'The cash amount must be between GH₵0 and GH₵1,000,000.');
  end if;
  if (p_amount = 0) <> (p_payer = 'none') then
    perform app_private.fail('invalid_cash', 'Choose who pays the cash difference, or set the amount to zero.');
  end if;
  if p_type = 'purchase' then
    if p_payer <> 'initiator' or p_amount < 100 then
      perform app_private.fail('invalid_cash', 'A purchase offer must be a positive amount paid by the buyer.');
    end if;
    if p_amount > p_listing.price_minor then
      perform app_private.fail('invalid_cash', 'A purchase offer cannot exceed the asking price.');
    end if;
    if not p_listing.is_negotiable and p_amount <> p_listing.price_minor then
      perform app_private.fail('invalid_cash', 'This seller has fixed the price; offers must match the asking price.');
    end if;
  end if;
end;
$$;

create or replace function app_private.offer_party_of(p_offer public.swap_offers, p_uid uuid)
returns public.offer_party
language sql
immutable
as $$
  select case when p_uid = p_offer.initiator_id then 'initiator'::public.offer_party
              when p_uid = p_offer.recipient_id then 'recipient'::public.offer_party end;
$$;

create or replace function app_private.other_party(p_offer public.swap_offers, p_uid uuid)
returns uuid
language sql
immutable
as $$
  select case when p_uid = p_offer.initiator_id then p_offer.recipient_id else p_offer.initiator_id end;
$$;

-- Lock an offer the caller participates in.
create or replace function app_private.offer_for_update(p_offer_id uuid, p_uid uuid)
returns public.swap_offers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.swap_offers;
begin
  select * into v_offer from public.swap_offers where id = p_offer_id for update;
  if not found or p_uid not in (coalesce(v_offer.initiator_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                 coalesce(v_offer.recipient_id, '00000000-0000-0000-0000-000000000000'::uuid)) then
    perform app_private.fail('not_found', 'Offer not found.');
  end if;
  return v_offer;
end;
$$;

create or replace function app_private.current_terms(p_offer_id uuid, p_version integer)
returns public.swap_offer_events
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.swap_offer_events
  where offer_id = p_offer_id and version = p_version and event_type in ('created', 'countered');
$$;

create or replace function app_private.offer_title(p_offer public.swap_offers)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select title from public.listings where id = p_offer.listing_id), 'a listing');
$$;

-- ---------------------------------------------------------------------------
-- Offer RPCs
-- ---------------------------------------------------------------------------
create or replace function app_private.create_offer(
  p_type public.offer_type,
  p_listing_id uuid,
  p_offered_listing_ids uuid[],
  p_cash_amount_minor bigint,
  p_cash_payer public.cash_payer,
  p_message text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(true);
  v_existing uuid;
  v_target public.listings;
  v_item public.listings;
  v_ids uuid[] := coalesce(p_offered_listing_ids, '{}');
  v_offer_id uuid;
  v_conversation uuid;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_id uuid;
begin
  if p_idempotency_key is null then
    perform app_private.fail('validation_failed', 'Missing request id.');
  end if;
  -- Safe retry: the same request id returns the offer already created.
  select id into v_existing from public.swap_offers where initiator_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'offer_create', 20, interval '1 hour');

  if v_message is not null and char_length(v_message) > 1000 then
    perform app_private.fail('validation_failed', 'Messages are limited to 1,000 characters.');
  end if;

  select * into v_target from public.listings where id = p_listing_id;
  if not found or v_target.status <> 'published' or v_target.moderation_status <> 'approved' then
    perform app_private.fail('listing_unavailable', 'This listing is no longer available.');
  end if;
  if v_target.seller_id = v_uid then
    perform app_private.fail('own_listing', 'You cannot make an offer on your own listing.');
  end if;
  if app_private.is_blocked_between(v_uid, v_target.seller_id) then
    perform app_private.fail('blocked', 'You cannot make offers to this seller.');
  end if;
  if exists (select 1 from public.profiles where id = v_target.seller_id and account_status <> 'active') then
    perform app_private.fail('listing_unavailable', 'This listing is no longer available.');
  end if;

  if p_type = 'purchase' then
    if cardinality(v_ids) <> 0 then
      perform app_private.fail('validation_failed', 'A purchase offer cannot include phones.');
    end if;
    if not v_target.available_for_sale then
      perform app_private.fail('not_for_sale', 'This phone is available for swap only.');
    end if;
  else
    if not v_target.open_to_swap then
      perform app_private.fail('swap_not_accepted', 'This seller is not accepting swaps for this phone.');
    end if;
    if cardinality(v_ids) < 1 or cardinality(v_ids) > 3 then
      perform app_private.fail('validation_failed', 'Offer between one and three of your phones.');
    end if;
    if (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
      perform app_private.fail('validation_failed', 'Each phone can be offered only once.');
    end if;
    foreach v_id in array v_ids loop
      select * into v_item from public.listings where id = v_id;
      if not found or v_item.seller_id <> v_uid then
        perform app_private.fail('not_owner', 'You can only offer phones listed on your own account.');
      end if;
      if v_item.id = v_target.id then
        perform app_private.fail('validation_failed', 'You cannot offer the same phone.');
      end if;
      if v_item.status <> 'published' or v_item.moderation_status <> 'approved' then
        perform app_private.fail('offered_listing_unavailable', 'Only your live, approved listings can be offered.');
      end if;
    end loop;
  end if;

  perform app_private.validate_cash_terms(p_type, p_cash_amount_minor, p_cash_payer, v_target);

  v_conversation := app_private.ensure_conversation(v_uid, v_target.seller_id, v_target.id);

  begin
    insert into public.swap_offers (offer_type, listing_id, initiator_id, recipient_id, status, current_version,
                                    awaiting_party, expires_at, idempotency_key, conversation_id)
    values (p_type, v_target.id, v_uid, v_target.seller_id, 'pending', 1, 'recipient',
            now() + make_interval(hours => app_private.setting_int('offer_expiry_hours', 72)),
            p_idempotency_key, v_conversation)
    returning id into v_offer_id;
  exception when unique_violation then
    perform app_private.fail('duplicate_offer', 'You already have an open offer on this listing. Update it instead.');
  end;

  insert into public.swap_offer_items (offer_id, version, listing_id, snapshot)
  select v_offer_id, 1, x, app_private.listing_snapshot(x) from unnest(v_ids) x;

  insert into public.swap_offer_events (offer_id, version, event_type, actor_id, cash_amount_minor, cash_payer, message)
  values (v_offer_id, 1, 'created', v_uid, p_cash_amount_minor, p_cash_payer, v_message);

  perform app_private.notify(
    v_target.seller_id, 'offer_received',
    case when p_type = 'swap' then 'New swap offer' else 'New purchase offer' end,
    'For ' || v_target.title,
    '/dashboard/offers/' || v_offer_id::text, 'offer', v_offer_id::text,
    'offer:' || v_offer_id::text || ':created'
  );
  perform app_private.log_audit(v_uid, 'offer.created', 'offer', v_offer_id::text,
    jsonb_build_object('type', p_type, 'listing_id', v_target.id));
  return v_offer_id;
end;
$$;

create or replace function public.create_swap_offer(
  p_listing_id uuid,
  p_offered_listing_ids uuid[],
  p_cash_amount_minor bigint,
  p_cash_payer public.cash_payer,
  p_message text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select app_private.create_offer('swap', p_listing_id, p_offered_listing_ids, p_cash_amount_minor, p_cash_payer, p_message, p_idempotency_key);
$$;

create or replace function public.initiate_purchase(
  p_listing_id uuid,
  p_amount_minor bigint,
  p_message text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select app_private.create_offer('purchase', p_listing_id, '{}', p_amount_minor, 'initiator', p_message, p_idempotency_key);
$$;

create or replace function public.counter_swap_offer(
  p_offer_id uuid,
  p_expected_version integer,
  p_cash_amount_minor bigint,
  p_cash_payer public.cash_payer,
  p_message text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(true);
  v_offer public.swap_offers;
  v_terms public.swap_offer_events;
  v_target public.listings;
  v_new_version integer;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  v_offer := app_private.offer_for_update(p_offer_id, v_uid);
  if v_offer.status <> 'pending' then
    perform app_private.fail('offer_closed', 'This offer is no longer open.');
  end if;
  if v_offer.expires_at <= now() then
    perform app_private.fail('offer_expired', 'This offer has expired.');
  end if;
  if app_private.offer_party_of(v_offer, v_uid) <> v_offer.awaiting_party then
    perform app_private.fail('not_your_turn', 'You are waiting for the other party to respond.');
  end if;
  if p_expected_version is distinct from v_offer.current_version then
    perform app_private.fail('offer_changed', 'This offer changed while you were viewing it. Review the latest terms.');
  end if;
  if v_offer.current_version >= 50 then
    perform app_private.fail('negotiation_limit', 'This negotiation has reached its limit. Accept, reject or start a new offer.');
  end if;
  if v_message is not null and char_length(v_message) > 1000 then
    perform app_private.fail('validation_failed', 'Messages are limited to 1,000 characters.');
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'offer_counter', 60, interval '1 hour');

  select * into v_target from public.listings where id = v_offer.listing_id;
  perform app_private.validate_cash_terms(v_offer.offer_type, p_cash_amount_minor, p_cash_payer, v_target);

  v_terms := app_private.current_terms(v_offer.id, v_offer.current_version);
  if v_terms.cash_amount_minor = p_cash_amount_minor and v_terms.cash_payer = p_cash_payer then
    perform app_private.fail('no_change', 'Your counteroffer has the same terms. Accept the offer instead.');
  end if;

  v_new_version := v_offer.current_version + 1;
  insert into public.swap_offer_items (offer_id, version, listing_id, snapshot)
  select v_offer.id, v_new_version, i.listing_id, app_private.listing_snapshot(i.listing_id)
  from public.swap_offer_items i
  where i.offer_id = v_offer.id and i.version = v_offer.current_version;

  insert into public.swap_offer_events (offer_id, version, event_type, actor_id, cash_amount_minor, cash_payer, message)
  values (v_offer.id, v_new_version, 'countered', v_uid, p_cash_amount_minor, p_cash_payer, v_message);

  update public.swap_offers
    set current_version = v_new_version,
        awaiting_party = case when awaiting_party = 'recipient' then 'initiator'::public.offer_party else 'recipient'::public.offer_party end,
        expires_at = now() + make_interval(hours => app_private.setting_int('offer_expiry_hours', 72))
    where id = v_offer.id;

  perform app_private.notify(
    app_private.other_party(v_offer, v_uid), 'offer_countered', 'You received a counteroffer',
    'On ' || app_private.offer_title(v_offer),
    '/dashboard/offers/' || v_offer.id::text, 'offer', v_offer.id::text,
    'offer:' || v_offer.id::text || ':v' || v_new_version
  );
  perform app_private.log_audit(v_uid, 'offer.countered', 'offer', v_offer.id::text, jsonb_build_object('version', v_new_version));
  return v_new_version;
end;
$$;

-- Accept the current terms. Returns the new transaction id.
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

  select coalesce(array_agg(listing_id order by listing_id), '{}') into v_item_ids
  from public.swap_offer_items where offer_id = v_offer.id and version = v_offer.current_version;
  v_all_ids := array_append(v_item_ids, v_offer.listing_id);

  -- Lock every involved listing in a deterministic order.
  select count(*) into v_locked from (
    select id from public.listings where id = any (v_all_ids) order by id for update
  ) locked;
  if v_locked <> cardinality(v_all_ids) then
    perform app_private.fail('listing_unavailable', 'One of the phones in this deal is no longer available.');
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

create or replace function public.reject_swap_offer(p_offer_id uuid, p_message text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(false);
  v_offer public.swap_offers;
begin
  v_offer := app_private.offer_for_update(p_offer_id, v_uid);
  if v_offer.status <> 'pending' then
    perform app_private.fail('offer_closed', 'This offer is no longer open.');
  end if;
  if app_private.offer_party_of(v_offer, v_uid) <> v_offer.awaiting_party then
    perform app_private.fail('not_your_turn', 'Only the party receiving these terms can reject them. You can cancel your own offer instead.');
  end if;
  update public.swap_offers set status = 'rejected', awaiting_party = null, closed_at = now() where id = v_offer.id;
  insert into public.swap_offer_events (offer_id, version, event_type, actor_id, message)
  values (v_offer.id, v_offer.current_version, 'rejected', v_uid, left(nullif(btrim(coalesce(p_message, '')), ''), 1000));
  perform app_private.notify(
    app_private.other_party(v_offer, v_uid), 'offer_rejected', 'Your offer was declined',
    'On ' || app_private.offer_title(v_offer),
    '/dashboard/offers/' || v_offer.id::text, 'offer', v_offer.id::text,
    'offer:' || v_offer.id::text || ':rejected'
  );
  perform app_private.log_audit(v_uid, 'offer.rejected', 'offer', v_offer.id::text, '{}');
end;
$$;

-- The initiator withdraws their own open offer.
create or replace function public.cancel_swap_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(false);
  v_offer public.swap_offers;
begin
  v_offer := app_private.offer_for_update(p_offer_id, v_uid);
  if v_offer.initiator_id <> v_uid then
    perform app_private.fail('forbidden', 'Only the person who made the offer can cancel it.');
  end if;
  if v_offer.status <> 'pending' then
    perform app_private.fail('offer_closed', 'This offer is no longer open.');
  end if;
  update public.swap_offers set status = 'cancelled', awaiting_party = null, closed_at = now() where id = v_offer.id;
  insert into public.swap_offer_events (offer_id, version, event_type, actor_id, metadata)
  values (v_offer.id, v_offer.current_version, 'cancelled', v_uid, '{"reason":"withdrawn"}');
  perform app_private.notify(
    v_offer.recipient_id, 'offer_cancelled', 'An offer was withdrawn',
    'On ' || app_private.offer_title(v_offer),
    '/dashboard/offers/' || v_offer.id::text, 'offer', v_offer.id::text,
    'offer:' || v_offer.id::text || ':cancelled'
  );
  perform app_private.log_audit(v_uid, 'offer.cancelled', 'offer', v_offer.id::text, '{}');
end;
$$;

-- Expire overdue open offers. Idempotent; safe for anyone (or a cron job) to call.
create or replace function public.expire_due_offers()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.swap_offers;
  v_count integer := 0;
begin
  for v_offer in
    select * from public.swap_offers
    where status = 'pending' and expires_at <= now()
    order by expires_at
    limit 500
    for update skip locked
  loop
    update public.swap_offers set status = 'expired', awaiting_party = null, closed_at = now() where id = v_offer.id;
    insert into public.swap_offer_events (offer_id, version, event_type, actor_id)
    values (v_offer.id, v_offer.current_version, 'expired', null);
    perform app_private.notify(v_offer.initiator_id, 'offer_expired', 'An offer expired', 'On ' || app_private.offer_title(v_offer),
      '/dashboard/offers/' || v_offer.id::text, 'offer', v_offer.id::text, 'offer:' || v_offer.id::text || ':expired');
    perform app_private.notify(v_offer.recipient_id, 'offer_expired', 'An offer expired', 'On ' || app_private.offer_title(v_offer),
      '/dashboard/offers/' || v_offer.id::text, 'offer', v_offer.id::text, 'offer:' || v_offer.id::text || ':expired');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- When a listing stops being offerable (paused, archived, reserved, moderated,
-- sold), every open offer that involves it is cancelled with an audit trail.
create or replace function public.listings_after_availability_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.swap_offers;
begin
  if (old.status = 'published' and old.moderation_status = 'approved')
     and not (new.status = 'published' and new.moderation_status = 'approved') then
    for v_offer in
      select o.* from public.swap_offers o
      where o.status = 'pending'
        and (o.listing_id = new.id or exists (
          select 1 from public.swap_offer_items i
          where i.offer_id = o.id and i.version = o.current_version and i.listing_id = new.id))
      for update
    loop
      update public.swap_offers set status = 'cancelled', awaiting_party = null, closed_at = now() where id = v_offer.id;
      insert into public.swap_offer_events (offer_id, version, event_type, actor_id, metadata)
      values (v_offer.id, v_offer.current_version, 'cancelled', null,
              jsonb_build_object('reason', 'listing_unavailable', 'listing_id', new.id, 'listing_status', new.status));
      perform app_private.notify(v_offer.initiator_id, 'offer_cancelled', 'An offer was closed',
        'A phone in this offer is no longer available.', '/dashboard/offers/' || v_offer.id::text, 'offer', v_offer.id::text,
        'offer:' || v_offer.id::text || ':cancelled');
      perform app_private.notify(v_offer.recipient_id, 'offer_cancelled', 'An offer was closed',
        'A phone in this offer is no longer available.', '/dashboard/offers/' || v_offer.id::text, 'offer', v_offer.id::text,
        'offer:' || v_offer.id::text || ':cancelled');
    end loop;
  end if;
  return new;
end;
$$;

create trigger listings_after_availability_change
  after update of status, moderation_status on public.listings
  for each row execute function public.listings_after_availability_change();

-- ---------------------------------------------------------------------------
-- Transaction RPCs
-- ---------------------------------------------------------------------------
create or replace function app_private.tx_for_update(p_tx_id uuid, p_uid uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions;
begin
  select * into v_tx from public.transactions where id = p_tx_id for update;
  if not found or (p_uid is distinct from v_tx.buyer_id and p_uid is distinct from v_tx.seller_id) then
    perform app_private.fail('not_found', 'Transaction not found.');
  end if;
  return v_tx;
end;
$$;

create or replace function app_private.complete_transaction(p_tx_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions;
begin
  select * into v_tx from public.transactions where id = p_tx_id for update;
  update public.transactions set status = 'completed', completed_at = now() where id = v_tx.id;
  update public.listings
    set status = case when id = v_tx.listing_id and v_tx.transaction_type = 'purchase' then 'sold'::public.listing_status
                      else 'swapped'::public.listing_status end
    where id in (select listing_id from public.listing_reservations where transaction_id = v_tx.id);
  update public.swap_offers set status = 'completed', closed_at = now() where id = v_tx.offer_id;
  insert into public.swap_offer_events (offer_id, version, event_type, actor_id)
  values (v_tx.offer_id, v_tx.agreed_version, 'completed', p_actor);

  perform app_private.notify(v_tx.seller_id,
    case when v_tx.transaction_type = 'purchase' then 'listing_sold'::public.notification_type else 'listing_swapped'::public.notification_type end,
    'Exchange completed', 'You can now leave a review.',
    '/dashboard/transactions/' || v_tx.id::text, 'transaction', v_tx.id::text, 'tx:' || v_tx.id::text || ':completed');
  perform app_private.notify(v_tx.buyer_id, 'transaction_update', 'Exchange completed', 'You can now leave a review.',
    '/dashboard/transactions/' || v_tx.id::text, 'transaction', v_tx.id::text, 'tx:' || v_tx.id::text || ':completed');
  perform app_private.log_audit(p_actor, 'transaction.completed', 'transaction', v_tx.id::text, '{}');
end;
$$;

create or replace function app_private.cancel_transaction_internal(p_tx_id uuid, p_actor uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions;
  v_ids uuid[];
begin
  select * into v_tx from public.transactions where id = p_tx_id for update;
  select coalesce(array_agg(listing_id), '{}') into v_ids from public.listing_reservations where transaction_id = v_tx.id;
  update public.transactions
    set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, cancel_reason = left(p_reason, 500)
    where id = v_tx.id;
  delete from public.listing_reservations where transaction_id = v_tx.id;
  -- Release reserved listings back to the marketplace.
  update public.listings set status = 'published' where id = any (v_ids) and status = 'reserved';
  update public.swap_offers set status = 'cancelled', closed_at = now() where id = v_tx.offer_id;
  insert into public.swap_offer_events (offer_id, version, event_type, actor_id, metadata)
  values (v_tx.offer_id, v_tx.agreed_version, 'cancelled', p_actor, jsonb_build_object('reason', 'transaction_cancelled'));

  perform app_private.notify(v_tx.buyer_id, 'transaction_update', 'Exchange cancelled', coalesce(left(p_reason, 200), ''),
    '/dashboard/transactions/' || v_tx.id::text, 'transaction', v_tx.id::text, 'tx:' || v_tx.id::text || ':cancelled');
  perform app_private.notify(v_tx.seller_id, 'transaction_update', 'Exchange cancelled', coalesce(left(p_reason, 200), ''),
    '/dashboard/transactions/' || v_tx.id::text, 'transaction', v_tx.id::text, 'tx:' || v_tx.id::text || ':cancelled');
  perform app_private.log_audit(p_actor, 'transaction.cancelled', 'transaction', v_tx.id::text, '{}');
end;
$$;

-- Each party independently confirms the exchange happened as agreed.
-- Completion requires both confirmations; a single confirmation never
-- completes a transaction. Returns the resulting status.
create or replace function public.confirm_transaction(p_transaction_id uuid, p_note text default null)
returns public.transaction_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(true);
  v_tx public.transactions;
  v_count int;
begin
  v_tx := app_private.tx_for_update(p_transaction_id, v_uid);
  if v_tx.status = 'disputed' then
    perform app_private.fail('transaction_disputed', 'This exchange is under dispute review.');
  end if;
  if v_tx.status <> 'active' then
    perform app_private.fail('invalid_state', 'This exchange is already closed.');
  end if;

  insert into public.transaction_confirmations (transaction_id, user_id, note)
  values (v_tx.id, v_uid, left(nullif(btrim(coalesce(p_note, '')), ''), 500))
  on conflict (transaction_id, user_id) do nothing;

  select count(distinct user_id) into v_count from public.transaction_confirmations
  where transaction_id = v_tx.id and user_id in (v_tx.buyer_id, v_tx.seller_id);

  if v_count = 2 then
    perform app_private.complete_transaction(v_tx.id, v_uid);
    return 'completed';
  end if;

  perform app_private.notify(
    case when v_uid = v_tx.buyer_id then v_tx.seller_id else v_tx.buyer_id end,
    'transaction_update', 'The other party confirmed the exchange',
    'Confirm once you have received what was agreed, or report a problem.',
    '/dashboard/transactions/' || v_tx.id::text, 'transaction', v_tx.id::text,
    'tx:' || v_tx.id::text || ':confirmed:' || v_uid::text);
  perform app_private.log_audit(v_uid, 'transaction.confirmed', 'transaction', v_tx.id::text, '{}');
  return 'active';
end;
$$;

-- Either party may cancel before anyone has confirmed. After a confirmation,
-- disagreements must go through a dispute.
create or replace function public.cancel_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(false);
  v_tx public.transactions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  v_tx := app_private.tx_for_update(p_transaction_id, v_uid);
  if v_tx.status <> 'active' then
    perform app_private.fail('invalid_state', 'Only active exchanges can be cancelled.');
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    perform app_private.fail('validation_failed', 'Please give a short reason (at least 5 characters).');
  end if;
  if exists (select 1 from public.transaction_confirmations where transaction_id = v_tx.id) then
    perform app_private.fail('confirmation_exists', 'A party has already confirmed this exchange. Report a problem instead.');
  end if;
  perform app_private.cancel_transaction_internal(v_tx.id, v_uid, v_reason);
end;
$$;

create or replace function public.open_dispute(p_transaction_id uuid, p_category public.dispute_category, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(false);
  v_tx public.transactions;
  v_id uuid;
  v_description text := btrim(coalesce(p_description, ''));
begin
  v_tx := app_private.tx_for_update(p_transaction_id, v_uid);
  if v_tx.status = 'disputed' then
    perform app_private.fail('already_disputed', 'A dispute is already open for this exchange.');
  end if;
  if v_tx.status <> 'active' then
    perform app_private.fail('invalid_state', 'Problems with closed exchanges can be reported from the transaction page.');
  end if;
  if char_length(v_description) < 10 or char_length(v_description) > 2000 then
    perform app_private.fail('validation_failed', 'Describe the problem in 10 to 2,000 characters.');
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'dispute_open', 5, interval '1 day');

  insert into public.disputes (transaction_id, opened_by, category, description)
  values (v_tx.id, v_uid, p_category, v_description)
  returning id into v_id;
  update public.transactions set status = 'disputed' where id = v_tx.id;
  update public.swap_offers set status = 'disputed' where id = v_tx.offer_id;
  insert into public.swap_offer_events (offer_id, version, event_type, actor_id, metadata)
  values (v_tx.offer_id, v_tx.agreed_version, 'disputed', v_uid, jsonb_build_object('dispute_id', v_id, 'category', p_category));

  perform app_private.notify(
    case when v_uid = v_tx.buyer_id then v_tx.seller_id else v_tx.buyer_id end,
    'dispute_update', 'A problem was reported with your exchange',
    'Our team will review it. You can add details in your messages.',
    '/dashboard/transactions/' || v_tx.id::text, 'transaction', v_tx.id::text, 'dispute:' || v_id::text || ':opened');
  perform app_private.log_audit(v_uid, 'dispute.opened', 'transaction', v_tx.id::text, jsonb_build_object('dispute_id', v_id));
  return v_id;
end;
$$;

-- Staff resolve a dispute: complete the exchange, cancel it (releasing the
-- listings) or dismiss the dispute (exchange continues).
create or replace function public.resolve_dispute(p_dispute_id uuid, p_outcome text, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := app_private.require_staff();
  v_dispute public.disputes;
  v_tx public.transactions;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_status public.dispute_status;
begin
  if p_outcome not in ('complete', 'cancel', 'dismiss') then
    perform app_private.fail('validation_failed', 'Unknown outcome.');
  end if;
  if v_note is null or char_length(v_note) < 5 then
    perform app_private.fail('validation_failed', 'A resolution note is required.');
  end if;
  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if not found then
    perform app_private.fail('not_found', 'Dispute not found.');
  end if;
  if v_dispute.status <> 'open' then
    perform app_private.fail('invalid_state', 'This dispute is already resolved.');
  end if;
  select * into v_tx from public.transactions where id = v_dispute.transaction_id for update;

  if p_outcome = 'complete' then
    perform app_private.complete_transaction(v_tx.id, v_admin);
    v_status := 'resolved_completed';
  elsif p_outcome = 'cancel' then
    perform app_private.cancel_transaction_internal(v_tx.id, v_admin, 'Cancelled after dispute review: ' || v_note);
    v_status := 'resolved_cancelled';
  else
    update public.transactions set status = 'active' where id = v_tx.id;
    update public.swap_offers set status = 'accepted' where id = v_tx.offer_id;
    v_status := 'dismissed';
  end if;

  update public.disputes set status = v_status, resolution_note = left(v_note, 1000), resolved_by = v_admin, resolved_at = now()
  where id = v_dispute.id;
  insert into public.swap_offer_events (offer_id, version, event_type, actor_id, metadata)
  values (v_tx.offer_id, v_tx.agreed_version, 'dispute_resolved', v_admin, jsonb_build_object('dispute_id', v_dispute.id, 'outcome', v_status));

  perform app_private.notify(v_tx.buyer_id, 'dispute_update', 'Dispute resolved', left(v_note, 200),
    '/dashboard/transactions/' || v_tx.id::text, 'transaction', v_tx.id::text, 'dispute:' || v_dispute.id::text || ':resolved');
  perform app_private.notify(v_tx.seller_id, 'dispute_update', 'Dispute resolved', left(v_note, 200),
    '/dashboard/transactions/' || v_tx.id::text, 'transaction', v_tx.id::text, 'dispute:' || v_dispute.id::text || ':resolved');
  perform app_private.log_admin_action('dispute.' || p_outcome, 'dispute', v_dispute.id::text, v_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.swap_offers enable row level security;
alter table public.swap_offer_items enable row level security;
alter table public.swap_offer_events enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.listing_reservations enable row level security;
alter table public.transaction_confirmations enable row level security;
alter table public.disputes enable row level security;

create policy "parties and staff read offers" on public.swap_offers
  for select to authenticated
  using ((select auth.uid()) in (initiator_id, recipient_id) or public.is_staff());
create policy "offer items follow offer access" on public.swap_offer_items
  for select to authenticated
  using (exists (select 1 from public.swap_offers o where o.id = offer_id));
create policy "offer events follow offer access" on public.swap_offer_events
  for select to authenticated
  using (exists (select 1 from public.swap_offers o where o.id = offer_id));

create policy "parties and staff read transactions" on public.transactions
  for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id) or public.is_staff());
create policy "transaction items follow transaction access" on public.transaction_items
  for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id));
create policy "confirmations follow transaction access" on public.transaction_confirmations
  for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id));
create policy "disputes follow transaction access" on public.disputes
  for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id));
-- listing_reservations: internal only.

revoke all on public.swap_offers, public.swap_offer_items, public.swap_offer_events, public.transactions,
  public.transaction_items, public.listing_reservations, public.transaction_confirmations, public.disputes
  from anon, authenticated;
grant select on public.swap_offers, public.swap_offer_items, public.swap_offer_events, public.transactions,
  public.transaction_items, public.transaction_confirmations, public.disputes
  to authenticated;
