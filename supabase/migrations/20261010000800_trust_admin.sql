-- =============================================================================
-- Top5Ideals 0800 — Reviews, reports, verification workflow, administration
-- RPCs and scoped analytics.
-- =============================================================================

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id),
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewee_id uuid references public.profiles (id) on delete set null,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  communication_rating smallint not null check (communication_rating between 1 and 5),
  accuracy_rating smallint not null check (accuracy_rating between 1 and 5),
  experience_rating smallint not null check (experience_rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1500),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  unique (transaction_id, reviewer_id)
);
create index reviews_reviewee_idx on public.reviews (reviewee_id, created_at desc) where not is_hidden;
create trigger reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type public.report_target not null,
  listing_id uuid references public.listings (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  review_id uuid references public.reviews (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  reason public.report_reason not null,
  details text check (details is null or char_length(details) <= 2000),
  -- Minimal copy of reported content so moderators need not browse private data.
  evidence jsonb not null default '{}',
  status public.report_status not null default 'open',
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create trigger reports_updated_at before update on public.reports for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create or replace function public.create_review(
  p_transaction_id uuid,
  p_overall smallint,
  p_communication smallint,
  p_accuracy smallint,
  p_experience smallint,
  p_comment text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(true);
  v_tx public.transactions;
  v_id uuid;
  v_other uuid;
begin
  select * into v_tx from public.transactions where id = p_transaction_id;
  if not found or (v_uid is distinct from v_tx.buyer_id and v_uid is distinct from v_tx.seller_id) then
    perform app_private.fail('not_found', 'Transaction not found.');
  end if;
  if v_tx.status <> 'completed' then
    perform app_private.fail('review_not_eligible', 'You can review only after both parties confirm the exchange.');
  end if;
  v_other := case when v_uid = v_tx.buyer_id then v_tx.seller_id else v_tx.buyer_id end;
  if v_other is null then
    perform app_private.fail('review_not_eligible', 'The other account no longer exists.');
  end if;
  if char_length(coalesce(p_comment, '')) > 1500 then
    perform app_private.fail('validation_failed', 'Reviews are limited to 1,500 characters.');
  end if;

  begin
    insert into public.reviews (transaction_id, reviewer_id, reviewee_id, overall_rating, communication_rating,
                                accuracy_rating, experience_rating, comment)
    values (v_tx.id, v_uid, v_other, p_overall, p_communication, p_accuracy, p_experience,
            nullif(btrim(coalesce(p_comment, '')), ''))
    returning id into v_id;
  exception
    when unique_violation then
      perform app_private.fail('already_reviewed', 'You have already reviewed this exchange.');
    when check_violation then
      perform app_private.fail('validation_failed', 'Ratings must be between 1 and 5.');
  end;

  perform app_private.notify(v_other, 'review_received', 'You received a new review', '',
    '/dashboard/reviews', 'review', v_id::text, 'review:' || v_id::text);
  perform app_private.log_audit(v_uid, 'review.created', 'review', v_id::text, jsonb_build_object('transaction_id', v_tx.id));
  return v_id;
end;
$$;

-- Reviewers may edit ratings/comment within the configured window.
create or replace function public.update_review(
  p_review_id uuid,
  p_overall smallint,
  p_communication smallint,
  p_accuracy smallint,
  p_experience smallint,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(true);
  v_review public.reviews;
begin
  select * into v_review from public.reviews where id = p_review_id for update;
  if not found or v_review.reviewer_id is distinct from v_uid then
    perform app_private.fail('not_found', 'Review not found.');
  end if;
  if v_review.created_at < now() - make_interval(days => app_private.setting_int('review_edit_window_days', 14)) then
    perform app_private.fail('edit_window_closed', 'Reviews can only be edited for a limited time.');
  end if;
  begin
    update public.reviews set overall_rating = p_overall, communication_rating = p_communication,
      accuracy_rating = p_accuracy, experience_rating = p_experience,
      comment = nullif(btrim(coalesce(p_comment, '')), ''), edited_at = now()
    where id = v_review.id;
  exception when check_violation then
    perform app_private.fail('validation_failed', 'Ratings must be between 1 and 5 and comments at most 1,500 characters.');
  end;
end;
$$;

-- Public trust summary. Averages count one (latest) review per reviewer to
-- dampen repeated reviews between the same pair of accounts.
create or replace function public.get_profile_trust(p_user_id uuid)
returns table (
  review_count bigint,
  average_overall numeric,
  average_communication numeric,
  average_accuracy numeric,
  average_experience numeric,
  completed_transactions bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with latest as (
    select distinct on (r.reviewer_id) r.*
    from public.reviews r
    where r.reviewee_id = p_user_id and not r.is_hidden
    order by r.reviewer_id, r.created_at desc
  )
  select
    (select count(*) from latest),
    (select round(avg(overall_rating)::numeric, 2) from latest),
    (select round(avg(communication_rating)::numeric, 2) from latest),
    (select round(avg(accuracy_rating)::numeric, 2) from latest),
    (select round(avg(experience_rating)::numeric, 2) from latest),
    (select count(*) from public.transactions t
       where t.status = 'completed' and p_user_id in (t.buyer_id, t.seller_id));
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function public.create_report(
  p_target_type public.report_target,
  p_target_id uuid,
  p_reason public.report_reason,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(false);
  v_id uuid;
  v_listing public.listings;
  v_message public.messages;
  v_review public.reviews;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_listing_id uuid;
  v_user_id uuid;
  v_message_id uuid;
  v_review_id uuid;
  v_tx_id uuid;
  v_evidence jsonb := '{}';
begin
  if v_details is not null and char_length(v_details) > 2000 then
    perform app_private.fail('validation_failed', 'Details are limited to 2,000 characters.');
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'report_create', 10, interval '1 day');

  if p_target_type = 'listing' then
    select * into v_listing from public.listings where id = p_target_id;
    if not found or not (public.listing_is_public(v_listing.status, v_listing.moderation_status) or v_listing.seller_id = v_uid) then
      perform app_private.fail('not_found', 'Listing not found.');
    end if;
    v_listing_id := v_listing.id;
    v_user_id := v_listing.seller_id;
    v_evidence := jsonb_build_object('title', v_listing.title, 'price_minor', v_listing.price_minor);
  elsif p_target_type = 'user' then
    if not exists (select 1 from public.profiles where id = p_target_id) or p_target_id = v_uid then
      perform app_private.fail('not_found', 'User not found.');
    end if;
    v_user_id := p_target_id;
  elsif p_target_type = 'message' then
    select m.* into v_message from public.messages m where m.id = p_target_id;
    if not found or not exists (select 1 from public.conversation_members where conversation_id = v_message.conversation_id and user_id = v_uid)
       or v_message.sender_id = v_uid then
      perform app_private.fail('not_found', 'Message not found.');
    end if;
    v_message_id := v_message.id;
    v_user_id := v_message.sender_id;
    -- Only the reported message is copied for moderators, never the full thread.
    v_evidence := jsonb_build_object('body', v_message.body, 'sent_at', v_message.created_at);
  elsif p_target_type = 'review' then
    select * into v_review from public.reviews where id = p_target_id;
    if not found then
      perform app_private.fail('not_found', 'Review not found.');
    end if;
    v_review_id := v_review.id;
    v_user_id := v_review.reviewer_id;
    v_evidence := jsonb_build_object('comment', v_review.comment, 'overall', v_review.overall_rating);
  elsif p_target_type = 'transaction' then
    if not exists (select 1 from public.transactions where id = p_target_id and v_uid in (buyer_id, seller_id)) then
      perform app_private.fail('not_found', 'Transaction not found.');
    end if;
    v_tx_id := p_target_id;
    select case when buyer_id = v_uid then seller_id else buyer_id end into v_user_id from public.transactions where id = p_target_id;
  end if;

  insert into public.reports (reporter_id, target_type, listing_id, reported_user_id, message_id, review_id, transaction_id,
                              reason, details, evidence)
  values (v_uid, p_target_type, v_listing_id, v_user_id, v_message_id, v_review_id, v_tx_id, p_reason, v_details, v_evidence)
  returning id into v_id;
  perform app_private.log_audit(v_uid, 'report.created', 'report', v_id::text, jsonb_build_object('target_type', p_target_type));
  return v_id;
end;
$$;

create or replace function public.resolve_report(p_report_id uuid, p_status public.report_status, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := app_private.require_staff();
  v_report public.reports;
begin
  if p_status = 'open' then
    perform app_private.fail('validation_failed', 'Choose reviewing, resolved or dismissed.');
  end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    perform app_private.fail('not_found', 'Report not found.');
  end if;
  update public.reports set status = p_status, resolution_note = left(nullif(btrim(coalesce(p_note, '')), ''), 1000),
    handled_by = v_admin, handled_at = now()
  where id = v_report.id;
  if p_status in ('resolved', 'dismissed') then
    perform app_private.notify(v_report.reporter_id, 'report_update', 'Your report was reviewed',
      'Thank you for helping keep Top5Ideals safe.', null, 'report', v_report.id::text, 'report:' || v_report.id::text || ':closed');
  end if;
  perform app_private.log_admin_action('report.' || p_status, 'report', v_report.id::text, p_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- Verification workflow
-- ---------------------------------------------------------------------------
create or replace function public.submit_verification_request(
  p_kind public.verification_kind,
  p_note text,
  p_document_paths text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := app_private.require_user(true);
  v_business uuid;
  v_id uuid;
  v_path text;
begin
  if cardinality(coalesce(p_document_paths, '{}')) < 1 or cardinality(p_document_paths) > 5 then
    perform app_private.fail('validation_failed', 'Upload between one and five documents.');
  end if;
  foreach v_path in array p_document_paths loop
    if v_path !~ ('^' || v_uid::text || '/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp|pdf)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'verification-docs' and o.name = v_path
                        and (o.owner_id = v_uid::text or o.owner = v_uid)) then
      perform app_private.fail('validation_failed', 'A document could not be found. Please upload it again.');
    end if;
  end loop;
  if p_kind = 'business' then
    select id into v_business from public.business_profiles where owner_id = v_uid;
    if v_business is null then
      perform app_private.fail('validation_failed', 'Create your business profile before requesting business verification.');
    end if;
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'verification_submit', 3, interval '1 day');

  begin
    insert into public.verification_requests (user_id, kind, business_profile_id, submitted_note, document_paths)
    values (v_uid, p_kind, v_business, left(nullif(btrim(coalesce(p_note, '')), ''), 1000), p_document_paths)
    returning id into v_id;
  exception when unique_violation then
    perform app_private.fail('duplicate_request', 'You already have a verification request under review.');
  end;

  if p_kind = 'business' then
    update public.business_profiles set verification_status = 'pending' where id = v_business and verification_status <> 'verified';
  else
    update public.profiles set verification_status = 'pending' where id = v_uid and verification_status <> 'verified';
  end if;
  perform app_private.log_audit(v_uid, 'verification.submitted', 'verification_request', v_id::text, jsonb_build_object('kind', p_kind));
  return v_id;
end;
$$;

create or replace function public.review_verification(p_request_id uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_req public.verification_requests;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_req from public.verification_requests where id = p_request_id for update;
  if not found then
    perform app_private.fail('not_found', 'Request not found.');
  end if;
  if v_req.user_id = v_admin then
    perform app_private.fail('forbidden', 'You cannot review your own verification request.');
  end if;
  if v_req.status <> 'pending' then
    perform app_private.fail('invalid_state', 'This request has already been reviewed.');
  end if;
  if not p_approve and (v_note is null or char_length(v_note) < 5) then
    perform app_private.fail('validation_failed', 'Give the applicant a reason for the rejection.');
  end if;

  update public.verification_requests
    set status = case when p_approve then 'approved'::public.verification_request_status else 'rejected'::public.verification_request_status end,
        reviewer_id = v_admin, reviewer_note = left(v_note, 1000), reviewed_at = now()
    where id = v_req.id;

  if v_req.kind = 'business' then
    update public.business_profiles
      set verification_status = case when p_approve then 'verified'::public.verification_status else 'rejected'::public.verification_status end,
          verified_at = case when p_approve then now() else null end
      where id = v_req.business_profile_id;
  end if;
  -- An approved business verification also verifies the owner's identity.
  update public.profiles
    set verification_status = case when p_approve then 'verified'::public.verification_status
                                   when verification_status = 'verified' then 'verified'::public.verification_status
                                   else 'rejected'::public.verification_status end,
        verified_at = case when p_approve then now() else verified_at end
    where id = v_req.user_id;

  perform app_private.notify(v_req.user_id, 'verification_update',
    case when p_approve then 'You are now verified' else 'Verification not approved' end,
    coalesce(left(v_note, 200), ''), '/dashboard/verification', 'verification_request', v_req.id::text,
    'verification:' || v_req.id::text);
  perform app_private.log_admin_action(case when p_approve then 'verification.approved' else 'verification.rejected' end,
    'verification_request', v_req.id::text, v_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation & account administration
-- ---------------------------------------------------------------------------
create or replace function public.moderate_listing(p_listing_id uuid, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := app_private.require_staff();
  v_listing public.listings;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_decision not in ('approve', 'reject') then
    perform app_private.fail('validation_failed', 'Unknown decision.');
  end if;
  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    perform app_private.fail('not_found', 'Listing not found.');
  end if;
  if v_listing.seller_id = v_admin then
    perform app_private.fail('forbidden', 'You cannot moderate your own listing.');
  end if;
  if v_listing.status in ('draft', 'archived', 'sold', 'swapped', 'reserved') then
    perform app_private.fail('invalid_state', 'This listing is not awaiting moderation.');
  end if;

  if p_decision = 'approve' then
    if v_listing.moderation_status = 'approved' then
      perform app_private.fail('invalid_state', 'This listing is already approved.');
    end if;
    update public.listings set moderation_status = 'approved', published_at = coalesce(published_at, now())
      where id = v_listing.id;
    insert into public.listing_moderation_events (listing_id, actor_id, decision, reason) values (v_listing.id, v_admin, 'approved', v_reason);
    perform app_private.notify(v_listing.seller_id, 'listing_approved', 'Your listing is live', v_listing.title,
      '/dashboard/listings', 'listing', v_listing.id::text, 'listing:' || v_listing.id::text || ':approved:' || extract(epoch from now())::bigint);
  else
    if v_reason is null or char_length(v_reason) < 5 then
      perform app_private.fail('validation_failed', 'A rejection reason is required.');
    end if;
    update public.listings set moderation_status = 'rejected' where id = v_listing.id;
    insert into public.listing_moderation_events (listing_id, actor_id, decision, reason) values (v_listing.id, v_admin, 'rejected', v_reason);
    perform app_private.notify(v_listing.seller_id, 'listing_rejected', 'Your listing needs changes', left(v_reason, 200),
      '/dashboard/listings', 'listing', v_listing.id::text, 'listing:' || v_listing.id::text || ':rejected:' || extract(epoch from now())::bigint);
  end if;
  perform app_private.log_admin_action('listing.' || p_decision, 'listing', v_listing.id::text, v_reason);
end;
$$;

-- Suspend or reinstate an account. Suspension pauses live listings and
-- cancels open offers; active transactions continue via the dispute process.
create or replace function public.set_account_status(p_user_id uuid, p_status public.account_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_offer public.swap_offers;
begin
  if p_user_id = v_admin then
    perform app_private.fail('forbidden', 'You cannot change your own account status.');
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    perform app_private.fail('validation_failed', 'A reason is required.');
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    perform app_private.fail('forbidden', 'Administrator accounts must be changed by a system operator.');
  end if;
  update public.profiles
    set account_status = p_status, suspended_at = case when p_status = 'suspended' then now() else null end
    where id = p_user_id;
  if not found then
    perform app_private.fail('not_found', 'User not found.');
  end if;

  if p_status = 'suspended' then
    update public.listings set status = 'paused' where seller_id = p_user_id and status = 'published';
    for v_offer in select * from public.swap_offers where status = 'pending' and initiator_id = p_user_id for update loop
      update public.swap_offers set status = 'cancelled', awaiting_party = null, closed_at = now() where id = v_offer.id;
      insert into public.swap_offer_events (offer_id, version, event_type, actor_id, metadata)
      values (v_offer.id, v_offer.current_version, 'cancelled', v_admin, '{"reason":"account_suspended"}');
    end loop;
  end if;
  perform app_private.log_admin_action('account.' || p_status, 'user', p_user_id::text, v_reason);
end;
$$;

create or replace function public.set_review_hidden(p_review_id uuid, p_hidden boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := app_private.require_staff();
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    perform app_private.fail('validation_failed', 'A reason is required.');
  end if;
  update public.reviews set is_hidden = p_hidden where id = p_review_id;
  if not found then
    perform app_private.fail('not_found', 'Review not found.');
  end if;
  perform app_private.log_admin_action(case when p_hidden then 'review.hidden' else 'review.restored' end, 'review', p_review_id::text, p_reason);
end;
$$;

-- Admin user directory. Email addresses are returned to full admins only.
create or replace function public.admin_list_users(p_query text default null, p_status public.account_status default null,
                                                   p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, username text, full_name text, email text, role public.user_role, account_status public.account_status,
  account_type public.account_type, verification_status public.verification_status, created_at timestamptz,
  listing_count bigint, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin boolean := public.is_admin();
  v_q text := nullif(btrim(left(coalesce(p_query, ''), 80)), '');
begin
  perform app_private.require_staff();
  if v_q is not null then
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  end if;
  return query
  select p.id, p.username, p.full_name, case when v_admin then u.email::text else null end, p.role, p.account_status,
         p.account_type, p.verification_status, p.created_at,
         (select count(*) from public.listings l where l.seller_id = p.id),
         count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  where (v_q is null or p.username ilike '%' || v_q || '%' or p.full_name ilike '%' || v_q || '%'
         or (v_admin and u.email ilike '%' || v_q || '%'))
    and (p_status is null or p.account_status = p_status)
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics (always scoped to the caller, or to staff for marketplace totals)
-- ---------------------------------------------------------------------------
create or replace function public.get_seller_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    perform app_private.fail('not_authenticated', 'Please sign in to continue.');
  end if;
  select jsonb_build_object(
    'listings_live', (select count(*) from public.listings where seller_id = v_uid and status = 'published' and moderation_status = 'approved'),
    'listings_pending', (select count(*) from public.listings where seller_id = v_uid and moderation_status = 'pending_review' and status in ('published', 'paused')),
    'listings_rejected', (select count(*) from public.listings where seller_id = v_uid and moderation_status = 'rejected' and status in ('published', 'paused')),
    'listings_draft', (select count(*) from public.listings where seller_id = v_uid and status = 'draft'),
    'listings_paused', (select count(*) from public.listings where seller_id = v_uid and status = 'paused'),
    'listings_reserved', (select count(*) from public.listings where seller_id = v_uid and status = 'reserved'),
    'views_30d', (select count(*) from public.listing_views v join public.listings l on l.id = v.listing_id
                  where l.seller_id = v_uid and v.view_date > ((now() at time zone 'utc')::date - 30)),
    'views_total', (select count(*) from public.listing_views v join public.listings l on l.id = v.listing_id where l.seller_id = v_uid),
    'favorites_total', (select count(*) from public.favorites f join public.listings l on l.id = f.listing_id where l.seller_id = v_uid),
    'unread_messages', public.unread_message_count(),
    'offers_awaiting_me', (select count(*) from public.swap_offers o where o.status = 'pending' and
                            ((o.recipient_id = v_uid and o.awaiting_party = 'recipient') or (o.initiator_id = v_uid and o.awaiting_party = 'initiator'))),
    'active_transactions', (select count(*) from public.transactions t where t.status in ('active', 'disputed') and v_uid in (t.buyer_id, t.seller_id)),
    'completed_sales', (select count(*) from public.transactions t where t.status = 'completed' and t.transaction_type = 'purchase' and t.seller_id = v_uid),
    'completed_swaps', (select count(*) from public.transactions t where t.status = 'completed' and t.transaction_type = 'swap' and v_uid in (t.buyer_id, t.seller_id)),
    'trust', (select to_jsonb(x) from public.get_profile_trust(v_uid) x)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_listing_performance(p_limit integer default 50, p_offset integer default 0)
returns table (
  listing_id uuid, title text, slug text, slug_key text, status public.listing_status,
  moderation_status public.moderation_status, price_minor bigint, published_at timestamptz,
  views_total bigint, views_7d bigint, favorites bigint, offers_total bigint, offers_open bigint, conversations bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.id, l.title, l.slug, l.slug_key, l.status, l.moderation_status, l.price_minor, l.published_at,
    (select count(*) from public.listing_views v where v.listing_id = l.id),
    (select count(*) from public.listing_views v where v.listing_id = l.id and v.view_date > ((now() at time zone 'utc')::date - 7)),
    (select count(*) from public.favorites f where f.listing_id = l.id),
    (select count(*) from public.swap_offers o where o.listing_id = l.id),
    (select count(*) from public.swap_offers o where o.listing_id = l.id and o.status = 'pending'),
    (select count(*) from public.conversations c where c.listing_id = l.id)
  from public.listings l
  where l.seller_id = auth.uid() and auth.uid() is not null
  order by l.updated_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_marketplace_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.require_staff();
  return jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_suspended', (select count(*) from public.profiles where account_status = 'suspended'),
    'listings_live', (select count(*) from public.listings where status = 'published' and moderation_status = 'approved'),
    'listings_pending', (select count(*) from public.listings where moderation_status = 'pending_review' and status in ('published', 'paused')),
    'offers_open', (select count(*) from public.swap_offers where status = 'pending'),
    'transactions_active', (select count(*) from public.transactions where status = 'active'),
    'transactions_completed_30d', (select count(*) from public.transactions where status = 'completed' and completed_at > now() - interval '30 days'),
    'disputes_open', (select count(*) from public.disputes where status = 'open'),
    'reports_open', (select count(*) from public.reports where status in ('open', 'reviewing')),
    'verifications_pending', (select count(*) from public.verification_requests where status = 'pending')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.reviews enable row level security;
alter table public.reports enable row level security;

create policy "visible reviews are public" on public.reviews
  for select using (not is_hidden or (select auth.uid()) in (reviewer_id, reviewee_id) or public.is_staff());

create policy "reporters and staff read reports" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or public.is_staff());

revoke all on public.reviews, public.reports from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant select on public.reports to authenticated;
