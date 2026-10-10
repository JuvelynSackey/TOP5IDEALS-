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
| `listing-images` (5 MB, jpeg/png/webp) | yes | insert only into `<own uid>/<own editable listing id>/…`; delete own files |
| `avatars`, `business-logos` (2 MB) | yes | insert/delete only under `<own uid>/` |
| `verification-docs` (10 MB, + pdf) | **no** | insert under `<own uid>/`; read by owner and admins only; admins view via 2-minute signed URLs |

There are **no UPDATE policies**, and paths are random, so nobody can overwrite anyone's file (including their own). Linking an image to a listing (`add_listing_image`) verifies path shape, ownership of the object (`owner_id`), and listing ownership/editability. Images are re-encoded in the browser (max 1600 px, WebP/JPEG), which strips EXIF/GPS metadata.

**Known trade-off:** listing images are in a public bucket so the CDN can serve them. Images of drafts or rejected listings are not linked anywhere public, but are reachable by anyone who knows the random path. Signed URLs for unpublished images would close this gap (see IMPLEMENTATION_STATUS).

## Transaction integrity

- Acceptance locks all involved listing rows (`FOR UPDATE`, ordered by id to avoid deadlocks), re-checks eligibility and inserts into `listing_reservations` whose **primary key** prevents a listing ever being reserved twice — even if two requests race.
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

`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`; `poweredByHeader` off; redirects after auth only accept same-site relative paths; JSON-LD is escaped; notification links are restricted to relative paths by a check constraint. A Content-Security-Policy is **not yet** configured (see IMPLEMENTATION_STATUS).

## Adding new database objects safely

- Enable RLS on every new table and `REVOKE ALL ... FROM anon, authenticated` before granting.
- Supabase grants `EXECUTE` on new public functions to `anon`/`authenticated` by default: explicitly `REVOKE` and re-`GRANT` in the same migration.
- Run `npm test` — the database suite applies every migration and catches regressions in policies.
