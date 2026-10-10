# Top5Ideals

**Buy. Sell. Swap. Upgrade.** A Ghana-focused marketplace for mobile phones where swapping is a first-class, fully tracked transaction — not just a label on a listing.

- Next.js 16 (App Router, Server Components, Server Actions) · TypeScript (strict)
- Supabase: Postgres + Row Level Security, Auth, Storage, Realtime
- Tailwind CSS 4 + shadcn-style components on Radix · Lucide · Framer Motion (sparingly)
- Zod + React Hook Form · Vitest (unit + PGlite database tests) · Playwright (E2E)

## Quick start

```bash
npm install
cp .env.example .env.local            # fill in your Supabase URL + publishable key
npx supabase link --project-ref <ref> # or `npx supabase start` for a local stack (Docker)
npx supabase db push                  # applies supabase/migrations in order
psql "$DATABASE_URL" -f supabase/seed.sql   # catalogue (idempotent); local stack seeds automatically
npm run dev
```

Then make yourself an administrator (SQL editor):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript rules) |
| `npm test` | Unit tests + database tests (all migrations applied to in-process Postgres) |
| `npm run test:e2e` | Playwright browser tests (needs a running app + test Supabase project) |
| `npm run test:integration` | Real-Postgres concurrency test (needs a test Supabase project) |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` from the migrations |

## Documentation

- [docs/PROJECT_AUDIT.md](docs/PROJECT_AUDIT.md) — starting state, risks, sequence
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data flow, conventions
- [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) — tables, state machines, money units
- [docs/SECURITY.md](docs/SECURITY.md) — RLS, storage, authorisation, threat notes
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Supabase + Vercel setup, rollback
- [docs/TESTING.md](docs/TESTING.md) — test layers and how to run them
- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) — what is done, tested, partial or blocked
