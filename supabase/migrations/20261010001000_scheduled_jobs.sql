-- =============================================================================
-- Top5Ideals 1000 — Scheduled maintenance jobs (pg_cron).
--
-- On Supabase, pg_cron is available and this migration enables it and
-- registers the jobs. Where pg_cron is not installed (local test databases),
-- the migration is a no-op and offers still expire lazily (accept/counter
-- refuse expired offers; dashboards sweep with expire_due_offers()).
-- cron.schedule() with a job name is an upsert, so re-running is safe.
-- =============================================================================

-- Rate-limit events are only needed for the longest window (1 day).
create or replace function app_private.prune_rate_limit_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from app_private.rate_limit_events where created_at < now() - interval '2 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- Expire overdue offers (and notify both parties) every 15 minutes.
    execute $job$ select cron.schedule('top5-expire-offers', '*/15 * * * *', 'select public.expire_due_offers()') $job$;
    -- Keep the rate-limit table small.
    execute $job$ select cron.schedule('top5-prune-rate-limits', '17 3 * * *', 'select app_private.prune_rate_limit_events()') $job$;
  else
    raise notice 'pg_cron not available: scheduled jobs not registered (offers still expire lazily).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock down internal helpers.
-- `alter default privileges in schema app_private revoke ...` (migration 0100)
-- cannot remove Postgres' *global* default EXECUTE-to-PUBLIC grant, so every
-- app_private function was executable by any role. Revoke explicitly and
-- re-grant only the side-effect-free helpers used by invoker-rights triggers.
-- Any future app_private function must be revoked the same way.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.fail(text, text), app_private.slugify(text), app_private.random_key(int)
  to anon, authenticated;
