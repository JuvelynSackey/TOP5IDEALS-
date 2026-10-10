-- =============================================================================
-- Top5Ideals 0200 — Identity, roles, business profiles, verification, blocks,
-- auditing.
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Lowercase-only format makes uniqueness case-insensitive by construction.
  username text unique check (username is null or username ~ '^[a-z0-9_]{3,30}$'),
  full_name text not null default '' check (char_length(full_name) <= 100),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  region_id smallint references public.regions (id),
  city text check (city is null or char_length(city) between 2 and 80),
  bio text check (bio is null or char_length(bio) <= 600),
  account_type public.account_type not null default 'individual',
  role public.user_role not null default 'user',
  account_status public.account_status not null default 'active',
  suspended_at timestamptz,
  verification_status public.verification_status not null default 'unverified',
  verified_at timestamptz,
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_region_idx on public.profiles (region_id);

comment on table public.profiles is 'Public profile data. Email lives in auth.users and phone in profile_contacts; neither is public.';

-- Private contact details (owner-only).
create table public.profile_contacts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  updated_at timestamptz not null default now()
);

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  description text check (description is null or char_length(description) <= 2000),
  logo_path text check (logo_path is null or char_length(logo_path) <= 300),
  region_id smallint references public.regions (id),
  city text check (city is null or char_length(city) between 2 and 80),
  area text check (area is null or char_length(area) <= 80),
  -- Explicitly public contact number the business chose to publish.
  public_phone text check (public_phone is null or public_phone ~ '^\+[1-9][0-9]{7,14}$'),
  verification_status public.verification_status not null default 'unverified',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.verification_kind not null,
  business_profile_id uuid references public.business_profiles (id) on delete cascade,
  status public.verification_request_status not null default 'pending',
  submitted_note text check (submitted_note is null or char_length(submitted_note) <= 1000),
  -- Paths inside the private 'verification-docs' bucket.
  document_paths text[] not null default '{}' check (cardinality(document_paths) between 1 and 5),
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'individual' or business_profile_id is not null)
);
create unique index verification_requests_one_pending on public.verification_requests (user_id) where status = 'pending';
create index verification_requests_status_idx on public.verification_requests (status, created_at);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- Append-only audit trail of domain events (written only by server functions).
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- Staff actions with human-written reasons.
create table public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text check (reason is null or char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);
create index admin_actions_target_idx on public.admin_actions (target_type, target_id);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger profile_contacts_updated_at before update on public.profile_contacts for each row execute function public.set_updated_at();
create trigger business_profiles_updated_at before update on public.business_profiles for each row execute function public.set_updated_at();
create trigger verification_requests_updated_at before update on public.verification_requests for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role / status helpers (public so RLS policies can call them; they only
-- reveal information about the caller).
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('moderator', 'admin') and account_status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and account_status = 'active'
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and account_status = 'active');
$$;

create or replace function public.has_complete_profile()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_status = 'active' and profile_completed_at is not null
  );
$$;

-- True when either user has blocked the other.
create or replace function app_private.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Authenticate the caller for a state-changing RPC. Returns auth.uid().
create or replace function app_private.require_user(p_require_complete boolean default true)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    perform app_private.fail('not_authenticated', 'Please sign in to continue.');
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    perform app_private.fail('profile_missing', 'Your profile could not be found.');
  end if;
  if v_profile.account_status <> 'active' then
    perform app_private.fail('account_suspended', 'Your account is suspended. Contact support if you believe this is a mistake.');
  end if;
  if p_require_complete and v_profile.profile_completed_at is null then
    perform app_private.fail('profile_incomplete', 'Please complete your profile first.');
  end if;
  return v_uid;
end;
$$;

create or replace function app_private.require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    perform app_private.fail('forbidden', 'You do not have permission to perform this action.');
  end if;
  return auth.uid();
end;
$$;

create or replace function app_private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    perform app_private.fail('forbidden', 'Administrator permission is required.');
  end if;
  return auth.uid();
end;
$$;

create or replace function app_private.log_audit(p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}')
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'));
$$;

create or replace function app_private.log_admin_action(p_action text, p_target_type text, p_target_id text, p_reason text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_actions (admin_id, action, target_type, target_id, reason)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_reason);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'admin.' || p_action, p_target_type, p_target_id, '{}');
$$;

-- ---------------------------------------------------------------------------
-- Profile lifecycle
-- ---------------------------------------------------------------------------

-- Create a profile for every new auth user. Never trusts metadata for role.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type public.account_type := 'individual';
begin
  if (new.raw_user_meta_data ->> 'account_type') = 'business' then
    v_type := 'business';
  end if;
  insert into public.profiles (id, full_name, account_type)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100), v_type)
  on conflict (id) do nothing;
  insert into public.profile_contacts (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- Track profile completion server-side.
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.username is not null and char_length(trim(new.full_name)) >= 2
     and new.region_id is not null and new.city is not null then
    new.profile_completed_at := coalesce(new.profile_completed_at, now());
  else
    new.profile_completed_at := null;
  end if;
  return new;
end;
$$;

create trigger profiles_completion before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- Becoming a business seller flips the account type automatically.
create or replace function public.business_profiles_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles set account_type = 'business' where id = new.owner_id;
  return new;
end;
$$;

create trigger business_profiles_set_type after insert on public.business_profiles
  for each row execute function public.business_profiles_after_insert();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.business_profiles enable row level security;
alter table public.verification_requests enable row level security;
alter table public.user_blocks enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_actions enable row level security;

-- profiles: public read; owners update a whitelisted set of columns.
create policy "profiles are publicly readable" on public.profiles
  for select using (true);
create policy "owners update their profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- profile_contacts: owner only (staff do not get blanket access).
create policy "owners read contacts" on public.profile_contacts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owners update contacts" on public.profile_contacts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- business_profiles
create policy "business profiles are publicly readable" on public.business_profiles
  for select using (true);
create policy "owners create their business profile" on public.business_profiles
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_active_user());
create policy "owners update their business profile" on public.business_profiles
  for update to authenticated
  using (owner_id = (select auth.uid()) and public.is_active_user())
  with check (owner_id = (select auth.uid()));

-- verification_requests: owner and admins may read; writes via RPC only.
create policy "owners and admins read verification requests" on public.verification_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- user_blocks
create policy "users read their blocks" on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "users create blocks" on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "users remove blocks" on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- audit / admin trails: staff read only; nobody writes directly.
create policy "admins read audit logs" on public.audit_logs
  for select to authenticated using (public.is_admin());
create policy "staff read admin actions" on public.admin_actions
  for select to authenticated using (public.is_staff());

-- Column-level privileges (defence in depth on top of RLS).
revoke all on public.profiles, public.profile_contacts, public.business_profiles,
  public.verification_requests, public.user_blocks, public.audit_logs, public.admin_actions,
  public.countries, public.regions, public.app_settings
  from anon, authenticated;

grant select on public.countries, public.regions to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username, full_name, avatar_path, region_id, city, bio) on public.profiles to authenticated;
grant select on public.profile_contacts to authenticated;
grant update (phone_e164) on public.profile_contacts to authenticated;
grant select on public.business_profiles to anon, authenticated;
grant insert (owner_id, business_name, slug, description, logo_path, region_id, city, area, public_phone)
  on public.business_profiles to authenticated;
grant update (business_name, slug, description, logo_path, region_id, city, area, public_phone)
  on public.business_profiles to authenticated;
grant select on public.verification_requests to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select on public.audit_logs, public.admin_actions to authenticated;

-- app_settings: admins may read and change values (keys are fixed).
create policy "admins read settings" on public.app_settings
  for select to authenticated using (public.is_admin());
create policy "admins update settings" on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.app_settings to authenticated;
grant update (value) on public.app_settings to authenticated;
