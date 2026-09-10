/**
 * Shared PGlite fixture for the LandGuard AI database regression suite.
 *
 * PGlite is a real PostgreSQL engine compiled to WebAssembly — the same
 * planner, the same constraint machinery, the same SQLSTATE codes. Generated
 * columns, CHECK constraints, foreign keys, triggers and row level security
 * all behave exactly as they do on a server, which is why the suite runs
 * against it instead of a mock: a hand-written fake would happily accept SQL
 * that Supabase rejects, and the point of these tests is to catch precisely
 * that.
 *
 * It requires no locally installed PostgreSQL, no Docker and no network.
 * Every test file builds its own in-memory database, so files are isolated
 * and can run in parallel.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path of the `database/` directory. */
export const DATABASE_DIR = join(HERE, '..', '..');

/** The canonical schema, read verbatim from the file that ships. */
export const SCHEMA_SQL = readFileSync(join(DATABASE_DIR, 'schema.sql'), 'utf8');

/** The demo seed, read verbatim from the file that ships. */
export const SEED_SQL = readFileSync(join(DATABASE_DIR, 'seed.sql'), 'utf8');

/**
 * Supabase platform objects that `schema.sql` depends on but does not create,
 * because on a real project Supabase Auth owns them.
 *
 * This shim is the ONLY thing the suite adds on top of the shipped files. It
 * reproduces the contract `schema.sql` relies on, and nothing more:
 *
 *   auth.users      the table `public.profiles.id` references
 *   auth.uid()      the caller's user id — same signature and return type as
 *                   Supabase's, but resolved from a session setting rather
 *                   than from a JWT, so tests can switch identity
 *   authenticated   the Postgres role Supabase gives a signed-in user
 *   anon            the Postgres role Supabase gives an anonymous one
 *
 * Keeping the shim here rather than in `schema.sql` matters: the file under
 * test stays byte-for-byte the file pasted into the Supabase SQL Editor.
 */
export const SUPABASE_SHIM_SQL = `
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id    UUID PRIMARY KEY,
  email TEXT UNIQUE
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $shim$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$shim$;

DO $shim$
BEGIN
  CREATE ROLE authenticated;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$shim$;

DO $shim$
BEGIN
  CREATE ROLE anon;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$shim$;

GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
`;

/**
 * Table-level GRANTs.
 *
 * RLS narrows what a role may reach; it does not by itself grant table
 * access. Supabase issues these GRANTs during project setup, so the harness
 * must too — otherwise every policy test would fail with "permission denied"
 * and prove nothing about the policies.
 *
 * This deliberately grants MORE than the policies allow (write on every table
 * to `authenticated`). Removing GRANTs as a confounder means anything the RLS
 * tests observe being blocked was blocked by a policy, not by a missing GRANT.
 */
export const GRANTS_SQL = `
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
`;

export type Db = PGlite;

/** A fresh in-memory database with the Supabase shim applied and no schema. */
export async function createBareDb(): Promise<Db> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_SHIM_SQL);
  return db;
}

/** A fresh database with the shim plus the full canonical schema. */
export async function createSchemaDb(): Promise<Db> {
  const db = await createBareDb();
  await db.exec(SCHEMA_SQL);
  await db.exec(GRANTS_SQL);
  return db;
}

/** A fresh database with schema plus PART A of the demo seed. */
export async function createSeededDb(): Promise<Db> {
  const db = await createSchemaDb();
  await db.exec(SEED_SQL);
  return db;
}

/** The shape of a PostgreSQL error as surfaced by PGlite. */
export interface SqlError {
  code: string;
  message: string;
  constraint?: string;
}

/**
 * Run a statement that is expected to fail, and return the PostgreSQL error.
 *
 * Throws if the statement unexpectedly SUCCEEDS — a negative test that stops
 * detecting anything must fail loudly rather than pass quietly.
 *
 * Assertions are made on `code` (the five-character SQLSTATE) and
 * `constraint` (the constraint's name) rather than on message text, so they
 * survive PostgreSQL version and locale changes.
 */
export async function expectSqlError(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<SqlError> {
  try {
    await db.query(sql, params);
  } catch (err) {
    const e = err as Partial<SqlError>;
    return {
      code: e.code ?? 'UNKNOWN',
      message: e.message ?? String(err),
      constraint: e.constraint,
    };
  }
  throw new Error(`Expected this statement to be rejected, but it succeeded:\n${sql}`);
}

/** Convenience: run a query and return its rows. */
export async function rows<T = Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await db.query<T>(sql, params);
  return result.rows;
}

/** Convenience: run a query expected to return exactly one row. */
export async function one<T = Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const r = await rows<T>(db, sql, params);
  if (r.length !== 1) {
    throw new Error(`Expected exactly 1 row, got ${r.length}:\n${sql}`);
  }
  return r[0]!;
}

/** SQLSTATE codes asserted throughout the suite. */
export const SQLSTATE = {
  NOT_NULL_VIOLATION: '23502',
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  GENERATED_ALWAYS: '428C9',
  INSUFFICIENT_PRIVILEGE: '42501',
} as const;
