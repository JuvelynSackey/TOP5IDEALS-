# Implementation status

_Last updated: 2026-10-10 (session 2: scheduled jobs, internal-helper privilege fix, CSP)._

Legend: **Verified** = covered by automated tests that were executed and passed. **Implemented** = code complete, type-checked, linted and included in a successful production build, but not yet exercised against a live Supabase project (none was available). **Partial** = works with documented gaps. **Blocked** = needs an external account/service.

## Check results (actually executed)

| Check | Result |
| --- | --- |
| `npm run typecheck` (strict TS) | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors, 1 warning (React Compiler skips memoising a component using React Hook Form `watch` — expected) |
| `npm test` (unit + database) | ✅ 103 passed (27 unit, 76 database); 1 integration suite skipped (no test project) |
| `npm run build` (Next 16.4, Turbopack) | ✅ 50 routes compiled |
| Production server smoke test (placeholder Supabase) | ✅ static/auth pages 200; `/dashboard`, `/sell`, `/admin` → 307 to login; invalid listing/shop/profile URLs → 404; security headers present |
| `npx playwright test --list` | ✅ 24 tests discovered (12 per device project) — **not executed** (no test project / base URL) |

## Staging verification (hosted Supabase, 2026-10-10)

- `supabase db push` applied all 10 migrations to the staging project without errors; `--include-seed` loaded 12 brands and 73 models.
- Anonymous API probes: private tables and admin RPCs return `permission denied`; `search_listings` works.
- Manual run: sign-up, profile completion, admin role, listing creation with photo upload, self-moderation correctly refused, approval, public listing page and home page.
- Found and fixed: the listing detail query was ambiguous through PostgREST (`listings → brands` via `brand_id` and via `listing_swap_brands`, error PGRST201). All 21 embedded queries in the app were then probed against the live API and parse correctly. PGlite tests cannot catch this class of bug because they bypass PostgREST.

## Completion criteria

| Criterion | Status | Evidence / notes |
| --- | --- | --- |
| Register, log in, log out | Implemented | Supabase Auth email/password, confirmation + reset routes; generic responses. Needs live project |
| Create a profile | Implemented · DB verified | Completion computed by trigger; RLS/column grants tested |
| Seller creates listing with images | Implemented · DB verified | 6-step wizard, server drafts, client compression, upload retry; `add_listing_image` ownership tests |
| Public discovers approved listings | Verified (DB) | Drafts/pending hidden on direct URL and search |
| Search & filters on real records | Verified (DB) | `search_listings` tests incl. injection-safe query |
| Save listings | Verified (DB) | Favourites RLS tests |
| Private messaging | Verified (DB) · UI implemented | Membership, idempotency, blocks, rate limits tested; Realtime UI untested live |
| Offer an eligible phone in exchange | Verified (DB) | Ownership, eligibility, own-listing, swap-acceptance rules |
| Unambiguous cash differences | Verified (DB + unit) | Constraint + `describeCash` wording tests |
| Counteroffers preserve history | Verified (DB) | Versioned events/items; immutability trigger |
| Unauthorised swap actions rejected | Verified (DB) | Third parties, wrong turn, stale version, wrong role |
| No double sale/swap under concurrency | Verified (sequential) · Partial | Row locks + reservation PK tested sequentially; parallel test written, not run (needs project) |
| Both parties confirm an exchange | Verified (DB) | Single confirmation never completes |
| Disputes & incomplete confirmations | Verified (DB) | Cancel blocked after confirmation; dispute → staff resolve complete/cancel/dismiss |
| Reviews require eligible transaction | Verified (DB) | Party, completion, uniqueness, server-derived reviewee |
| Admins moderate listings | Verified (DB) · UI implemented | Reasons visible to seller only; self-moderation blocked |
| Seller analytics scoped | Verified (DB) | RPCs filter by `auth.uid()`; `listing_views` not readable |
| RLS on every private/user table | Verified (DB) | See docs/SECURITY.md |
| Storage policies protect files | Verified (DB, stubbed storage schema) | Folder ownership, no overwrite, private verification docs |
| Primary controls meaningful | Implemented | Every button calls a server action/RPC or navigates |
| Mobile & desktop | Implemented | Mobile-first layouts, bottom nav, sticky listing bar; overflow E2E test written, not run |
| Loading, empty, error states | Implemented | `loading.tsx` (buy, dashboard, admin), empty states, `error.tsx`, `not-found.tsx` |
| Automated tests cover critical workflows | Partial | DB/unit executed; E2E + concurrency written but blocked on test project |
| Type/lint/build documented | Done | This file |
| Deployment docs reflect implementation | Done | docs/DEPLOYMENT.md |

## Partially implemented / known limitations

1. **Not run against hosted Supabase.** Migrations were validated on PostgreSQL 18 (PGlite) with stand-ins for `auth`/`storage`. Hosted Supabase (PG 15/17, real storage schema, PostgREST, Realtime) must be verified on a staging project first.
2. **Email/SMS/WhatsApp notifications:** in-app notifications only. Email deliveries are queued in `notification_deliveries` when a user opts in, but no worker sends them (the preference UI currently saves email = off).
3. **Offer expiry** runs every 15 minutes via `pg_cron` (migration 1000) on Supabase; verified only for the no-`pg_cron` path locally — confirm `cron.job` on staging.
4. **Phone-number login** not implemented (email/password only; stated on the login form).
5. **Search typo tolerance** not implemented (prefix matching on normalised tokens only). Brand counts on the homepage scan up to 2,000 live listings.
6. **Listing images** are in a public bucket; unpublished images are unguessable but not access-controlled. Consider signed URLs for drafts.
7. **Content-Security-Policy** is nonce-based and verified on the built server (all inline scripts carry the nonce); styles still allow `'unsafe-inline'`. Must be re-checked in a browser against live Supabase (Realtime `wss`, Storage images).
8. **Account deletion** flow not implemented. Users with negotiation history cannot be hard-deleted (FK `RESTRICT` protects history); use suspension/anonymisation.
9. **Verification documents** cannot be deleted by the user after upload (by design, private); removing one from the form only stops it being submitted.
10. **Dispute evidence uploads** and **message attachments** are not supported (text only).
11. **Granular admin permissions:** two staff tiers (moderator, admin) only.
12. **Upload progress** is stage-based (optimising → uploading → saving), not byte-level.
13. **Legal pages** are plain-language placeholders flagged as needing legal review.
14. **No demo data seed** — the catalogue seed is production-safe; demo users/listings must be created through the app.
15. **Rate limiting of auth endpoints** relies on Supabase Auth settings (configure in the dashboard).

## Blocked (external setup required)

- Supabase project (URL + publishable key), migrations push, seed, first admin.
- SMTP provider for production auth emails; email template change for cross-device links.
- Vercel project + environment variables + domain.
- Test project and accounts to run Playwright and the concurrency test.

## Next highest-priority task

Create a **staging Supabase project**, `supabase db push` + seed, run the app against it, then execute `npm run test:e2e` and `npm run test:integration`. Fix anything that differs between PGlite and hosted Supabase before production.
