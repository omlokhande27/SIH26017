/**
 * ml-service.live.test.ts — Node calling a REAL running FastAPI service.
 *
 * ###########################################################################
 * # REQUIRES A RUNNING ML SERVICE. Gated behind LIVE_ML=1.                  #
 * #                                                                        #
 * #   cd ml-service                                                        #
 * #   ML_SERVICE_API_KEY=<key> .venv/bin/python -m uvicorn app.main:app \  #
 * #       --port 8111                                                      #
 * #                                                                        #
 * #   cd backend && npm run test:live:ml                                   #
 * ###########################################################################
 *
 * The mocked client tests prove the payload is built correctly. Only this
 * proves the two services actually agree: that the field names line up, the
 * contract deserialises, and the shared secret works. A schema mismatch
 * between them is invisible to both test suites in isolation.
 *
 * It touches no database and creates no data.
 */
import { describe, it, expect, beforeAll } from 'vitest';

if (process.env.LIVE_ML !== '1') {
  throw new Error(
    'Requires a running ML service. Start it, then use `npm run test:live:ml`.',
  );
}

const ML_URL = process.env.ML_SERVICE_URL ?? 'http://127.0.0.1:8111';
const API_KEY = process.env.ML_SERVICE_API_KEY ?? '';

/** A stored snapshot row, shaped as the database returns it. */
const criticalSnapshot = {
  id: 'live-snap-1',
  project_id: 'live-proj-1',
  snapshot_date: '2026-09-11T00:00:00Z',
  created_at: '2026-09-11T00:00:00Z',
  land_required_ha: '900.0000',
  land_acquired_ha: '90.0000',
  acquisition_percentage: '10.0000',
  compensation_pending: '1200000000.00',
  compensation_pending_percentage: '85.0000',
  affected_landowners: 2000,
  affected_families: 1800,
  court_cases_count: 6,
  litigation_flag: true,
  land_dispute_flag: true,
  title_issue_flag: true,
  land_record_issue_flag: true,
  r_and_r_required: true,
  r_and_r_pending: true,
  row_issue: true,
  encroachment: true,
  forest_clearance_pending: true,
  possession_pending: true,
  administrative_delay: true,
  notification_delay_days: 500,
  award_delay_days: 900,
} as never;

let client: typeof import('../../src/services/ml-service.client');

beforeAll(async () => {
  process.env.ML_SERVICE_URL = ML_URL;
  process.env.ML_SERVICE_API_KEY = API_KEY;
  client = await import('../../src/services/ml-service.client');

  const health = await client.checkMlService();
  if (!health) {
    throw new Error(`No ML service reachable at ${ML_URL}. Start it first.`);
  }
}, 30_000);

describe('LIVE ML · connectivity', () => {
  it('reaches the running service', async () => {
    const health = await client.checkMlService();
    expect(health).not.toBeNull();
    expect(health?.status).toBe('ok');
  });

  it('reports the rule engine and model state', async () => {
    const health = await client.checkMlService();
    expect(health?.rule_engine.rules).toBeGreaterThan(0);
    expect(health?.rule_engine.categories).toBe(13);
    expect(health?.model.loaded).toBe(true);
  });

  it('authenticates with the shared secret', async () => {
    // If the key were wrong this would throw DependencyUnavailableError.
    const result = await client.predict(criticalSnapshot);
    expect(result.risk_score).toBeGreaterThan(0);
  });
});

describe('LIVE ML · the two services agree on the contract', () => {
  it('returns a complete assessment for a real snapshot row', async () => {
    const result = await client.predict(criticalSnapshot);

    expect(result.risk_level).toBe('CRITICAL');
    expect(result.risk_score).toBeGreaterThanOrEqual(80);
    expect(result.triggered_rules.length).toBeGreaterThan(5);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.explanation).toBeTruthy();
  });

  it('maps the snapshot fields the ML service actually expects', async () => {
    // The real integration risk. Field names that do not line up would leave
    // rules skipped rather than erroring, so this asserts coverage instead of
    // just a 200.
    const result = await client.predict(criticalSnapshot);
    expect(result.coverage.sufficient).toBe(true);
    expect(result.coverage.missing_core_inputs).toEqual([]);
    expect(result.coverage.coverage_pct).toBeGreaterThan(90);
  });

  it('ties every recommendation to a rule that fired', async () => {
    const result = await client.predict(criticalSnapshot);
    const fired = new Set(result.triggered_rules.map((r) => r.rule_id));
    for (const rec of result.recommendations) {
      for (const id of rec.linked_rule_ids) expect(fired.has(id)).toBe(true);
    }
  });

  it('labels the delay figure honestly', async () => {
    const result = await client.predict(criticalSnapshot);
    const ml = result.ml_estimate;
    expect(['EXPERIMENTAL_ML_ESTIMATE', 'BASELINE_MEDIAN', 'UNAVAILABLE']).toContain(
      ml.prediction_type,
    );
    expect(['LOW', 'NONE']).toContain(ml.confidence);
    if (!ml.beats_baseline && ml.prediction_type === 'BASELINE_MEDIAN') {
      expect(ml.note).toContain('not a model prediction');
    }
  });

  it('flags an incomplete snapshot rather than reassuring', async () => {
    const sparse = {
      id: 's', project_id: 'p', snapshot_date: '2026-09-11T00:00:00Z',
      created_at: '2026-09-11T00:00:00Z',
      land_required_ha: null, land_acquired_ha: null, acquisition_percentage: null,
      compensation_pending: null, compensation_pending_percentage: null,
      affected_landowners: null, affected_families: null,
      court_cases_count: 0, litigation_flag: false, land_dispute_flag: false,
      title_issue_flag: false, land_record_issue_flag: false,
      r_and_r_required: false, r_and_r_pending: false, row_issue: false,
      encroachment: false, forest_clearance_pending: false,
      possession_pending: false, administrative_delay: false,
      notification_delay_days: null, award_delay_days: null,
    } as never;

    const result = await client.predict(sparse);
    expect(result.coverage.sufficient).toBe(false);
    expect(result.coverage.missing_core_inputs.length).toBeGreaterThan(0);
    expect(result.explanation).toContain('INCOMPLETE');
  });

  it('rule-only evaluation works without the model', async () => {
    const result = await client.evaluateRules(criticalSnapshot);
    expect(result.risk_level).toBe('CRITICAL');
    expect(result).not.toHaveProperty('ml_estimate');
  });

  it('returns recommendations from the dedicated endpoint', async () => {
    const recs = await client.getRecommendations(criticalSnapshot);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]).toHaveProperty('action');
  });
});

describe('LIVE ML · leakage boundary holds across the wire', () => {
  it('the service REJECTS a payload carrying outcome data', async () => {
    // Sent raw, bypassing the client's field-by-field builder, to prove the
    // service itself refuses rather than relying on the caller being careful.
    const response = await fetch(`${ML_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({
        snapshot: { acquisition_percentage: 50, actual_delay_days: 365 },
      }),
    });
    expect(response.status).toBe(422);
  });

  it('no response ever contains outcome fields', async () => {
    const result = await client.predict(criticalSnapshot);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('actual_delay_days');
    expect(serialised).not.toContain('delay_days_target');
  });
});

// Unreachable-service handling is NOT tested here. `ML_SERVICE_URL` is read at
// module load, so it cannot be repointed mid-suite, and taking the real service
// down would break every other assertion in this file. That behaviour is
// covered in tests/ml-service.client.test.ts, where `fetch` can be stubbed.
