# Security

## Principles

1. **Database is the authority.** RLS on every exposed table, column-level `GRANT`s, validation triggers and `SECURITY DEFINER` RPCs that authenticate with `auth.uid()`. The UI only mirrors these rules.
2. **No service-role key in the app.** Not in the browser, not on the server. Admin features run as the signed-in admin and are re-checked by `is_staff()` / `is_admin()` in SQL.
3. **Least privilege.** `REVOKE ALL` on every table from `anon`/`authenticated`, then grant only what each role needs. `REVOKE EXECUTE` on all functions, then grant per function (`migration 0900`). Internal helpers live in `app_private` (not exposed by PostgREST).
4. **Identity from verified tokens.** Server code derives the user from `supabase.auth.getClaims()` (JWT signature verified), never from client-supplied ids.

## Roles

| Role | Granted by | Can |
| --- | --- | --- |
| `user` | sign-up (default) | Own profile, listings, offers, messages, reviews, reports |
| `moderator` | SQL by an operator | Moderate listings, resolve reports and disputes, hide reviews, manage featured listings, read admin actions. **Cannot** see emails, verification documents, suspend users, edit catalogue or settings |
| `admin` | SQL by an operator | Everything a moderator can, plus users (incl. emails), suspensions, verification review (documents), catalogue, settings, audit logs |

Public sign-up can never grant a role: `role` is not in any client `GRANT`, and the sign-up trigger ignores metadata except `full_name` and `account_type ∈ {individual, business}`. Admins cannot suspend other admins or themselves through the app; moderators/admins cannot moderate their own listings or approve their own verification.

## Table access summary

| Table | anon | authenticated |
| --- | --- | --- |
| profiles | read | read; update own `username, full_name, avatar_path, region_id, city, bio` |
| profile_contacts | — | read/update own phone |
| business_profiles | read | create/update own (not verification fields) |
| listings | read public | read own + public; insert drafts; update own content columns (not status/moderation/seller); delete own drafts |
| listing_images, listing_swap_brands | read if listing visible | writes only via RPCs |
| favorites, user_blocks, notification_preferences | — | own rows |
| notifications | — | read own; update `read_at`; delete own |
| conversations, members, messages | — | members read; writes only via RPCs |
| swap_offers (+items/events), transactions (+items/confirmations), disputes | — | parties (and staff) read; writes only via RPCs |
| reviews | read visible | read; writes only via RPCs |
| reports | — | reporter + staff read; writes via RPCs |
| verification_requests | — | owner + admins read; writes via RPCs |
| listing_views, listing_reservations, notification_deliveries | — | none (internal) |
| audit_logs / admin_actions | — | admins / staff read |

Every rule in this table is exercised by `tests/db/*.test.ts` running as the real `authenticated` and `anon` roles.

## Storage

| Bucket | Public read | Write rule |
| --- | --- | --- |
| `listing-images` (5 MB, jpeg/png/webp) | **no** — served by `/media/listings/…` | insert only into `<own uid>/<own editable listing id>/…`; delete own files; read: anyone if the listing is public, otherwise owner, staff and parties to an offer/transaction involving it (`can_read_listing_image`, migration 1100) |
| `avatars`, `business-logos` (2 MB) | yes | insert/delete only under `<own uid>/` |
| `verification-docs` (10 MB, + pdf) | **no** | insert under `<own uid>/`; read by owner and admins only; admins view via 2-minute signed URLs |

There are **no UPDATE policies**, and paths are random, so nobody can overwrite anyone's file (including their own). Linking an image to a listing (`add_listing_image`) verifies path shape, ownership of the object (`owner_id`), and listing ownership/editability. Images are re-encoded in the browser (max 1600 px, WebP/JPEG), which strips EXIF/GPS metadata.

**Listing photo delivery:** the route `src/app/media/listings/[...path]/route.ts` first downloads the file anonymously (succeeds only for public listings → `Cache-Control: public, max-age=300, s-maxage=600`), then as the signed-in visitor (→ `private, no-store`), otherwise 404. Paths are validated against `<uuid>/<uuid>/<random>.<ext>`. Because Next's image optimiser does not forward cookies, non-public contexts (sell wizard, dashboards, admin queue, offer history, messages, the detail page of an unpublished listing) render with `unoptimized`. After a takedown, shared caches may serve the old photo for up to ~10 minutes and the optimiser cache for its TTL; the listing itself disappears immediately.

## Transaction integrity

- Acceptance locks all involved listing rows **before** the offer row (`FOR UPDATE`, ordered by id) — the same listing → offer order used by every other path — then re-checks eligibility and inserts into `listing_reservations` whose **primary key** prevents a listing ever being reserved twice — even if two requests race.
- When a listing becomes non-offerable, a trigger cancels every open offer involving it (with an audit event).
- Counter/accept use expected-version checks; offers carry idempotency keys; messages carry client ids → retries never duplicate.
- Negotiation history, confirmations and agreed terms are immutable (triggers reject `UPDATE`/`DELETE` even from the table owner).
- Reviews require a completed transaction, the reviewer to be a party, and are unique per (transaction, reviewer); the reviewee is derived server-side.

## Abuse controls

Server-side rate limits (`app_private.enforce_rate_limit`): messages 20/min and 600/day, new conversations 30/h, offers 20/h, counters 60/h, publishes 30/day, reports 10/day, disputes 5/day, verification 3/day. Login, sign-up and password-reset throttling rely on Supabase Auth's built-in rate limits (configure in the dashboard). Suspension blocks all write RPCs, pauses live listings and cancels open offers.

## Privacy

- Email and phone are never public. Admins (not moderators) can see emails.
- Staff do not get blanket access to messages. A reported message is copied into the report as evidence; the rest of the conversation stays private.
- Password reset and sign-up responses are generic (no account enumeration). Phone-number login is not offered.
- Logs are structured JSON with redaction of sensitive keys; message bodies, tokens and passwords are never logged.

## Web hardening

`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`; `poweredByHeader` off; redirects after auth only accept same-site relative paths; JSON-LD is escaped; notification links are restricted to relative paths by a check constraint.

**Content-Security-Policy** (`src/lib/csp.ts`, set in `src/lib/supabase/proxy.ts`): a fresh nonce per request with `'strict-dynamic'` — no `unsafe-inline`/`unsafe-eval` for scripts in production. Next.js applies the nonce to its inline scripts automatically; `next-themes` receives it via `Providers`. Network access is limited to the site and the configured Supabase project (`https` + `wss` for Realtime); images to self, `data:`, `blob:` and Supabase Storage; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`. Styles allow `'unsafe-inline'` because Radix, sonner and next/image set inline style attributes. Any new third-party script, font, image or API host must be added in `buildCsp`. Static files excluded by the proxy matcher (images, `robots.txt`, `sitemap.xml`) are served without the header.

## Email delivery secret

The Mailtrap API token lives only in Supabase Vault (`mailtrap_api_token`) and is read by `app_private.email_api_token()` inside the database. It is never in the repository, environment files or the browser. Outgoing requests are made by `pg_net`, whose request and response tables are not exposed to API roles. Email bodies are built from notification text with HTML escaping (`app_private.html_escape`, tested against script injection). Users only receive email for groups they opted into.

## Internal helper privileges

Postgres grants `EXECUTE` on new functions to `PUBLIC`, and a per-schema `ALTER DEFAULT PRIVILEGES … REVOKE` cannot remove that global default. Migration `1000` therefore revokes execute on **all** `app_private` functions from `public`, `anon` and `authenticated`, re-granting only `fail`, `slugify` and `random_key` (needed by invoker-rights triggers). `tests/db/maintenance.test.ts` asserts client roles cannot call privileged helpers.

## Adding new database objects safely

- Enable RLS on every new table and `REVOKE ALL ... FROM anon, authenticated` before granting.
- Supabase grants `EXECUTE` on new public functions to `anon`/`authenticated` by default: explicitly `REVOKE` and re-`GRANT` in the same migration. New `app_private` functions must also be revoked from `public, anon, authenticated` explicitly.
- Run `npm test` — the database suite applies every migration and catches regressions in policies.
