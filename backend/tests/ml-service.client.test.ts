/**
 * ml-service.client.test.ts — the payload the backend sends to the ML service.
 *
 * The assertion that matters is what the payload does NOT contain. The ML
 * service rejects unknown fields, so a leaked column would surface as a 422 in
 * production — but by then it has already been read out of the database and
 * put on the wire. This checks it never leaves.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabaseMock } from './helpers/supabase-mock';

vi.mock('../src/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAdmin: supabaseMock,
}));

const mlClient = await import('../src/services/ml-service.client');
const { __testing, predict, checkMlService } = mlClient;
const { toRequestSnapshot } = __testing;

/** A snapshot row as it comes back from the database. */
const snapshotRow = {
  id: 'snap-1',
  project_id: 'proj-1',
  snapshot_date: '2026-09-11T00:00:00Z',
  created_at: '2026-09-11T00:00:00Z',
  land_required_ha: '200.0000',
  land_acquired_ha: '50.0000',
  acquisition_percentage: '25.0000',
  compensation_pending: '750000.00',
  compensation_pending_percentage: '75.0000',
  affected_landowners: 500,
  affected_families: 450,
  court_cases_count: 2,
  litigation_flag: true,
  land_dispute_flag: false,
  title_issue_flag: true,
  land_record_issue_flag: false,
  r_and_r_required: true,
  r_and_r_pending: true,
  row_issue: false,
  encroachment: true,
  forest_clearance_pending: false,
  possession_pending: true,
  administrative_delay: false,
  notification_delay_days: 120,
  award_delay_days: 400,
} as never;

describe('payload construction', () => {
  it('sends exactly the 21 feature columns plus three identifiers', () => {
    const payload = toRequestSnapshot(snapshotRow);
    expect(Object.keys(payload).sort()).toEqual(
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

  it('NEVER forwards outcome data, even when the row carries it', () => {
    // The reason the builder enumerates fields rather than spreading the row:
    // a spread forwards whatever a future SELECT happens to include.
    const contaminated = {
      ...(snapshotRow as object),
      actual_delay_days: 365,
      delay_days_target: 500,
      actual_completion_date: '2027-01-01',
    } as never;

    const payload = toRequestSnapshot(contaminated);
    const serialised = JSON.stringify(payload);

    expect(payload).not.toHaveProperty('actual_delay_days');
    expect(payload).not.toHaveProperty('delay_days_target');
    expect(payload).not.toHaveProperty('actual_completion_date');
    expect(serialised).not.toContain('365');
    expect(serialised).not.toContain('actual_');
  });

  it('converts NUMERIC values to numbers for the JSON contract', () => {
    // PostgREST returns NUMERIC as a JS number, but the column type permits a
    // string too; the ML service expects a number either way.
    const payload = toRequestSnapshot(snapshotRow);
    expect(payload.acquisition_percentage).toBe(25);
    expect(payload.compensation_pending).toBe(750000);
    expect(typeof payload.land_required_ha).toBe('number');
  });

  it('preserves null rather than substituting zero', () => {
    // A fabricated 0 is indistinguishable from a real measurement of zero, and
    // the rule engine would evaluate it as observed fact.
    const sparse = {
      ...(snapshotRow as object),
      acquisition_percentage: null,
      compensation_pending: null,
      affected_families: null,
      award_delay_days: null,
    } as never;

    const payload = toRequestSnapshot(sparse);
    expect(payload.acquisition_percentage).toBeNull();
    expect(payload.compensation_pending).toBeNull();
    expect(payload.affected_families).toBeNull();
    expect(payload.acquisition_percentage).not.toBe(0);
  });

  it('passes boolean flags through unchanged', () => {
    const payload = toRequestSnapshot(snapshotRow);
    expect(payload.litigation_flag).toBe(true);
    expect(payload.land_dispute_flag).toBe(false);
    expect(payload.encroachment).toBe(true);
  });
});


describe('failure handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns an unreachable service into a clean 503, not a hang', async () => {
    // The ML service being down must degrade the product, never take the API
    // down with it.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));

    await expect(predict(snapshotRow)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('treats a rejected API key as a dependency failure, not a client error', async () => {
    // The caller did nothing wrong; this backend is misconfigured. Reporting
    // 401 to the caller would send them to re-authenticate pointlessly.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid or missing API key',
      }),
    );

    await expect(predict(snapshotRow)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('never leaks the ML service error body to the caller', async () => {
    // An ML error body can echo the payload, which is project data.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Traceback: project_id=secret-project-123 failed at line 42',
      }),
    );

    await expect(predict(snapshotRow)).rejects.toSatisfy((err: Error) => {
      expect(err.message).not.toContain('secret-project-123');
      expect(err.message).not.toContain('Traceback');
      return true;
    });
  });

  it('checkMlService returns null instead of throwing, so /health keeps answering', async () => {
    // A health endpoint that goes dark during an incident is useless at
    // exactly the moment it is needed.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    await expect(checkMlService()).resolves.toBeNull();
  });
});
