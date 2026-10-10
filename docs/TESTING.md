# Testing

| Layer | Location | Runs where | Command |
| --- | --- | --- | --- |
| Unit | `tests/unit` | Node | `npm run test:unit` |
| Database (RLS, RPCs, state machines, storage policies) | `tests/db` | In-process PostgreSQL (PGlite) — no network, no Docker | `npm run test:db` |
| Real-Postgres concurrency | `tests/integration` | A **test** Supabase project | `npm run test:integration` |
| End-to-end (browser) | `tests/e2e` | Running app + **test** Supabase project | `npm run test:e2e` |

`npm test` runs unit + database tests (integration tests skip themselves unless configured).

## How the database tests work

`tests/db/harness.ts` creates a fresh PGlite instance, installs stand-ins for Supabase's `anon`/`authenticated`/`service_role` roles, `auth.users`, `auth.uid()`, `storage.buckets/objects`, `storage.foldername()` and Supabase's default privileges, then applies **every** migration and the seed. Tests run queries inside transactions as `SET LOCAL ROLE authenticated` with `request.jwt.claim.sub` set — the same mechanism PostgREST uses — so RLS, column grants, triggers and `SECURITY DEFINER` RPCs behave as in production.

Coverage highlights: privilege escalation attempts, private contacts, listing ownership and state transitions, moderation visibility, storage path/ownership rules, search filters and injection-safe queries, favourites, view deduplication and scoped analytics, conversation privacy and idempotency, rate limiting, blocks, notifications, swap creation rules, cash consistency, counteroffer versioning and immutability, turn/version checks, expiry, reservation conflicts, confirmations, disputes, cancellations, reviews, reports, verification and suspension.

Limitation: PGlite is single-connection, so simultaneous requests are tested sequentially (the reservation primary key is also tested directly). `tests/integration/concurrency.test.ts` fires two acceptances in parallel against a real project.

## E2E setup

1. Create a separate Supabase **test** project, apply migrations and seed.
2. Disable "Confirm email" in the test project (or confirm the accounts manually).
3. Create three users through the app, complete their profiles, then make one an admin via SQL. Give the buyer one approved listing (needed to offer in a swap).
4. Run the app against the test project and set the `E2E_*` variables (see `.env.example`).
5. `npx playwright install chromium` once, then `npm run test:e2e`.

The journeys cover: listing creation with photo upload and moderation, discovery, save/unsave, messaging, swap offer with cash, counteroffer, acceptance, double confirmation, mutual reviews, unauthorised conversation access and reporting. Public checks (landing, search, protected redirects, 404s, no horizontal overflow at 360 px) need only `E2E_BASE_URL`.
