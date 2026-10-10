# Architecture

## Overview

```
Browser ──(publishable key + session cookie)──► Next.js on Vercel ──► Supabase
  │                                                │                    ├─ Postgres (RLS, RPCs)
  │  direct: Storage uploads, Realtime            │ Server Components   ├─ Auth
  └───────────────────────────────────────────────►│ Server Actions      ├─ Storage
                                                    │ Route Handlers      └─ Realtime
```

- **No service-role key exists in the application.** Every request — including admin actions — runs as the signed-in user. The database decides what is allowed.
- Business rules that change state (publishing, offers, acceptance, confirmations, disputes, reviews, moderation, verification) are implemented once, as PostgreSQL `SECURITY DEFINER` functions in `supabase/migrations`. Server Actions validate input with Zod, call the RPC, and map error codes to friendly text. There is no duplicated business logic between actions and route handlers.
- Plain owner edits (listing content, profile fields, favourites, blocks, notification preferences) use direct table writes, constrained by RLS **and** column-level `GRANT`s plus validation triggers.

## Directory layout

| Path | Purpose |
| --- | --- |
| `supabase/migrations/` | Ordered SQL migrations (schema, RLS, RPCs, storage, grants) |
| `supabase/seed.sql` | Idempotent catalogue seed (brands, models) |
| `src/proxy.ts`, `src/lib/supabase/proxy.ts` | Next 16 proxy: refresh session cookie, redirect anonymous users away from `/dashboard`, `/sell`, `/admin` |
| `src/lib/supabase/{server,client}.ts` | SSR (cookie) client and browser client, typed with generated `Database` |
| `src/server/` | Server-only data access: `auth.ts` (viewer from verified JWT claims), `queries.ts` (public reads), `deals.ts` (offer reads) |
| `src/app/actions/` | Server Actions grouped by domain: `listings`, `marketplace`, `deals`, `messages`, `account`, `admin` |
| `src/lib/` | Pure domain helpers (money, cash wording, state machines, slugs, phone numbers, validation, logging) — unit tested |
| `src/components/ui/` | shadcn-style primitives on Radix (button, dialog, dropdown, tabs, switch, checkbox, …) |
| `src/components/*` | Feature components (listings, sell wizard, offers, messages, admin, …) |
| `tests/unit`, `tests/db`, `tests/integration`, `tests/e2e` | See docs/TESTING.md |

## Domain operations → implementation

| Operation (brief) | Implementation |
| --- | --- |
| createListing / updateListing | `createDraftAction`, `saveListingStepAction` (RLS + column grants + `listings_before_write` trigger, optimistic concurrency on `updated_at`) |
| publishListing / pauseListing / archiveListing | RPC `publish_listing`, `pause_listing`, `resume_listing`, `archive_listing`, `mark_listing_sold_elsewhere` |
| getListing / searchListings | `getListingByKey`, RPC `search_listings` (tsvector + filters) |
| favoriteListing / unfavoriteListing | `toggleFavoriteAction` (RLS) |
| createConversation / sendMessage / markConversationRead | RPC `start_conversation`, `send_message`, `mark_conversation_read` |
| createSwapOffer / initiatePurchase | RPC `create_swap_offer`, `initiate_purchase` (shared `app_private.create_offer`) |
| counterSwapOffer / acceptSwapOffer / rejectSwapOffer / cancelSwapOffer / expireSwapOffer | RPC `counter_swap_offer`, `accept_swap_offer`, `reject_swap_offer`, `cancel_swap_offer`, `expire_due_offers` |
| confirmTransactionStep / completeSwap / cancelTransaction | RPC `confirm_transaction` (completes on 2nd confirmation), `cancel_transaction` |
| reportSwapProblem / reportTransactionProblem | RPC `open_dispute` |
| createReview | RPC `create_review`, `update_review` |
| reportListing / reportUser | RPC `create_report` |
| submitVerificationRequest | RPC `submit_verification_request` |
| moderateListing / suspendUser / reviewVerification / resolveReport / manageFeaturedListing | RPC `moderate_listing`, `set_account_status`, `review_verification`, `resolve_report`, RLS on `featured_listings` |

## Conventions

- **Money:** integer minor units (pesewas) in `bigint` columns named `*_minor`; `GH₵1.00 = 100`. Formatting/parsing only in `src/lib/money.ts`.
- **Errors:** RPCs raise `P0001` with a stable code in `MESSAGE` and human text in `DETAIL`. `src/lib/errors.ts` maps codes; unknown errors become a generic message (no SQL leaks to the browser).
- **Time:** `timestamptz` in UTC; displayed in `Africa/Accra` (`src/lib/format.ts`).
- **Results:** every Server Action returns `ActionResult<T>` (`{ ok: true, data } | { ok: false, code, error, fieldErrors? }`).
- **Logging:** `src/lib/logger.ts` writes JSON lines with redaction of sensitive keys (passwords, tokens, bodies, emails, phones).
- **Theme:** `next-themes` with `class` strategy, system default, persisted in `localStorage` (`top5-theme`), applied before paint (no flicker).
- **Caching:** all pages that read user data are dynamic (cookies). Only `/sitemap.xml`, `/robots.txt`, `/opengraph-image` and the icon are static. No authenticated response is cached publicly; Supabase SSR sets `Cache-Control: private, no-store` when it writes auth cookies.
