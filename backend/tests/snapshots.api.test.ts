/**
 * snapshots.api.test.ts — feature snapshot creation over real HTTP.
 *
 * This is the hand-off from the operational system to the ML system, so the
 * assertions here are about integrity rather than convenience: the snapshot
 * belongs to the right project, contains no outcome data, cannot be altered
 * afterwards, and is refused outright when the underlying data cannot support
 * an honest feature vector.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { supabaseMock } from './helpers/supabase-mock';
import {
  PROJECTS,
  USERS,
  authHeader,
  seedCompensation,
  seedLandAcquisition,
  seedStandardFixture,
} from './helpers/api';

vi.mock('../src/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAdmin: supabaseMock,
}));

const { default: app } = await import('../src/app');

const base = `/api/projects/${PROJECTS.assigned}`;

/** A project with enough data for a snapshot to succeed. */
function seedSnapshotReadyProject(): void {
  seedStandardFixture();
  seedLandAcquisition();
  seedCompensation();
  supabaseMock.setTable('legal_issues', [
    {
      id: 'li-1',
      project_id: PROJECTS.assigned,
      issue_type: 'LITIGATION',
      court_case: true,
      status: 'OPEN',
      severity: 'HIGH',
      reported_date: '2024-03-01',
      resolved_date: null,
      case_reference: null,
      description: null,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    },
  ]);
  supabaseMock.setTable('risk_factors', [
    {
      id: 'rf-1',
      project_id: PROJECTS.assigned,
      factor_type: 'ENCROACHMENT',
      factor_name: 'Structures on alignment',
      status: 'OPEN',
      severity: 'HIGH',
      reported_date: '2024-04-01',
      resolved_date: null,
      description: null,
      created_at: '2024-04-01T00:00:00Z',
      updated_at: '2024-04-01T00:00:00Z',
    },
  ]);
}

beforeEach(() => {
  seedSnapshotReadyProject();
});

describe('POST /api/projects/:projectId/snapshots', () => {
  it('creates a snapshot from current project data', async () => {
    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(201);
    expect(res.body.data.snapshot).toBeDefined();
    expect(res.body.data.snapshot.id).toBeDefined();
  });

  it('returns the snapshot id, project id, timestamp and features', async () => {
    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    const snapshot = res.body.data.snapshot;
    expect(snapshot.id).toBeTruthy();
    expect(snapshot.project_id).toBe(PROJECTS.assigned);
    expect(snapshot.snapshot_date).toBeTruthy();
    expect(snapshot.land_required_ha).toBe('100.0000');
    expect(snapshot.acquisition_percentage).toBe('40.0000');
  });

  it('binds the snapshot to the project in the URL', async () => {
    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(res.body.data.snapshot.project_id).toBe(PROJECTS.assigned);
    expect(res.body.data.snapshot.project_id).not.toBe(PROJECTS.unassigned);

    const stored = supabaseMock.getTable('project_feature_snapshots');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.project_id).toBe(PROJECTS.assigned);
  });

  it('derives features from the project’s current records', async () => {
    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    const s = res.body.data.snapshot;
    expect(s.court_cases_count).toBe(1);
    expect(s.litigation_flag).toBe(true);
    expect(s.encroachment).toBe(true);
    expect(s.compensation_pending).toBe('750000.00');
    // No forest clearance factor recorded, so the flag is false.
    expect(s.forest_clearance_pending).toBe(false);
  });

  it('returns data quality information and says it is not persisted', async () => {
    // The schema has no provenance column, so this is computed and returned
    // rather than stored. Saying so plainly beats implying it was saved.
    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(res.body.data.data_quality).toBeDefined();
    expect(res.body.data.data_quality.persisted).toBe(false);
    expect(res.body.data.data_quality.sources).toEqual({
      land_acquisition: true,
      compensation: true,
      legal_issues: 1,
      risk_factors: 1,
    });
    expect(res.body.data.data_quality.completeness).toBeGreaterThan(0);
  });

  it('uses the server clock, ignoring any client-supplied timestamp', async () => {
    // Backdating a snapshot would let someone place it before an inconvenient
    // event; the temporal integrity of the training set rests on this.
    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin))
      .send({ snapshot_date: '1999-01-01T00:00:00Z' });

    const year = new Date(res.body.data.snapshot.snapshot_date).getUTCFullYear();
    expect(year).toBeGreaterThan(2020);
    expect(year).not.toBe(1999);
  });

  it('does not create a snapshot as a side effect of updating project data', async () => {
    // Snapshots represent an intentional prediction point. Auto-creating them
    // on every edit would make "which snapshot did this prediction use"
    // meaningless.
    await request(app)
      .patch(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin))
      .send({ land_acquired_ha: '60' });

    await request(app)
      .patch(`${base}`)
      .set(...authHeader(USERS.admin))
      .send({ district: 'Changed' });

    expect(supabaseMock.getTable('project_feature_snapshots')).toHaveLength(0);
  });
});

describe('leakage prevention', () => {
  it('writes no outcome-shaped column into the snapshot', async () => {
    await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    const stored = supabaseMock.getTable('project_feature_snapshots')[0] ?? {};
    const forbidden = [
      /^actual_/,
      /target$/,
      /^delay_(days|months)$/,
      /^outcome/,
      /completion_date$/,
      /overrun/,
      /predicted/,
    ];
    const offending = Object.keys(stored).filter((k) => forbidden.some((p) => p.test(k)));
    expect(offending).toEqual([]);
  });

  it('ignores outcome data present elsewhere in the database', async () => {
    // Even with ground truth recorded for this project, none of it may reach
    // the feature vector. The features must be identical either way.
    const before = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    supabaseMock.setTable('actual_outcomes', [
      {
        id: 'ao-1',
        project_id: PROJECTS.assigned,
        actual_delay_days: '365.00',
        outcome_date: '2025-01-01',
      },
    ]);
    supabaseMock.setTable('project_feature_snapshots', []);

    const after = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    const strip = (s: Record<string, unknown>) => {
      const { id, snapshot_date, created_at, ...rest } = s;
      return rest;
    };
    expect(strip(after.body.data.snapshot)).toEqual(strip(before.body.data.snapshot));
  });

  it('does not read the project’s actual completion date', async () => {
    // A future completion date is outcome information; it must not change the
    // feature vector.
    const before = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    const projects = supabaseMock.getTable('projects').map((p) =>
      p.id === PROJECTS.assigned ? { ...p, actual_completion_date: '2027-12-31' } : p,
    );
    supabaseMock.setTable('projects', projects);
    supabaseMock.setTable('project_feature_snapshots', []);

    const after = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    const strip = (s: Record<string, unknown>) => {
      const { id, snapshot_date, created_at, ...rest } = s;
      return rest;
    };
    expect(strip(after.body.data.snapshot)).toEqual(strip(before.body.data.snapshot));
  });
});

describe('input quality is handled honestly', () => {
  it('refuses with 422 when the project has no land record', async () => {
    supabaseMock.setTable('land_acquisition', []);

    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(422);
    expect(supabaseMock.getTable('project_feature_snapshots')).toHaveLength(0);
  });

  it('explains what is blocking rather than failing opaquely', async () => {
    supabaseMock.setTable('land_acquisition', []);

    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(res.body.details.issues).toBeDefined();
    expect(res.body.details.issues[0].field).toBe('land_acquisition');
    expect(res.body.details.issues[0].message).toContain('land-acquisition');
  });

  it('does not invent values to fill a gap', async () => {
    // With no compensation record the features must be null, not zero.
    supabaseMock.setTable('compensation', []);

    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(201);
    expect(res.body.data.snapshot.compensation_pending).toBeNull();
    expect(res.body.data.snapshot.compensation_pending).not.toBe('0');
  });

  it('warns about the gap and lists the null features', async () => {
    supabaseMock.setTable('compensation', []);

    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(res.body.data.data_quality.missingFeatures).toContain('compensation_pending');
    expect(
      res.body.data.data_quality.issues.some(
        (i: { severity: string; field: string }) =>
          i.severity === 'warning' && i.field === 'compensation',
      ),
    ).toBe(true);
  });

  it('refuses when land acquired exceeds land required', async () => {
    supabaseMock.setTable('land_acquisition', [
      {
        id: 'land-bad',
        project_id: PROJECTS.assigned,
        land_required_ha: '10.0000',
        land_acquired_ha: '50.0000',
        land_acquisition_percentage: '500.0000',
        affected_landowners: null,
        affected_families: null,
        possession_obtained: false,
        notification_date: null,
        award_date: null,
        possession_date: null,
      },
    ]);

    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(422);
  });

  it('surfaces a database constraint rejection as 422, not 500', async () => {
    supabaseMock.failWith(
      'project_feature_snapshots',
      '23514',
      'new row violates check constraint "snapshot_litigation_matches_case_count"',
    );

    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('litigation flag');
  });
});

describe('preview', () => {
  it('reports what a snapshot would contain without writing one', async () => {
    const res = await request(app)
      .get(`${base}/snapshots/preview`)
      .set(...authHeader(USERS.viewer));

    expect(res.status).toBe(200);
    expect(res.body.data.would_succeed).toBe(true);
    expect(res.body.data.persisted).toBe(false);
    expect(res.body.data.features).toBeDefined();
    expect(supabaseMock.getTable('project_feature_snapshots')).toHaveLength(0);
  });

  it('reports that a snapshot would fail, and why', async () => {
    supabaseMock.setTable('land_acquisition', []);

    const res = await request(app)
      .get(`${base}/snapshots/preview`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data.would_succeed).toBe(false);
    expect(supabaseMock.getTable('project_feature_snapshots')).toHaveLength(0);
  });
});

describe('immutability', () => {
  it('exposes no route to update a snapshot', async () => {
    const created = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));
    const id = created.body.data.snapshot.id;

    const res = await request(app)
      .patch(`${base}/snapshots/${id}`)
      .set(...authHeader(USERS.admin))
      .send({ court_cases_count: 99 });

    expect(res.status).toBe(404);
  });

  it('exposes no route to delete a snapshot', async () => {
    const created = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));
    const id = created.body.data.snapshot.id;

    const res = await request(app)
      .delete(`${base}/snapshots/${id}`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(404);
    expect(supabaseMock.getTable('project_feature_snapshots')).toHaveLength(1);
  });

  it('leaves an existing snapshot untouched when project data changes', async () => {
    const created = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));
    const original = { ...created.body.data.snapshot };

    await request(app)
      .patch(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin))
      .send({ land_acquired_ha: '95' });

    const res = await request(app)
      .get(`${base}/snapshots/${original.id}`)
      .set(...authHeader(USERS.admin));

    expect(res.body.data.snapshot.land_acquired_ha).toBe('40.0000');
    expect(res.body.data.snapshot.acquisition_percentage).toBe('40.0000');
  });

  it('records a new snapshot rather than replacing the old one', async () => {
    await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));
    await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    expect(supabaseMock.getTable('project_feature_snapshots')).toHaveLength(2);
  });
});

describe('authorization', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post(`${base}/snapshots`);
    expect(res.status).toBe(401);
  });

  it('lets an assigned OFFICER create a snapshot', async () => {
    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.officer));

    expect(res.status).toBe(201);
  });

  it('refuses an OFFICER an unassigned project', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECTS.unassigned}/snapshots`)
      .set(...authHeader(USERS.officer));

    expect(res.status).toBe(403);
    expect(supabaseMock.getTable('project_feature_snapshots')).toHaveLength(0);
  });

  it.each(['viewer', 'analyst'] as const)('refuses %s, since creating is a write', async (who) => {
    const res = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS[who]));

    expect(res.status).toBe(403);
    expect(supabaseMock.getTable('project_feature_snapshots')).toHaveLength(0);
  });

  it.each(['viewer', 'analyst'] as const)('lets %s read snapshots', async (who) => {
    await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    const res = await request(app)
      .get(`${base}/snapshots`)
      .set(...authHeader(USERS[who]));

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
  });

  it('does not expose a snapshot through a different project', async () => {
    const created = await request(app)
      .post(`${base}/snapshots`)
      .set(...authHeader(USERS.admin));

    const res = await request(app)
      .get(`/api/projects/${PROJECTS.unassigned}/snapshots/${created.body.data.snapshot.id}`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });
});
