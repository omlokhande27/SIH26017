/**
 * dashboard.api.test.ts — Phase 6 aggregate endpoints, over real HTTP.
 *
 * The SQL aggregation itself lives in migration 0005 and is verified against
 * real PostgreSQL separately; these tests cover the layer above it. The
 * assertion that carries the most weight is SCOPING: these endpoints have no
 * project id for `requireProjectAccess` to guard, and the backend queries with
 * the service-role key which bypasses RLS, so the scope array passed into the
 * SQL is the only thing standing between an OFFICER and national totals.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { supabaseMock } from './helpers/supabase-mock';
import { PROJECTS, USERS, authHeader, seedStandardFixture } from './helpers/api';

vi.mock('../src/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAdmin: supabaseMock,
}));

const { default: app } = await import('../src/app');

type Role = 'ADMIN' | 'ANALYST' | 'OFFICER' | 'VIEWER';
const USER_FOR: Record<Role, string> = {
  ADMIN: USERS.admin,
  ANALYST: USERS.analyst,
  OFFICER: USERS.officer,
  VIEWER: USERS.viewer,
};
const as = (role: Role, claimedRole?: string): [string, string] =>
  authHeader(USER_FOR[role], claimedRole);

const OVERVIEW = {
  total_projects: 12,
  total_projects_with_assessments: 9,
  projects_without_assessments: 3,
  low_risk_projects: 3,
  medium_risk_projects: 2,
  high_risk_projects: 3,
  critical_risk_projects: 1,
  average_predicted_delay_days: '596.0',
  average_risk_score: '54.2',
  latest_assessment_count: 9,
  incomplete_assessments: 2,
  projects_with_pending_compensation: 7,
  projects_with_land_disputes: 2,
  projects_with_litigation: 3,
  projects_with_row_issues: 1,
  projects_with_encroachment: 2,
  projects_with_land_record_issues: 1,
  projects_with_title_issues: 1,
  projects_with_forest_clearance_issues: 2,
  projects_with_rr_issues: 3,
  projects_with_possession_pending: 4,
  projects_with_administrative_delay: 2,
};

const EMPTY_OVERVIEW = Object.fromEntries(
  Object.entries(OVERVIEW).map(([k, v]) => [k, typeof v === 'number' ? 0 : null]),
);

function stubRpcs() {
  supabaseMock.setRpc('lg_dashboard_overview', () => OVERVIEW);
  supabaseMock.setRpc('lg_risk_distribution', () => [
    { risk_level: 'LOW', project_count: 3 },
    { risk_level: 'MEDIUM', project_count: 2 },
    { risk_level: 'HIGH', project_count: 3 },
    { risk_level: 'CRITICAL', project_count: 1 },
  ]);
  supabaseMock.setRpc('lg_analytics_by_state', () => [
    {
      state: 'Maharashtra', total_projects: 7, assessed_projects: 5,
      low_risk: 1, medium_risk: 1, high_risk: 2, critical_risk: 1,
      average_delay_days: '596.0', average_risk_score: '61.0',
      average_acquisition_percentage: '42.50',
      total_compensation_pending: '1875000000.55', projects_with_major_issues: 4,
    },
  ]);
  supabaseMock.setRpc('lg_analytics_land_acquisition', () => ({
    projects_with_land_data: 10,
    total_land_required_ha: '2816.1500',
    total_land_acquired_ha: '1102.4000',
    total_land_pending_ha: '1713.7500',
    average_acquisition_percentage: '48.22',
    overall_acquisition_percentage: '39.15',
    projects_below_25_percent: 2, projects_below_50_percent: 5,
    projects_below_75_percent: 7, projects_fully_acquired: 1,
    projects_possession_obtained: 1,
    total_affected_landowners: 4770, total_affected_families: 4270,
    projects_with_compensation_data: 10,
    total_compensation_required: '4244000000.00',
    total_compensation_paid: '1597000000.00',
    total_compensation_pending: '2647000000.55',
    overall_compensation_pending_percentage: '62.37',
    projects_with_pending_compensation: 7, projects_with_disputed_payment: 1,
  }));
  supabaseMock.setRpc('lg_analytics_delay', () => ({
    assessed_projects: 9,
    average_delay_days: '596.0', median_delay_days: '596.0',
    min_delay_days: '596.00', max_delay_days: '596.00',
    delay_buckets: [
      { range: '0-90 days', project_count: 0 },
      { range: '365-730 days', project_count: 9 },
    ],
    risk_score_buckets: [{ range: '60-80 (HIGH)', project_count: 3 }],
    assessments_by_day: [{ date: '2026-09-12', count: 9 }],
    incomplete_assessments: 2,
    model_types_in_use: ['BASELINE_MEDIAN'],
    confidence_levels_in_use: ['LOW'],
  }));
  supabaseMock.setRpc('lg_high_risk_projects', (args) => {
    const rows = [
      {
        project_id: PROJECTS.assigned, project_name: 'Assigned Project', project_code: 'TEST-A',
        state: 'Maharashtra', district: 'North', sector: 'ROAD',
        implementing_agency: 'Agency A', project_status: 'ACTIVE',
        prediction_id: 'pred-1', risk_level: 'CRITICAL', risk_score: 88.5,
        predicted_delay_days: 596, prediction_type: 'BASELINE_MEDIAN', confidence: 'LOW',
        assessment_complete: true, assessed_at: '2026-09-12T00:00:00Z',
        top_triggered_rules: [{ rule_id: 'LAND_PROGRESS', contribution: 25, rank: 1 }],
        top_recommendations: [
          { title: 'Prioritise acquisition', priority: 'CRITICAL', source_rule_id: 'LAND_PROGRESS', status: 'OPEN' },
        ],
        recommendation_count: 4,
      },
      {
        project_id: PROJECTS.unassigned, project_name: 'Unassigned Project', project_code: 'TEST-B',
        state: 'Gujarat', district: 'South', sector: 'RAILWAY',
        implementing_agency: 'Agency B', project_status: 'PLANNED',
        prediction_id: 'pred-2', risk_level: 'HIGH', risk_score: 72.0,
        predicted_delay_days: 596, prediction_type: 'BASELINE_MEDIAN', confidence: 'LOW',
        assessment_complete: true, assessed_at: '2026-09-12T00:00:00Z',
        top_triggered_rules: [], top_recommendations: [], recommendation_count: 0,
      },
    ];
    const limit = Number(args.p_limit ?? 10);
    const state = args.p_state as string | null;
    const level = args.p_risk_level as string | null;
    return rows
      .filter((r) => (!state || r.state === state) && (!level || r.risk_level === level))
      .slice(0, limit);
  });
  supabaseMock.setRpc('lg_compare_projects', (args) => {
    const ids = (args.p_ids as string[]) ?? [];
    const scope = args.p_project_ids as string[] | null;
    return ids
      .filter((id) => scope === null || scope.includes(id))
      .map((id) => ({
        project_id: id, project_name: `Project ${id.slice(-1)}`, project_code: 'X',
        state: 'S', district: 'D', sector: 'ROAD', implementing_agency: 'A',
        project_status: 'ACTIVE',
        land_required_ha: '200.0000', land_acquired_ha: '50.0000',
        land_acquisition_percentage: '25.0000', possession_obtained: false,
        affected_families: 250,
        compensation_required: '1000000.55', compensation_paid: '250000.25',
        compensation_pending: '750000.30', compensation_pending_percentage: '75.0000',
        payment_status: 'IN_PROGRESS',
        issues: { litigation: true, encroachment: false, court_cases_count: 1 },
        assessment: {
          prediction_id: 'p1', risk_level: 'CRITICAL', risk_score: 88.5,
          predicted_delay_days: 596, prediction_type: 'BASELINE_MEDIAN',
          confidence: 'LOW', assessment_complete: true, rule_coverage_pct: 93.3,
          assessed_at: '2026-09-12T00:00:00Z',
        },
        has_assessment: true, recommendation_count: 3,
      }));
  });
}

beforeEach(() => {
  seedStandardFixture();
  stubRpcs();
});

// ---------------------------------------------------------------------------
describe('authentication', () => {
  it.each([
    '/api/dashboard/overview',
    '/api/dashboard/risk-distribution',
    '/api/dashboard/high-risk-projects',
    '/api/analytics/by-state',
    '/api/analytics/land-acquisition',
    '/api/analytics/delay',
  ])('%s rejects an unauthenticated request', async (path) => {
    expect((await request(app).get(path)).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('PROJECT SCOPING — the authorization boundary for aggregates', () => {
  it.each<Role>(['ADMIN', 'ANALYST', 'VIEWER'])(
    '%s gets an UNSCOPED query (p_project_ids = null)',
    async (role) => {
      await request(app).get('/api/dashboard/overview').set(...as(role));
      const call = supabaseMock.rpcCalls.find((c) => c.fn === 'lg_dashboard_overview');
      expect(call?.args.p_project_ids).toBeNull();
    },
  );

  it('OFFICER gets a query scoped to their assigned projects', async () => {
    // The critical one. Without this the officer would see national totals
    // through an endpoint that looks harmless.
    await request(app).get('/api/dashboard/overview').set(...as('OFFICER'));
    const call = supabaseMock.rpcCalls.find((c) => c.fn === 'lg_dashboard_overview');
    expect(Array.isArray(call?.args.p_project_ids)).toBe(true);
    expect(call?.args.p_project_ids).toEqual([PROJECTS.assigned]);
  });

  it('OFFICER with no assignments gets an EMPTY scope, not an unscoped query', async () => {
    // `[]` and `null` mean opposite things to the SQL. Getting this backwards
    // would turn "sees nothing" into "sees everything".
    supabaseMock.setTable('project_assignments', []);
    supabaseMock.setTable('projects', [
      { id: PROJECTS.assigned, created_by: USERS.admin, state: 'Maharashtra' },
    ]);

    await request(app).get('/api/dashboard/overview').set(...as('OFFICER'));
    const call = supabaseMock.rpcCalls.find((c) => c.fn === 'lg_dashboard_overview');
    expect(call?.args.p_project_ids).toEqual([]);
    expect(call?.args.p_project_ids).not.toBeNull();
  });

  it.each([
    ['risk-distribution', '/api/dashboard/risk-distribution', 'lg_risk_distribution'],
    ['by-state', '/api/analytics/by-state', 'lg_analytics_by_state'],
    ['land-acquisition', '/api/analytics/land-acquisition', 'lg_analytics_land_acquisition'],
    ['delay', '/api/analytics/delay', 'lg_analytics_delay'],
    ['high-risk', '/api/dashboard/high-risk-projects', 'lg_high_risk_projects'],
  ])('%s scopes an OFFICER too', async (_label, path, fn) => {
    // Every aggregate endpoint, not just the first one. A single unscoped
    // query is a leak regardless of how many others are correct.
    await request(app).get(path).set(...as('OFFICER'));
    const call = supabaseMock.rpcCalls.find((c) => c.fn === fn);
    expect(call?.args.p_project_ids).toEqual([PROJECTS.assigned]);
  });

  it('role comes from profiles, not the ADMIN claim in the token', async () => {
    // Every token this suite mints claims user_metadata.role = ADMIN. If that
    // were trusted, the OFFICER below would get an unscoped query.
    await request(app).get('/api/dashboard/overview').set(...as('OFFICER', 'ADMIN'));
    const call = supabaseMock.rpcCalls.find((c) => c.fn === 'lg_dashboard_overview');
    expect(call?.args.p_project_ids).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/dashboard/overview', () => {
  it('returns the counts the SQL produced', async () => {
    const res = await request(app).get('/api/dashboard/overview').set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.overview.total_projects).toBe(12);
    expect(res.body.data.overview.critical_risk_projects).toBe(1);
    expect(res.body.data.overview.projects_with_litigation).toBe(3);
  });

  it('keeps NUMERIC averages as strings', async () => {
    // Precision survives the wire; parsing to float is the client's decision.
    const res = await request(app).get('/api/dashboard/overview').set(...as('ADMIN'));
    expect(res.body.data.overview.average_predicted_delay_days).toBe('596.0');
    expect(typeof res.body.data.overview.average_predicted_delay_days).toBe('string');
  });

  it('carries the ML honesty disclosure', async () => {
    const res = await request(app).get('/api/dashboard/overview').set(...as('ADMIN'));
    const d = res.body.data.disclosure;
    expect(d.primary_signal).toBe('RULE_ENGINE');
    expect(d.delay_estimate_note).toContain('not a model prediction');
    expect(d.limitations).toContain('ml_outperforms_baseline_false');
  });

  it('handles an empty database without inventing anything', async () => {
    supabaseMock.setRpc('lg_dashboard_overview', () => EMPTY_OVERVIEW);
    const res = await request(app).get('/api/dashboard/overview').set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.overview.total_projects).toBe(0);
    expect(res.body.data.overview.average_predicted_delay_days).toBeNull();
  });

  it('returns 503 when the aggregation function is unavailable', async () => {
    supabaseMock.failRpc('lg_dashboard_overview', 'connection refused');
    const res = await request(app).get('/api/dashboard/overview').set(...as('ADMIN'));
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/dashboard/risk-distribution', () => {
  it('returns all four bands with a total', async () => {
    const res = await request(app).get('/api/dashboard/risk-distribution').set(...as('VIEWER'));
    expect(res.status).toBe(200);
    expect(res.body.data.distribution.map((r: { risk_level: string }) => r.risk_level)).toEqual([
      'LOW', 'MEDIUM', 'HIGH', 'CRITICAL',
    ]);
    expect(res.body.data.total_assessed).toBe(9);
  });

  it('includes an empty band rather than omitting it', async () => {
    // A chart that drops CRITICAL because nothing is critical implies the band
    // cannot occur.
    supabaseMock.setRpc('lg_risk_distribution', () => [
      { risk_level: 'LOW', project_count: 2 },
      { risk_level: 'MEDIUM', project_count: 0 },
      { risk_level: 'HIGH', project_count: 0 },
      { risk_level: 'CRITICAL', project_count: 0 },
    ]);
    const res = await request(app).get('/api/dashboard/risk-distribution').set(...as('ADMIN'));
    expect(res.body.data.distribution).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/dashboard/high-risk-projects', () => {
  it('returns projects ranked with their rules and recommendations', async () => {
    const res = await request(app).get('/api/dashboard/high-risk-projects').set(...as('ADMIN'));
    expect(res.status).toBe(200);
    const first = res.body.data.projects[0];
    expect(first.risk_score).toBe(88.5);
    expect(first.top_triggered_rules[0].rule_id).toBe('LAND_PROGRESS');
    expect(first.top_recommendations[0].priority).toBe('CRITICAL');
    expect(first.recommendation_count).toBe(4);
  });

  it('applies the limit', async () => {
    const res = await request(app)
      .get('/api/dashboard/high-risk-projects?limit=1')
      .set(...as('ADMIN'));
    expect(res.body.data.projects).toHaveLength(1);
  });

  it('filters by state and risk level', async () => {
    const byState = await request(app)
      .get('/api/dashboard/high-risk-projects?state=Gujarat')
      .set(...as('ADMIN'));
    expect(byState.body.data.projects).toHaveLength(1);
    expect(byState.body.data.projects[0].state).toBe('Gujarat');

    const byLevel = await request(app)
      .get('/api/dashboard/high-risk-projects?risk_level=CRITICAL')
      .set(...as('ADMIN'));
    expect(byLevel.body.data.projects.every((p: { risk_level: string }) => p.risk_level === 'CRITICAL')).toBe(true);
  });

  it.each([
    ['limit above the cap', 'limit=500'],
    ['limit below 1', 'limit=0'],
    ['unknown risk level', 'risk_level=EXTREME'],
    ['unknown query parameter', 'evil=1'],
  ])('rejects %s with 400', async (_label, qs) => {
    const res = await request(app)
      .get(`/api/dashboard/high-risk-projects?${qs}`)
      .set(...as('ADMIN'));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('analytics endpoints', () => {
  it('by-state returns per-state rows with exact money', async () => {
    const res = await request(app).get('/api/analytics/by-state').set(...as('ANALYST'));
    expect(res.status).toBe(200);
    const row = res.body.data.states[0];
    expect(row.state).toBe('Maharashtra');
    // Aggregated in SQL as NUMERIC; a float sum would not survive this.
    expect(row.total_compensation_pending).toBe('1875000000.55');
  });

  it('land-acquisition returns both averages and exact totals', async () => {
    const res = await request(app).get('/api/analytics/land-acquisition').set(...as('VIEWER'));
    expect(res.status).toBe(200);
    const a = res.body.data.analytics;
    // Two different questions: mean of per-project percentages vs the
    // portfolio position. Reporting one as the other would mislead.
    expect(a.average_acquisition_percentage).toBe('48.22');
    expect(a.overall_acquisition_percentage).toBe('39.15');
    expect(a.total_compensation_pending).toBe('2647000000.55');
    expect(res.body.data.note).toContain('NUMERIC');
  });

  it('delay analytics preserves the honesty metadata', async () => {
    const res = await request(app).get('/api/analytics/delay').set(...as('ADMIN'));
    expect(res.status).toBe(200);
    const a = res.body.data.analytics;
    expect(a.model_types_in_use).toContain('BASELINE_MEDIAN');
    expect(a.confidence_levels_in_use).toContain('LOW');
    expect(res.body.data.disclosure.limitations).toContain('ml_outperforms_baseline_false');
  });

  it('delay analytics reports buckets and trend data', async () => {
    const res = await request(app).get('/api/analytics/delay').set(...as('ADMIN'));
    const a = res.body.data.analytics;
    expect(Array.isArray(a.delay_buckets)).toBe(true);
    expect(Array.isArray(a.risk_score_buckets)).toBe(true);
    expect(Array.isArray(a.assessments_by_day)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/projects/compare', () => {
  const A = PROJECTS.assigned;
  const B = PROJECTS.unassigned;

  it('compares two projects', async () => {
    const res = await request(app)
      .get(`/api/projects/compare?ids=${A},${B}`)
      .set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.returned).toBe(2);
    expect(res.body.data.unavailable).toEqual([]);
  });

  it('is not captured by the /projects/:projectId route', async () => {
    // "compare" must not be parsed as a project id — route order matters.
    const res = await request(app)
      .get(`/api/projects/compare?ids=${A},${B}`)
      .set(...as('ADMIN'));
    expect(res.status).not.toBe(404);
    expect(res.body.data.projects).toBeDefined();
  });

  it('omits projects the caller cannot see, and says so', async () => {
    // Not distinguished from "does not exist": telling a caller that a project
    // exists but is not theirs is an enumeration oracle.
    const res = await request(app)
      .get(`/api/projects/compare?ids=${A},${B}`)
      .set(...as('OFFICER'));
    expect(res.status).toBe(200);
    expect(res.body.data.returned).toBe(1);
    expect(res.body.data.unavailable).toEqual([B]);
  });

  it.each([
    ['invalid UUID', 'ids=not-a-uuid,also-bad'],
    ['duplicate ids', `ids=${PROJECTS.assigned},${PROJECTS.assigned}`],
    ['only one id', `ids=${PROJECTS.assigned}`],
    ['missing ids', ''],
    ['unknown parameter', `ids=${PROJECTS.assigned},${PROJECTS.unassigned}&evil=1`],
  ])('rejects %s with 400', async (_label, qs) => {
    const res = await request(app).get(`/api/projects/compare?${qs}`).set(...as('ADMIN'));
    expect(res.status).toBe(400);
  });

  it('rejects more than 10 projects', async () => {
    const ids = Array.from({ length: 11 }, (_, i) =>
      `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
    ).join(',');
    const res = await request(app).get(`/api/projects/compare?ids=${ids}`).set(...as('ADMIN'));
    expect(res.status).toBe(400);
  });
});
