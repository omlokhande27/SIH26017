/**
 * predictions.live.test.ts — the Phase 5 flow against the REAL stack.
 *
 * ###########################################################################
 * # REQUIRES: real Supabase + a running ML service. Gated behind LIVE_E2E=1. #
 * #                                                                        #
 * #   cd ml-service && ML_SERVICE_API_KEY=<key> \                          #
 * #       .venv/bin/python -m uvicorn app.main:app --port 8111             #
 * #   cd backend && npm run test:live:predictions                          #
 * #                                                                        #
 * # Writes to the real database. Every fixture is removed in afterAll.     #
 * ###########################################################################
 *
 * This is the only test that proves the three parts actually work together:
 * the backend reads a real snapshot, the ML service scores it over HTTP, and
 * the assessment lands in real Postgres past real constraints. The mocked
 * suite proves the logic; it cannot prove the columns exist.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (process.env.LIVE_E2E !== '1') {
  throw new Error(
    'Refusing to run against a real database without LIVE_E2E=1. Use `npm run test:live:predictions`.',
  );
}

const { default: app } = await import('../../src/app');
const { env, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = await import('../../src/config/env');
const mlClient = await import('../../src/services/ml-service.client');

const RUN = randomBytes(4).toString('hex');
const TAG = `ZZPRED-${RUN}`;

const secret = createClient(env.SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Role = 'ADMIN' | 'OFFICER' | 'VIEWER';
const actors = new Map<Role, { id: string; token: string }>();
const projectIds: string[] = [];
let assignedProjectId = '';
let unassignedProjectId = '';

const as = (role: Role): [string, string] => ['Authorization', `Bearer ${actors.get(role)!.token}`];

async function makeActor(role: Role) {
  const email = `zzpred-${RUN}-${role.toLowerCase()}@example.com`;
  const password = `Pred!${randomBytes(18).toString('base64url')}`;

  const { data, error } = await secret.auth.admin.createUser({
    email, password, email_confirm: true,
    // Hostile on purpose: if any layer read the claim, VIEWER would pass the
    // write checks below.
    user_metadata: { full_name: `Pred ${role}`, role: 'ADMIN' },
  });
  if (error || !data.user) throw new Error(`createUser(${role}): ${error?.message}`);

  if (role !== 'VIEWER') {
    const { error: promote } = await secret.from('profiles').update({ role }).eq('id', data.user.id);
    if (promote) throw new Error(`promote(${role}): ${promote.message}`);
  }

  const signIn: SupabaseClient = createClient(env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await signIn.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`signIn(${role}): ${signInError?.message}`);

  return { id: data.user.id, token: session.session.access_token };
}

beforeAll(async () => {
  // Fail early and legibly if migration 0004 has not been applied. Without
  // this the first insert dies with "column not found", which reads like a
  // code bug rather than a deployment step.
  const { error: probe } = await secret.from('predictions').select('risk_score').limit(1);
  if (probe && /column|schema cache/i.test(probe.message)) {
    throw new Error(
      'Migration 0004 is not applied to this Supabase project. Run ' +
        'database/migrations/0004_prediction_assessment_fields.sql in the SQL Editor first. ' +
        `(${probe.message})`,
    );
  }

  const health = await mlClient.checkMlService();
  if (!health) {
    throw new Error(`No ML service reachable at ${process.env.ML_SERVICE_URL}. Start it first.`);
  }

  for (const role of ['ADMIN', 'OFFICER', 'VIEWER'] as const) {
    actors.set(role, await makeActor(role));
  }

  for (const suffix of ['A', 'B'] as const) {
    const res = await request(app)
      .post('/api/projects')
      .set(...as('ADMIN'))
      .send({
        project_name: `${TAG} Project ${suffix}`,
        project_code: `${TAG}-${suffix}`,
        state: 'TestState', district: 'TestDistrict', sector: 'ROAD',
        implementing_agency: 'Test Agency', planned_start_date: '2024-01-01',
        project_status: 'ACTIVE',
      });
    if (res.status !== 201) throw new Error(`seed project: ${res.status} ${JSON.stringify(res.body)}`);
    const id = res.body.data.project.id as string;
    projectIds.push(id);
    if (suffix === 'A') assignedProjectId = id; else unassignedProjectId = id;
  }

  await secret.from('project_assignments').insert({
    project_id: assignedProjectId, user_id: actors.get('OFFICER')!.id,
  });

  // Real project data so the rule engine has something to evaluate.
  await request(app)
    .post(`/api/projects/${assignedProjectId}/land-acquisition`)
    .set(...as('ADMIN'))
    .send({
      land_required_ha: '200', land_acquired_ha: '50',
      affected_landowners: 900, affected_families: 800,
      notification_date: '2023-01-01',
    });
  await request(app)
    .post(`/api/projects/${assignedProjectId}/compensation`)
    .set(...as('ADMIN'))
    .send({ total_compensation_required: '1000000.00', total_compensation_paid: '200000.00' });
  await request(app)
    .post(`/api/projects/${assignedProjectId}/risk-factors`)
    .set(...as('ADMIN'))
    .send({ factor_type: 'ENCROACHMENT', factor_name: 'Structures on alignment', severity: 'HIGH' });
}, 180_000);

afterAll(async () => {
  for (const id of projectIds) {
    const { data: preds } = await secret.from('predictions').select('id').eq('project_id', id);
    for (const p of preds ?? []) {
      await secret.from('recommendations').delete().eq('prediction_id', (p as { id: string }).id);
      await secret.from('prediction_explanations').delete().eq('prediction_id', (p as { id: string }).id);
    }
    await secret.from('predictions').delete().eq('project_id', id);
    await secret.from('project_feature_snapshots').delete().eq('project_id', id);
    await secret.from('projects').delete().eq('id', id);
  }
  await secret.from('projects').delete().like('project_code', `${TAG}%`);
  for (const actor of actors.values()) await secret.auth.admin.deleteUser(actor.id);
}, 120_000);

const base = () => `/api/projects/${assignedProjectId}`;

describe('LIVE · prediction orchestration end to end', () => {
  let predictionId = '';
  let snapshotId = '';

  it('runs project -> snapshot -> ML -> rules -> persistence -> response', async () => {
    const res = await request(app)
      .post(`${base()}/predictions`)
      .set(...as('ADMIN'))
      .send({});

    expect(res.status).toBe(201);
    const body = res.body.data;

    expect(body.risk_assessment.risk_level).toBeTruthy();
    expect(body.risk_assessment.triggered_rules.length).toBeGreaterThan(0);
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.prediction.predicted_delay_days).toBeGreaterThan(0);

    predictionId = body.prediction.id;
    snapshotId = body.snapshot.id;
  });

  it('created the snapshot it assessed, since the project had none', async () => {
    const { data } = await secret
      .from('project_feature_snapshots')
      .select('id, project_id')
      .eq('id', snapshotId)
      .single();
    expect((data as { project_id: string }).project_id).toBe(assignedProjectId);
  });

  it('persisted the prediction against the right project and snapshot', async () => {
    const { data } = await secret
      .from('predictions')
      .select('project_id, feature_snapshot_id, prediction_status, prediction_type, confidence, risk_score, risk_level, rule_coverage_pct, assessment_complete')
      .eq('id', predictionId)
      .single();

    const row = data as Record<string, unknown>;
    expect(row.project_id).toBe(assignedProjectId);
    expect(row.feature_snapshot_id).toBe(snapshotId);
    expect(row.prediction_status).toBe('SUCCESS');
    expect(row.prediction_type).toBe('BASELINE_MEDIAN');
    expect(row.confidence).toBe('LOW');
    expect(Number(row.risk_score)).toBeGreaterThan(0);
    expect(row.risk_level).toBeTruthy();
  });

  it('persisted explanations tagged as RULE_ENGINE, not model attribution', async () => {
    const { data } = await secret
      .from('prediction_explanations')
      .select('feature_name, contribution_score, rank, explanation_source')
      .eq('prediction_id', predictionId)
      .order('rank', { ascending: true });

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.explanation_source === 'RULE_ENGINE')).toBe(true);
    expect(rows[0]?.rank).toBe(1);
  });

  it('persisted recommendations linked to their triggering rule', async () => {
    const { data } = await secret
      .from('recommendations')
      .select('title, priority, status, source_rule_id')
      .eq('prediction_id', predictionId);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === 'OPEN')).toBe(true);
    expect(rows.every((r) => typeof r.source_rule_id === 'string')).toBe(true);
  });

  it('registered the model version as STAGING with its real metrics', async () => {
    const { data } = await secret
      .from('model_versions')
      .select('version, algorithm, status, r2_score, dataset_size')
      .eq('version', '0.1.0-median_baseline')
      .maybeSingle();

    const row = data as Record<string, unknown> | null;
    expect(row).toBeTruthy();
    expect(row?.status).toBe('STAGING');
    expect(Number(row?.dataset_size)).toBe(130);
    // The unflattering number, recorded rather than hidden.
    expect(Number(row?.r2_score)).toBeLessThan(0);
  });

  it('left the snapshot untouched', async () => {
    const before = await secret
      .from('project_feature_snapshots').select('*').eq('id', snapshotId).single();

    await request(app).post(`${base()}/predictions`).set(...as('ADMIN')).send({});

    const after = await secret
      .from('project_feature_snapshots').select('*').eq('id', snapshotId).single();
    expect(after.data).toEqual(before.data);
  });
});

describe('LIVE · reads', () => {
  it('returns the latest prediction', async () => {
    const res = await request(app)
      .get(`${base()}/predictions/latest`)
      .set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.prediction.project_id).toBe(assignedProjectId);
  });

  it('lists prediction history', async () => {
    const res = await request(app)
      .get(`${base()}/predictions`)
      .set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBeGreaterThanOrEqual(2);
  });

  it('returns the stored assessment with its explanations and recommendations', async () => {
    const res = await request(app)
      .get(`${base()}/assessment`)
      .set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.explanations.length).toBeGreaterThan(0);
    expect(res.body.data.recommendations.length).toBeGreaterThan(0);
  });
});

describe('LIVE · authorization', () => {
  it('rejects an unauthenticated request', async () => {
    expect((await request(app).post(`${base()}/predictions`).send({})).status).toBe(401);
  });

  it('lets an assigned OFFICER run a prediction', async () => {
    const res = await request(app).post(`${base()}/predictions`).set(...as('OFFICER')).send({});
    expect(res.status).toBe(201);
  });

  it('refuses an OFFICER on an unassigned project', async () => {
    const res = await request(app)
      .post(`/api/projects/${unassignedProjectId}/predictions`)
      .set(...as('OFFICER'))
      .send({});
    expect(res.status).toBe(403);
  });

  it('VIEWER cannot run a prediction but CAN read one', async () => {
    const write = await request(app).post(`${base()}/predictions`).set(...as('VIEWER')).send({});
    expect(write.status).toBe(403);

    const read = await request(app).get(`${base()}/predictions`).set(...as('VIEWER'));
    expect(read.status).toBe(200);
  });
});

describe('LIVE · leakage boundary', () => {
  it('an assessment never exposes outcome data, even when it exists', async () => {
    // Record real ground truth, then take a fresh assessment.
    const { data: snap } = await secret
      .from('project_feature_snapshots')
      .select('id, snapshot_date')
      .eq('project_id', assignedProjectId)
      .limit(1).single();

    const outcomeDate = new Date((snap as { snapshot_date: string }).snapshot_date);
    outcomeDate.setUTCFullYear(outcomeDate.getUTCFullYear() + 1);

    await secret.from('actual_outcomes').insert({
      project_id: assignedProjectId,
      feature_snapshot_id: (snap as { id: string }).id,
      actual_delay_days: 1234,
      outcome_date: outcomeDate.toISOString().slice(0, 10),
    });

    const res = await request(app).post(`${base()}/predictions`).set(...as('ADMIN')).send({});
    expect(res.status).toBe(201);

    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('1234');
    expect(serialised).not.toContain('actual_delay_days');

    await secret.from('actual_outcomes').delete().eq('project_id', assignedProjectId);
  });
});
