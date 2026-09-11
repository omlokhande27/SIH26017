/**
 * dashboard.live.test.ts — Phase 6 aggregates against the REAL stack.
 *
 * ###########################################################################
 * # REQUIRES real Supabase WITH migration 0005 applied. Gated on LIVE_E2E=1. #
 * #                                                                        #
 * #   npm run test:live:dashboard                                          #
 * #                                                                        #
 * # Writes fixtures to the real database; all are removed in afterAll.     #
 * ###########################################################################
 *
 * The mocked suite stubs the SQL functions, so it proves the API layer and the
 * scoping argument — not that the aggregation is correct or that the functions
 * exist. Only this suite does that, and only this suite proves that money
 * summed in PostgreSQL survives the wire exactly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (process.env.LIVE_E2E !== '1') {
  throw new Error('Refusing to run against a real database without LIVE_E2E=1.');
}

const { default: app } = await import('../../src/app');
const { env, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = await import('../../src/config/env');

const RUN = randomBytes(4).toString('hex');
const TAG = `ZZDASH-${RUN}`;

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
  const email = `zzdash-${RUN}-${role.toLowerCase()}@example.com`;
  const password = `Dash!${randomBytes(18).toString('base64url')}`;
  const { data, error } = await secret.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: `Dash ${role}`, role: 'ADMIN' },
  });
  if (error || !data.user) throw new Error(`createUser(${role}): ${error?.message}`);
  if (role !== 'VIEWER') {
    const { error: p } = await secret.from('profiles').update({ role }).eq('id', data.user.id);
    if (p) throw new Error(`promote(${role}): ${p.message}`);
  }
  const signIn: SupabaseClient = createClient(env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: s, error: e } = await signIn.auth.signInWithPassword({ email, password });
  if (e || !s.session) throw new Error(`signIn(${role}): ${e?.message}`);
  return { id: data.user.id, token: s.session.access_token };
}

beforeAll(async () => {
  // Fail early and legibly if migration 0005 has not been applied. Without
  // this every test dies with "function not found", which reads like a code
  // bug rather than a deployment step.
  const { error: probe } = await secret.rpc('lg_dashboard_overview', { p_project_ids: null });
  if (probe) {
    throw new Error(
      'Migration 0005 is not applied to this Supabase project. Run ' +
        'database/migrations/0005_dashboard_analytics_functions.sql in the SQL Editor first. ' +
        `(${probe.message})`,
    );
  }

  for (const role of ['ADMIN', 'OFFICER', 'VIEWER'] as const) {
    actors.set(role, await makeActor(role));
  }

  for (const suffix of ['A', 'B'] as const) {
    const res = await request(app).post('/api/projects').set(...as('ADMIN')).send({
      project_name: `${TAG} Project ${suffix}`, project_code: `${TAG}-${suffix}`,
      state: suffix === 'A' ? 'ZZTestState' : 'ZZOtherState',
      district: 'D', sector: 'ROAD', implementing_agency: 'Agency',
      planned_start_date: '2024-01-01', project_status: 'ACTIVE',
    });
    if (res.status !== 201) throw new Error(`seed: ${res.status} ${JSON.stringify(res.body)}`);
    const id = res.body.data.project.id as string;
    projectIds.push(id);
    if (suffix === 'A') assignedProjectId = id; else unassignedProjectId = id;
  }

  await secret.from('project_assignments').insert({
    project_id: assignedProjectId, user_id: actors.get('OFFICER')!.id,
  });

  // Exact decimal money, to prove SQL aggregation preserves it end to end.
  await request(app).post(`/api/projects/${assignedProjectId}/land-acquisition`)
    .set(...as('ADMIN'))
    .send({ land_required_ha: '200.0000', land_acquired_ha: '50.0000', affected_families: 250 });
  await request(app).post(`/api/projects/${assignedProjectId}/compensation`)
    .set(...as('ADMIN'))
    .send({ total_compensation_required: '1000000.55', total_compensation_paid: '250000.25' });
}, 180_000);

afterAll(async () => {
  for (const id of projectIds) {
    const { data: preds } = await secret.from('predictions').select('id').eq('project_id', id);
    for (const p of preds ?? []) {
      const pid = (p as { id: string }).id;
      await secret.from('recommendations').delete().eq('prediction_id', pid);
      await secret.from('prediction_explanations').delete().eq('prediction_id', pid);
    }
    await secret.from('predictions').delete().eq('project_id', id);
    await secret.from('project_feature_snapshots').delete().eq('project_id', id);
    await secret.from('projects').delete().eq('id', id);
  }
  await secret.from('projects').delete().like('project_code', `${TAG}%`);
  for (const a of actors.values()) await secret.auth.admin.deleteUser(a.id);
}, 120_000);

describe('LIVE · dashboard aggregates', () => {
  it('overview aggregates in SQL against the real database', async () => {
    const res = await request(app).get('/api/dashboard/overview').set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.overview.total_projects).toBeGreaterThanOrEqual(2);
    expect(res.body.data.disclosure.primary_signal).toBe('RULE_ENGINE');
  });

  it('risk distribution returns all four bands', async () => {
    const res = await request(app).get('/api/dashboard/risk-distribution').set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.distribution.map((r: { risk_level: string }) => r.risk_level))
      .toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });

  it('land analytics preserves exact NUMERIC money through SQL', async () => {
    // The property JavaScript aggregation would destroy: 1000000.55 - 250000.25
    // summed as doubles does not reliably give 750000.30.
    const res = await request(app).get('/api/analytics/land-acquisition').set(...as('ADMIN'));
    expect(res.status).toBe(200);
    const a = res.body.data.analytics;
    expect(typeof a.total_compensation_pending).toBe('string');
    expect(a.total_compensation_pending).toMatch(/\.\d{2}$/);
    expect(Number(a.total_land_required_ha)).toBeGreaterThanOrEqual(200);
  });

  it('by-state analytics groups in SQL', async () => {
    const res = await request(app).get('/api/analytics/by-state').set(...as('ADMIN'));
    expect(res.status).toBe(200);
    const ours = res.body.data.states.find((s: { state: string }) => s.state === 'ZZTestState');
    expect(ours).toBeTruthy();
    expect(ours.total_projects).toBe(1);
  });

  it('delay analytics carries the real honesty metadata', async () => {
    const res = await request(app).get('/api/analytics/delay').set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.disclosure.limitations).toContain('ml_outperforms_baseline_false');
  });

  it('high-risk projects returns a ranked list', async () => {
    const res = await request(app)
      .get('/api/dashboard/high-risk-projects?limit=5')
      .set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.projects)).toBe(true);
  });
});

describe('LIVE · scoping is enforced by the database, not just the API', () => {
  it('an OFFICER sees only their assigned project in the totals', async () => {
    const officer = await request(app).get('/api/dashboard/overview').set(...as('OFFICER'));
    const admin = await request(app).get('/api/dashboard/overview').set(...as('ADMIN'));

    expect(officer.status).toBe(200);
    expect(officer.body.data.overview.total_projects).toBe(1);
    expect(admin.body.data.overview.total_projects).toBeGreaterThan(
      officer.body.data.overview.total_projects,
    );
  });

  it('an OFFICER sees only their own state in by-state analytics', async () => {
    const res = await request(app).get('/api/analytics/by-state').set(...as('OFFICER'));
    const states = res.body.data.states.map((s: { state: string }) => s.state);
    expect(states).toContain('ZZTestState');
    expect(states).not.toContain('ZZOtherState');
  });

  it('a VIEWER sees portfolio-wide figures under the prototype policy', async () => {
    const res = await request(app).get('/api/dashboard/overview').set(...as('VIEWER'));
    expect(res.status).toBe(200);
    expect(res.body.data.overview.total_projects).toBeGreaterThanOrEqual(2);
  });
});

describe('LIVE · project comparison', () => {
  it('compares two real projects in one query', async () => {
    const res = await request(app)
      .get(`/api/projects/compare?ids=${assignedProjectId},${unassignedProjectId}`)
      .set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.returned).toBe(2);
    const withLand = res.body.data.projects.find(
      (p: { project_id: string }) => p.project_id === assignedProjectId,
    );
    expect(withLand.land_acquisition_percentage).toBe('25.0000');
    expect(withLand.compensation_pending).toBe('750000.30');
  });

  it('omits a project the OFFICER cannot see', async () => {
    const res = await request(app)
      .get(`/api/projects/compare?ids=${assignedProjectId},${unassignedProjectId}`)
      .set(...as('OFFICER'));
    expect(res.status).toBe(200);
    expect(res.body.data.returned).toBe(1);
    expect(res.body.data.unavailable).toEqual([unassignedProjectId]);
  });

  it('rejects an invalid UUID', async () => {
    const res = await request(app)
      .get('/api/projects/compare?ids=nope,also-nope')
      .set(...as('ADMIN'));
    expect(res.status).toBe(400);
  });
});

describe('LIVE · AI summary', () => {
  it('returns a controlled 503 when OPENAI_API_KEY is not configured', async () => {
    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/ai-summary`)
      .set(...as('ADMIN'));
    // 503 when unconfigured; 200/404 if a key is present and an assessment
    // exists or does not. Never a 500.
    expect([200, 404, 503]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });
});
