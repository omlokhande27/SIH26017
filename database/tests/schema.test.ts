/**
 * schema.test.ts — the schema applies, re-applies, and produces the structure
 * the documentation claims.
 *
 * The single most valuable test here is idempotency. `schema.sql` is pasted
 * into the Supabase SQL Editor by hand, and a half-applied run gets pasted
 * again. If re-running were not safe, the second paste would fail somewhere in
 * the middle and leave the database in an undefined state. An earlier version
 * of this file had exactly that class of bug: helper functions were declared
 * before `public.profiles` existed, so a fresh apply failed at CREATE time.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  createBareDb,
  createSchemaDb,
  DATABASE_DIR,
  SCHEMA_SQL,
  GRANTS_SQL,
  type Db,
} from './helpers/db';

/** The 14 tables the design is specified to contain. */
const EXPECTED_TABLES = [
  'actual_outcomes',
  'compensation',
  'land_acquisition',
  'legal_issues',
  'model_versions',
  'prediction_explanations',
  'predictions',
  'profiles',
  'project_assignments',
  'project_feature_snapshots',
  'projects',
  'recommendations',
  'risk_factor_types',
  'risk_factors',
];

describe('schema application', () => {
  it('applies cleanly to a fresh database', async () => {
    const db = await createBareDb();
    await expect(db.exec(SCHEMA_SQL)).resolves.toBeDefined();
    await db.close();
  });

  it('is idempotent — applying it a second time is safe', async () => {
    const db = await createBareDb();
    await db.exec(SCHEMA_SQL);
    await expect(db.exec(SCHEMA_SQL)).resolves.toBeDefined();

    // And a third time, since a "safe once more" bug can hide behind a
    // DROP ... CREATE pair that only balances on even-numbered runs.
    await expect(db.exec(SCHEMA_SQL)).resolves.toBeDefined();
    await db.close();
  });

  it('leaves the same table set after a re-apply', async () => {
    const db = await createBareDb();
    await db.exec(SCHEMA_SQL);
    const first = await tableNames(db);
    await db.exec(SCHEMA_SQL);
    const second = await tableNames(db);
    expect(second).toEqual(first);
    await db.close();
  });
});

describe('schema structure', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createSchemaDb();
  });

  afterAll(async () => {
    await db.close();
  });

  it('creates exactly the 14 documented tables', async () => {
    expect(await tableNames(db)).toEqual(EXPECTED_TABLES);
  });

  it('enables row level security on every table', async () => {
    const res = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `SELECT tablename, rowsecurity FROM pg_tables
       WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const withoutRls = res.rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    expect(withoutRls).toEqual([]);
    expect(res.rows).toHaveLength(EXPECTED_TABLES.length);
  });

  it('defines the three RLS helper functions as SECURITY DEFINER', async () => {
    // Without SECURITY DEFINER, the policy on `profiles` re-enters itself
    // through current_app_role() and recurses until PostgreSQL aborts. This is
    // the single most common way a Supabase RLS setup breaks.
    const res = await db.query<{ proname: string; prosecdef: boolean; config: string[] | null }>(
      `SELECT proname, prosecdef, proconfig AS config
       FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace
         AND proname IN ('current_app_role', 'is_admin', 'is_assigned_to_project')
       ORDER BY proname`,
    );
    expect(res.rows.map((r) => r.proname)).toEqual([
      'current_app_role',
      'is_admin',
      'is_assigned_to_project',
    ]);
    for (const fn of res.rows) {
      expect(fn.prosecdef, `${fn.proname} must be SECURITY DEFINER`).toBe(true);
      // A pinned search_path stops a caller redirecting the function to a
      // table of their own making.
      expect(fn.config?.join(','), `${fn.proname} must pin search_path`).toContain('search_path=');
    }
  });

  it('creates the documented updated_at triggers and no snapshot trigger', async () => {
    const res = await db.query<{ table_name: string }>(
      `SELECT c.relname AS table_name
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal AND t.tgname LIKE '%set_updated_at'
       ORDER BY c.relname`,
    );
    expect(res.rows.map((r) => r.table_name)).toEqual([
      'compensation',
      'land_acquisition',
      'legal_issues',
      'profiles',
      'projects',
      'risk_factors',
    ]);
  });

  it('does not put an updated_at column on the immutable snapshot table', async () => {
    // A mutable snapshot would defeat the entire point of freezing ML inputs.
    const res = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'project_feature_snapshots'
         AND column_name = 'updated_at'`,
    );
    expect(res.rows).toEqual([]);
  });

  it('creates the indexes that back the documented access paths', async () => {
    const res = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    );
    const names = res.rows.map((r) => r.indexname);
    for (const expected of [
      'idx_projects_state',
      'idx_projects_district',
      'idx_projects_status',
      'idx_predictions_project_created',
      'idx_snapshots_project_date',
      'idx_explanations_prediction_rank',
      'project_feature_snapshots_id_project_key',
      'model_versions_single_active',
    ]) {
      expect(names, `missing index ${expected}`).toContain(expected);
    }
  });

  it('allows at most one ACTIVE model version', async () => {
    // The partial unique index is what decides which model serves traffic;
    // two ACTIVE rows would make that ambiguous.
    await db.exec(GRANTS_SQL);
    await db.query(
      `INSERT INTO public.model_versions (version, algorithm, status)
       VALUES ('active-a', 'test', 'ACTIVE')`,
    );
    await expect(
      db.query(
        `INSERT INTO public.model_versions (version, algorithm, status)
         VALUES ('active-b', 'test', 'ACTIVE')`,
      ),
    ).rejects.toMatchObject({ code: '23505' });

    // Archived rows are unconstrained — only ACTIVE is limited to one.
    await expect(
      db.query(
        `INSERT INTO public.model_versions (version, algorithm, status)
         VALUES ('archived-a', 'test', 'ARCHIVED')`,
      ),
    ).resolves.toBeDefined();
    await db.query(`DELETE FROM public.model_versions WHERE version LIKE 'a%'`);
  });

  it('creates the documented number of RLS policies', async () => {
    // docs/DATABASE.md §9 states "all 14 tables, with 42 policies". Pinning
    // the count here keeps that claim honest: adding or removing a policy
    // fails this test until the documentation is updated to match.
    const res = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`,
    );
    expect(res.rows[0]!.n).toBe(42);
  });

  it('seeds the risk factor vocabulary without duplicating it on re-apply', async () => {
    // The vocabulary is a lookup table so new factor types are an INSERT
    // rather than a schema migration; re-running schema.sql must not multiply
    // the rows.
    const before = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM public.risk_factor_types`,
    );
    expect(before.rows[0]!.n).toBe(7);
    await db.exec(SCHEMA_SQL);
    const after = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM public.risk_factor_types`,
    );
    expect(after.rows[0]!.n).toBe(7);
  });
});

describe('migrations', () => {
  // schema.sql is the canonical baseline and already contains every migration.
  // Applying the numbered files on top of it must therefore CONVERGE rather
  // than fail — that is what makes a fresh install and a migrated install the
  // same database. It also means a syntax error in a migration is caught here
  // instead of in the Supabase SQL Editor.

  it('applies every numbered migration on top of the baseline', async () => {
    const db = await createBareDb();
    await db.exec(SCHEMA_SQL);

    const migrationsDir = join(DATABASE_DIR, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(files.length, 'expected at least one numbered migration').toBeGreaterThan(0);

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await expect(db.exec(sql), `migration ${file} failed`).resolves.toBeDefined();
    }
    await db.close();
  });

  it('leaves the prediction status rule in force after migrating', async () => {
    const db = await createBareDb();
    await db.exec(SCHEMA_SQL);
    const sql = readFileSync(
      join(DATABASE_DIR, 'migrations', '0002_prediction_result_matches_status.sql'),
      'utf8',
    );
    await db.exec(sql);

    const res = await db.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.predictions'::regclass
         AND conname = 'predictions_result_matches_status'`,
    );
    expect(res.rows).toHaveLength(1);

    // And it still bites.
    await db.query(
      `INSERT INTO public.projects (id, project_name, project_code, state, district, sector, implementing_agency)
       VALUES ('b1000000-0000-4000-8000-000000000001', 'M', 'MIG-1', 'S', 'D', 'ROAD', 'A')`,
    );
    await db.query(
      `INSERT INTO public.project_feature_snapshots (id, project_id)
       VALUES ('e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001')`,
    );
    await expect(
      db.query(
        `INSERT INTO public.predictions
           (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
         VALUES ('b1000000-0000-4000-8000-000000000001',
                 'e1000000-0000-4000-8000-000000000001', 0, 'LOW', 'FAILED')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await db.close();
  });
});

async function tableNames(db: Db): Promise<string[]> {
  const res = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return res.rows.map((r) => r.table_name);
}
