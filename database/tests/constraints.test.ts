/**
 * constraints.test.ts — the database rejects invalid data on its own.
 *
 * Everything asserted here is enforced by PostgreSQL, not by the application.
 * That is the point: these rules also hold for direct SQL, admin edits in the
 * Supabase table editor, and any future service that writes to this database.
 * A rule enforced only in the Node layer holds for exactly one caller.
 *
 * Negative assertions go through `expectSqlError`, which throws if the
 * statement unexpectedly succeeds — a guard that stops working must fail
 * loudly rather than pass quietly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSchemaDb, expectSqlError, one, SQLSTATE, type Db } from './helpers/db';
import {
  createProject,
  createSnapshot,
  createPrediction,
  createPredictionChain,
} from './helpers/fixtures';

let db: Db;

beforeEach(async () => {
  db = await createSchemaDb();
});

afterEach(async () => {
  await db.close();
});

describe('generated columns', () => {
  it('computes land_acquisition_percentage from its inputs', async () => {
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.land_acquisition (project_id, land_required_ha, land_acquired_ha)
       VALUES ($1, 200, 50)`,
      [projectId],
    );
    const row = await one<{ pct: string }>(
      db,
      `SELECT land_acquisition_percentage::text AS pct FROM public.land_acquisition
       WHERE project_id = $1`,
      [projectId],
    );
    expect(Number(row.pct)).toBeCloseTo(25, 4);
  });

  it('recomputes the percentage when an input changes', async () => {
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.land_acquisition (project_id, land_required_ha, land_acquired_ha)
       VALUES ($1, 200, 50)`,
      [projectId],
    );
    await db.query(
      `UPDATE public.land_acquisition SET land_acquired_ha = 150 WHERE project_id = $1`,
      [projectId],
    );
    const row = await one<{ pct: string }>(
      db,
      `SELECT land_acquisition_percentage::text AS pct FROM public.land_acquisition
       WHERE project_id = $1`,
      [projectId],
    );
    expect(Number(row.pct)).toBeCloseTo(75, 4);
  });

  it('computes both compensation columns', async () => {
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.compensation
         (project_id, total_compensation_required, total_compensation_paid)
       VALUES ($1, 1000000.00, 250000.00)`,
      [projectId],
    );
    const row = await one<{ pending: string; pct: string }>(
      db,
      `SELECT compensation_pending::text AS pending,
              compensation_pending_percentage::text AS pct
       FROM public.compensation WHERE project_id = $1`,
      [projectId],
    );
    expect(Number(row.pending)).toBeCloseTo(750000, 2);
    expect(Number(row.pct)).toBeCloseTo(75, 4);
  });

  it('returns 0 rather than dividing by zero when nothing is required', async () => {
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.compensation
         (project_id, total_compensation_required, total_compensation_paid)
       VALUES ($1, 0, 0)`,
      [projectId],
    );
    const row = await one<{ pct: string }>(
      db,
      `SELECT compensation_pending_percentage::text AS pct FROM public.compensation
       WHERE project_id = $1`,
      [projectId],
    );
    expect(Number(row.pct)).toBe(0);
  });
});

describe('generated columns cannot be spoofed', () => {
  // This is the whole reason the values are GENERATED rather than computed in
  // the Node layer. A caller who could write the derived value directly could
  // report 100% acquisition on a project that has acquired nothing.

  it('rejects an INSERT that supplies land_acquisition_percentage', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.land_acquisition
         (project_id, land_required_ha, land_acquired_ha, land_acquisition_percentage)
       VALUES ($1, 200, 50, 100)`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.GENERATED_ALWAYS);
  });

  it('rejects an UPDATE that targets land_acquisition_percentage', async () => {
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.land_acquisition (project_id, land_required_ha, land_acquired_ha)
       VALUES ($1, 200, 50)`,
      [projectId],
    );
    const err = await expectSqlError(
      db,
      `UPDATE public.land_acquisition SET land_acquisition_percentage = 100 WHERE project_id = $1`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.GENERATED_ALWAYS);
  });

  it('rejects an INSERT that supplies compensation_pending', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.compensation
         (project_id, total_compensation_required, total_compensation_paid, compensation_pending)
       VALUES ($1, 1000, 250, 0)`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.GENERATED_ALWAYS);
  });

  it('rejects an UPDATE that targets compensation_pending_percentage', async () => {
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.compensation
         (project_id, total_compensation_required, total_compensation_paid)
       VALUES ($1, 1000, 250)`,
      [projectId],
    );
    const err = await expectSqlError(
      db,
      `UPDATE public.compensation SET compensation_pending_percentage = 0 WHERE project_id = $1`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.GENERATED_ALWAYS);
  });
});

describe('predictions: result columns must agree with prediction_status', () => {
  // The rule this suite exists to protect:
  //   SUCCESS          -> predicted_delay_days AND risk_level both present
  //   PENDING / FAILED -> both NULL
  //
  // The failure mode being prevented is a fabricated 0. Zero is a valid,
  // plausible "no delay expected" forecast, so a failed inference stored as 0
  // is indistinguishable from a real result and would be absorbed silently by
  // dashboards, averages and training queries.

  it('accepts a SUCCESS prediction carrying a value', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    await expect(
      db.query(
        `INSERT INTO public.predictions
           (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
         VALUES ($1, $2, 120.5, 'HIGH', 'SUCCESS')`,
        [projectId, snapshotId],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a SUCCESS prediction with no predicted_delay_days', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, NULL, 'HIGH', 'SUCCESS')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(err.constraint).toBe('predictions_result_matches_status');
  });

  it('rejects a SUCCESS prediction with no risk_level', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, 120.5, NULL, 'SUCCESS')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(err.constraint).toBe('predictions_result_matches_status');
  });

  it('accepts a FAILED prediction with both result columns NULL', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    await expect(
      db.query(
        `INSERT INTO public.predictions
           (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
         VALUES ($1, $2, NULL, NULL, 'FAILED')`,
        [projectId, snapshotId],
      ),
    ).resolves.toBeDefined();

    const row = await one<{ delay: string | null; risk: string | null }>(
      db,
      `SELECT predicted_delay_days::text AS delay, risk_level AS risk
       FROM public.predictions WHERE project_id = $1`,
      [projectId],
    );
    expect(row.delay).toBeNull();
    expect(row.risk).toBeNull();
  });

  it('rejects a FAILED prediction carrying a fabricated 0', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, 0, 'LOW', 'FAILED')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(err.constraint).toBe('predictions_result_matches_status');
  });

  it('rejects a FAILED prediction carrying any delay value at all', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, 250, NULL, 'FAILED')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('rejects a FAILED prediction carrying a risk_level but no delay', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, NULL, 'CRITICAL', 'FAILED')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('treats PENDING the same way — an unfinished inference has no result', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    await expect(
      db.query(
        `INSERT INTO public.predictions
           (project_id, feature_snapshot_id, prediction_status)
         VALUES ($1, $2, 'PENDING')`,
        [projectId, snapshotId],
      ),
    ).resolves.toBeDefined();

    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, 0, 'LOW', 'PENDING')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('enforces the rule on UPDATE, not just INSERT', async () => {
    // The realistic path to a bad row: a worker marks an in-flight prediction
    // FAILED without clearing the value it had optimistically written.
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const predictionId = await createPrediction(db, projectId, snapshotId, 90, 'HIGH');

    const err = await expectSqlError(
      db,
      `UPDATE public.predictions SET prediction_status = 'FAILED' WHERE id = $1`,
      [predictionId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(err.constraint).toBe('predictions_result_matches_status');

    // Clearing the result alongside the status is the supported transition.
    await expect(
      db.query(
        `UPDATE public.predictions
         SET prediction_status = 'FAILED', predicted_delay_days = NULL, risk_level = NULL
         WHERE id = $1`,
        [predictionId],
      ),
    ).resolves.toBeDefined();
  });

  it('still rejects a negative predicted_delay_days', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, -5, 'LOW', 'SUCCESS')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('still rejects an unknown risk_level', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, 10, 'CATASTROPHIC', 'SUCCESS')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('still rejects an unknown prediction_status', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
       VALUES ($1, $2, 10, 'LOW', 'MAYBE')`,
      [projectId, snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });
});

describe('domain CHECK constraints', () => {
  it('rejects acquiring more land than is required', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.land_acquisition (project_id, land_required_ha, land_acquired_ha)
       VALUES ($1, 100, 150)`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(err.constraint).toBe('land_acquired_not_over_required');
  });

  it('rejects a non-positive land_required_ha', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.land_acquisition (project_id, land_required_ha, land_acquired_ha)
       VALUES ($1, 0, 0)`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('rejects paying more compensation than is required', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.compensation
         (project_id, total_compensation_required, total_compensation_paid)
       VALUES ($1, 1000, 2000)`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(err.constraint).toBe('compensation_paid_not_over_required');
  });

  it('enforces the statutory notification -> award -> possession order', async () => {
    const projectId = await createProject(db);
    const awardBeforeNotification = await expectSqlError(
      db,
      `INSERT INTO public.land_acquisition
         (project_id, land_required_ha, notification_date, award_date)
       VALUES ($1, 100, '2024-06-01', '2024-01-01')`,
      [projectId],
    );
    expect(awardBeforeNotification.constraint).toBe('land_award_after_notification');

    const possessionBeforeAward = await expectSqlError(
      db,
      `INSERT INTO public.land_acquisition
         (project_id, land_required_ha, award_date, possession_date)
       VALUES ($1, 100, '2024-06-01', '2024-01-01')`,
      [projectId],
    );
    expect(possessionBeforeAward.constraint).toBe('land_possession_after_award');
  });

  it('rejects a planned completion date before the planned start', async () => {
    const err = await expectSqlError(
      db,
      `INSERT INTO public.projects
         (project_name, project_code, state, district, sector, implementing_agency,
          planned_start_date, planned_completion_date)
       VALUES ('X', 'CHK-DATES', 'S', 'D', 'ROAD', 'A', '2025-01-01', '2024-01-01')`,
    );
    expect(err.constraint).toBe('projects_planned_dates_ordered');
  });

  it('rejects out-of-range coordinates', async () => {
    const err = await expectSqlError(
      db,
      `INSERT INTO public.projects
         (project_name, project_code, state, district, sector, implementing_agency, latitude)
       VALUES ('X', 'CHK-LAT', 'S', 'D', 'ROAD', 'A', 120)`,
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('rejects a case_reference on an issue that is not a court case', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.legal_issues
         (project_id, issue_type, court_case, case_reference, severity)
       VALUES ($1, 'LITIGATION', FALSE, 'WP/123/2024', 'HIGH')`,
      [projectId],
    );
    expect(err.constraint).toBe('legal_case_reference_requires_court_case');
  });

  it('rejects a resolved date earlier than the reported date', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.legal_issues
         (project_id, issue_type, severity, reported_date, resolved_date)
       VALUES ($1, 'LAND_DISPUTE', 'LOW', '2024-06-01', '2024-01-01')`,
      [projectId],
    );
    expect(err.constraint).toBe('legal_resolved_after_reported');
  });

  it('rejects completed_at on a recommendation that is still open', async () => {
    const { predictionId } = await createPredictionChain(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.recommendations
         (prediction_id, title, description, priority, recommended_action, status, completed_at)
       VALUES ($1, 'T', 'D', 'HIGH', 'A', 'OPEN', NOW())`,
      [predictionId],
    );
    expect(err.constraint).toBe('recommendations_completed_at_requires_terminal_status');
  });

  it('rejects an R² score above 1', async () => {
    const err = await expectSqlError(
      db,
      `INSERT INTO public.model_versions (version, algorithm, r2_score)
       VALUES ('bad-r2', 'test', 1.5)`,
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('allows a negative R² score, which is a real outcome for a bad model', async () => {
    await expect(
      db.query(
        `INSERT INTO public.model_versions (version, algorithm, r2_score)
         VALUES ('negative-r2', 'test', -3.2)`,
      ),
    ).resolves.toBeDefined();
  });
});

describe('foreign keys and uniqueness', () => {
  it('rejects a prediction pointing at a non-existent project', async () => {
    const projectId = await createProject(db);
    const snapshotId = await createSnapshot(db, projectId);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.predictions
         (project_id, feature_snapshot_id, predicted_delay_days, risk_level)
       VALUES ('00000000-0000-4000-8000-00000000dead', $1, 10, 'LOW')`,
      [snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.FOREIGN_KEY_VIOLATION);
  });

  it('rejects a risk factor with an unknown factor_type', async () => {
    const projectId = await createProject(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.risk_factors (project_id, factor_type, factor_name, severity)
       VALUES ($1, 'NOT_A_REAL_TYPE', 'x', 'LOW')`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.FOREIGN_KEY_VIOLATION);
  });

  it('accepts a newly inserted factor type without a schema change', async () => {
    // The extensibility requirement: adding a vocabulary entry is an INSERT.
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.risk_factor_types (code, label) VALUES ('NEW_FACTOR', 'New Factor')`,
    );
    await expect(
      db.query(
        `INSERT INTO public.risk_factors (project_id, factor_type, factor_name, severity)
         VALUES ($1, 'NEW_FACTOR', 'x', 'LOW')`,
        [projectId],
      ),
    ).resolves.toBeDefined();
  });

  it('allows only one land_acquisition row per project', async () => {
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.land_acquisition (project_id, land_required_ha) VALUES ($1, 100)`,
      [projectId],
    );
    const err = await expectSqlError(
      db,
      `INSERT INTO public.land_acquisition (project_id, land_required_ha) VALUES ($1, 100)`,
      [projectId],
    );
    expect(err.code).toBe(SQLSTATE.UNIQUE_VIOLATION);
  });

  it('rejects a duplicate project_code', async () => {
    await createProject(db, { project_code: 'DUP-001' });
    const err = await expectSqlError(
      db,
      `INSERT INTO public.projects
         (project_name, project_code, state, district, sector, implementing_agency)
       VALUES ('Other', 'DUP-001', 'S', 'D', 'ROAD', 'A')`,
    );
    expect(err.code).toBe(SQLSTATE.UNIQUE_VIOLATION);
  });

  it('rejects a duplicate project assignment', async () => {
    const projectId = await createProject(db);
    const userId = '00000000-0000-4000-8000-00000000f001';
    // The on_auth_user_created trigger provisions the profile row as VIEWER,
    // so this only needs to promote it — inserting the profile again would
    // collide with what the trigger already created.
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'a@example.invalid')`, [userId]);
    await db.query(`UPDATE public.profiles SET role = 'OFFICER' WHERE id = $1`, [userId]);
    await db.query(`INSERT INTO public.project_assignments (project_id, user_id) VALUES ($1, $2)`, [
      projectId,
      userId,
    ]);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.project_assignments (project_id, user_id) VALUES ($1, $2)`,
      [projectId, userId],
    );
    expect(err.code).toBe(SQLSTATE.UNIQUE_VIOLATION);
  });

  it('cascades a project delete to its child rows', async () => {
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.land_acquisition (project_id, land_required_ha) VALUES ($1, 100)`,
      [projectId],
    );
    await db.query(
      `INSERT INTO public.legal_issues (project_id, issue_type, severity)
       VALUES ($1, 'LAND_DISPUTE', 'LOW')`,
      [projectId],
    );
    await db.query(`DELETE FROM public.projects WHERE id = $1`, [projectId]);

    const remaining = await one<{ n: number }>(
      db,
      `SELECT (SELECT COUNT(*) FROM public.land_acquisition WHERE project_id = $1)
            + (SELECT COUNT(*) FROM public.legal_issues     WHERE project_id = $1) AS n`,
      [projectId],
    );
    expect(Number(remaining.n)).toBe(0);
  });

  it('refuses to delete a snapshot a prediction still depends on', async () => {
    // ON DELETE RESTRICT: the audit trail cannot be silently broken.
    const { snapshotId } = await createPredictionChain(db);
    const err = await expectSqlError(
      db,
      `DELETE FROM public.project_feature_snapshots WHERE id = $1`,
      [snapshotId],
    );
    expect(err.code).toBe(SQLSTATE.FOREIGN_KEY_VIOLATION);
  });
});

describe('updated_at triggers', () => {
  // These assert against a BACKDATED starting value rather than against a
  // second wall-clock reading. NOW() returns the transaction timestamp, and
  // two statements can land inside the same clock tick — an assertion of the
  // form "the second reading is later than the first" is a flaky test, not a
  // test of the trigger. Backdating first makes the check deterministic.

  it('advances updated_at on UPDATE without the caller setting it', async () => {
    const projectId = await createProject(db);

    // Plant an old timestamp with the trigger out of the way, so the value
    // under test can only have come from the trigger firing.
    await db.exec('ALTER TABLE public.projects DISABLE TRIGGER trg_projects_set_updated_at');
    await db.query(`UPDATE public.projects SET updated_at = '2000-01-01' WHERE id = $1`, [
      projectId,
    ]);
    await db.exec('ALTER TABLE public.projects ENABLE TRIGGER trg_projects_set_updated_at');

    await db.query(`UPDATE public.projects SET district = 'Changed' WHERE id = $1`, [projectId]);

    const after = await one<{ year: number }>(
      db,
      `SELECT EXTRACT(YEAR FROM updated_at)::int AS year FROM public.projects WHERE id = $1`,
      [projectId],
    );
    expect(after.year).toBeGreaterThan(2000);
  });

  it('overrides a client-supplied updated_at', async () => {
    // A client must not be able to backdate the audit timestamp.
    const projectId = await createProject(db);
    await db.query(
      `UPDATE public.projects SET district = 'X', updated_at = '2000-01-01' WHERE id = $1`,
      [projectId],
    );
    const row = await one<{ year: number }>(
      db,
      `SELECT EXTRACT(YEAR FROM updated_at)::int AS year FROM public.projects WHERE id = $1`,
      [projectId],
    );
    expect(row.year).toBeGreaterThan(2000);
  });

  it('maintains compensation.last_updated alongside updated_at', async () => {
    const projectId = await createProject(db);
    await db.query(
      `INSERT INTO public.compensation (project_id, total_compensation_required)
       VALUES ($1, 1000)`,
      [projectId],
    );

    await db.exec('ALTER TABLE public.compensation DISABLE TRIGGER trg_compensation_last_updated');
    await db.exec('ALTER TABLE public.compensation DISABLE TRIGGER trg_compensation_set_updated_at');
    await db.query(
      `UPDATE public.compensation SET last_updated = '2000-01-01', updated_at = '2000-01-01'
       WHERE project_id = $1`,
      [projectId],
    );
    await db.exec('ALTER TABLE public.compensation ENABLE TRIGGER trg_compensation_last_updated');
    await db.exec('ALTER TABLE public.compensation ENABLE TRIGGER trg_compensation_set_updated_at');

    await db.query(
      `UPDATE public.compensation SET total_compensation_paid = 500 WHERE project_id = $1`,
      [projectId],
    );

    const after = await one<{ last_updated_year: number; updated_at_year: number }>(
      db,
      `SELECT EXTRACT(YEAR FROM last_updated)::int AS last_updated_year,
              EXTRACT(YEAR FROM updated_at)::int  AS updated_at_year
       FROM public.compensation WHERE project_id = $1`,
      [projectId],
    );
    expect(after.last_updated_year).toBeGreaterThan(2000);
    expect(after.updated_at_year).toBeGreaterThan(2000);
  });

  it('does not touch updated_at on an unrelated row', async () => {
    const target = await createProject(db);
    const bystander = await createProject(db);

    await db.exec('ALTER TABLE public.projects DISABLE TRIGGER trg_projects_set_updated_at');
    await db.query(`UPDATE public.projects SET updated_at = '2000-01-01' WHERE id = $1`, [
      bystander,
    ]);
    await db.exec('ALTER TABLE public.projects ENABLE TRIGGER trg_projects_set_updated_at');

    await db.query(`UPDATE public.projects SET district = 'Changed' WHERE id = $1`, [target]);

    const row = await one<{ year: number }>(
      db,
      `SELECT EXTRACT(YEAR FROM updated_at)::int AS year FROM public.projects WHERE id = $1`,
      [bystander],
    );
    expect(row.year).toBe(2000);
  });
});

describe('prediction explanations', () => {
  it('rejects two explanations at the same rank for one prediction', async () => {
    const { predictionId } = await createPredictionChain(db);
    await db.query(
      `INSERT INTO public.prediction_explanations
         (prediction_id, feature_name, contribution_score, contribution_direction, rank)
       VALUES ($1, 'feature_a', 10, 'INCREASES_DELAY', 1)`,
      [predictionId],
    );
    const err = await expectSqlError(
      db,
      `INSERT INTO public.prediction_explanations
         (prediction_id, feature_name, contribution_score, contribution_direction, rank)
       VALUES ($1, 'feature_b', 5, 'INCREASES_DELAY', 1)`,
      [predictionId],
    );
    expect(err.code).toBe(SQLSTATE.UNIQUE_VIOLATION);
  });

  it('rejects the same feature twice for one prediction', async () => {
    const { predictionId } = await createPredictionChain(db);
    await db.query(
      `INSERT INTO public.prediction_explanations
         (prediction_id, feature_name, contribution_score, contribution_direction, rank)
       VALUES ($1, 'feature_a', 10, 'INCREASES_DELAY', 1)`,
      [predictionId],
    );
    const err = await expectSqlError(
      db,
      `INSERT INTO public.prediction_explanations
         (prediction_id, feature_name, contribution_score, contribution_direction, rank)
       VALUES ($1, 'feature_a', 5, 'DECREASES_DELAY', 2)`,
      [predictionId],
    );
    expect(err.code).toBe(SQLSTATE.UNIQUE_VIOLATION);
  });

  it('rejects a rank of zero or below', async () => {
    const { predictionId } = await createPredictionChain(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.prediction_explanations
         (prediction_id, feature_name, contribution_score, contribution_direction, rank)
       VALUES ($1, 'feature_a', 10, 'INCREASES_DELAY', 0)`,
      [predictionId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('accepts a negative contribution_score, which is meaningful', async () => {
    // A feature that pushes the estimate down is as real as one that pushes
    // it up; clamping the score at zero would destroy that information.
    const { predictionId } = await createPredictionChain(db);
    await expect(
      db.query(
        `INSERT INTO public.prediction_explanations
           (prediction_id, feature_name, contribution_score, contribution_direction, rank)
         VALUES ($1, 'acquisition_percentage', -28.4, 'DECREASES_DELAY', 1)`,
        [predictionId],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown contribution_direction', async () => {
    const { predictionId } = await createPredictionChain(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.prediction_explanations
         (prediction_id, feature_name, contribution_score, contribution_direction, rank)
       VALUES ($1, 'f', 1, 'CAUSES_DELAY', 1)`,
      [predictionId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('cascades an explanation delete when its prediction is deleted', async () => {
    const { predictionId } = await createPredictionChain(db);
    await db.query(
      `INSERT INTO public.prediction_explanations
         (prediction_id, feature_name, contribution_score, contribution_direction, rank)
       VALUES ($1, 'f', 1, 'NEUTRAL', 1)`,
      [predictionId],
    );
    await db.query(`DELETE FROM public.predictions WHERE id = $1`, [predictionId]);
    const row = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.prediction_explanations WHERE prediction_id = $1`,
      [predictionId],
    );
    expect(row.n).toBe(0);
  });
});

describe('recommendations', () => {
  it('rejects an unknown priority', async () => {
    const { predictionId } = await createPredictionChain(db);
    const err = await expectSqlError(
      db,
      `INSERT INTO public.recommendations
         (prediction_id, title, description, priority, recommended_action)
       VALUES ($1, 'T', 'D', 'URGENT', 'A')`,
      [predictionId],
    );
    expect(err.code).toBe(SQLSTATE.CHECK_VIOLATION);
  });

  it('allows completed_at once the status is terminal', async () => {
    const { predictionId } = await createPredictionChain(db);
    await expect(
      db.query(
        `INSERT INTO public.recommendations
           (prediction_id, title, description, priority, recommended_action, status, completed_at)
         VALUES ($1, 'T', 'D', 'HIGH', 'A', 'COMPLETED', NOW())`,
        [predictionId],
      ),
    ).resolves.toBeDefined();
  });

  it('cascades a recommendation delete when its prediction is deleted', async () => {
    const { predictionId } = await createPredictionChain(db);
    await db.query(
      `INSERT INTO public.recommendations
         (prediction_id, title, description, priority, recommended_action)
       VALUES ($1, 'T', 'D', 'HIGH', 'A')`,
      [predictionId],
    );
    await db.query(`DELETE FROM public.predictions WHERE id = $1`, [predictionId]);
    const row = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.recommendations WHERE prediction_id = $1`,
      [predictionId],
    );
    expect(row.n).toBe(0);
  });
});
