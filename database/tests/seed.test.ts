/**
 * seed.test.ts — the demo seed loads, re-loads safely, and is honestly labelled.
 *
 * Two things are being protected here.
 *
 * The mechanical one: `seed.sql` must survive being run twice, because it gets
 * pasted into the Supabase SQL Editor by hand.
 *
 * The substantive one: every row in the seed is INVENTED. None of it is
 * government data. The naming convention ([DEMO] / DEMO- prefixes) is the only
 * thing stopping a screenshot of the dashboard from being mistaken for real
 * land acquisition figures, so it is asserted rather than trusted. The same
 * goes for the model registry: no model has been trained, so every evaluation
 * metric must still be NULL, and the seeded predictions must point at a row
 * explicitly named as untrained.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSeededDb, SEED_SQL, rows, one, type Db } from './helpers/db';

let db: Db;

beforeAll(async () => {
  db = await createSeededDb();
});

afterAll(async () => {
  await db.close();
});

describe('seed loading', () => {
  it('loads against the canonical schema', async () => {
    const projects = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.projects`,
    );
    expect(projects.n).toBe(6);
  });

  it('is idempotent — re-running does not duplicate rows', async () => {
    const countAll = async () =>
      one<{ projects: number; predictions: number; explanations: number; recs: number }>(
        db,
        `SELECT (SELECT COUNT(*) FROM public.projects)::int                AS projects,
                (SELECT COUNT(*) FROM public.predictions)::int             AS predictions,
                (SELECT COUNT(*) FROM public.prediction_explanations)::int AS explanations,
                (SELECT COUNT(*) FROM public.recommendations)::int         AS recs`,
      );
    const before = await countAll();
    await db.exec(SEED_SQL);
    const after = await countAll();
    expect(after).toEqual(before);
  });

  it('populates every relationship in the chain', async () => {
    const counts = await one<Record<string, number>>(
      db,
      `SELECT (SELECT COUNT(*) FROM public.land_acquisition)::int          AS land,
              (SELECT COUNT(*) FROM public.compensation)::int              AS compensation,
              (SELECT COUNT(*) FROM public.legal_issues)::int              AS legal,
              (SELECT COUNT(*) FROM public.risk_factors)::int              AS risks,
              (SELECT COUNT(*) FROM public.project_feature_snapshots)::int AS snapshots,
              (SELECT COUNT(*) FROM public.predictions)::int               AS predictions,
              (SELECT COUNT(*) FROM public.prediction_explanations)::int   AS explanations,
              (SELECT COUNT(*) FROM public.recommendations)::int           AS recommendations,
              (SELECT COUNT(*) FROM public.actual_outcomes)::int           AS outcomes`,
    );
    for (const [table, n] of Object.entries(counts)) {
      expect(Number(n), `${table} should not be empty`).toBeGreaterThan(0);
    }
  });
});

describe('seed data is unmistakably fictional', () => {
  it('prefixes every project name with [DEMO]', async () => {
    const bad = await rows<{ project_name: string }>(
      db,
      `SELECT project_name FROM public.projects WHERE project_name NOT LIKE '[DEMO]%'`,
    );
    expect(bad).toEqual([]);
  });

  it('prefixes every project code with DEMO-', async () => {
    const bad = await rows<{ project_code: string }>(
      db,
      `SELECT project_code FROM public.projects WHERE project_code NOT LIKE 'DEMO-%'`,
    );
    expect(bad).toEqual([]);
  });

  it('marks every implementing agency as fictional', async () => {
    const bad = await rows<{ implementing_agency: string }>(
      db,
      `SELECT implementing_agency FROM public.projects
       WHERE implementing_agency NOT LIKE '[DEMO]%'`,
    );
    expect(bad).toEqual([]);
  });

  it('marks every court case reference as fictional', async () => {
    const bad = await rows<{ case_reference: string }>(
      db,
      `SELECT case_reference FROM public.legal_issues
       WHERE case_reference IS NOT NULL AND case_reference NOT LIKE '[DEMO]%'`,
    );
    expect(bad).toEqual([]);
  });
});

describe('seed does not fabricate model results', () => {
  it('leaves every evaluation metric NULL, because nothing has been trained', async () => {
    const bad = await rows(
      db,
      `SELECT version FROM public.model_versions
       WHERE mae IS NOT NULL OR rmse IS NOT NULL OR r2_score IS NOT NULL`,
    );
    expect(
      bad,
      'A seeded model carries evaluation metrics. No model has been trained; these would be invented numbers.',
    ).toEqual([]);
  });

  it('names the placeholder model as untrained', async () => {
    const model = await one<{ version: string; status: string; training_date: string | null }>(
      db,
      `SELECT version, status, training_date::text AS training_date FROM public.model_versions`,
    );
    expect(model.version).toContain('untrained');
    expect(model.status).toBe('TRAINING');
    expect(model.training_date).toBeNull();
  });

  it('traces every seeded prediction back to the untrained placeholder', async () => {
    // So a demo prediction can never be mistaken for genuine model output.
    const orphaned = await rows(
      db,
      `SELECT p.id FROM public.predictions p
       LEFT JOIN public.model_versions m ON m.id = p.model_version_id
       WHERE m.id IS NULL OR m.version NOT LIKE '%untrained%'`,
    );
    expect(orphaned).toEqual([]);
  });
});

describe('seed integrity', () => {
  it('computes generated columns rather than accepting seeded values', async () => {
    // seed.sql omits the generated columns; PostgreSQL fills them in. If the
    // seed ever started supplying them, the load would fail outright.
    const row = await one<{ pct: string; required: string; acquired: string }>(
      db,
      `SELECT land_acquisition_percentage::text AS pct,
              land_required_ha::text AS required,
              land_acquired_ha::text AS acquired
       FROM public.land_acquisition
       WHERE project_id = 'b0000000-0000-4000-8000-000000000006'`,
    );
    const expected = (Number(row.acquired) / Number(row.required)) * 100;
    expect(Number(row.pct)).toBeCloseTo(expected, 3);
    expect(Number(row.pct)).toBeCloseTo(100, 3);
  });

  it('derives compensation_pending consistently across every seeded row', async () => {
    const inconsistent = await rows(
      db,
      `SELECT project_id FROM public.compensation
       WHERE compensation_pending
             <> total_compensation_required - total_compensation_paid`,
    );
    expect(inconsistent).toEqual([]);
  });

  it('attaches every prediction to a snapshot of its own project', async () => {
    const mismatched = await rows(
      db,
      `SELECT p.id FROM public.predictions p
       JOIN public.project_feature_snapshots s ON s.id = p.feature_snapshot_id
       WHERE s.project_id <> p.project_id`,
    );
    expect(mismatched).toEqual([]);
  });

  it('satisfies the prediction status/result rule on every seeded row', async () => {
    const violations = await rows(
      db,
      `SELECT id, prediction_status FROM public.predictions
       WHERE (prediction_status = 'SUCCESS'
              AND (predicted_delay_days IS NULL OR risk_level IS NULL))
          OR (prediction_status IN ('FAILED', 'PENDING')
              AND (predicted_delay_days IS NOT NULL OR risk_level IS NOT NULL))`,
    );
    expect(violations).toEqual([]);
  });

  it('records the one demo outcome strictly after its snapshot', async () => {
    const outcome = await one<{ outcome_date: string; snapshot_date: string }>(
      db,
      `SELECT o.outcome_date::text AS outcome_date, s.snapshot_date::date::text AS snapshot_date
       FROM public.actual_outcomes o
       JOIN public.project_feature_snapshots s ON s.id = o.feature_snapshot_id`,
    );
    expect(new Date(outcome.outcome_date).getTime()).toBeGreaterThan(
      new Date(outcome.snapshot_date).getTime(),
    );
  });

  it('ranks explanations contiguously from 1 within each prediction', async () => {
    const broken = await rows<{ prediction_id: string }>(
      db,
      `SELECT prediction_id FROM public.prediction_explanations
       GROUP BY prediction_id
       HAVING MIN(rank) <> 1 OR MAX(rank) <> COUNT(*)`,
    );
    expect(broken).toEqual([]);
  });

  it('gives every recommendation a parent prediction', async () => {
    const orphans = await rows(
      db,
      `SELECT r.id FROM public.recommendations r
       LEFT JOIN public.predictions p ON p.id = r.prediction_id
       WHERE p.id IS NULL`,
    );
    expect(orphans).toEqual([]);
  });

  it('leaves profiles empty, since auth.users is Supabase-managed', async () => {
    // PART B of the seed is commented out on purpose: users cannot be
    // invented in SQL. A non-empty profiles table here would mean someone
    // uncommented it with placeholder UUIDs.
    const profiles = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.profiles`,
    );
    expect(profiles.n).toBe(0);
  });
});
