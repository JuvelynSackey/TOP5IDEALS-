-- =============================================================================
-- Top5Ideals 0600 — Private messaging.
-- Conversations are created atomically via start_conversation(), deduplicated
-- by a unique key (pair of users + listing), so concurrent "Message seller"
-- clicks always converge on one conversation. Messages are written only via
-- send_message(), which enforces membership, blocks, rate limits and
-- idempotency (client_id).
-- =============================================================================

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete set null,
  dedupe_key text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index conversations_last_message_idx on public.conversations (last_message_at desc nulls last);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, client_id)
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

-- Used by RLS policies; SECURITY DEFINER avoids recursive policy evaluation.
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;

-- Find or atomically create the conversation between two users about a listing.
create or replace function app_private.ensure_conversation(p_a uuid, p_b uuid, p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := least(p_a::text, p_b::text) || ':' || greatest(p_a::text, p_b::text) || ':' ||
                coalesce(p_listing_id::text, 'direct');
  v_id uuid;
begin
  select id into v_id from public.conversations where dedupe_key = v_key;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.conversations (listing_id, dedupe_key, created_by)
  values (p_listing_id, v_key, p_a)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversations where dedupe_key = v_key;
    return v_id;
  end if;
  insert into public.conversation_members (conversation_id, user_id)
  values (v_id, p_a), (v_id, p_b)
  on conflict do nothing;
  return v_id;
end;
$$;

-- Start (or reuse) a conversation with another user, optionally about a listing.
-- When a listing is given and the caller is not its seller, the other party is
-- always the listing's seller.
create or replace function public.start_conversation(p_recipient_id uuid default null, p_listing_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(true);
  v_other uuid := p_recipient_id;
  v_listing public.listings;
begin
  if p_listing_id is not null then
    select * into v_listing from public.listings where id = p_listing_id;
    if not found or not public.listing_is_public(v_listing.status, v_listing.moderation_status) then
      perform app_private.fail('listing_unavailable', 'This listing is not available.');
    end if;
    -- Buyers always talk to the seller; a seller may address a specific buyer.
    if v_listing.seller_id <> v_uid then
      v_other := v_listing.seller_id;
    end if;
  end if;

  if v_other is null or not exists (select 1 from public.profiles where id = v_other) then
    perform app_private.fail('not_found', 'That user could not be found.');
  end if;
  if v_other = v_uid then
    perform app_private.fail('invalid_recipient', 'You cannot message yourself.');
  end if;
  if app_private.is_blocked_between(v_uid, v_other) then
    perform app_private.fail('blocked', 'You cannot message this user.');
  end if;
  if exists (select 1 from public.profiles where id = v_other and account_status <> 'active') then
    perform app_private.fail('recipient_unavailable', 'This user is not accepting messages.');
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'conversation_start', 30, interval '1 hour');
  return app_private.ensure_conversation(v_uid, v_other, p_listing_id);
end;
$$;

create or replace function public.send_message(p_conversation_id uuid, p_body text, p_client_id uuid)
returns public.messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(true);
  v_body text := btrim(coalesce(p_body, ''));
  v_message public.messages;
  v_sender public.profiles;
  r record;
begin
  if p_client_id is null then
    perform app_private.fail('validation_failed', 'Missing message id.');
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    perform app_private.fail('validation_failed', 'Messages must be between 1 and 2,000 characters.');
  end if;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation_id and user_id = v_uid) then
    perform app_private.fail('not_found', 'Conversation not found.');
  end if;

  -- Idempotent retry: the same client_id returns the original message.
  select * into v_message from public.messages where conversation_id = p_conversation_id and client_id = p_client_id;
  if found then
    if v_message.sender_id is distinct from v_uid then
      perform app_private.fail('validation_failed', 'Duplicate message id.');
    end if;
    return v_message;
  end if;

  if exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation_id and m.user_id <> v_uid
      and app_private.is_blocked_between(v_uid, m.user_id)
  ) then
    perform app_private.fail('blocked', 'You cannot message this user.');
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'message_minute', 20, interval '1 minute');
  perform app_private.enforce_rate_limit(v_uid, 'message_day', 600, interval '1 day');

  insert into public.messages (conversation_id, sender_id, body, client_id)
  values (p_conversation_id, v_uid, v_body, p_client_id)
  on conflict (conversation_id, client_id) do nothing
  returning * into v_message;
  if v_message.id is null then
    select * into v_message from public.messages where conversation_id = p_conversation_id and client_id = p_client_id;
    return v_message;
  end if;

  update public.conversations set last_message_at = v_message.created_at where id = p_conversation_id;
  update public.conversation_members set last_read_at = v_message.created_at
    where conversation_id = p_conversation_id and user_id = v_uid;

  select * into v_sender from public.profiles where id = v_uid;
  for r in select user_id from public.conversation_members where conversation_id = p_conversation_id and user_id <> v_uid loop
    perform app_private.notify(
      r.user_id, 'message',
      'New message from ' || coalesce('@' || v_sender.username, 'a member'),
      left(v_body, 120),
      '/dashboard/messages/' || p_conversation_id::text,
      'conversation', p_conversation_id::text,
      'conversation:' || p_conversation_id::text,
      true
    );
  end loop;
  return v_message;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform app_private.fail('not_authenticated', 'Please sign in to continue.');
  end if;
  update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = v_uid;
  update public.notifications set read_at = now()
    where user_id = v_uid and dedupe_key = 'conversation:' || p_conversation_id::text and read_at is null;
end;
$$;

-- Inbox for the caller only.
create or replace function public.list_conversations(p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  listing_id uuid,
  listing_title text,
  listing_slug text,
  listing_slug_key text,
  listing_status public.listing_status,
  listing_image_path text,
  other_user_id uuid,
  other_username text,
  other_full_name text,
  other_avatar_path text,
  last_message_body text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.listing_id, l.title, l.slug, l.slug_key, l.status,
    (select li.storage_path from public.listing_images li where li.listing_id = l.id and li.is_primary limit 1),
    o.user_id, p.username, p.full_name, p.avatar_path,
    lm.body, lm.sender_id, c.last_message_at,
    (select count(*) from public.messages m
       where m.conversation_id = c.id and m.sender_id is distinct from auth.uid()
         and (me.last_read_at is null or m.created_at > me.last_read_at))
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select cm.user_id from public.conversation_members cm
    where cm.conversation_id = c.id and cm.user_id <> me.user_id limit 1
  ) o on true
  left join public.profiles p on p.id = o.user_id
  left join public.listings l on l.id = c.listing_id
  left join lateral (
    select m.body, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by c.last_message_at desc nulls last, c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.unread_message_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.conversation_members me
  join public.messages m on m.conversation_id = me.conversation_id
  where me.user_id = auth.uid()
    and m.sender_id is distinct from auth.uid()
    and (me.last_read_at is null or m.created_at > me.last_read_at);
$$;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "members read conversations" on public.conversations
  for select to authenticated using (public.is_conversation_member(id));
create policy "members read membership" on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));

revoke all on public.conversations, public.conversation_members, public.messages from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages to authenticated;

