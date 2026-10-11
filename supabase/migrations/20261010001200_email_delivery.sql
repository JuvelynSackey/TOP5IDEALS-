-- =============================================================================
-- Top5Ideals 1200 — Email delivery for notifications (Mailtrap HTTP API).
--
-- app_private.notify() already queues a row in notification_deliveries when a
-- user opts in to email for that notification type. This migration adds the
-- sender, which runs inside the database:
--   1. pg_cron calls app_private.dispatch_email_deliveries() every minute.
--   2. It first reconciles earlier requests from pg_net's response table:
--      2xx → sent; other → retried, and failed after 5 attempts.
--   3. It then posts up to 50 pending emails to the configured endpoint with
--      net.http_post (asynchronous) and records each request id.
--
-- Configuration (admin settings): email_api_url, email_from_address,
-- email_from_name, site_url. The API token is a SECRET stored in Supabase
-- Vault under the name 'mailtrap_api_token'; it never appears in code.
--   Mailtrap Email Testing (sandbox, staging):
--     https://sandbox.api.mailtrap.io/api/send/<inbox_id>
--   Mailtrap Email Sending (production, verified domain):
--     https://send.api.mailtrap.io/api/send
-- With no URL or no token the sender does nothing and emails stay queued.
-- =============================================================================

alter table public.notification_deliveries
  add column if not exists request_id bigint,
  add column if not exists sent_at timestamptz;
create index if not exists notification_deliveries_request_idx
  on public.notification_deliveries (request_id) where request_id is not null;

insert into public.app_settings (key, value, description) values
  ('email_api_url', '""', 'Mailtrap send endpoint. Sandbox: https://sandbox.api.mailtrap.io/api/send/<inbox_id>. Production: https://send.api.mailtrap.io/api/send. Empty turns email off.'),
  ('email_from_address', '"notifications@top5ideals.test"', 'Sender address for notification emails. Production needs an address on a verified domain.'),
  ('email_from_name', '"Top5Ideals"', 'Sender name shown in inboxes.'),
  ('site_url', '"http://localhost:3000"', 'Public address of the site, used for links in emails (no trailing slash).')
on conflict (key) do nothing;

create or replace function app_private.setting_text(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select value #>> '{}' from public.app_settings where key = p_key), p_default);
$$;

create or replace function app_private.html_escape(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

-- Reads the Mailtrap token from Vault. Returns null when Vault or the secret is missing.
create or replace function app_private.email_api_token()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'mailtrap_api_token' limit 1;
  return nullif(btrim(v_token), '');
exception when others then
  return null;
end;
$$;

-- Apply pg_net responses to earlier requests.
create or replace function app_private.reconcile_email_deliveries()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select d.id, d.attempts, resp.status_code, resp.error_msg, resp.timed_out, resp.content
    from public.notification_deliveries d
    join net._http_response resp on resp.id = d.request_id
    where d.status = 'pending' and d.request_id is not null
    for update of d skip locked
  loop
    if r.status_code between 200 and 299 then
      update public.notification_deliveries
        set status = 'sent', sent_at = now(), request_id = null, last_error = null
        where id = r.id;
    else
      update public.notification_deliveries
        set status = case when r.attempts >= 5 then 'failed'::public.delivery_status else 'pending'::public.delivery_status end,
            request_id = null,
            last_error = left(coalesce(r.error_msg, case when r.timed_out then 'timed out' end, 'HTTP ' || r.status_code || ': ' || r.content, 'unknown error'), 500)
        where id = r.id;
    end if;
    v_count := v_count + 1;
  end loop;

  -- Requests whose response never arrived (or was pruned) are retried.
  update public.notification_deliveries
    set request_id = null, last_error = 'no response from email provider'
    where status = 'pending' and request_id is not null and updated_at < now() - interval '10 minutes'
      and not exists (select 1 from net._http_response resp where resp.id = request_id);
  return v_count;
end;
$$;

-- Send queued emails. Returns the number of requests started.
create or replace function app_private.dispatch_email_deliveries(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text := btrim(app_private.setting_text('email_api_url', ''));
  v_token text;
  v_from_address text := app_private.setting_text('email_from_address', 'notifications@top5ideals.test');
  v_from_name text := app_private.setting_text('email_from_name', 'Top5Ideals');
  v_site text := rtrim(app_private.setting_text('site_url', ''), '/');
  r record;
  v_link text;
  v_request bigint;
  v_count integer := 0;
begin
  if v_url = '' then
    return 0;
  end if;
  v_token := app_private.email_api_token();
  if v_token is null then
    raise notice 'Email sender: Vault secret mailtrap_api_token is not set; emails stay queued.';
    return 0;
  end if;

  perform app_private.reconcile_email_deliveries();

  for r in
    select d.id, n.title, n.body, n.link, u.email, p.full_name
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    join public.profiles p on p.id = n.user_id
    join auth.users u on u.id = n.user_id
    where d.channel = 'email' and d.status = 'pending' and d.request_id is null and d.attempts < 5
    order by d.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update of d skip locked
  loop
    if r.email is null or btrim(r.email) = '' then
      update public.notification_deliveries set status = 'skipped', last_error = 'recipient has no email address' where id = r.id;
      continue;
    end if;
    v_link := case when r.link is not null and v_site <> '' then v_site || r.link end;

    v_request := net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'from', jsonb_build_object('email', v_from_address, 'name', v_from_name),
        'to', jsonb_build_array(jsonb_build_object('email', r.email)),
        'subject', r.title,
        'category', 'notification',
        'text', concat_ws(E'\n\n',
          r.title,
          nullif(r.body, ''),
          case when v_link is not null then 'Open: ' || v_link end,
          'You get this email because email alerts are on in your Top5Ideals notification settings.'),
        'html', concat(
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0b0d10;max-width:560px">',
          '<p style="font-weight:bold;letter-spacing:2px;color:#077d70;margin:0 0 16px">TOP5IDEALS</p>',
          '<h1 style="font-size:20px;margin:0 0 8px">', app_private.html_escape(r.title), '</h1>',
          case when nullif(r.body, '') is not null then '<p style="margin:0 0 16px">' || app_private.html_escape(r.body) || '</p>' else '' end,
          case when v_link is not null then
            '<p style="margin:0 0 24px"><a href="' || app_private.html_escape(v_link) || '" style="background:#077d70;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Open in Top5Ideals</a></p>'
          else '' end,
          '<p style="font-size:12px;color:#59626e;margin:0">You get this email because email alerts are on in your Top5Ideals notification settings.</p>',
          '</div>')
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
      timeout_milliseconds := 10000
    );

    update public.notification_deliveries
      set request_id = v_request, attempts = attempts + 1
      where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Enable pg_net and schedule the sender where available (Supabase).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $job$ select cron.schedule('top5-send-emails', '* * * * *', 'select app_private.dispatch_email_deliveries()') $job$;
  else
    raise notice 'pg_cron not available: email sender not scheduled.';
  end if;
end;
$$;

-- Internal helpers stay owner-only (see migration 1000).
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.fail(text, text), app_private.slugify(text), app_private.random_key(int)
  to anon, authenticated;
