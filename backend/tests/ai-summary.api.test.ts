/**
 * ai-summary.api.test.ts — the optional AI explanation layer.
 *
 * Two properties matter more than the rest.
 *
 * FIRST, the layer is genuinely optional: without OPENAI_API_KEY the backend
 * starts, every other endpoint works, and only this one returns 503. A system
 * whose core function depends on a third-party LLM being reachable is a system
 * that stops working when it is not.
 *
 * SECOND, the model is given verified facts and told what it may not say. The
 * prompt assertions below are not decoration — an LLM handed a risk assessment
 * will otherwise reach for "the AI predicts a 596-day delay with high
 * confidence", which is false twice over: no model produced that figure, and
 * the confidence is LOW.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { supabaseMock } from './helpers/supabase-mock';
import { PROJECTS, USERS, authHeader, seedStandardFixture } from './helpers/api';

vi.mock('../src/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAdmin: supabaseMock,
}));

const { default: app } = await import('../src/app');
const { __testing } = await import('../src/services/ai-summary.service');

type Role = 'ADMIN' | 'ANALYST' | 'OFFICER' | 'VIEWER';
const USER_FOR: Record<Role, string> = {
  ADMIN: USERS.admin, ANALYST: USERS.analyst,
  OFFICER: USERS.officer, VIEWER: USERS.viewer,
};
const as = (role: Role): [string, string] => authHeader(USER_FOR[role]);

const base = `/api/projects/${PROJECTS.assigned}`;

/** Captures what was actually sent to the provider. */
let aiRequests: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];

function stubProvider(opts: { status?: number; content?: string } = {}) {
  aiRequests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      aiRequests.push({
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      if (opts.status && opts.status >= 400) {
        return { ok: false, status: opts.status, text: async () => 'provider error body' } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'gpt-4o-mini',
          choices: [{ message: { content: opts.content ?? '## Executive Summary\nRule-based assessment.' } }],
        }),
      } as Response;
    }),
  );
}

function seedAssessment() {
  supabaseMock.setTable('predictions', [
    {
      id: 'pred-1', project_id: PROJECTS.assigned, feature_snapshot_id: 'snap-1',
      predicted_delay_days: 596, risk_level: 'CRITICAL', prediction_status: 'SUCCESS',
      prediction_type: 'BASELINE_MEDIAN', confidence: 'LOW', risk_score: 88.5,
      rule_coverage_pct: 93.3, assessment_complete: true, missing_core_inputs: [],
      limitations: { dataset_size_limited: true, ml_outperforms_baseline: false },
      created_at: '2026-09-12T00:00:00Z',
    },
  ]);
  supabaseMock.setTable('prediction_explanations', [
    {
      id: 'e1', prediction_id: 'pred-1', feature_name: 'LAND_PROGRESS',
      feature_value: 25, contribution_score: 25, contribution_direction: 'INCREASES_DELAY',
      rank: 1, explanation_source: 'RULE_ENGINE',
    },
  ]);
  supabaseMock.setTable('recommendations', [
    {
      id: 'r1', prediction_id: 'pred-1', title: 'Prioritise acquisition',
      description: 'Only 25% acquired', priority: 'CRITICAL',
      recommended_action: 'Convene a review', status: 'OPEN',
      source_rule_id: 'LAND_PROGRESS', created_at: '2026-09-12T00:00:00Z',
    },
  ]);
}

beforeEach(() => {
  seedStandardFixture();
  seedAssessment();
  process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key';
  stubProvider();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
describe('optionality — the system works without OpenAI', () => {
  it('returns 503 with a clear message when no key is configured', async () => {
    // `features.llmExplanations` is resolved at module load from the env that
    // tests/setup.ts establishes, which has no OPENAI_API_KEY — so this is the
    // real unconfigured path, not a simulated one.
    const res = await request(app).post(`${base}/ai-summary`).set(...as('ADMIN'));
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('OPENAI_API_KEY');
    expect(res.body.error).toContain('unaffected');
  });

  it('does not call the provider when unconfigured', async () => {
    await request(app).post(`${base}/ai-summary`).set(...as('ADMIN'));
    expect(aiRequests).toHaveLength(0);
  });

  it('every other endpoint keeps working without a key', async () => {
    supabaseMock.setRpc('lg_dashboard_overview', () => ({ total_projects: 3 }));
    const res = await request(app).get('/api/dashboard/overview').set(...as('ADMIN'));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('prompt construction — hallucination prevention', () => {
  const prompt = __testing.SYSTEM_PROMPT;

  it('instructs the model to use only the provided facts', () => {
    expect(prompt).toContain('USE ONLY THE PROVIDED FACTS');
    expect(prompt.toLowerCase()).toContain('do not invent');
  });

  it('requires missing information to be stated, not filled in', () => {
    expect(prompt.toLowerCase()).toContain('unavailable');
    expect(prompt.toLowerCase()).toContain('never fill a gap');
  });

  it('forbids describing the baseline as an ML prediction', () => {
    // The specific false sentence this layer exists to prevent.
    expect(prompt).toContain('BASELINE_MEDIAN');
    expect(prompt.toLowerCase()).toContain('must not call it an ai or machine-learning prediction');
  });

  it('tells the model the risk score is rule-based, not ML', () => {
    expect(prompt).toContain('DETERMINISTIC RULE ENGINE');
  });

  it('forbids inventing accuracy or confidence figures', () => {
    expect(prompt.toLowerCase()).toContain('never state or imply an accuracy figure');
  });

  it('requires an incomplete assessment to be flagged', () => {
    expect(prompt).toContain('assessment_complete is false');
    expect(prompt.toLowerCase()).toContain('missing records as much as low risk');
  });

  it('specifies the seven required sections', () => {
    for (const section of [
      'Executive Summary', 'Current Risk Situation', 'Main Delay Factors',
      'Why This Project Is At Risk', 'Recommended Administrative Actions',
      'Priority Actions', 'Data Limitations',
    ]) {
      expect(prompt).toContain(section);
    }
  });
});

// ---------------------------------------------------------------------------
describe('facts payload — what the model is allowed to see', () => {
  const project = {
    id: PROJECTS.assigned, project_name: 'Test', project_code: 'T1',
    state: 'S', district: 'D', sector: 'ROAD', implementing_agency: 'A',
    project_status: 'ACTIVE', planned_start_date: '2024-01-01',
    planned_completion_date: '2026-01-01', actual_start_date: null,
    actual_completion_date: null, latitude: null, longitude: null,
    created_by: 'u1', created_at: 'x', updated_at: 'y',
  } as never;

  const assessment = {
    prediction: {
      id: 'pred-1', project_id: PROJECTS.assigned, risk_score: 88.5,
      risk_level: 'CRITICAL', predicted_delay_days: 596,
      prediction_type: 'BASELINE_MEDIAN', confidence: 'LOW',
      rule_coverage_pct: 93.3, assessment_complete: true,
      missing_core_inputs: [], limitations: {}, created_at: 'z',
    },
    explanations: [{ feature_name: 'LAND_PROGRESS', contribution_score: 25, rank: 1, explanation_source: 'RULE_ENGINE' }],
    recommendations: [{ title: 'T', description: 'D', priority: 'CRITICAL', recommended_action: 'A', source_rule_id: 'LAND_PROGRESS', status: 'OPEN' }],
  } as never;

  it('labels the delay estimate so the model cannot mistake it', () => {
    const facts = __testing.buildFacts(project, assessment);
    const delay = (facts.delay_estimate as Record<string, unknown>);
    expect(delay.interpretation).toContain('NOT a machine-learning prediction');
  });

  it('labels the risk assessment as rule-engine output', () => {
    const facts = __testing.buildFacts(project, assessment);
    expect((facts.risk_assessment as Record<string, unknown>).source).toBe('DETERMINISTIC_RULE_ENGINE');
  });

  it('NEVER includes credentials or secrets', async () => {
    // The single most damaging possible mistake in this layer.
    const facts = __testing.buildFacts(project, assessment);
    const serialised = JSON.stringify(facts).toLowerCase();
    for (const forbidden of [
      'service_role', 'supabase_url', 'jwt_secret', 'openai_api_key',
      'apikey', 'authorization', 'bearer', 'password', 'sb_secret',
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('sends no user token or session data', () => {
    const facts = __testing.buildFacts(project, assessment);
    const serialised = JSON.stringify(facts).toLowerCase();
    expect(serialised).not.toContain('access_token');
    expect(serialised).not.toContain('user_metadata');
  });
});

// ---------------------------------------------------------------------------
describe('response contract', () => {
  // These run with a key present, by re-importing the service with a stubbed
  // config so the configured path is exercised.
  it('a successful summary is labelled AI_GENERATED_EXPLANATION', async () => {
    vi.resetModules();
    vi.doMock('../src/config/env', async () => {
      const actual = await vi.importActual<typeof import('../src/config/env')>('../src/config/env');
      return {
        ...actual,
        env: { ...actual.env, OPENAI_API_KEY: 'sk-test' },
        features: { ...actual.features, llmExplanations: true },
      };
    });
    vi.doMock('../src/config/supabase', () => ({ supabase: supabaseMock, supabaseAdmin: supabaseMock }));
    stubProvider();

    const { generateAiSummary } = await import('../src/services/ai-summary.service');
    const result = await generateAiSummary(PROJECTS.assigned);

    expect(result.content_type).toBe('AI_GENERATED_EXPLANATION');
    expect(result.provenance.risk_assessment_source).toBe('RULE_ENGINE');
    expect(result.provenance.recommendations_source).toBe('RULE_ENGINE');
    expect(result.provenance.delay_estimate_source).toBe('BASELINE_MEDIAN');
    expect(result.provenance.ai_role).toContain('produced no number');
    expect(result.provenance.prediction_id).toBe('pred-1');
    vi.doUnmock('../src/config/env');
    vi.resetModules();
  });

  it('the API key is sent to the provider but never returned', async () => {
    vi.resetModules();
    vi.doMock('../src/config/env', async () => {
      const actual = await vi.importActual<typeof import('../src/config/env')>('../src/config/env');
      return {
        ...actual,
        env: { ...actual.env, OPENAI_API_KEY: 'sk-secret-value-123' },
        features: { ...actual.features, llmExplanations: true },
      };
    });
    vi.doMock('../src/config/supabase', () => ({ supabase: supabaseMock, supabaseAdmin: supabaseMock }));
    stubProvider();

    const { generateAiSummary } = await import('../src/services/ai-summary.service');
    const result = await generateAiSummary(PROJECTS.assigned);

    // Sent as a header...
    const authHeaderValue = (aiRequests[0]?.headers as Record<string, string>).Authorization;
    expect(authHeaderValue).toContain('sk-secret-value-123');
    // ...and absent from everything the caller receives.
    expect(JSON.stringify(result)).not.toContain('sk-secret-value-123');
    vi.doUnmock('../src/config/env');
    vi.resetModules();
  });

  it('provider failure surfaces as 503 without leaking the error body', async () => {
    vi.resetModules();
    vi.doMock('../src/config/env', async () => {
      const actual = await vi.importActual<typeof import('../src/config/env')>('../src/config/env');
      return {
        ...actual,
        env: { ...actual.env, OPENAI_API_KEY: 'sk-test' },
        features: { ...actual.features, llmExplanations: true },
      };
    });
    vi.doMock('../src/config/supabase', () => ({ supabase: supabaseMock, supabaseAdmin: supabaseMock }));
    stubProvider({ status: 500 });

    const { generateAiSummary } = await import('../src/services/ai-summary.service');
    await expect(generateAiSummary(PROJECTS.assigned)).rejects.toMatchObject({ statusCode: 503 });
    vi.doUnmock('../src/config/env');
    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
describe('authorization', () => {
  it('rejects an unauthenticated request', async () => {
    expect((await request(app).post(`${base}/ai-summary`)).status).toBe(401);
  });

  it('refuses an OFFICER on an unassigned project', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECTS.unassigned}/ai-summary`)
      .set(...as('OFFICER'));
    expect(res.status).toBe(403);
  });

  it('allows an assigned OFFICER through to the layer', async () => {
    // 503 here is the unconfigured-key path, which means authorization passed.
    const res = await request(app).post(`${base}/ai-summary`).set(...as('OFFICER'));
    expect(res.status).toBe(503);
  });
});
