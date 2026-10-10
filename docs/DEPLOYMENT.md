# Deployment

> Never run migrations or destructive commands against production without approval and a fresh backup.

## 1. Supabase project

1. Create a project (region close to Ghana, e.g. `eu-west`), choose a strong database password and store it in a password manager.
2. **Project Settings → API:** copy the Project URL and the publishable (or legacy anon) key. Do **not** copy the service-role key anywhere — the app doesn't need it.

## 2. Database migrations

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push            # applies supabase/migrations/* in order
```

Migrations create: schema, RLS policies, RPCs, triggers, storage buckets and policies, Realtime publication entries, and function grants. They are forward-only and were verified on PostgreSQL 18 (PGlite) with Supabase stand-ins; run them on a staging project first.

## 3. Catalogue seed (idempotent)

```bash
psql "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" -f supabase/seed.sql
```

or paste `supabase/seed.sql` into the SQL editor. Re-running updates rows by slug and never duplicates. It contains no demo users or listings.

## 4. Storage

Buckets `avatars`, `business-logos` (public), `listing-images` and `verification-docs` (private) plus their policies are created by migrations `0900` and `1100`. Listing photos are served by the app at `/media/listings/…`, not by public Storage URLs. Verify under **Storage**: sizes 5 MB / 2 MB / 2 MB / 10 MB and allowed MIME types.

Orphaned listing images (uploaded but never linked, e.g. abandoned uploads) can be listed by an admin with `select * from public.list_orphaned_listing_images('1 day');` and removed via the Storage API or dashboard.

## 5. Authentication

**Authentication → URL configuration**

- Site URL: `https://<your-domain>`
- Redirect URLs: `https://<your-domain>/auth/callback`, `https://<your-domain>/auth/confirm`, and for previews `https://*-<team>.vercel.app/auth/callback`
- Local: `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/confirm`

**Email templates (recommended).** The default links use PKCE (`/auth/callback?code=`) and must be opened in the same browser. For cross-device links, change templates to the token-hash form handled by `/auth/confirm`:

- Confirm sign-up: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard/profile?setup=1`
- Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`

**Email provider.** Supabase's built-in SMTP is heavily rate-limited and for testing only. Configure a custom SMTP provider (e.g. Resend, Postmark, Amazon SES) under **Authentication → SMTP**. Keep "Confirm email" enabled. Set Auth rate limits under **Authentication → Rate limits**.

## 6. First administrator

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'owner@example.com');
-- moderators:
update public.profiles set role = 'moderator' where username = 'some_moderator';
```

Roles can only be changed by a database operator — never through the app.

## 7. Scheduled jobs

Migration `1000` enables `pg_cron` (available on Supabase) and registers:

| Job | Schedule | Purpose |
| --- | --- | --- |
| `top5-expire-offers` | every 15 min | `public.expire_due_offers()` — expires overdue offers and notifies both parties |
| `top5-prune-rate-limits` | daily 03:17 UTC | deletes rate-limit events older than 2 days |

Verify after `db push` with `select jobname, schedule, active from cron.job;` and inspect runs in `cron.job_run_details`. If `pg_cron` is unavailable the migration logs a notice and offers still expire lazily (accept/counter refuse expired offers; dashboards sweep overdue offers on load).

## 8. Vercel

1. Import the repository. Framework preset: Next.js. Node 20+.
2. Environment variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-domain>` (omit on Preview to use `VERCEL_URL`)
3. Build command `npm run build`, output default. The build does not need database access (pages are dynamic; the sitemap falls back to static entries if the database is unreachable at build time).
4. Point previews at a **staging** Supabase project, never production.

## 9. Local development

```bash
npm install
cp .env.example .env.local     # set URL + key of a dev project, or run `npx supabase start` (Docker) and use its local URL/key
npm run dev
```

With the local stack, `npx supabase db reset` re-applies migrations and seeds the catalogue.

## 10. Production checklist

- [ ] Migrations applied to staging, smoke-tested, then to production after a backup
- [ ] Seed run; brands/models visible in `/admin/models`
- [ ] Site URL, redirect URLs, email templates and SMTP configured
- [ ] First admin assigned; test moderation end-to-end
- [ ] `select * from cron.job` shows both Top5Ideals jobs
- [ ] Legal pages (`/terms`, `/privacy`) replaced with reviewed text
- [ ] Custom domain + HTTPS; `NEXT_PUBLIC_SITE_URL` set

## Rollback and recovery

- **Application:** Vercel → Deployments → *Promote* a previous deployment (instant rollback). Environment variable changes need a redeploy.
- **Database:** migrations are forward-only. To undo, write a new corrective migration; do not edit applied migration files. Before every production migration take a backup (Pro plan: Point-in-Time Recovery; otherwise `pg_dump`). Restore via **Database → Backups** or `psql < dump.sql` into a fresh project, then repoint environment variables.
- **Storage:** files are not versioned; keep periodic exports of the private `verification-docs` bucket if required by policy.
- **Incident response:** suspend abusive accounts from `/admin/users`; take down listings from `/admin/listings` ("Take down"); every admin action is recorded in `admin_actions` and `audit_logs`.
