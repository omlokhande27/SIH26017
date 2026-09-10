/**
 * Identity helpers for the row level security tests.
 *
 * PGlite connects as the `postgres` superuser, and PostgreSQL exempts both
 * superusers and table owners from row level security. Every RLS assertion
 * must therefore run inside `SET ROLE authenticated` (or `anon`), which is
 * what `actingAs` and `actingAsAnon` do. A policy test that forgets this would
 * pass unconditionally while proving nothing — so the suite routes all of them
 * through these helpers.
 */
import type { Db } from './db';

export type AppRole = 'ADMIN' | 'OFFICER' | 'ANALYST' | 'VIEWER';

/** Fixed UUIDs so tests can refer to identities by name. */
export const USERS = {
  admin: '00000000-0000-4000-8000-0000000000a1',
  officer: '00000000-0000-4000-8000-0000000000b1',
  officer2: '00000000-0000-4000-8000-0000000000b2',
  analyst: '00000000-0000-4000-8000-0000000000c1',
  viewer: '00000000-0000-4000-8000-0000000000d1',
} as const;

export type UserKey = keyof typeof USERS;

/**
 * Create an auth.users row and the matching public.profiles row.
 *
 * Runs as superuser, before any SET ROLE — seeding identities is setup, not
 * something under test.
 */
export async function createUser(
  db: Db,
  id: string,
  role: AppRole,
  fullName = `test ${role.toLowerCase()}`,
): Promise<void> {
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    id,
    `${id}@example.invalid`,
  ]);
  await db.query(
    `INSERT INTO public.profiles (id, full_name, role) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`,
    [id, fullName, role],
  );
}

/** Create the standard cast of four users used by most RLS tests. */
export async function createStandardUsers(db: Db): Promise<void> {
  await createUser(db, USERS.admin, 'ADMIN');
  await createUser(db, USERS.officer, 'OFFICER');
  await createUser(db, USERS.officer2, 'OFFICER');
  await createUser(db, USERS.analyst, 'ANALYST');
  await createUser(db, USERS.viewer, 'VIEWER');
}

/** Assign a user to a project (the mechanism OFFICER scoping is built on). */
export async function assignToProject(db: Db, userId: string, projectId: string): Promise<void> {
  await db.query(
    `INSERT INTO public.project_assignments (project_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [projectId, userId],
  );
}

/**
 * Run `fn` as a signed-in user: the `authenticated` Postgres role, with
 * auth.uid() resolving to `userId`.
 *
 * The role and the claim are reset afterwards even if `fn` throws, so one
 * failing assertion cannot leak an identity into the next test.
 */
export async function actingAs<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`SET request.jwt.claim.sub = '${userId}';`);
  await db.exec('SET ROLE authenticated;');
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);");
  }
}

/** Run `fn` as an unauthenticated visitor: the `anon` role, auth.uid() NULL. */
export async function actingAsAnon<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.exec("SELECT set_config('request.jwt.claim.sub', '', false);");
  await db.exec('SET ROLE anon;');
  try {
    return await fn();
  } finally {
    await db.exec('RESET ROLE;');
  }
}

/** Count rows visible to the current identity in `table`. */
export async function visibleCount(db: Db, table: string): Promise<number> {
  const res = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM public.${table}`);
  return res.rows[0]!.n;
}
