/**
 * leakage.test.ts — the structural defences against training on the answer.
 *
 * Data leakage is the failure mode that produces a model with excellent
 * offline metrics and no real predictive power. It is also silent: nothing
 * crashes, the numbers just look good. The schema fights it structurally
 * rather than by convention, and these tests check the structure holds.
 *
 * Four defences, tested here in order:
 *
 *   1. Physical separation — the target lives in `actual_outcomes`, never in
 *      the feature table, so a training query must JOIN to reach it.
 *   2. A column boundary — an automated audit that fails if an
 *      outcome-shaped column ever appears on the snapshot table.
 *   3. A temporal guard — an outcome cannot predate the features it labels.
 *   4. Cross-project protection — a composite FK makes it impossible to
 *      attach a snapshot to the wrong project.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSchemaDb, expectSqlError, rows, one, SQLSTATE, type Db } from './helpers/db';
import { createProject, createSnapshot } from './helpers/fixtures';

let db: Db;

beforeEach(async () => {
  db = await createSchemaDb();
});

afterEach(async () => {
  await db.close();
});

describe('physical separation of features from the target', () => {
  it('keeps the target out of the feature table entirely', async () => {
    const snapshotColumns = (
      await rows<{ column_name: string }>(
        db,
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_feature_snapshots'`,
      )
    ).map((r) => r.column_name);

    // The label column exists on actual_outcomes and must exist nowhere else.
    expect(snapshotColumns).not.toContain('actual_delay_days');

    const outcomeColumns = (
      await rows<{ column_name: string }>(
        db,
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'actual_outcomes'`,
      )
    ).map((r) => r.column_name);
    expect(outcomeColumns).toContain('actual_delay_days');
  });

  it('audits the snapshot table for outcome-shaped columns', async () => {
    // A guard against future edits, not against the current file. If someone
    // adds `delay_days_target` to the snapshot table for convenience, this
    // fails on the next run rather than six months later in production.
    const forbiddenPatterns = [
      /^actual_/,
      /target$/,
      /^delay_(days|months)$/,
      /^outcome/,
      /completion_date$/,
      /overrun/,
      /_label$/,
    ];

    const snapshotColumns = (
      await rows<{ column_name: string }>(
        db,
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_feature_snapshots'`,
      )
    ).map((r) => r.column_name);

    const violations = snapshotColumns.filter((c) => forbiddenPatterns.some((p) => p.test(c)));
    expect(
      violations,
      `These columns look like outcome data on the feature table. Ground truth belongs in actual_outcomes.`,
    ).toEqual([]);
  });

  it('keeps elapsed-time features, which are inputs rather than targets', async () => {
    // notification_delay_days and award_delay_days measure delay ALREADY
    // OBSERVED at snapshot_date. They are legitimate inputs, and the audit
    // above must not be so broad that it forbids them.
    const snapshotColumns = (
      await rows<{ column_name: string }>(
        db,
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_feature_snapshots'`,
      )
    ).map((r) => r.column_name);
    expect(snapshotColumns).toContain('notification_delay_days');
    expect(snapshotColumns).toContain('award_delay_days');
  });

  it('rejects a negative elapsed-time feature', async () => {
    // Negative elapsed time would mean the measurement ran against a future
    // date — the exact shape of an accidental forward-looking feature.
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.project_feature_snapshots
         (project_id, notification_delay_days) VALUES ($1, -10)`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('requires an explicit JOIN to pair features with their label', async () => {
    // Demonstrates the design intent: SELECT * on the feature table cannot
    // pull in the target, so a training query has to reach for it on purpose.
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId, '2023-01-01 00:00:00+00');
    await db.query(
      `INSERT INTO public.actual_outcomes
         (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
       VALUES ($1, $2, 121, '2024-06-01')`,
      [projectId, snapshotId],
    );

    const featureOnly = await one(
      db,
      `SELECT * FROM public.project_feature_snapshots WHERE id = $1`,
      [snapshotId],
    );
    expect(Object.keys(featureOnly)).not.toContain('actual_delay_days');

    const joined = await one<{ actual_delay_days: string }>(
      db,
      `SELECT o.actual_delay_days::text AS actual_delay_days
       FROM public.project_feature_snapshots s
       JOIN public.actual_outcomes o ON o.feature_snapshot_id = s.id
       WHERE s.id = $1`,
      [snapshotId],
    );
    expect(Number(joined.actual_delay_days)).toBe(121);
  });
});

describe('temporal guard: an outcome cannot predate its features', () => {
  it('accepts an outcome observed after the snapshot', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId, '2023-06-01 00:00:00+00');
    await expect(
      db.query(
        `INSERT INTO public.actual_outcomes
           (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
         VALUES ($1, $2, 90, '2024-09-30')`,
        [projectId, snapshotId],
      ),
    ).resolves.toBeDefined();
  });

  it('accepts an outcome observed on the same day as the snapshot', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId, '2023-06-01 00:00:00+00');
    await expect(
      db.query(
        `INSERT INTO public.actual_outcomes
           (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
         VALUES ($1, $2, 0, '2023-06-01')`,
        [projectId, snapshotId],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an outcome dated before the snapshot it labels', async () => {
    // This is leakage in its purest form: a label drawn from before the
    // features were frozen describes a future the model was never shown.
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId, '2023-06-01 00:00:00+00');
    const err = await expectSqlError(
      db,
      `INSERT INTO public.actual_outcomes
         (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
       VALUES ($1, $2, 90, '2022-01-01')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(err.message).toMatch(/leakage/i);
  });

  it('enforces the guard on UPDATE as well as INSERT', async () => {
    // Backdating an existing outcome is the same violation by another route.
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId, '2023-06-01 00:00:00+00');
    await db.query(
      `INSERT INTO public.actual_outcomes
         (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
       VALUES ($1, $2, 90, '2024-09-30')`,
      [projectId, snapshotId],
    );
    const err = await expectSqlError(
      db,
      `UPDATE public.actual_outcomes SET outcome_date = '2022-01-01'
       WHERE feature_snapshot_id = $1`,
      [snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('allows only one ground-truth label per snapshot', async () => {
    // Two labels for one set of features would make the training set
    // internally contradictory.
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId, '2023-06-01 00:00:00+00');
    await db.query(
      `INSERT INTO public.actual_outcomes
         (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
       VALUES ($1, $2, 90, '2024-09-30')`,
      [projectId, snapshotId],
    );
    const err = await expectSqlError(
      db,
      `INSERT INTO public.actual_outcomes
         (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
       VALUES ($1, $2, 200, '2024-10-30')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.UNIQUE_VIOLATION);
  });

  it('rejects a negative actual_delay_days', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId, '2023-06-01 00:00:00+00');
    const err = await expectSqlError(
      db,
      `INSERT INTO public.actual_outcomes
         (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
       VALUES ($1, $2, -30, '2024-09-30')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });
});

describe('cross-project contamination', () => {
  // The composite FK (feature_snapshot_id, project_id) references
  // project_feature_snapshots (id, project_id). Attaching project A's
  // prediction to project B's snapshot is not "discouraged" — it is
  // unrepresentable.

  it('rejects a prediction whose snapshot belongs to another project', async () => {
    const projectA = await createProject(db);
    const projectB = await createProject(db);
    const snapshotB = await createSnapshot(db, projectB);

    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, 100, 'HIGH', 'SUCCESS')`,
      [projectA, snapshotB],
    );
    expect(err.code).toBe(SQLSTATE.FOREIGN_KEY_VIOLATION);
    expect(err.constraint).toBe('predictions_snapshot_matches_project');
  });

  it('accepts a prediction whose snapshot belongs to the same project', async () => {
    const projectA = await createProject(db);
    const snapshotA = await createSnapshot(db, projectA);
    await expect(
      db.query(
        `INSERT INTO public.predictions
           (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
         VALUES ($1, $2, 100, 'HIGH', 'SUCCESS')`,
        [projectA, snapshotA],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an outcome whose snapshot belongs to another project', async () => {
    const projectA = await createProject(db);
    const projectB = await createProject(db);
    const snapshotB = await createSnapshot(db, projectB);

    const err = await expectSqlError(
      db,
      `INSERT INTO public.actual_outcomes
         (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
       VALUES ($1, $2, 100, '2026-01-01')`,
      [projectA, snapshotB],
    );
    expect(err.code).toBe(SQLSTATE.FOREIGN_KEY_VIOLATION);
    expect(err.constraint).toBe('actual_outcomes_snapshot_matches_project');
  });

  it('rejects repointing an existing prediction at another project', async () => {
    // The guard has to hold on UPDATE too, or it is only a guard at creation.
    const projectA = await createProject(db);
    const projectB = await createProject(db);
    const snapshotA = await createSnapshot(db, projectA);
    const snapshotB = await createSnapshot(db, projectB);
    const inserted = await one<{ id: string }>(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, 100, 'HIGH', 'SUCCESS') RETURNING id`,
      [projectA, snapshotA],
    );

    const err = await expectSqlError(
      db,
      `UPDATE public.predictions SET feature_snapshot_id = $1 WHERE id = $2`,
      [snapshotB, inserted.id],
    );
    expect(err.code).toBe(SQLSTATE.FOREIGN_KEY_VIOLATION);
  });

  it('backs the composite FK with the unique index it requires', async () => {
    const res = await rows<{ indexname: string }>(
      db,
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = 'project_feature_snapshots_id_project_key'`,
    );
    expect(res).toHaveLength(1);
  });
});

describe('snapshot immutability (structural)', () => {
  it('carries no updated_at column and no updated_at trigger', async () => {
    // A snapshot that can be revised is not a snapshot. The policy half of
    // this (no UPDATE policy for any role) is covered in rls.test.ts.
    const cols = await rows(
      db,
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'project_feature_snapshots'
         AND column_name = 'updated_at'`,
    );
    expect(cols).toEqual([]);

    const triggers = await rows(
      db,
      `SELECT t.tgname FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       WHERE c.relname = 'project_feature_snapshots' AND NOT t.tgisinternal`,
    );
    expect(triggers).toEqual([]);
  });

  it('grants no UPDATE policy on snapshots to any role', async () => {
    const policies = await rows<{ policyname: string; cmd: string }>(
      db,
      `SELECT policyname, cmd FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'project_feature_snapshots'
       ORDER BY policyname`,
    );
    // ALL covers UPDATE, and ADMIN legitimately holds it. No policy may grant
    // UPDATE to a non-admin role.
    const updatePolicies = policies.filter((p) => p.cmd === 'UPDATE');
    expect(updatePolicies).toEqual([]);
  });
});

describe('snapshot internal consistency', () => {
  it('rejects a litigation flag with no recorded court case', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.project_feature_snapshots
         (project_id, litigation_flag, court_cases_count) VALUES ($1, TRUE, 0)`,
      [projectId],
    );
    expect(err.constraint).toBe('snapshot_litigation_matches_case_count');
  });

  it('rejects a court case with no litigation flag', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.project_feature_snapshots
         (project_id, litigation_flag, court_cases_count) VALUES ($1, FALSE, 2)`,
      [projectId],
    );
    expect(err.constraint).toBe('snapshot_litigation_matches_case_count');
  });

  it('rejects pending R&R on a project where R&R was never required', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.project_feature_snapshots
         (project_id, r_and_r_required, r_and_r_pending) VALUES ($1, FALSE, TRUE)`,
      [projectId],
    );
    expect(err.constraint).toBe('snapshot_rr_pending_requires_rr');
  });

  it('rejects a snapshot showing more land acquired than required', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.project_feature_snapshots
         (project_id, land_required_ha, land_acquired_ha) VALUES ($1, 100, 150)`,
      [projectId],
    );
    expect(err.constraint).toBe('snapshot_acquired_not_over_required');
  });
});
