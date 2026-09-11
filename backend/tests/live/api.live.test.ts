/**
 * api.live.test.ts — Phase 3 endpoints against the REAL Supabase project.
 *
 * ###########################################################################
 * # THIS SUITE WRITES TO THE REAL DATABASE.                                 #
 * #                                                                        #
 * # It is excluded from `npm test` and refuses to run unless LIVE_E2E=1 is  #
 * # set explicitly. Run it with `npm run test:live`.                        #
 * #                                                                        #
 * # Everything it creates carries the fixture tag below and is removed in   #
 * # afterAll, which runs even when assertions fail.                        #
 * ###########################################################################
 *
 * WHY THIS EXISTS SEPARATELY FROM THE MOCKED SUITE
 *
 * The 313 tests in tests/*.test.ts run against an in-memory fake. They prove
 * the logic; they cannot prove the schema matches, that a column name is right,
 * that a constraint fires, or that a real ES256 token is accepted. This suite
 * proves those, and nothing else should be inferred from it.
 *
 * WHY THE AUTHORIZATION ASSERTIONS MATTER MOST
 *
 * Every service in this backend queries through `supabaseAdmin`, which bypasses
 * RLS entirely. So for API traffic the policies verified in verify-live-db.ts
 * are NOT what protects these routes — `requireProjectAccess` is. A gap there
 * has no backstop. That is what the role matrix below is really testing.
 *
 * No token, key or password is printed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (process.env.LIVE_E2E !== '1') {
  throw new Error(
    'Refusing to run live tests against a real database without LIVE_E2E=1. Use `npm run test:live`.',
  );
}

const { default: app } = await import('../../src/app');
const { env, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = await import('../../src/config/env');

const RUN = randomBytes(4).toString('hex');
const TAG = `ZZE2E-${RUN}`;

/** Privileged client — fixtures and verification ONLY, never as evidence. */
const secret = createClient(env.SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Role = 'ADMIN' | 'ANALYST' | 'OFFICER' | 'VIEWER';

interface Actor {
  role: Role;
  id: string;
  token: string;
}

const actors = new Map<Role, Actor>();
const createdProjectIds = new Set<string>();
let assignedProjectId = '';
let unassignedProjectId = '';

/** Authorization header for a role. */
const auth = (role: Role): [string, string] => [
  'Authorization',
  `Bearer ${actors.get(role)!.token}`,
];

/**
 * Provision a real user and sign them in for a real ES256 token.
 *
 * A fresh client per sign-in: supabase-js retains the session on the client
 * instance, so reusing one would quietly authenticate it.
 */
async function makeActor(role: Role): Promise<Actor> {
  const email = `zze2e-${RUN}-${role.toLowerCase()}@example.com`;
  const password = `Live!${randomBytes(18).toString('base64url')}`;

  const { data, error } = await secret.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Hostile on purpose: every actor's token claims ADMIN. If any layer read
    // it, the whole role matrix below would pass for the wrong reason.
    user_metadata: { full_name: `E2E ${role}`, role: 'ADMIN' },
  });
  if (error || !data.user) throw new Error(`createUser(${role}): ${error?.message}`);

  if (role !== 'VIEWER') {
    const { error: promote } = await secret
      .from('profiles')
      .update({ role })
      .eq('id', data.user.id);
    if (promote) throw new Error(`promote(${role}): ${promote.message}`);
  }

  const signIn: SupabaseClient = createClient(env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await signIn.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session) throw new Error(`signIn(${role}): ${signInError?.message}`);

  return { role, id: data.user.id, token: session.session.access_token };
}

beforeAll(async () => {
  for (const role of ['ADMIN', 'ANALYST', 'OFFICER', 'VIEWER'] as const) {
    actors.set(role, await makeActor(role));
  }

  // Two projects seeded through the API itself, as ADMIN — so project creation
  // is exercised as part of setup rather than bypassed with a direct insert.
  for (const suffix of ['A', 'B'] as const) {
    const res = await request(app)
      .post('/api/projects')
      .set(...auth('ADMIN'))
      .send({
        project_name: `${TAG} Project ${suffix}`,
        project_code: `${TAG}-${suffix}`,
        state: 'TestState',
        district: 'TestDistrict',
        sector: 'ROAD',
        implementing_agency: 'Test Agency',
        planned_start_date: '2024-01-01',
        project_status: 'ACTIVE',
      });
    if (res.status !== 201) throw new Error(`seed project ${suffix}: ${res.status} ${JSON.stringify(res.body)}`);
    const id = res.body.data.project.id as string;
    createdProjectIds.add(id);
    if (suffix === 'A') assignedProjectId = id;
    else unassignedProjectId = id;
  }

  // Assignment has no Phase 3 endpoint (by design — it is an admin action not
  // yet exposed), so it is seeded directly.
  const { error } = await secret
    .from('project_assignments')
    .insert({ project_id: assignedProjectId, user_id: actors.get('OFFICER')!.id });
  if (error) throw new Error(`assign officer: ${error.message}`);
}, 120_000);

afterAll(async () => {
  // Runs even if assertions failed. Predictions/snapshots first: the snapshot
  // FK is ON DELETE RESTRICT from predictions.
  for (const id of createdProjectIds) {
    await secret.from('predictions').delete().eq('project_id', id);
    await secret.from('project_feature_snapshots').delete().eq('project_id', id);
    await secret.from('actual_outcomes').delete().eq('project_id', id);
    await secret.from('projects').delete().eq('id', id);
  }
  await secret.from('projects').delete().like('project_code', `${TAG}%`);

  for (const actor of actors.values()) {
    await secret.auth.admin.deleteUser(actor.id);
  }
}, 120_000);

// ---------------------------------------------------------------------------
describe('LIVE · anonymous access', () => {
  it.each([
    ['GET', '/api/projects'],
    ['GET', '/api/reference/risk-factor-types'],
  ])('%s %s is rejected without a token', async (method, path) => {
    const res = await request(app)[method.toLowerCase() as 'get'](path);
    expect(res.status).toBe(401);
  });

  it('rejects a project read without a token', async () => {
    const res = await request(app).get(`/api/projects/${assignedProjectId}`);
    expect(res.status).toBe(401);
  });

  it('rejects a garbage token', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered real token', async () => {
    // A genuine ES256 token with four characters of the signature changed.
    const good = actors.get('ADMIN')!.token;
    const tampered = `${good.slice(0, -4)}AAAA`;
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('LIVE · ADMIN lifecycle', () => {
  it('creates, reads, updates and deletes a project', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set(...auth('ADMIN'))
      .send({
        project_name: `${TAG} Lifecycle`,
        project_code: `${TAG}-LIFE`,
        state: 'S',
        district: 'D',
        sector: 'ROAD',
        implementing_agency: 'A',
      });
    expect(created.status).toBe(201);
    const id = created.body.data.project.id as string;
    createdProjectIds.add(id);

    // created_by must be the caller, taken from the verified token.
    expect(created.body.data.project.created_by).toBe(actors.get('ADMIN')!.id);

    const read = await request(app)
      .get(`/api/projects/${id}`)
      .set(...auth('ADMIN'));
    expect(read.status).toBe(200);
    expect(read.body.data.project.project_code).toBe(`${TAG}-LIFE`);

    const updated = await request(app)
      .patch(`/api/projects/${id}`)
      .set(...auth('ADMIN'))
      .send({ district: 'Updated District' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.project.district).toBe('Updated District');

    const removed = await request(app)
      .delete(`/api/projects/${id}`)
      .set(...auth('ADMIN'));
    expect(removed.status).toBe(200);
    createdProjectIds.delete(id);

    // Gone from the real database, not just from the response.
    const { data } = await secret.from('projects').select('id').eq('id', id).maybeSingle();
    expect(data).toBeNull();
  });

  it('lists projects with real pagination metadata', async () => {
    const res = await request(app)
      .get('/api/projects?limit=1&page=1')
      .set(...auth('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.projects).toHaveLength(1);
    expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(2);
  });

  it('filters by a real column', async () => {
    const res = await request(app)
      .get('/api/projects?state=TestState')
      .set(...auth('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.projects.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a duplicate project_code with 409 from the real constraint', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(...auth('ADMIN'))
      .send({
        project_name: 'dup',
        project_code: `${TAG}-A`,
        state: 'S',
        district: 'D',
        sector: 'ROAD',
        implementing_agency: 'A',
      });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
describe('LIVE · role authorization matrix', () => {
  it('role comes from profiles, not the ADMIN claim every token carries', async () => {
    // Each actor's user_metadata claims ADMIN. If that were trusted, VIEWER
    // would be able to create a project here.
    const res = await request(app)
      .post('/api/projects')
      .set(...auth('VIEWER'))
      .send({
        project_name: 'viewer',
        project_code: `${TAG}-VX`,
        state: 'S',
        district: 'D',
        sector: 'ROAD',
        implementing_agency: 'A',
      });
    expect(res.status).toBe(403);
  });

  it.each<Role>(['ANALYST', 'VIEWER'])('%s can read all projects', async (role) => {
    const res = await request(app)
      .get('/api/projects')
      .set(...auth(role));
    expect(res.status).toBe(200);
    const codes = res.body.data.projects.map((p: { project_code: string }) => p.project_code);
    expect(codes).toContain(`${TAG}-A`);
    expect(codes).toContain(`${TAG}-B`);
  });

  it.each<Role>(['ANALYST', 'VIEWER'])('%s cannot update a project', async (role) => {
    const res = await request(app)
      .patch(`/api/projects/${assignedProjectId}`)
      .set(...auth(role))
      .send({ district: 'Hacked' });
    expect(res.status).toBe(403);

    const { data } = await secret
      .from('projects')
      .select('district')
      .eq('id', assignedProjectId)
      .single();
    expect((data as { district: string }).district).not.toBe('Hacked');
  });

  it.each<Role>(['ANALYST', 'VIEWER', 'OFFICER'])('%s cannot delete a project', async (role) => {
    const res = await request(app)
      .delete(`/api/projects/${assignedProjectId}`)
      .set(...auth(role));
    expect(res.status).toBe(403);
  });

  it('OFFICER sees only the assigned project in the collection', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set(...auth('OFFICER'));
    expect(res.status).toBe(200);
    const codes = res.body.data.projects.map((p: { project_code: string }) => p.project_code);
    expect(codes).toContain(`${TAG}-A`);
    expect(codes).not.toContain(`${TAG}-B`);
  });

  it('OFFICER can read and update the assigned project', async () => {
    const read = await request(app)
      .get(`/api/projects/${assignedProjectId}`)
      .set(...auth('OFFICER'));
    expect(read.status).toBe(200);

    const update = await request(app)
      .patch(`/api/projects/${assignedProjectId}`)
      .set(...auth('OFFICER'))
      .send({ district: 'Officer Edit' });
    expect(update.status).toBe(200);
  });

  it('OFFICER is refused the unassigned project', async () => {
    const read = await request(app)
      .get(`/api/projects/${unassignedProjectId}`)
      .set(...auth('OFFICER'));
    expect(read.status).toBe(403);

    const write = await request(app)
      .patch(`/api/projects/${unassignedProjectId}`)
      .set(...auth('OFFICER'))
      .send({ district: 'Nope' });
    expect(write.status).toBe(403);
  });

  it('OFFICER cannot reach an unassigned project through a child route', async () => {
    const res = await request(app)
      .get(`/api/projects/${unassignedProjectId}/land-acquisition`)
      .set(...auth('OFFICER'));
    expect(res.status).toBe(403);
  });

  it('self-assignment has no endpoint and is blocked at the database', async () => {
    // No Phase 3 route exposes project_assignments, so the API surface cannot
    // grant it. Confirm the database also refuses, using the officer's own
    // token through an RLS-respecting client.
    const officerClient = createClient(env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${actors.get('OFFICER')!.token}` } },
    });
    const { error } = await officerClient
      .from('project_assignments')
      .insert({ project_id: unassignedProjectId, user_id: actors.get('OFFICER')!.id });
    expect(error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe('LIVE · land acquisition and compensation', () => {
  it('creates land acquisition and returns the DATABASE-computed percentage', async () => {
    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/land-acquisition`)
      .set(...auth('ADMIN'))
      .send({
        land_required_ha: '200',
        land_acquired_ha: '50',
        affected_landowners: 500,
        affected_families: 450,
        notification_date: '2024-02-01',
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.land_acquisition.land_acquisition_percentage)).toBe(25);
  });

  it('refuses a client-supplied generated column', async () => {
    const res = await request(app)
      .patch(`/api/projects/${assignedProjectId}/land-acquisition`)
      .set(...auth('ADMIN'))
      .send({ land_acquisition_percentage: '100' });
    expect(res.status).toBe(400);
  });

  it('recomputes the percentage on the server when an input changes', async () => {
    const res = await request(app)
      .patch(`/api/projects/${assignedProjectId}/land-acquisition`)
      .set(...auth('ADMIN'))
      .send({ land_acquired_ha: '150' });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.land_acquisition.land_acquisition_percentage)).toBe(75);
  });

  it('returns 409 on a second create', async () => {
    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/land-acquisition`)
      .set(...auth('ADMIN'))
      .send({ land_required_ha: '10' });
    expect(res.status).toBe(409);
  });

  it('creates compensation and returns both computed values', async () => {
    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/compensation`)
      .set(...auth('ADMIN'))
      .send({ total_compensation_required: '1000000.00', total_compensation_paid: '250000.00' });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.compensation.compensation_pending)).toBe(750000);
    expect(Number(res.body.data.compensation.compensation_pending_percentage)).toBe(75);
  });

  it('OFFICER can write child data on the assigned project', async () => {
    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/legal-issues`)
      .set(...auth('OFFICER'))
      .send({ issue_type: 'LAND_DISPUTE', severity: 'HIGH', reported_date: '2024-03-01' });
    expect(res.status).toBe(201);
  });

  it.each<Role>(['ANALYST', 'VIEWER'])('%s cannot write child data', async (role) => {
    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/legal-issues`)
      .set(...auth(role))
      .send({ issue_type: 'LAND_DISPUTE', severity: 'LOW' });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('LIVE · legal issues and risk factors CRUD', () => {
  let legalIssueId = '';
  let riskFactorId = '';

  it('creates, reads, updates and deletes a legal issue', async () => {
    const created = await request(app)
      .post(`/api/projects/${assignedProjectId}/legal-issues`)
      .set(...auth('ADMIN'))
      .send({
        issue_type: 'LITIGATION',
        court_case: true,
        case_reference: `${TAG}/WP/1`,
        severity: 'CRITICAL',
        reported_date: '2024-03-12',
      });
    expect(created.status).toBe(201);
    legalIssueId = created.body.data.legal_issue.id;

    const read = await request(app)
      .get(`/api/projects/${assignedProjectId}/legal-issues/${legalIssueId}`)
      .set(...auth('VIEWER'));
    expect(read.status).toBe(200);

    const updated = await request(app)
      .patch(`/api/projects/${assignedProjectId}/legal-issues/${legalIssueId}`)
      .set(...auth('ADMIN'))
      .send({ status: 'RESOLVED', resolved_date: '2024-09-01' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.legal_issue.status).toBe('RESOLVED');

    const removed = await request(app)
      .delete(`/api/projects/${assignedProjectId}/legal-issues/${legalIssueId}`)
      .set(...auth('ADMIN'));
    expect(removed.status).toBe(200);
  });

  it('does not expose a legal issue through a different project', async () => {
    const created = await request(app)
      .post(`/api/projects/${assignedProjectId}/legal-issues`)
      .set(...auth('ADMIN'))
      .send({ issue_type: 'LAND_DISPUTE', severity: 'LOW' });
    const id = created.body.data.legal_issue.id;

    const res = await request(app)
      .get(`/api/projects/${unassignedProjectId}/legal-issues/${id}`)
      .set(...auth('ADMIN'));
    expect(res.status).toBe(404);
  });

  it('creates a risk factor with a real vocabulary code', async () => {
    const vocab = await request(app)
      .get('/api/reference/risk-factor-types')
      .set(...auth('VIEWER'));
    expect(vocab.status).toBe(200);
    const codes = vocab.body.data.risk_factor_types.map((t: { code: string }) => t.code);
    expect(codes).toContain('ENCROACHMENT');

    const created = await request(app)
      .post(`/api/projects/${assignedProjectId}/risk-factors`)
      .set(...auth('ADMIN'))
      .send({
        factor_type: 'ENCROACHMENT',
        factor_name: 'Structures on alignment',
        severity: 'HIGH',
        reported_date: '2024-04-01',
      });
    expect(created.status).toBe(201);
    riskFactorId = created.body.data.risk_factor.id;

    const list = await request(app)
      .get(`/api/projects/${assignedProjectId}/risk-factors`)
      .set(...auth('ANALYST'));
    expect(list.status).toBe(200);
    expect(list.body.data.count).toBeGreaterThanOrEqual(1);
  });

  it('maps an unknown factor type to 422 from the real foreign key', async () => {
    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/risk-factors`)
      .set(...auth('ADMIN'))
      .send({ factor_type: 'NOT_A_REAL_TYPE', factor_name: 'x', severity: 'LOW' });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('risk-factor-types');
  });

  it('updates and deletes a risk factor', async () => {
    const updated = await request(app)
      .patch(`/api/projects/${assignedProjectId}/risk-factors/${riskFactorId}`)
      .set(...auth('OFFICER'))
      .send({ status: 'IN_PROGRESS' });
    expect(updated.status).toBe(200);

    const removed = await request(app)
      .delete(`/api/projects/${assignedProjectId}/risk-factors/${riskFactorId}`)
      .set(...auth('ADMIN'));
    expect(removed.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('LIVE · full project view', () => {
  it('composes every section from the real database', async () => {
    const res = await request(app)
      .get(`/api/projects/${assignedProjectId}/full`)
      .set(...auth('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.project.project_code).toBe(`${TAG}-A`);
    expect(res.body.data.land_acquisition).toBeTruthy();
    expect(res.body.data.compensation).toBeTruthy();
    expect(Array.isArray(res.body.data.legal_issues)).toBe(true);
    expect(res.body.data.summary).toBeTruthy();
  });

  it('refuses the full view on an unassigned project to an OFFICER', async () => {
    const res = await request(app)
      .get(`/api/projects/${unassignedProjectId}/full`)
      .set(...auth('OFFICER'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('LIVE · feature snapshots and the leakage boundary', () => {
  let snapshotId = '';

  it('previews without writing anything', async () => {
    const before = await secret
      .from('project_feature_snapshots')
      .select('id')
      .eq('project_id', assignedProjectId);

    const res = await request(app)
      .get(`/api/projects/${assignedProjectId}/snapshots/preview`)
      .set(...auth('VIEWER'));
    expect(res.status).toBe(200);
    expect(res.body.data.persisted).toBe(false);

    const after = await secret
      .from('project_feature_snapshots')
      .select('id')
      .eq('project_id', assignedProjectId);
    expect(after.data?.length ?? 0).toBe(before.data?.length ?? 0);
  });

  it('creates a snapshot from real project data', async () => {
    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/snapshots`)
      .set(...auth('ADMIN'));
    expect(res.status).toBe(201);
    snapshotId = res.body.data.snapshot.id;

    expect(res.body.data.snapshot.project_id).toBe(assignedProjectId);
    expect(Number(res.body.data.snapshot.acquisition_percentage)).toBe(75);
    expect(res.body.data.data_quality.persisted).toBe(false);
  });

  it('NEVER carries outcome data into a snapshot', async () => {
    // Record real ground truth for this project, then take another snapshot.
    // The feature vector must be unchanged: actual_delay_days lives in
    // actual_outcomes and must never reach the ML input record.
    const { data: snap } = await secret
      .from('project_feature_snapshots')
      .select('id, snapshot_date')
      .eq('project_id', assignedProjectId)
      .limit(1)
      .single();

    // The outcome date must fall AFTER the snapshot it labels — the temporal
    // leakage guard enforces exactly that, and rejected an earlier version of
    // this test that used a past date. Derived from the snapshot's own date so
    // it stays correct as the clock moves.
    const outcomeDate = new Date((snap as { snapshot_date: string }).snapshot_date);
    outcomeDate.setUTCFullYear(outcomeDate.getUTCFullYear() + 1);

    const { error: outcomeError } = await secret.from('actual_outcomes').insert({
      project_id: assignedProjectId,
      feature_snapshot_id: (snap as { id: string }).id,
      actual_delay_days: 365,
      outcome_date: outcomeDate.toISOString().slice(0, 10),
    });
    expect(outcomeError).toBeNull();

    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/snapshots`)
      .set(...auth('ADMIN'));
    expect(res.status).toBe(201);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('actual_delay_days');
    expect(body).not.toContain('delay_days_target');
    expect(body).not.toContain('365');

    const forbidden = [/^actual_/, /target$/, /^outcome/, /overrun/, /predicted/];
    const offending = Object.keys(res.body.data.snapshot).filter((k) =>
      forbidden.some((p) => p.test(k)),
    );
    expect(offending).toEqual([]);
  });

  it('REFUSES an outcome dated before the snapshot it labels', async () => {
    // The temporal half of leakage prevention: a label drawn from before the
    // features were frozen describes a future the model was never shown.
    const { data: snap } = await secret
      .from('project_feature_snapshots')
      .select('id, snapshot_date')
      .eq('project_id', assignedProjectId)
      .limit(1)
      .single();

    const { error } = await secret.from('actual_outcomes').insert({
      project_id: assignedProjectId,
      feature_snapshot_id: (snap as { id: string }).id,
      actual_delay_days: 10,
      outcome_date: '2020-01-01',
    });

    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/leakage/i);
  });

  it('keeps outcomes out of the full project view too', async () => {
    const res = await request(app)
      .get(`/api/projects/${assignedProjectId}/full`)
      .set(...auth('ADMIN'));
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('actual_delay_days');
    expect(body).not.toContain('actual_outcomes');
  });

  it('is immutable — no update or delete route exists', async () => {
    const patched = await request(app)
      .patch(`/api/projects/${assignedProjectId}/snapshots/${snapshotId}`)
      .set(...auth('ADMIN'))
      .send({ court_cases_count: 99 });
    expect(patched.status).toBe(404);

    const deleted = await request(app)
      .delete(`/api/projects/${assignedProjectId}/snapshots/${snapshotId}`)
      .set(...auth('ADMIN'));
    expect(deleted.status).toBe(404);

    const { data } = await secret
      .from('project_feature_snapshots')
      .select('id')
      .eq('id', snapshotId)
      .maybeSingle();
    expect(data).toBeTruthy();
  });

  it('does not change an existing snapshot when project data changes', async () => {
    const before = await request(app)
      .get(`/api/projects/${assignedProjectId}/snapshots/${snapshotId}`)
      .set(...auth('ADMIN'));
    const originalPct = before.body.data.snapshot.acquisition_percentage;

    await request(app)
      .patch(`/api/projects/${assignedProjectId}/land-acquisition`)
      .set(...auth('ADMIN'))
      .send({ land_acquired_ha: '199' });

    const after = await request(app)
      .get(`/api/projects/${assignedProjectId}/snapshots/${snapshotId}`)
      .set(...auth('ADMIN'));
    expect(after.body.data.snapshot.acquisition_percentage).toEqual(originalPct);
  });

  it.each<Role>(['ANALYST', 'VIEWER'])('%s cannot create a snapshot', async (role) => {
    const res = await request(app)
      .post(`/api/projects/${assignedProjectId}/snapshots`)
      .set(...auth(role));
    expect(res.status).toBe(403);
  });

  it('refuses a snapshot when the project has no land data', async () => {
    const res = await request(app)
      .post(`/api/projects/${unassignedProjectId}/snapshots`)
      .set(...auth('ADMIN'));
    expect(res.status).toBe(422);
    expect(res.body.details.issues[0].field).toBe('land_acquisition');
  });
});

// ---------------------------------------------------------------------------
describe('LIVE · validation', () => {
  const base = `/api/projects`;

  it.each([
    ['missing required fields', { project_name: 'x' }],
    ['invalid enum', { project_name: 'x', project_code: `${TAG}-Q1`, state: 'S', district: 'D', sector: 'ROAD', implementing_agency: 'A', project_status: 'NOPE' }],
    ['invalid date', { project_name: 'x', project_code: `${TAG}-Q2`, state: 'S', district: 'D', sector: 'ROAD', implementing_agency: 'A', planned_start_date: '2025-02-30' }],
    ['latitude out of range', { project_name: 'x', project_code: `${TAG}-Q3`, state: 'S', district: 'D', sector: 'ROAD', implementing_agency: 'A', latitude: 120 }],
    ['unknown field', { project_name: 'x', project_code: `${TAG}-Q4`, state: 'S', district: 'D', sector: 'ROAD', implementing_agency: 'A', sneaky: 1 }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(app)
      .post(base)
      .set(...auth('ADMIN'))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid UUID path parameter', async () => {
    const res = await request(app)
      .get(`${base}/not-a-uuid`)
      .set(...auth('ADMIN'));
    expect([400, 404, 422]).toContain(res.status);
  });

  it('returns 404 for a well-formed but non-existent project', async () => {
    const res = await request(app)
      .get(`${base}/aaaaaaaa-0000-4000-8000-0000000000ff`)
      .set(...auth('ADMIN'));
    expect(res.status).toBe(404);
  });

  it.each([
    ['negative land', { land_required_ha: '-5' }],
    ['acquired over required', { land_required_ha: '10', land_acquired_ha: '50' }],
    ['award before notification', { land_required_ha: '10', notification_date: '2024-06-01', award_date: '2024-01-01' }],
  ])('rejects invalid land data: %s', async (_label, body) => {
    const res = await request(app)
      .post(`${base}/${unassignedProjectId}/land-acquisition`)
      .set(...auth('ADMIN'))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects compensation paid exceeding required', async () => {
    const res = await request(app)
      .post(`${base}/${unassignedProjectId}/compensation`)
      .set(...auth('ADMIN'))
      .send({ total_compensation_required: '100', total_compensation_paid: '500' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty update body', async () => {
    const res = await request(app)
      .patch(`${base}/${assignedProjectId}`)
      .set(...auth('ADMIN'))
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects an unknown query parameter', async () => {
    const res = await request(app)
      .get(`${base}?evil=1`)
      .set(...auth('ADMIN'));
    expect(res.status).toBe(400);
  });

  it('never leaks raw database text on error', async () => {
    const res = await request(app)
      .post(base)
      .set(...auth('ADMIN'))
      .send({
        project_name: 'dup',
        project_code: `${TAG}-A`,
        state: 'S',
        district: 'D',
        sector: 'ROAD',
        implementing_agency: 'A',
      });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('duplicate key value');
    expect(body).not.toContain('DETAIL');
    expect(body).not.toContain('projects_project_code_key');
  });
});
