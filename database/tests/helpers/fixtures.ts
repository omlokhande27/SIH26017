/**
 * Minimal row builders for tests that need a valid parent row before they can
 * exercise the thing actually under test.
 *
 * These deliberately insert the smallest legal row rather than a realistic
 * one: a constraint test should fail because of the constraint being probed,
 * never because an unrelated column was left empty.
 */
import type { Db } from './db';

let counter = 0;
const nextSuffix = () => String(++counter).padStart(4, '0');

/** Insert a valid project and return its id. */
export async function createProject(
  db: Db,
  overrides: Partial<{
    id: string;
    project_name: string;
    project_code: string;
    state: string;
    district: string;
    sector: string;
    implementing_agency: string;
    project_status: string;
  }> = {},
): Promise<string> {
  const suffix = nextSuffix();
  const row = {
    project_name: `Test Project ${suffix}`,
    project_code: `TEST-${suffix}`,
    state: 'Maharashtra',
    district: 'Test District',
    sector: 'ROAD',
    implementing_agency: 'Test Agency',
    project_status: 'ACTIVE',
    ...overrides,
  };

  if (overrides.id) {
    await db.query(
      `INSERT INTO public.projects
         (id, project_name, project_code, state, district, sector, implementing_agency, project_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        overrides.id,
        row.project_name,
        row.project_code,
        row.state,
        row.district,
        row.sector,
        row.implementing_agency,
        row.project_status,
      ],
    );
    return overrides.id;
  }

  const res = await db.query<{ id: string }>(
    `INSERT INTO public.projects
       (project_name, project_code, state, district, sector, implementing_agency, project_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      row.project_name,
      row.project_code,
      row.state,
      row.district,
      row.sector,
      row.implementing_agency,
      row.project_status,
    ],
  );
  return res.rows[0]!.id;
}

/** Insert a minimal feature snapshot for `projectId` and return its id. */
export async function createSnapshot(
  db: Db,
  projectId: string,
  snapshotDate = '2025-01-01 00:00:00+00',
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO public.project_feature_snapshots (project_id, snapshot_date)
     VALUES ($1, $2)
     RETURNING id`,
    [projectId, snapshotDate],
  );
  return res.rows[0]!.id;
}

/** Insert a model version row and return its id. */
export async function createModelVersion(
  db: Db,
  version = `test-${nextSuffix()}`,
  status = 'TRAINING',
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO public.model_versions (version, algorithm, status)
     VALUES ($1, 'test-algorithm', $2)
     RETURNING id`,
    [version, status],
  );
  return res.rows[0]!.id;
}

/** Insert a SUCCESS prediction and return its id. */
export async function createPrediction(
  db: Db,
  projectId: string,
  snapshotId: string,
  delayDays = 42,
  riskLevel = 'MEDIUM',
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO public.predictions
       (project_id, feature_snapshot_id, predicted_delay_days, risk_level, prediction_status)
     VALUES ($1, $2, $3, $4, 'SUCCESS')
     RETURNING id`,
    [projectId, snapshotId, delayDays, riskLevel],
  );
  return res.rows[0]!.id;
}

/** Project → snapshot → prediction in one call, for tests that need the chain. */
export async function createPredictionChain(
  db: Db,
): Promise<{ projectId: string; snapshotId: string; predictionId: string }> {
  const projectId = await createProject(db);
  const snapshotId = await createSnapshot(db, projectId);
  const predictionId = await createPrediction(db, projectId, snapshotId);
  return { projectId, snapshotId, predictionId };
}
