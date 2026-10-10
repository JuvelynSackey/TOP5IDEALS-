# Project audit

_Audit date: 2026-10-10 (start of the build)._

## Starting state

The repository directory (`TOP5`) was **empty**: no source code, no `package.json`, no migrations, no environment files and no git history. There was therefore no existing functionality to preserve and no prior architecture to reconcile with. The project was initialised from scratch on the stack required by the product brief.

| Area | Finding at start |
| --- | --- |
| Framework / dependencies | None present |
| Routing / UI | None |
| Database / migrations | None; no Supabase project linked |
| Authentication | None |
| Deployment config | None |
| Environment variables | None defined; no secrets present |
| Tooling available | Node 24, npm 11, git. **Not available:** Docker, Supabase CLI binary, `psql` |

## Most important risks identified

1. **No live Supabase project or Docker.** Migrations, RLS policies and RPCs could not be run against hosted Supabase. *Mitigation:* every migration is applied to an in-process PostgreSQL (PGlite, Postgres 18) with faithful stand-ins for Supabase's `auth`/`storage` schemas and default role grants, and 74 database tests exercise RLS, grants, RPCs and state machines as the real `authenticated`/`anon` roles. Hosted verification remains an external step.
2. **Transaction integrity** (double-selling, ambiguous cash differences, rewritten negotiation history). *Mitigation:* all state changes live in `SECURITY DEFINER` functions with row locks, a primary-key reservation table, append-only history and immutable agreed terms.
3. **Authorisation drift between UI and backend.** *Mitigation:* the browser only ever holds the publishable key; there is no service-role key in the application. RLS + column privileges + RPC checks are the source of truth; UI state mirrors are unit-tested separately.
4. **True concurrency cannot be simulated in a single-connection database.** *Mitigation:* locking + unique constraints are tested sequentially; a real-Postgres concurrency test is provided for a test project (`tests/integration`).
5. **Incomplete product brief at first** (the first message contained only the tail of the brief). Resolved when the full brief was supplied.

## Implementation sequence followed

1. Foundation migrations → identity/roles → catalogue → notifications → listings → messaging → offers/transactions → trust/admin → storage/realtime/grants.
2. PGlite harness + database tests, type generation from the schema.
3. Next.js shell, design tokens, Supabase SSR clients, proxy (session refresh + route protection).
4. Auth, profiles, search/discovery, listing detail, sell wizard with uploads.
5. Messaging (Realtime), offers/counteroffers, transactions, disputes, reviews.
6. Notifications, storefronts, verification, analytics, administration.
7. SEO (metadata, sitemap, robots, OG), accessibility pass, lint/type/test/build, documentation.
