/**
 * Database test harness.
 *
 * Runs every migration in supabase/migrations against an in-process PostgreSQL
 * (PGlite, Postgres compiled to WASM) after installing minimal stand-ins for the
 * Supabase-managed `auth` and `storage` schemas plus Supabase's default role
 * grants. Queries can then be executed as a specific user through the same
 * `authenticated` role and `auth.uid()` mechanism PostgREST uses, so RLS policies,
 * column privileges and SECURITY DEFINER RPCs are exercised for real.
 *
 * Limitation: PGlite is single-connection, so true parallel transactions cannot
 * be simulated. Concurrency guarantees (row locks + unique constraints) are
 * exercised sequentially here and documented in docs/SECURITY.md.
 */
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const SUPABASE_STUBS = /* sql */ `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text unique,
    raw_user_meta_data jsonb not null default '{}',
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    owner_id text,
    metadata jsonb,
    created_at timestamptz default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;

  -- pg_net stand-in: records outgoing requests; tests insert responses.
  create schema net;
  create table net._test_requests (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb);
  create table net._http_response (id bigint primary key, status_code integer, content text, error_msg text, timed_out boolean default false, created timestamptz default now());
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
  returns bigint language sql as $$
    insert into net._test_requests (url, body, headers) values (url, body, headers) returning id
  $$;

  -- Supabase Vault stand-in.
  create schema vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Db = PGlite;

export async function createTestDb(options: { seed?: boolean } = {}): Promise<Db> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = join(ROOT, "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  if (options.seed !== false) {
    await db.exec(readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8"));
  }
  return db;
}

type Executor = Pick<Transaction, "query" | "exec">;

/** Run `fn` inside a transaction as the given user (or anon when uid is null). */
export async function as<T>(db: Db, uid: string | null, fn: (tx: Executor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    return fn(tx);
  });
}

/** Convenience: run a single query as a user and return rows. */
export async function q<R = Record<string, unknown>>(
  db: Db,
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return as(db, uid, async (tx) => (await tx.query<R>(sql, params)).rows);
}

/** Expect a query to fail; returns the error message (the business error code). */
export async function fails(db: Db, uid: string | null, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await q(db, uid, sql, params);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`Expected query to fail but it succeeded: ${sql}`);
}

export interface TestUser {
  id: string;
  username: string;
}

/** Create an auth user (via the signup trigger) with an optionally completed profile. */
export async function createUser(
  db: Db,
  name: string,
  opts: { complete?: boolean; role?: "user" | "moderator" | "admin"; business?: boolean } = {},
): Promise<TestUser> {
  const id = randomUUID();
  const username = `${name.toLowerCase()}_${id.slice(0, 6)}`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${username}@example.test`,
    JSON.stringify({ full_name: name, account_type: opts.business ? "business" : "individual" }),
  ]);
  if (opts.complete !== false) {
    await db.query(
      `update public.profiles set username = $2, region_id = (select id from public.regions where slug = 'greater-accra'), city = 'Accra' where id = $1`,
      [id, username],
    );
  }
  if (opts.role && opts.role !== "user") {
    await db.query(`update public.profiles set role = $2 where id = $1`, [id, opts.role]);
  }
  return { id, username };
}

/** Insert a storage object as if the user uploaded it (bypassing storage API). */
export async function putObject(db: Db, bucket: string, path: string, owner: string): Promise<void> {
  await db.query(`insert into storage.objects (bucket_id, name, owner, owner_id) values ($1, $2, $3::uuid, ($3::uuid)::text)`, [
    bucket,
    path,
    owner,
  ]);
}

export async function brandModel(db: Db, modelSlug: string): Promise<{ brandId: number; modelId: number }> {
  const res = await db.query<{ brand_id: number; id: number }>(`select id, brand_id from public.phone_models where slug = $1`, [
    modelSlug,
  ]);
  const row = res.rows[0];
  if (!row) throw new Error(`Unknown model ${modelSlug}`);
  return { brandId: row.brand_id, modelId: row.id };
}
