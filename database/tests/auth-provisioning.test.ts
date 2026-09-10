/**
 * auth-provisioning.test.ts — every authenticated user gets a profile, and
 * nobody can choose their own role while getting one.
 *
 * The backend resolves authorization from `public.profiles` and fails closed
 * when the row is absent, so without this trigger a user who signed up
 * successfully would be refused by every endpoint. That is the availability
 * half of what is tested here.
 *
 * The security half matters more. `raw_user_meta_data` is whatever the client
 * sent to the signup call, and the user can rewrite it afterwards through
 * `auth.updateUser()`. If the trigger read the role from there — even "just as
 * a default" — signing up would be a self-service route to ADMIN. The role is
 * a hard-coded literal, and these tests attack that from several directions.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSchemaDb, one, rows, type Db } from './helpers/db';

let db: Db;

beforeEach(async () => {
  db = await createSchemaDb();
});

afterEach(async () => {
  await db.close();
});

/** Create an auth user the way Supabase Auth would, with signup metadata. */
async function signUp(
  id: string,
  email: string,
  metadata: Record<string, unknown> | null = null,
): Promise<void> {
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
    [id, email, metadata === null ? null : JSON.stringify(metadata)],
  );
}

const USER_A = '10000000-0000-4000-8000-000000000001';
const USER_B = '10000000-0000-4000-8000-000000000002';

describe('automatic provisioning', () => {
  it('creates a profile row for a new auth user', async () => {
    await signUp(USER_A, 'new@example.invalid');

    const profile = await one<{ id: string; role: string }>(
      db,
      `SELECT id, role FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(profile.id).toBe(USER_A);
  });

  it('assigns the least-privileged role', async () => {
    await signUp(USER_A, 'new@example.invalid');

    const profile = await one<{ role: string }>(
      db,
      `SELECT role FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(profile.role).toBe('VIEWER');
  });

  it('copies full_name from signup metadata, which carries no privilege', async () => {
    await signUp(USER_A, 'new@example.invalid', { full_name: 'Asha Verma' });

    const profile = await one<{ full_name: string }>(
      db,
      `SELECT full_name FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(profile.full_name).toBe('Asha Verma');
  });

  it('handles a user with no metadata at all', async () => {
    await signUp(USER_A, 'bare@example.invalid', null);

    const profile = await one<{ role: string; full_name: string | null }>(
      db,
      `SELECT role, full_name FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(profile.role).toBe('VIEWER');
    expect(profile.full_name).toBeNull();
  });

  it('normalises a blank full_name to NULL rather than an empty string', async () => {
    await signUp(USER_A, 'blank@example.invalid', { full_name: '   ' });

    const profile = await one<{ full_name: string | null }>(
      db,
      `SELECT full_name FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(profile.full_name).toBeNull();
  });

  it('caps an oversized full_name instead of rejecting the signup', async () => {
    await signUp(USER_A, 'long@example.invalid', { full_name: 'x'.repeat(5000) });

    const profile = await one<{ len: number }>(
      db,
      `SELECT LENGTH(full_name)::int AS len FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(profile.len).toBe(200);
  });

  it('provisions each user independently', async () => {
    await signUp(USER_A, 'a@example.invalid');
    await signUp(USER_B, 'b@example.invalid');

    const all = await rows<{ id: string; role: string }>(
      db,
      `SELECT id, role FROM public.profiles ORDER BY id`,
    );
    expect(all).toHaveLength(2);
    expect(all.every((r) => r.role === 'VIEWER')).toBe(true);
  });
});

describe('a user cannot choose their own role at signup', () => {
  it('IGNORES a role claim in signup metadata', async () => {
    // The attack: sign up with { data: { role: 'ADMIN' } }. Supabase stores
    // that verbatim in raw_user_meta_data. The trigger must not read it.
    await signUp(USER_A, 'attacker@example.invalid', {
      full_name: 'Attacker',
      role: 'ADMIN',
    });

    const profile = await one<{ role: string }>(
      db,
      `SELECT role FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(profile.role).toBe('VIEWER');
    expect(profile.role).not.toBe('ADMIN');
  });

  it.each([
    ['lowercase', { role: 'admin' }],
    ['app_role key', { app_role: 'ADMIN' }],
    ['nested', { profile: { role: 'ADMIN' } }],
    ['array of roles', { roles: ['ADMIN', 'OFFICER'] }],
    ['boolean flag', { is_admin: true }],
    ['officer', { role: 'OFFICER' }],
    ['analyst', { role: 'ANALYST' }],
  ])('ignores a role smuggled as %s', async (_label, metadata) => {
    await signUp(USER_A, 'attacker@example.invalid', metadata);

    const profile = await one<{ role: string }>(
      db,
      `SELECT role FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(profile.role).toBe('VIEWER');
  });

  it('still assigns VIEWER when metadata claims every privilege at once', async () => {
    await signUp(USER_A, 'attacker@example.invalid', {
      role: 'ADMIN',
      app_role: 'ADMIN',
      roles: ['ADMIN'],
      is_admin: true,
      is_superuser: true,
      full_name: 'Attacker',
    });

    const profile = await one<{ role: string; full_name: string }>(
      db,
      `SELECT role, full_name FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    // full_name is honoured because it grants nothing; role is not.
    expect(profile.full_name).toBe('Attacker');
    expect(profile.role).toBe('VIEWER');
  });
});

describe('idempotency and existing rows', () => {
  it('never downgrades an existing profile', async () => {
    // A promoted user must not be reset to VIEWER by a re-run or a replayed
    // insert. ON CONFLICT DO NOTHING is what guarantees this.
    await signUp(USER_A, 'promoted@example.invalid');
    await db.query(`UPDATE public.profiles SET role = 'ADMIN' WHERE id = $1`, [USER_A]);

    // Simulate the row being re-inserted (backfill, replay, re-applied migration).
    await db.query(
      `INSERT INTO public.profiles (id, full_name, role) VALUES ($1, 'x', 'VIEWER')
       ON CONFLICT (id) DO NOTHING`,
      [USER_A],
    );

    const profile = await one<{ role: string }>(
      db,
      `SELECT role FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(profile.role).toBe('ADMIN');
  });

  it('creates exactly one profile per user', async () => {
    await signUp(USER_A, 'once@example.invalid');

    const count = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(count.n).toBe(1);
  });

  it('removes the profile when the auth user is deleted', async () => {
    // profiles.id references auth.users ON DELETE CASCADE.
    await signUp(USER_A, 'gone@example.invalid');
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [USER_A]);

    const count = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.profiles WHERE id = $1`,
      [USER_A],
    );
    expect(count.n).toBe(0);
  });
});

describe('trigger definition', () => {
  it('is attached to auth.users as an AFTER INSERT row trigger', async () => {
    const trigger = await one<{ tgname: string; timing: number }>(
      db,
      `SELECT t.tgname, t.tgtype::int AS timing
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'auth' AND c.relname = 'users'
         AND t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal`,
    );
    expect(trigger.tgname).toBe('on_auth_user_created');
    // tgtype bit 0 = ROW level, bit 2 = INSERT. BEFORE would set bit 1.
    expect(trigger.timing & 1).toBe(1); // row-level
    expect(trigger.timing & 4).toBe(4); // fires on INSERT
    expect(trigger.timing & 2).toBe(0); // AFTER, not BEFORE
  });

  it('runs as SECURITY DEFINER with a pinned search_path', async () => {
    // The function writes to public.profiles, which is under RLS, and runs in
    // the context of a signup rather than an application session.
    const fn = await one<{ prosecdef: boolean; config: string[] | null }>(
      db,
      `SELECT prosecdef, proconfig AS config FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname = 'handle_new_auth_user'`,
    );
    expect(fn.prosecdef).toBe(true);
    expect(fn.config?.join(',')).toContain('search_path=');
  });

  it('does not read any role value from raw_user_meta_data', async () => {
    // A source-level assertion to back the behavioural ones: the function body
    // must not reference a role key in the metadata at all. This catches a
    // future edit that reintroduces the pattern with tests still green
    // because no test happened to exercise that exact key.
    const fn = await one<{ src: string }>(
      db,
      `SELECT prosrc AS src FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname = 'handle_new_auth_user'`,
    );
    // SQL line comments are stripped first. The function documents the rule in
    // a comment that names the very pattern being forbidden, and matching that
    // would be a false positive — the assertion is about executable code.
    const executable = fn.src
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
      .toLowerCase();

    expect(executable).toContain('raw_user_meta_data');
    expect(executable).toContain("'full_name'");
    expect(executable).not.toMatch(/raw_user_meta_data\s*->>\s*'[^']*role[^']*'/);
    // The role must appear as a bare literal.
    expect(executable).toContain("'viewer'");
  });
});
