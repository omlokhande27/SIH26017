/**
 * snapshot-features.test.ts — the feature definitions themselves.
 *
 * `deriveSnapshotFeatures` is pure, so these tests are exhaustive and fast: no
 * database, no mock, no clock. That matters because these definitions are the
 * part of the system most damaging to get wrong. A miscounted court case is a
 * bug; a leaked outcome column is a model that looks excellent and predicts
 * nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  assessSnapshotQuality,
  deriveSnapshotFeatures,
  hasBlockingIssues,
  type LandAcquisitionSource,
  type SnapshotSource,
} from '../src/services/snapshot-features';

const AS_OF = new Date('2025-06-01T00:00:00Z');

const land = (overrides: Partial<LandAcquisitionSource> = {}): LandAcquisitionSource => ({
  land_required_ha: '100.0000',
  land_acquired_ha: '40.0000',
  land_acquisition_percentage: '40.0000',
  affected_landowners: 500,
  affected_families: 450,
  possession_obtained: false,
  notification_date: null,
  award_date: null,
  possession_date: null,
  ...overrides,
});

const source = (overrides: Partial<SnapshotSource> = {}): SnapshotSource => ({
  project: { id: 'p1', planned_start_date: null },
  land: land(),
  compensation: { compensation_pending: '1000.00', compensation_pending_percentage: '25.0000' },
  legalIssues: [],
  riskFactors: [],
  asOf: AS_OF,
  ...overrides,
});

describe('leakage boundary', () => {
  it('produces exactly the 21 writable snapshot columns and nothing else', () => {
    // The guard against a future edit quietly adding an outcome-derived
    // feature: any new key shows up here as a failure.
    const features = deriveSnapshotFeatures(source());
    expect(Object.keys(features).sort()).toEqual([
      'acquisition_percentage',
      'administrative_delay',
      'affected_families',
      'affected_landowners',
      'award_delay_days',
      'compensation_pending',
      'compensation_pending_percentage',
      'court_cases_count',
      'encroachment',
      'forest_clearance_pending',
      'land_acquired_ha',
      'land_dispute_flag',
      'land_record_issue_flag',
      'land_required_ha',
      'litigation_flag',
      'notification_delay_days',
      'possession_pending',
      'r_and_r_pending',
      'r_and_r_required',
      'row_issue',
      'title_issue_flag',
    ]);
  });

  it('emits no outcome-shaped feature under any input', () => {
    const features = deriveSnapshotFeatures(
      source({
        legalIssues: [{ issue_type: 'LITIGATION', court_case: true, status: 'OPEN' }],
        riskFactors: [{ factor_type: 'ENCROACHMENT', status: 'OPEN' }],
      }),
    );

    const forbidden = [
      /^actual_/,
      /target$/,
      /^delay_(days|months)$/,
      /^outcome/,
      /completion_date$/,
      /overrun/,
      /_label$/,
      /predicted/,
    ];
    const offending = Object.keys(features).filter((k) => forbidden.some((p) => p.test(k)));
    expect(offending).toEqual([]);
  });

  it('ignores outcome data even if a caller smuggles it into the source object', () => {
    // The input type has no field for outcome data, but a JavaScript caller
    // can still pass extra keys. They must have no effect.
    const contaminated = {
      ...source(),
      actual_outcomes: [{ actual_delay_days: 500 }],
      delay_days_target: 500,
    } as unknown as SnapshotSource;

    expect(deriveSnapshotFeatures(contaminated)).toEqual(deriveSnapshotFeatures(source()));
  });
});

describe('derived numerics are copied, never recomputed', () => {
  it('copies the generated acquisition percentage verbatim', () => {
    // Even when it disagrees with a naive recomputation from the raw columns.
    // The database's generated value is authoritative; recomputing here would
    // let the snapshot drift from the row it was taken from.
    const features = deriveSnapshotFeatures(
      source({
        land: land({
          land_required_ha: '3.0000',
          land_acquired_ha: '1.0000',
          land_acquisition_percentage: '33.3333',
        }),
      }),
    );
    expect(features.acquisition_percentage).toBe('33.3333');
  });

  it('preserves exact decimal strings without float conversion', () => {
    const features = deriveSnapshotFeatures(
      source({
        compensation: {
          compensation_pending: '1875000000.55',
          compensation_pending_percentage: '65.8667',
        },
      }),
    );
    expect(features.compensation_pending).toBe('1875000000.55');
    expect(features.compensation_pending_percentage).toBe('65.8667');
  });
});

describe('missing inputs produce null, never a substitute', () => {
  it('nulls land features when there is no land record', () => {
    const features = deriveSnapshotFeatures(source({ land: null }));
    expect(features.land_required_ha).toBeNull();
    expect(features.land_acquired_ha).toBeNull();
    expect(features.acquisition_percentage).toBeNull();
    expect(features.affected_landowners).toBeNull();
  });

  it('nulls compensation features when there is no compensation record', () => {
    // Critically NOT zero: "not recorded" and "nothing outstanding" are
    // different facts, and a fabricated 0 would be learned as the second.
    const features = deriveSnapshotFeatures(source({ compensation: null }));
    expect(features.compensation_pending).toBeNull();
    expect(features.compensation_pending_percentage).toBeNull();
    expect(features.compensation_pending).not.toBe('0');
  });

  it('still reports boolean flags as false rather than null', () => {
    // Booleans are NOT NULL in the schema, and absence of a recorded risk
    // factor genuinely means the flag is false.
    const features = deriveSnapshotFeatures(source({ land: null, compensation: null }));
    expect(features.litigation_flag).toBe(false);
    expect(features.encroachment).toBe(false);
    expect(features.court_cases_count).toBe(0);
  });
});

describe('legal features count only active issues', () => {
  it('counts open court cases', () => {
    const features = deriveSnapshotFeatures(
      source({
        legalIssues: [
          { issue_type: 'LITIGATION', court_case: true, status: 'OPEN' },
          { issue_type: 'TITLE_DISPUTE', court_case: true, status: 'IN_PROGRESS' },
        ],
      }),
    );
    expect(features.court_cases_count).toBe(2);
    expect(features.litigation_flag).toBe(true);
  });

  it('excludes resolved and closed issues', () => {
    // A dispute settled two years ago is history, not current risk. Counting
    // it would make every project look permanently distressed after one bad
    // quarter.
    const features = deriveSnapshotFeatures(
      source({
        legalIssues: [
          { issue_type: 'LITIGATION', court_case: true, status: 'RESOLVED' },
          { issue_type: 'LITIGATION', court_case: true, status: 'CLOSED' },
        ],
      }),
    );
    expect(features.court_cases_count).toBe(0);
    expect(features.litigation_flag).toBe(false);
  });

  it('does not count a non-court issue as a court case', () => {
    const features = deriveSnapshotFeatures(
      source({
        legalIssues: [{ issue_type: 'LAND_DISPUTE', court_case: false, status: 'OPEN' }],
      }),
    );
    expect(features.court_cases_count).toBe(0);
    expect(features.litigation_flag).toBe(false);
    expect(features.land_dispute_flag).toBe(true);
  });

  it('keeps litigation_flag and court_cases_count in agreement, always', () => {
    // The schema CHECK requires exactly this. Deriving the flag from the count
    // makes disagreement unrepresentable — verified across many shapes.
    const shapes = [
      [],
      [{ issue_type: 'LITIGATION', court_case: true, status: 'OPEN' }],
      [{ issue_type: 'LITIGATION', court_case: false, status: 'OPEN' }],
      [{ issue_type: 'LITIGATION', court_case: true, status: 'CLOSED' }],
      [
        { issue_type: 'LITIGATION', court_case: true, status: 'OPEN' },
        { issue_type: 'LAND_DISPUTE', court_case: false, status: 'OPEN' },
      ],
    ];

    for (const legalIssues of shapes) {
      const f = deriveSnapshotFeatures(source({ legalIssues }));
      const consistent =
        (f.litigation_flag && f.court_cases_count > 0) ||
        (!f.litigation_flag && f.court_cases_count === 0);
      expect(consistent, JSON.stringify(legalIssues)).toBe(true);
    }
  });

  it.each([
    ['LAND_DISPUTE', 'land_dispute_flag'],
    ['TITLE_DISPUTE', 'title_issue_flag'],
    ['LAND_RECORD_ISSUE', 'land_record_issue_flag'],
  ] as const)('maps %s to %s', (issueType, flag) => {
    const features = deriveSnapshotFeatures(
      source({ legalIssues: [{ issue_type: issueType, court_case: false, status: 'OPEN' }] }),
    );
    expect(features[flag]).toBe(true);
  });
});

describe('risk factor features', () => {
  it.each([
    ['ROW_ISSUE', 'row_issue'],
    ['ENCROACHMENT', 'encroachment'],
    ['FOREST_CLEARANCE_PENDING', 'forest_clearance_pending'],
    ['ADMINISTRATIVE_DELAY', 'administrative_delay'],
  ] as const)('maps active %s to %s', (code, flag) => {
    const features = deriveSnapshotFeatures(
      source({ riskFactors: [{ factor_type: code, status: 'OPEN' }] }),
    );
    expect(features[flag]).toBe(true);
  });

  it('ignores resolved risk factors', () => {
    const features = deriveSnapshotFeatures(
      source({ riskFactors: [{ factor_type: 'ENCROACHMENT', status: 'RESOLVED' }] }),
    );
    expect(features.encroachment).toBe(false);
  });

  it('treats R&R as required once recorded, pending only while open', () => {
    const resolved = deriveSnapshotFeatures(
      source({ riskFactors: [{ factor_type: 'R_AND_R_PENDING', status: 'RESOLVED' }] }),
    );
    // Required stays true: the obligation existed. Pending is false: it is done.
    expect(resolved.r_and_r_required).toBe(true);
    expect(resolved.r_and_r_pending).toBe(false);

    const open = deriveSnapshotFeatures(
      source({ riskFactors: [{ factor_type: 'R_AND_R_PENDING', status: 'OPEN' }] }),
    );
    expect(open.r_and_r_required).toBe(true);
    expect(open.r_and_r_pending).toBe(true);
  });

  it('never reports R&R pending without R&R required', () => {
    // The schema CHECK snapshot_rr_pending_requires_rr demands this.
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) {
      const f = deriveSnapshotFeatures(
        source({ riskFactors: [{ factor_type: 'R_AND_R_PENDING', status }] }),
      );
      expect(!f.r_and_r_pending || f.r_and_r_required, status).toBe(true);
    }
    const none = deriveSnapshotFeatures(source({ riskFactors: [] }));
    expect(none.r_and_r_pending).toBe(false);
    expect(none.r_and_r_required).toBe(false);
  });

  it('derives possession_pending from the operational record', () => {
    // An award was passed but possession never taken — evidence in its own
    // right, even with no risk factor raised.
    const features = deriveSnapshotFeatures(
      source({ land: land({ award_date: '2024-01-01', possession_obtained: false }) }),
    );
    expect(features.possession_pending).toBe(true);
  });

  it('does not report possession pending before an award exists', () => {
    const features = deriveSnapshotFeatures(
      source({ land: land({ award_date: null, possession_obtained: false }) }),
    );
    expect(features.possession_pending).toBe(false);
  });

  it('reports possession pending from a risk factor even without an award', () => {
    const features = deriveSnapshotFeatures(
      source({
        land: land({ award_date: null }),
        riskFactors: [{ factor_type: 'POSSESSION_PENDING', status: 'OPEN' }],
      }),
    );
    expect(features.possession_pending).toBe(true);
  });

  it('clears possession_pending once possession is obtained', () => {
    const features = deriveSnapshotFeatures(
      source({
        land: land({ award_date: '2024-01-01', possession_obtained: true }),
      }),
    );
    expect(features.possession_pending).toBe(false);
  });
});

describe('elapsed-time features', () => {
  it('measures award_delay_days from notification to award', () => {
    const features = deriveSnapshotFeatures(
      source({ land: land({ notification_date: '2024-01-01', award_date: '2024-03-01' }) }),
    );
    expect(features.award_delay_days).toBe(60); // Jan + Feb in a leap year
  });

  it('measures award delay to the snapshot date while the award is outstanding', () => {
    const features = deriveSnapshotFeatures(
      source({ land: land({ notification_date: '2025-05-01', award_date: null }) }),
    );
    expect(features.award_delay_days).toBe(31); // 1 May -> 1 June
  });

  it('freezes the measure once the award lands', () => {
    // The realised duration, not the project's current age.
    const features = deriveSnapshotFeatures(
      source({ land: land({ notification_date: '2020-01-01', award_date: '2020-01-11' }) }),
    );
    expect(features.award_delay_days).toBe(10);
  });

  it('returns null rather than a negative value for a future notification', () => {
    // A notification dated after the snapshot is a data-entry error. NULL is
    // honest; the column's CHECK forbids a negative, and clamping to 0 would
    // look like a real measurement of "no delay".
    const features = deriveSnapshotFeatures(
      source({ land: land({ notification_date: '2030-01-01' }) }),
    );
    expect(features.award_delay_days).toBeNull();
  });

  it('nulls award_delay_days when no notification date exists', () => {
    const features = deriveSnapshotFeatures(
      source({ land: land({ notification_date: null }) }),
    );
    expect(features.award_delay_days).toBeNull();
  });

  it('measures notification_delay_days from the planned start', () => {
    const features = deriveSnapshotFeatures(
      source({
        project: { id: 'p1', planned_start_date: '2024-01-01' },
        land: land({ notification_date: '2024-02-01' }),
      }),
    );
    expect(features.notification_delay_days).toBe(31);
  });

  it('nulls notification_delay_days when notification precedes the planned start', () => {
    // Real records do this: acquisition sometimes begins before the project is
    // formally scheduled. The measure is not meaningful, so it is not invented.
    const features = deriveSnapshotFeatures(
      source({
        project: { id: 'p1', planned_start_date: '2024-06-01' },
        land: land({ notification_date: '2023-08-10' }),
      }),
    );
    expect(features.notification_delay_days).toBeNull();
  });

  it('nulls notification_delay_days when there is no planned start date', () => {
    const features = deriveSnapshotFeatures(
      source({ project: { id: 'p1', planned_start_date: null } }),
    );
    expect(features.notification_delay_days).toBeNull();
  });

  it('never returns a negative elapsed value under any combination', () => {
    const dates = [null, '2020-01-01', '2025-06-01', '2030-01-01'];
    for (const plannedStart of dates) {
      for (const notification of dates) {
        for (const award of dates) {
          const f = deriveSnapshotFeatures(
            source({
              project: { id: 'p1', planned_start_date: plannedStart },
              land: land({ notification_date: notification, award_date: award }),
            }),
          );
          if (f.award_delay_days !== null) expect(f.award_delay_days).toBeGreaterThanOrEqual(0);
          if (f.notification_delay_days !== null) {
            expect(f.notification_delay_days).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe('determinism', () => {
  it('produces identical output for identical input', () => {
    const s = source({
      legalIssues: [{ issue_type: 'LITIGATION', court_case: true, status: 'OPEN' }],
      riskFactors: [{ factor_type: 'ENCROACHMENT', status: 'OPEN' }],
    });
    expect(deriveSnapshotFeatures(s)).toEqual(deriveSnapshotFeatures(s));
  });

  it('depends on the injected asOf rather than the wall clock', () => {
    const base = { land: land({ notification_date: '2024-01-01' }) };
    const early = deriveSnapshotFeatures(source({ ...base, asOf: new Date('2024-02-01T00:00:00Z') }));
    const later = deriveSnapshotFeatures(source({ ...base, asOf: new Date('2024-03-01T00:00:00Z') }));
    expect(early.award_delay_days).toBe(31);
    expect(later.award_delay_days).toBe(60);
  });
});

describe('quality assessment', () => {
  it('blocks when there is no land record', () => {
    const report = assessSnapshotQuality(source({ land: null }));
    expect(hasBlockingIssues(report)).toBe(true);
    expect(report.issues.some((i) => i.field === 'land_acquisition')).toBe(true);
  });

  it('blocks when land acquired exceeds land required', () => {
    const report = assessSnapshotQuality(
      source({ land: land({ land_required_ha: '10', land_acquired_ha: '20' }) }),
    );
    expect(hasBlockingIssues(report)).toBe(true);
  });

  it('blocks an out-of-range acquisition percentage', () => {
    const report = assessSnapshotQuality(
      source({ land: land({ land_acquisition_percentage: '150.0000' }) }),
    );
    expect(hasBlockingIssues(report)).toBe(true);
  });

  it('blocks a date in the future relative to the snapshot', () => {
    const report = assessSnapshotQuality(
      source({ land: land({ notification_date: '2030-01-01' }) }),
    );
    expect(hasBlockingIssues(report)).toBe(true);
    expect(report.issues.some((i) => i.field === 'notification_date')).toBe(true);
  });

  it('warns, but does not block, when compensation is absent', () => {
    const report = assessSnapshotQuality(source({ compensation: null }));
    expect(hasBlockingIssues(report)).toBe(false);
    expect(report.issues.some((i) => i.severity === 'warning' && i.field === 'compensation')).toBe(
      true,
    );
  });

  it('reports which features will be null and how complete the vector is', () => {
    const report = assessSnapshotQuality(source({ compensation: null }));
    expect(report.missingFeatures).toContain('compensation_pending');
    expect(report.completeness).toBeGreaterThan(0);
    expect(report.completeness).toBeLessThan(1);
  });

  it('records which source records were present', () => {
    const report = assessSnapshotQuality(
      source({
        compensation: null,
        legalIssues: [{ issue_type: 'LAND_DISPUTE', court_case: false, status: 'OPEN' }],
      }),
    );
    expect(report.sources).toEqual({
      land_acquisition: true,
      compensation: false,
      legal_issues: 1,
      risk_factors: 0,
    });
  });

  it('passes a complete, consistent project', () => {
    const report = assessSnapshotQuality(
      source({
        project: { id: 'p1', planned_start_date: '2024-01-01' },
        land: land({ notification_date: '2024-02-01', award_date: '2024-06-01' }),
      }),
    );
    expect(hasBlockingIssues(report)).toBe(false);
    expect(report.completeness).toBe(1);
  });
});
