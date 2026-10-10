-- =============================================================================
-- Top5Ideals 0900 — Storage buckets and policies, Realtime publication and
-- function execute privileges.
--
-- Storage layout (first folder is always the uploader's user id):
--   listing-images/<uid>/<listing_id>/<random>.<ext>   public read
--   avatars/<uid>/<random>.<ext>                        public read
--   business-logos/<uid>/<random>.<ext>                 public read
--   verification-docs/<uid>/<random>.<ext>              PRIVATE (owner + admins, signed URLs)
-- There are no UPDATE policies: files are immutable and paths are unique, so a
-- user can never overwrite anyone's file (including their own).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('listing-images', 'listing-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('business-logos', 'business-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "top5: owners upload listing images to their editable listings" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_active_user()
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[2]
        and l.seller_id = (select auth.uid())
        and l.status not in ('reserved', 'sold', 'swapped', 'archived')
    )
  );

create policy "top5: owners upload avatars and logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'business-logos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_active_user()
  );

create policy "top5: owners upload verification documents" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_active_user()
  );

create policy "top5: owners read their files; admins read verification documents" on storage.objects
  for select to authenticated
  using (
    (bucket_id in ('listing-images', 'avatars', 'business-logos', 'verification-docs')
      and (storage.foldername(name))[1] = (select auth.uid())::text)
    or (bucket_id = 'verification-docs' and public.is_admin())
  );

create policy "top5: owners delete their public images" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('listing-images', 'avatars', 'business-logos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Listing-image files with no listing_images row (e.g. abandoned uploads).
create or replace function public.list_orphaned_listing_images(p_older_than interval default interval '1 day')
returns table (name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.require_admin();
  return query
  select o.name, o.created_at
  from storage.objects o
  where o.bucket_id = 'listing-images'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.listing_images li where li.storage_path = o.name)
  order by o.created_at
  limit 1000;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: messages and notifications are streamed to members/owners; RLS
-- policies above decide which rows each subscriber receives.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.notifications;
    alter publication supabase_realtime add table public.swap_offers;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function execute privileges.
-- Postgres grants EXECUTE to PUBLIC by default and Supabase also grants it to
-- anon/authenticated. Lock everything down, then open what each role needs.
-- Every RPC still authenticates and authorises internally.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_staff(), public.is_admin(), public.is_active_user(), public.has_complete_profile(),
  public.listing_is_public(public.listing_status, public.moderation_status),
  public.valid_device_checks(jsonb), public.format_storage(integer), public.build_search_query(text),
  public.search_listings(text, smallint[], integer[], bigint, bigint, integer[], integer[], public.listing_condition[],
                         smallint, smallint[], text, public.account_type, boolean, boolean, boolean, uuid, text, integer, integer),
  public.record_listing_view(uuid, text),
  public.get_profile_trust(uuid)
to anon, authenticated;

grant execute on function
  public.is_conversation_member(uuid),
  public.publish_listing(uuid), public.pause_listing(uuid), public.resume_listing(uuid), public.archive_listing(uuid),
  public.mark_listing_sold_elsewhere(uuid),
  public.add_listing_image(uuid, text, integer, integer), public.remove_listing_image(uuid),
  public.set_primary_listing_image(uuid), public.reorder_listing_images(uuid, uuid[]),
  public.set_listing_swap_brands(uuid, smallint[]),
  public.start_conversation(uuid, uuid), public.send_message(uuid, text, uuid), public.mark_conversation_read(uuid),
  public.list_conversations(integer, integer), public.unread_message_count(),
  public.create_swap_offer(uuid, uuid[], bigint, public.cash_payer, text, uuid),
  public.initiate_purchase(uuid, bigint, text, uuid),
  public.counter_swap_offer(uuid, integer, bigint, public.cash_payer, text),
  public.accept_swap_offer(uuid, integer), public.reject_swap_offer(uuid, text), public.cancel_swap_offer(uuid),
  public.expire_due_offers(),
  public.confirm_transaction(uuid, text), public.cancel_transaction(uuid, text),
  public.open_dispute(uuid, public.dispute_category, text), public.resolve_dispute(uuid, text, text),
  public.create_review(uuid, smallint, smallint, smallint, smallint, text),
  public.update_review(uuid, smallint, smallint, smallint, smallint, text),
  public.create_report(public.report_target, uuid, public.report_reason, text),
  public.resolve_report(uuid, public.report_status, text),
  public.submit_verification_request(public.verification_kind, text, text[]),
  public.review_verification(uuid, boolean, text),
  public.moderate_listing(uuid, text, text), public.set_account_status(uuid, public.account_status, text),
  public.set_review_hidden(uuid, boolean, text), public.admin_list_users(text, public.account_status, integer, integer),
  public.get_seller_dashboard(), public.get_listing_performance(integer, integer), public.get_marketplace_stats(),
  public.list_orphaned_listing_images(interval)
to authenticated;

grant execute on all functions in schema public to service_role;
