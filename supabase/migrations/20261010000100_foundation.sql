-- =============================================================================
-- Top5Ideals 0100 — Foundation
-- Enumerations, shared helpers, private schema, location catalogue and settings.
--
-- Conventions used by every migration:
--   * Money is stored as BIGINT minor units (pesewas for GHS). GH₵1.00 = 100.
--   * Timestamps are timestamptz (UTC). The UI renders them in Africa/Accra.
--   * Business-rule violations raise SQLSTATE P0001 with a stable machine code
--     in MESSAGE (e.g. 'listing_unavailable') and a human hint in DETAIL.
--   * Internal helpers live in schema app_private, which PostgREST does not
--     expose. Public RPCs are SECURITY DEFINER and authenticate via auth.uid().
-- =============================================================================

create schema if not exists app_private;
revoke all on schema app_private from public;
-- Client roles may reach only the explicitly granted, side-effect free helpers
-- (needed by invoker-rights triggers). Everything else stays owner-only.
grant usage on schema app_private to anon, authenticated;
alter default privileges in schema app_private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.account_type as enum ('individual', 'business');
create type public.user_role as enum ('user', 'moderator', 'admin');
create type public.account_status as enum ('active', 'suspended');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.verification_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.verification_kind as enum ('individual', 'business');

create type public.listing_condition as enum ('new', 'like_new', 'excellent', 'good', 'fair', 'refurbished');
create type public.listing_status as enum ('draft', 'published', 'paused', 'reserved', 'sold', 'swapped', 'archived');
create type public.moderation_status as enum ('not_submitted', 'pending_review', 'approved', 'rejected');
create type public.battery_health_status as enum ('reported', 'unknown', 'not_applicable');
create type public.network_lock_status as enum ('unlocked', 'locked', 'unknown');

create type public.offer_type as enum ('swap', 'purchase');
create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'cancelled', 'expired', 'completed', 'disputed');
create type public.offer_party as enum ('initiator', 'recipient');
create type public.cash_payer as enum ('none', 'initiator', 'recipient');
create type public.offer_event_type as enum ('created', 'countered', 'accepted', 'rejected', 'cancelled', 'expired', 'completed', 'disputed', 'dispute_resolved');

create type public.transaction_status as enum ('active', 'completed', 'cancelled', 'disputed');
create type public.dispute_category as enum ('no_show', 'not_as_described', 'other_party_unresponsive', 'payment_issue', 'suspected_fraud', 'other');
create type public.dispute_status as enum ('open', 'resolved_completed', 'resolved_cancelled', 'dismissed');

create type public.report_target as enum ('listing', 'user', 'message', 'review', 'transaction');
create type public.report_reason as enum ('fraud', 'stolen_device', 'counterfeit', 'misleading', 'prohibited_item', 'harassment', 'spam', 'other');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create type public.notification_type as enum (
  'message', 'offer_received', 'offer_countered', 'offer_accepted', 'offer_rejected',
  'offer_cancelled', 'offer_expired', 'listing_approved', 'listing_rejected',
  'listing_sold', 'listing_swapped', 'transaction_update', 'verification_update',
  'review_received', 'dispute_update', 'report_update'
);
create type public.delivery_channel as enum ('email');
create type public.delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Raise a business-rule error with a stable code the application can map.
create or replace function app_private.fail(p_code text, p_detail text default null)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = coalesce(p_detail, p_code);
end;
$$;

-- URL slug helper (ASCII lowercase, hyphen separated).
create or replace function app_private.slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Short random key used in stable listing URLs (base36, 8 chars).
create or replace function app_private.random_key(p_length int default 8)
returns text
language plpgsql
volatile
as $$
declare
  v_chars constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  v_out text := '';
begin
  for i in 1..p_length loop
    v_out := v_out || substr(v_chars, 1 + floor(random() * 36)::int, 1);
  end loop;
  return v_out;
end;
$$;

grant execute on function app_private.fail(text, text), app_private.slugify(text), app_private.random_key(int)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Location catalogue (country-extensible; Ghana seeded here because the
-- application cannot function without it).
-- ---------------------------------------------------------------------------
create table public.countries (
  code char(2) primary key,
  name text not null,
  currency char(3) not null,
  phone_country_code text not null
);

create table public.regions (
  id smallint generated by default as identity primary key,
  country_code char(2) not null default 'GH' references public.countries(code),
  name text not null,
  slug text not null unique,
  capital text not null,
  sort_order smallint not null default 0,
  unique (country_code, name)
);

insert into public.countries (code, name, currency, phone_country_code)
values ('GH', 'Ghana', 'GHS', '+233');

insert into public.regions (name, slug, capital, sort_order) values
  ('Greater Accra', 'greater-accra', 'Accra', 1),
  ('Ashanti', 'ashanti', 'Kumasi', 2),
  ('Central', 'central', 'Cape Coast', 3),
  ('Eastern', 'eastern', 'Koforidua', 4),
  ('Western', 'western', 'Sekondi-Takoradi', 5),
  ('Western North', 'western-north', 'Sefwi Wiawso', 6),
  ('Volta', 'volta', 'Ho', 7),
  ('Oti', 'oti', 'Dambai', 8),
  ('Northern', 'northern', 'Tamale', 9),
  ('Savannah', 'savannah', 'Damongo', 10),
  ('North East', 'north-east', 'Nalerigu', 11),
  ('Upper East', 'upper-east', 'Bolgatanga', 12),
  ('Upper West', 'upper-west', 'Wa', 13),
  ('Bono', 'bono', 'Sunyani', 14),
  ('Bono East', 'bono-east', 'Techiman', 15),
  ('Ahafo', 'ahafo', 'Goaso', 16);

alter table public.countries enable row level security;
alter table public.regions enable row level security;
create policy "countries are public" on public.countries for select using (true);
create policy "regions are public" on public.regions for select using (true);

-- ---------------------------------------------------------------------------
-- Application settings (admin-managed, read by server-side functions).
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key check (key ~ '^[a-z0-9_]{3,64}$'),
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.app_settings (key, value, description) values
  ('auto_approve_verified_sellers', 'false', 'When true, listings from verified sellers skip the moderation queue (audited as auto_approved).'),
  ('offer_expiry_hours', '72', 'Hours an offer or counteroffer stays open before it expires.'),
  ('confirmation_window_days', '7', 'Days after acceptance after which an unconfirmed exchange may be escalated as unresponsive.'),
  ('review_edit_window_days', '14', 'Days during which a reviewer may edit their review.');

alter table public.app_settings enable row level security;

create or replace function app_private.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default);
$$;

create or replace function app_private.setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = p_key), p_default);
$$;

-- Internal rate limiting (per user + action within a sliding window).
create table app_private.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup on app_private.rate_limit_events (user_id, action, created_at desc);

create or replace function app_private.enforce_rate_limit(p_user uuid, p_action text, p_max int, p_window interval)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || ':' || p_action));
  select count(*) into v_count
  from app_private.rate_limit_events
  where user_id = p_user and action = p_action and created_at > now() - p_window;
  if v_count >= p_max then
    perform app_private.fail('rate_limited', 'Too many requests. Please wait a moment and try again.');
  end if;
  insert into app_private.rate_limit_events (user_id, action) values (p_user, p_action);
end;
$$;
