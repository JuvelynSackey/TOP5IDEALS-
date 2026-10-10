-- =============================================================================
-- Top5Ideals 0400 — In-app notifications, preferences and a delivery outbox.
-- Notifications are created inside the same database transaction as the
-- domain change that caused them, so they cannot be lost or orphaned.
-- External delivery (email) is queued in notification_deliveries for a worker;
-- no worker ships with the MVP (see docs/IMPLEMENTATION_STATUS.md).
-- =============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null check (char_length(title) between 1 and 140),
  body text not null default '' check (char_length(body) <= 500),
  -- Relative in-app link only (prevents open redirects).
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  entity_type text,
  entity_id text,
  -- Same user + dedupe_key = same logical notification (duplicate-safe).
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key);
create index notifications_user_unread on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_created on public.notifications (user_id, created_at desc);

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  in_app boolean not null default true,
  email boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel public.delivery_channel not null,
  status public.delivery_status not null default 'pending',
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);
create index notification_deliveries_pending on public.notification_deliveries (created_at) where status = 'pending';

create trigger notification_preferences_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at();
create trigger notification_deliveries_updated_at before update on public.notification_deliveries for each row execute function public.set_updated_at();

-- Create (or refresh, for the same dedupe key) a notification for a user,
-- honouring their preferences. Never raises on preference lookup.
create or replace function app_private.notify(
  p_user uuid,
  p_type public.notification_type,
  p_title text,
  p_body text,
  p_link text,
  p_entity_type text,
  p_entity_id text,
  p_dedupe_key text default null,
  p_refresh boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_in_app boolean := true;
  v_email boolean := false;
  v_id uuid;
begin
  if p_user is null then
    return;
  end if;
  select np.in_app, np.email into v_in_app, v_email
  from public.notification_preferences np
  where np.user_id = p_user and np.type = p_type;
  v_in_app := coalesce(v_in_app, true);
  v_email := coalesce(v_email, false);
  if not v_in_app and not v_email then
    return;
  end if;

  if p_refresh and p_dedupe_key is not null then
    insert into public.notifications (user_id, type, title, body, link, entity_type, entity_id, dedupe_key)
    values (p_user, p_type, left(p_title, 140), left(coalesce(p_body, ''), 500), p_link, p_entity_type, p_entity_id, p_dedupe_key)
    on conflict (user_id, dedupe_key) do update
      set title = excluded.title, body = excluded.body, link = excluded.link,
          read_at = null, created_at = now()
    returning id into v_id;
  else
    insert into public.notifications (user_id, type, title, body, link, entity_type, entity_id, dedupe_key)
    values (p_user, p_type, left(p_title, 140), left(coalesce(p_body, ''), 500), p_link, p_entity_type, p_entity_id, p_dedupe_key)
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_id;
  end if;

  if v_id is not null and v_email then
    insert into public.notification_deliveries (notification_id, channel)
    values (v_id, 'email')
    on conflict (notification_id, channel) do update set status = 'pending', updated_at = now();
  end if;
end;
$$;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "users read own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users mark own notifications read" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users delete own notifications" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "users read own preferences" on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users insert own preferences" on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users update own preferences" on public.notification_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "admins read deliveries" on public.notification_deliveries
  for select to authenticated using (public.is_admin());

revoke all on public.notifications, public.notification_preferences, public.notification_deliveries from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.notification_preferences to authenticated;
grant insert (user_id, type, in_app, email), update (in_app, email) on public.notification_preferences to authenticated;
grant select on public.notification_deliveries to authenticated;
