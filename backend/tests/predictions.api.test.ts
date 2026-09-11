/**
 * predictions.api.test.ts — the Phase 5 orchestration, over real HTTP.
 *
 * The Supabase client is faked and the ML service is stubbed at `fetch`, so the
 * REAL client code runs and the actual request body can be inspected. That
 * matters for the leakage assertions: stubbing the client module would test
 * the stub's payload rather than the one the backend would really send.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { supabaseMock } from './helpers/supabase-mock';
import { PROJECTS, USERS, authHeader, seedStandardFixture } from './helpers/api';

/**
 * `authHeader` takes a user id, not a role name. Mapping here keeps the tests
 * readable as a policy matrix while still minting a token for the right user.
 */
type Role = 'ADMIN' | 'ANALYST' | 'OFFICER' | 'VIEWER';
const USER_FOR: Record<Role, string> = {
  ADMIN: USERS.admin,
  ANALYST: USERS.analyst,
  OFFICER: USERS.officer,
  VIEWER: USERS.viewer,
};
const as = (role: Role, claimedRole?: string): [string, string] =>
  authHeader(USER_FOR[role], claimedRole);

vi.mock('../src/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAdmin: supabaseMock,
}));

const { default: app } = await import('../src/app');

const base = `/api/projects/${PROJECTS.assigned}`;

const SNAPSHOT_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER_SNAPSHOT_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

/** A complete assessment, as the ML service returns one. */
const mlResponse = {
  project_id: PROJECTS.assigned,
  snapshot_id: SNAPSHOT_ID,
  risk_score: 72.5,
  risk_level: 'HIGH',
  triggered_rules: [
    {
      rule_id: 'LAND_PROGRESS',
      factor: 'Land Acquisition Progress',
      category: 'LAND',
      severity: 'HIGH',
      contribution: 18,
      reason: 'Only 40% of required land has been acquired',
      evidence: { acquisition_percentage: 40 },
    },
    {
      rule_id: 'COMP_PENDING',
      factor: 'Pending Compensation',
      category: 'COMPENSATION',
      severity: 'MEDIUM',
      contribution: 12,
      reason: '45% of compensation outstanding',
      evidence: { compensation_pending_percentage: 45 },
    },
  ],
  skipped_rules: [
    {
      rule_id: 'TL_AWARD',
      factor: 'Award Delay',
      category: 'TIMELINE',
      missing_fields: ['award_delay_days'],
      reason: 'Cannot evaluate: award_delay_days is not recorded for this project.',
    },
  ],
  coverage: {
    rules_total: 15,
    rules_evaluated: 14,
    rules_skipped: 1,
    coverage_pct: 93.3,
    sufficient: true,
    missing_core_inputs: [],
  },
  recommendations: [
    {
      title: 'Prioritise acquisition for critical project sections',
      action: 'Identify the alignment segments blocking construction start.',
      priority: 'HIGH',
      rationale: 'Only 40% of required land has been acquired',
      linked_rule_ids: ['LAND_PROGRESS'],
    },
  ],
  explanation: 'This project is at high risk of land-acquisition delay (risk score 73/100).',
  ml_estimate: {
    predicted_delay_days: 596,
    prediction_type: 'BASELINE_MEDIAN',
    model_version: '0.1.0-median_baseline',
    model_type: 'median_baseline',
    confidence: 'LOW',
    beats_baseline: false,
    note: 'This is the MEDIAN historical delay, not a model prediction.',
  },
  limitations: {
    dataset_size_limited: true,
    feature_variance_limited: true,
    predictors_largely_imputed: true,
    ml_outperforms_baseline: false,
    rule_coverage_sufficient: true,
  },
};

const modelInfoResponse = {
  model_version: '0.1.0-median_baseline',
  model_type: 'median_baseline',
  trained_at: '2026-09-11T00:00:00Z',
  training_rows: 130,
  distinct_feature_vectors: 22,
  features: [],
  metrics: { mae: 306.8, rmse: 374.2, r2: -0.009 },
  baseline_metrics: { mae: 306.8 },
  beats_baseline: false,
};

/** Captures every request body sent to the ML service. */
let mlRequests: Array<{ url: string; body: unknown }> = [];

function stubMlService(overrides: { predict?: unknown; status?: number } = {}) {
  mlRequests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      mlRequests.push({ url: String(url), body });

      if (overrides.status && overrides.status >= 400) {
        return { ok: false, status: overrides.status, text: async () => 'ml error' } as Response;
      }
      if (String(url).includes('/model-info')) {
        return { ok: true, status: 200, json: async () => modelInfoResponse } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => overrides.predict ?? mlResponse,
      } as Response;
    }),
  );
}

function seedSnapshot(projectId = PROJECTS.assigned) {
  supabaseMock.setTable('project_feature_snapshots', [
    {
      id: SNAPSHOT_ID,
      project_id: projectId,
      snapshot_date: '2026-09-11T00:00:00Z',
      created_at: '2026-09-11T00:00:00Z',
      land_required_ha: 200,
      land_acquired_ha: 80,
      acquisition_percentage: 40,
      compensation_pending: 450000,
      compensation_pending_percentage: 45,
      affected_landowners: 300,
      affected_families: 250,
      court_cases_count: 1,
      litigation_flag: true,
      land_dispute_flag: false,
      title_issue_flag: false,
      land_record_issue_flag: false,
      r_and_r_required: false,
      r_and_r_pending: false,
      row_issue: false,
      encroachment: false,
      forest_clearance_pending: false,
      possession_pending: false,
      administrative_delay: false,
      notification_delay_days: 90,
      award_delay_days: null,
    },
  ]);
}

beforeEach(() => {
  seedStandardFixture();
  seedSnapshot();
  supabaseMock.setTable('predictions', []);
  supabaseMock.setTable('prediction_explanations', []);
  supabaseMock.setTable('recommendations', []);
  supabaseMock.setTable('model_versions', []);
  supabaseMock.setTable('actual_outcomes', []);
  stubMlService();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
describe('POST predictions — orchestration', () => {
  it('runs the full workflow and returns a combined assessment', async () => {
    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({});

    expect(res.status).toBe(201);
    const body = res.body.data;
    expect(body.prediction).toBeDefined();
    expect(body.risk_assessment).toBeDefined();
    expect(body.recommendations).toBeDefined();
    expect(body.limitations).toBeDefined();
    expect(body.snapshot.id).toBe(SNAPSHOT_ID);
  });

  it('keeps the delay estimate and the risk assessment SEPARATE', async () => {
    // No blended "AI confidence" score. The rule engine is deterministic; the
    // delay figure is a median with no project-specific signal. Averaging them
    // would produce a number that looks authoritative and means nothing.
    const body = (
      await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({})
    ).body.data;

    expect(body.prediction.predicted_delay_days).toBe(596);
    expect(body.prediction.prediction_type).toBe('BASELINE_MEDIAN');
    expect(body.prediction.confidence).toBe('LOW');
    expect(body.risk_assessment.risk_score).toBe(72.5);
    expect(body.risk_assessment.risk_level).toBe('HIGH');
    expect(body).not.toHaveProperty('combined_confidence');
    expect(body).not.toHaveProperty('ai_score');
  });

  it('reports the limitations as flags', async () => {
    const body = (
      await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({})
    ).body.data;

    expect(body.limitations).toContain('dataset_size_limited');
    expect(body.limitations).toContain('feature_variance_limited');
    expect(body.limitations).toContain('predictors_largely_imputed');
    expect(body.limitations).toContain('ml_outperforms_baseline_false');
  });

  it('states plainly that the figure is not a model prediction', async () => {
    const body = (
      await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({})
    ).body.data;
    expect(body.prediction.note).toContain('not a model prediction');
  });

  it('creates a snapshot when the project has none', async () => {
    supabaseMock.setTable('project_feature_snapshots', []);
    supabaseMock.setTable('land_acquisition', [
      {
        id: 'land-1', project_id: PROJECTS.assigned,
        land_required_ha: 100, land_acquired_ha: 40, land_acquisition_percentage: 40,
        affected_landowners: 10, affected_families: 8, possession_obtained: false,
        notification_date: '2024-02-01', award_date: null, possession_date: null,
      },
    ]);

    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({});

    expect(res.status).toBe(201);
    expect(supabaseMock.getTable('project_feature_snapshots')).toHaveLength(1);
  });

  it('uses an explicitly supplied snapshot_id', async () => {
    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({ snapshot_id: SNAPSHOT_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.snapshot.id).toBe(SNAPSHOT_ID);
  });

  it('refuses a snapshot belonging to another project', async () => {
    // Scoped by (project_id, id), so a foreign snapshot is a 404 rather than
    // being silently assessed under the wrong project.
    supabaseMock.setTable('project_feature_snapshots', [
      { id: OTHER_SNAPSHOT_ID, project_id: PROJECTS.unassigned, snapshot_date: '2026-01-01T00:00:00Z' },
    ]);

    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({ snapshot_id: OTHER_SNAPSHOT_ID });

    expect(res.status).toBe(404);
  });

  it('rejects an unknown body field', async () => {
    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({ predicted_delay_days: 1 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('persistence', () => {
  it('saves the prediction against the right project and snapshot', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const stored = supabaseMock.getTable('predictions');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.project_id).toBe(PROJECTS.assigned);
    expect(stored[0]?.feature_snapshot_id).toBe(SNAPSHOT_ID);
    expect(stored[0]?.prediction_status).toBe('SUCCESS');
  });

  it('persists both signals without merging them', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const row = supabaseMock.getTable('predictions')[0]!;
    expect(row.predicted_delay_days).toBe(596);
    expect(row.prediction_type).toBe('BASELINE_MEDIAN');
    expect(row.confidence).toBe('LOW');
    expect(row.risk_score).toBe(72.5);
    expect(row.risk_level).toBe('HIGH');
    expect(row.rule_coverage_pct).toBe(93.3);
    expect(row.assessment_complete).toBe(true);
  });

  it('saves one explanation per triggered rule, ranked and sourced', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const explanations = supabaseMock.getTable('prediction_explanations');
    expect(explanations).toHaveLength(2);
    expect(explanations[0]?.rank).toBe(1);
    expect(explanations[0]?.feature_name).toBe('LAND_PROGRESS');
    expect(explanations[0]?.contribution_score).toBe(18);
    // The column that stops a rule finding being read as a model's
    // self-attribution.
    expect(explanations.every((e) => e.explanation_source === 'RULE_ENGINE')).toBe(true);
  });

  it('ranks explanations by contribution', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});
    const explanations = supabaseMock.getTable('prediction_explanations');
    const byRank = [...explanations].sort((a, b) => Number(a.rank) - Number(b.rank));
    expect(Number(byRank[0]?.contribution_score)).toBeGreaterThan(
      Number(byRank[1]?.contribution_score),
    );
  });

  it('saves recommendations linked to the rule that triggered them', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const recs = supabaseMock.getTable('recommendations');
    expect(recs).toHaveLength(1);
    expect(recs[0]?.source_rule_id).toBe('LAND_PROGRESS');
    expect(recs[0]?.status).toBe('OPEN');
    expect(recs[0]?.priority).toBe('HIGH');
  });

  it('registers the model version as STAGING, not ACTIVE', async () => {
    // The current baseline lost to a median; promoting it to ACTIVE would be
    // an endorsement it has not earned, and the table permits only one ACTIVE
    // row — auto-promoting would block a future genuine model.
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const versions = supabaseMock.getTable('model_versions');
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe('0.1.0-median_baseline');
    expect(versions[0]?.status).toBe('STAGING');
    expect(versions[0]?.r2_score).toBe(-0.009);
  });

  it('reuses an existing model version row rather than duplicating it', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    expect(supabaseMock.getTable('model_versions')).toHaveLength(1);
    expect(supabaseMock.getTable('predictions')).toHaveLength(2);
  });

  it('does not modify the snapshot it assessed', async () => {
    const before = JSON.stringify(supabaseMock.getTable('project_feature_snapshots'));
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});
    expect(JSON.stringify(supabaseMock.getTable('project_feature_snapshots'))).toBe(before);
  });
});

// ---------------------------------------------------------------------------
describe('LEAKAGE — outcome data never reaches the ML service', () => {
  it('sends only the whitelisted snapshot fields', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const predictCall = mlRequests.find((r) => r.url.includes('/predict'));
    const sent = (predictCall?.body as { snapshot: Record<string, unknown> }).snapshot;

    expect(Object.keys(sent).sort()).toEqual(
      [
        'acquisition_percentage', 'administrative_delay', 'affected_families',
        'affected_landowners', 'award_delay_days', 'compensation_pending',
        'compensation_pending_percentage', 'court_cases_count', 'encroachment',
        'forest_clearance_pending', 'land_acquired_ha', 'land_dispute_flag',
        'land_record_issue_flag', 'land_required_ha', 'litigation_flag',
        'notification_delay_days', 'possession_pending', 'project_id',
        'r_and_r_pending', 'r_and_r_required', 'row_issue', 'snapshot_date',
        'snapshot_id', 'title_issue_flag',
      ].sort(),
    );
  });

  it('does NOT forward outcome columns even when the snapshot row carries them', async () => {
    // The scenario a future schema change would create: someone adds a column
    // to the snapshot SELECT and it flows straight to the model. The payload
    // builder enumerates fields, so it cannot.
    const rows = supabaseMock.getTable('project_feature_snapshots');
    rows[0] = { ...rows[0], actual_delay_days: 365, delay_days_target: 500 } as never;
    supabaseMock.setTable('project_feature_snapshots', rows);

    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const predictCall = mlRequests.find((r) => r.url.includes('/predict'));
    const serialised = JSON.stringify(predictCall?.body);
    expect(serialised).not.toContain('actual_delay_days');
    expect(serialised).not.toContain('delay_days_target');
    expect(serialised).not.toContain('365');
  });

  it('never reads actual_outcomes during prediction', async () => {
    // Ground truth exists for this project. If the orchestrator touched that
    // table, this value would be reachable.
    supabaseMock.setTable('actual_outcomes', [
      {
        id: 'ao-1', project_id: PROJECTS.assigned, feature_snapshot_id: SNAPSHOT_ID,
        actual_delay_days: 999, outcome_date: '2027-01-01',
      },
    ]);

    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({});

    expect(JSON.stringify(mlRequests)).not.toContain('999');
    expect(JSON.stringify(res.body)).not.toContain('999');
    expect(JSON.stringify(res.body)).not.toContain('actual_delay_days');
  });
});

// ---------------------------------------------------------------------------
describe('ML service failures', () => {
  it('returns 503 and saves NOTHING when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({});

    expect(res.status).toBe(503);
    // A prediction row with no assessment behind it is worse than no row.
    expect(supabaseMock.getTable('predictions')).toHaveLength(0);
    expect(supabaseMock.getTable('prediction_explanations')).toHaveLength(0);
  });

  it('returns 503 when the service rejects our API key', async () => {
    stubMlService({ status: 401 });
    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({});
    expect(res.status).toBe(503);
  });

  it('refuses to persist when the service returns no delay estimate', async () => {
    stubMlService({
      predict: {
        ...mlResponse,
        ml_estimate: { ...mlResponse.ml_estimate, predicted_delay_days: null, prediction_type: 'UNAVAILABLE' },
      },
    });

    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({});

    expect(res.status).toBe(422);
    expect(supabaseMock.getTable('predictions')).toHaveLength(0);
  });

  it('never leaks a stack trace or the ML error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false, status: 500,
        text: async () => 'Traceback: project secret-123 failed at line 42',
      }),
    );

    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('ADMIN'))
      .send({});

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Traceback');
    expect(body).not.toContain('secret-123');
  });
});

// ---------------------------------------------------------------------------
describe('authorization', () => {
  it('rejects an unauthenticated request', async () => {
    expect((await request(app).post(`${base}/predictions`).send({})).status).toBe(401);
  });

  it('lets an assigned OFFICER run a prediction', async () => {
    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('OFFICER'))
      .send({});
    expect(res.status).toBe(201);
  });

  it('refuses an OFFICER on an unassigned project', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECTS.unassigned}/predictions`)
      .set(...as('OFFICER'))
      .send({});
    expect(res.status).toBe(403);
    expect(supabaseMock.getTable('predictions')).toHaveLength(0);
  });

  it.each(['ANALYST', 'VIEWER'] as const)(
    '%s cannot run a prediction — creating one is a write',
    async (role) => {
      const res = await request(app)
        .post(`${base}/predictions`)
        .set(...as(role))
        .send({});
      expect(res.status).toBe(403);
      expect(supabaseMock.getTable('predictions')).toHaveLength(0);
    },
  );

  it.each(['ANALYST', 'VIEWER'] as const)('%s CAN read assessments', async (role) => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const res = await request(app)
      .get(`${base}/predictions`)
      .set(...as(role));
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
  });

  it('role comes from profiles, not the ADMIN claim in every test token', async () => {
    // Every token this suite mints claims user_metadata.role = ADMIN. If that
    // were trusted, the VIEWER below would succeed.
    const res = await request(app)
      .post(`${base}/predictions`)
      .set(...as('VIEWER', 'ADMIN'))
      .send({});
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('reads', () => {
  it('returns 404 for latest when no prediction exists', async () => {
    const res = await request(app)
      .get(`${base}/predictions/latest`)
      .set(...as('ADMIN'));
    expect(res.status).toBe(404);
  });

  it('returns the most recent prediction', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const res = await request(app)
      .get(`${base}/predictions/latest`)
      .set(...as('ADMIN'));
    expect(res.status).toBe(200);
    expect(res.body.data.prediction.project_id).toBe(PROJECTS.assigned);
  });

  it('lists prediction history', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const res = await request(app)
      .get(`${base}/predictions`)
      .set(...as('ADMIN'));
    expect(res.body.data.count).toBe(2);
  });

  it('returns the STORED assessment, not a recomputed one', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});

    const res = await request(app)
      .get(`${base}/assessment`)
      .set(...as('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data.prediction).toBeDefined();
    expect(res.body.data.explanations).toHaveLength(2);
    expect(res.body.data.recommendations).toHaveLength(1);
  });

  it('refuses an OFFICER the assessment of an unassigned project', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECTS.unassigned}/assessment`)
      .set(...as('OFFICER'));
    expect(res.status).toBe(403);
  });

  it('exposes no route to edit or delete a prediction', async () => {
    await request(app).post(`${base}/predictions`).set(...as('ADMIN')).send({});
    const id = supabaseMock.getTable('predictions')[0]?.id;

    const patched = await request(app)
      .patch(`${base}/predictions/${id}`)
      .set(...as('ADMIN'))
      .send({ risk_level: 'LOW' });
    expect(patched.status).toBe(404);

    const deleted = await request(app)
      .delete(`${base}/predictions/${id}`)
      .set(...as('ADMIN'));
    expect(deleted.status).toBe(404);
  });
});
