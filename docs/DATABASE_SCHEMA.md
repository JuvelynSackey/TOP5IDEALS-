# Database schema

All objects are created by the migrations in `supabase/migrations` (applied in filename order). Internal helpers live in the `app_private` schema, which is not exposed through the API.

## Units and conventions

- **Money:** `bigint` **minor units** (pesewas). Columns end in `_minor`. Currency is `GHS` (`currency char(3)` with a check constraint, ready for more countries). Range GH₵1–GH₵1,000,000 for prices; GH₵0–GH₵1,000,000 for cash differences.
- **Cash difference:** `cash_amount_minor >= 0` + `cash_payer ∈ {none, initiator, recipient}`; a check constraint enforces `amount = 0 ⇔ payer = none`. *Initiator* = the person who made the offer (buyer/offerer); *recipient* = owner of the target listing.
- **Identifiers:** UUIDs for user-facing entities; identity `bigint` for append-only logs.
- **Timestamps:** `created_at`/`updated_at` (`set_updated_at` trigger) in UTC.

## Tables

| Group | Table | Notes |
| --- | --- | --- |
| Location | `countries`, `regions` | Ghana + its 16 regions seeded in migration 0100 |
| Settings | `app_settings` | `auto_approve_verified_sellers`, `offer_expiry_hours`, `confirmation_window_days`, `review_edit_window_days` |
| Identity | `profiles` | 1:1 with `auth.users`; public profile; `role` (user/moderator/admin), `account_status`, `verification_status`, `profile_completed_at` (set by trigger) |
| | `profile_contacts` | **Private** phone number (E.164), owner-only |
| | `business_profiles` | Storefront (unique slug), optional *public* phone, verification status set only by admins |
| | `verification_requests` | Documents (paths in private bucket), one pending per user |
| | `user_blocks` | Blocks prevent messaging and offers in both directions |
| Catalogue | `brands`, `phone_models` | Storage/RAM options, `battery_health_supported`; deactivate instead of delete |
| Marketplace | `listings` | See state machine below; `slug_key` (8 chars, permanent) + descriptive `slug`; `search_vector` (tsvector, GIN) |
| | `listing_images` | Unique storage path; **exactly one primary** via partial unique index; max 10 |
| | `listing_swap_brands` | Preferred brands for swaps (real FK, not text) |
| | `favorites` | PK (user, listing) |
| | `listing_views` | Unique (listing, viewer_key, UTC day) — dedup policy below |
| | `featured_listings` | Staff-managed, time-boxed |
| | `listing_moderation_events` | Submissions/decisions with seller-visible reasons |
| Messaging | `conversations` | Unique `dedupe_key` (user pair + listing) |
| | `conversation_members` | Membership + `last_read_at` (unread counts) |
| | `messages` | Unique (conversation, client_id) for idempotent sends; 1–2000 chars |
| Notifications | `notifications` | Unique (user, dedupe_key) → duplicate-safe |
| | `notification_preferences` | Per type in-app/email |
| | `notification_deliveries` | Outbox for external channels (no worker yet) |
| Swapping | `swap_offers` | One row per negotiation; `offer_type` swap/purchase; `current_version`; `awaiting_party`; `expires_at`; `idempotency_key` |
| | `swap_offer_items` | Offered listings **per version** + snapshot (append-only) |
| | `swap_offer_events` | Append-only history; proposal events carry full cash terms per version |
| Transactions | `transactions` | One per accepted offer; immutable agreed terms + `terms_snapshot` |
| | `transaction_items` | Listings involved with snapshots |
| | `listing_reservations` | **PK listing_id** — the hard guarantee against double-selling |
| | `transaction_confirmations` | Unique (transaction, user) |
| | `disputes` | One open dispute per transaction |
| Trust | `reviews` | Unique (transaction, reviewer); 4 ratings + comment; `is_hidden` |
| | `reports` | Targets: listing/user/message/review/transaction; minimal evidence snapshot |
| Admin | `audit_logs`, `admin_actions` | Written only by server functions |

> The brief's `transaction_confirmations`, `swap_offer_items`, `swap_offer_events` names are used as specified. `swap_offers` also carries **purchase** offers (`offer_type = 'purchase'`, no items, buyer pays) so buying and swapping share one negotiation, acceptance and reservation engine. `listing_reservations`, `listing_moderation_events`, `listing_swap_brands`, `profile_contacts`, `countries`, `regions` and `app_settings` were added for integrity, privacy and configurability.

## Listing state machine

Two independent axes avoid contradictory states:

- `status` (seller intent/lifecycle): `draft → published ⇄ paused`; `draft|published|paused → archived`; `published|paused → sold` (sold outside platform); `published → reserved` (**only** by an accepted offer); `reserved → sold|swapped` (**only** by a completed transaction) or back to `published` (cancelled transaction).
- `moderation_status`: `not_submitted → pending_review → approved | rejected`; rejected → pending_review on resubmission; approved → pending_review when **material** fields or photos change (price, swap and location edits do not need re-review).

**Public** (direct URL) = approved and status ∈ {published, paused, reserved, sold, swapped}. **Offerable/searchable** = approved and published. Owners change status only via RPCs; reserved/sold/swapped/archived listings are locked against edits.

Optional policy: when `auto_approve_verified_sellers = true`, verified sellers' submissions are approved immediately and recorded as `auto_approved` in `listing_moderation_events` and `audit_logs`.

## Offer state machine (`swap_offers.status`)

| Status | Meaning | Transitions |
| --- | --- | --- |
| `pending` | Open; `awaiting_party` must respond. Shown as **Countered** when `current_version > 1` | → accepted (awaiting party), rejected (awaiting party), cancelled (initiator, or automatically when a listing involved becomes unavailable/reserved, or account suspended), expired (`expire_due_offers`) ; counter keeps it pending, increments version, flips `awaiting_party`, resets expiry |
| `accepted` | Terms agreed; transaction exists; listings reserved | → completed, disputed, cancelled (via transaction) |
| `disputed` | Transaction under review | → completed, cancelled, accepted (dispute dismissed) |
| `rejected`, `cancelled`, `expired`, `completed` | Terminal | — |

Acceptance and counters require `p_expected_version = current_version`, so nobody can accept terms that changed while they were reading them.

## Transaction rules

- `active` → `completed` **only** when both buyer and seller have confirmed.
- Either party may `cancel_transaction` (with a reason) **before any confirmation**; this releases reservations and republishes listings.
- After one confirmation, disagreements go through `open_dispute` (`disputed`); confirmation is blocked while disputed.
- **Incomplete confirmations:** after `confirm_by` (acceptance + `confirmation_window_days`, default 7) the UI suggests escalating as `other_party_unresponsive`. A single confirmation never completes a transaction; staff decide via `resolve_dispute` (complete / cancel / dismiss).
- Agreed terms are immutable (`transactions_guard` trigger rejects changes even from privileged roles); closed transactions cannot change state.

## View deduplication policy

One counted view per viewer per listing per UTC day. Signed-in viewers are keyed by user id; anonymous viewers by a random UUID cookie (`t5_vid`). The listing owner's views are not counted. Analytics label these as "unique viewers per day".

## Search

`search_listings` (security invoker, so RLS applies) combines a prefix `tsquery` (`simple` config, tokens sanitised to alphanumerics) over title/brand/model (A), variant/colour/storage/RAM (B), location (C) and description (D) with structured filters. "Recommended" ranking = `2 × ts_rank + weekly recency decay + 0.15 verified seller + 0.05 battery reported`. Results are capped at 48 per page and 5,000 offset. Typo tolerance (trigram similarity) is not implemented.

## Deletion behaviour

Profiles cascade from `auth.users`. History tables use `ON DELETE SET NULL` for people (reviews, events, audit logs, transactions keep their rows) and `RESTRICT` where losing history would corrupt integrity (`swap_offers.listing_id`, `swap_offer_items.listing_id`). Consequently a user who has negotiation history cannot be hard-deleted; anonymise or suspend instead (see IMPLEMENTATION_STATUS).

## Type generation

`npm run db:types` applies all migrations to PGlite and writes Supabase-format types to `src/lib/supabase/database.types.ts`. With a linked project you can alternatively run `npx supabase gen types typescript --linked`.
