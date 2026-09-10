/**
 * project-data.api.test.ts — land acquisition, compensation, legal issues and
 * risk factors over real HTTP.
 *
 * The recurring theme is that derived values belong to the database. A client
 * sends source figures; PostgreSQL computes the percentages; the API returns
 * what PostgreSQL computed. These tests attack that from both ends: a request
 * that tries to supply a generated column must be refused, and a response must
 * carry the database's value rather than the client's arithmetic.
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

beforeEach(() => {
  seedStandardFixture();
});

const base = `/api/projects/${PROJECTS.assigned}`;

// ---------------------------------------------------------------------------
// Land acquisition
// ---------------------------------------------------------------------------

describe('land acquisition — generated columns', () => {
  it('REFUSES a request supplying land_acquisition_percentage', async () => {
    // The whole reason the column is GENERATED: a client that could write it
    // could report 100% acquisition on a project that has acquired nothing.
    const res = await request(app)
      .post(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin))
      .send({
        land_required_ha: '100',
        land_acquired_ha: '10',
        land_acquisition_percentage: '100.0000',
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('land_acquisition_percentage');
  });

  it('refuses to spoof the percentage on update either', async () => {
    seedLandAcquisition();
    const res = await request(app)
      .patch(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin))
      .send({ land_acquisition_percentage: '99.9999' });

    expect(res.status).toBe(400);
  });

  it('returns the percentage the database computed', async () => {
    const res = await request(app)
      .post(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin))
      .send({ land_required_ha: '200', land_acquired_ha: '50' });

    expect(res.status).toBe(201);
    expect(res.body.data.land_acquisition.land_acquisition_percentage).toBe('25.0000');
  });

  it('recomputes the percentage when a source value changes', async () => {
    seedLandAcquisition();
    const res = await request(app)
      .patch(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin))
      .send({ land_acquired_ha: '80' });

    expect(res.status).toBe(200);
    expect(res.body.data.land_acquisition.land_acquisition_percentage).toBe('80.0000');
  });
});

describe('land acquisition — validation', () => {
  it.each([
    ['acquired over required', { land_required_ha: '10', land_acquired_ha: '20' }],
    ['negative required', { land_required_ha: '-5' }],
    ['zero required', { land_required_ha: '0' }],
    ['negative acquired', { land_required_ha: '10', land_acquired_ha: '-1' }],
    [
      'parcels acquired over total',
      { land_required_ha: '10', land_parcels_total: 5, land_parcels_acquired: 9 },
    ],
    [
      'award before notification',
      { land_required_ha: '10', notification_date: '2024-06-01', award_date: '2024-01-01' },
    ],
    [
      'possession before award',
      { land_required_ha: '10', award_date: '2024-06-01', possession_date: '2024-01-01' },
    ],
    ['negative landowners', { land_required_ha: '10', affected_landowners: -3 }],
    ['unknown field', { land_required_ha: '10', mystery: 1 }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app)
      .post(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin))
      .send(body);

    expect(res.status).toBe(400);
  });

  it('accepts a valid record', async () => {
    const res = await request(app)
      .post(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin))
      .send({
        land_required_ha: '145.5000',
        land_acquired_ha: '132.4000',
        land_parcels_total: 620,
        land_parcels_acquired: 561,
        affected_landowners: 540,
        affected_families: 480,
        notification_date: '2023-08-10',
        award_date: '2024-01-05',
      });

    expect(res.status).toBe(201);
  });

  it('returns 409 when a record already exists', async () => {
    seedLandAcquisition();
    const res = await request(app)
      .post(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin))
      .send({ land_required_ha: '10' });

    expect(res.status).toBe(409);
  });

  it('returns 404 when reading a record that does not exist', async () => {
    const res = await request(app)
      .get(`${base}/land-acquisition`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });
});

describe('land acquisition — authorization', () => {
  it('lets an assigned OFFICER write', async () => {
    const res = await request(app)
      .post(`${base}/land-acquisition`)
      .set(...authHeader(USERS.officer))
      .send({ land_required_ha: '50' });

    expect(res.status).toBe(201);
  });

  it.each(['viewer', 'analyst'] as const)('refuses %s a write', async (who) => {
    const res = await request(app)
      .post(`${base}/land-acquisition`)
      .set(...authHeader(USERS[who]))
      .send({ land_required_ha: '50' });

    expect(res.status).toBe(403);
    expect(supabaseMock.getTable('land_acquisition')).toHaveLength(0);
  });

  it.each(['viewer', 'analyst'] as const)('allows %s to read', async (who) => {
    seedLandAcquisition();
    const res = await request(app)
      .get(`${base}/land-acquisition`)
      .set(...authHeader(USERS[who]));

    expect(res.status).toBe(200);
  });

  it('refuses an OFFICER an unassigned project', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECTS.unassigned}/land-acquisition`)
      .set(...authHeader(USERS.officer))
      .send({ land_required_ha: '50' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Compensation
// ---------------------------------------------------------------------------

describe('compensation — generated columns', () => {
  it.each(['compensation_pending', 'compensation_pending_percentage'])(
    'refuses a request supplying %s',
    async (column) => {
      const res = await request(app)
        .post(`${base}/compensation`)
        .set(...authHeader(USERS.admin))
        .send({
          total_compensation_required: '1000',
          total_compensation_paid: '250',
          [column]: '0',
        });

      expect(res.status).toBe(400);
    },
  );

  it('returns the pending amount the database computed', async () => {
    const res = await request(app)
      .post(`${base}/compensation`)
      .set(...authHeader(USERS.admin))
      .send({ total_compensation_required: '1000000.00', total_compensation_paid: '250000.00' });

    expect(res.status).toBe(201);
    expect(res.body.data.compensation.compensation_pending).toBe('750000.00');
    expect(res.body.data.compensation.compensation_pending_percentage).toBe('75.0000');
  });

  it('recomputes when a payment is recorded', async () => {
    seedCompensation();
    const res = await request(app)
      .patch(`${base}/compensation`)
      .set(...authHeader(USERS.admin))
      .send({ total_compensation_paid: '1000000.00' });

    expect(res.body.data.compensation.compensation_pending).toBe('0.00');
    expect(res.body.data.compensation.compensation_pending_percentage).toBe('0.0000');
  });

  it('preserves exact decimal amounts as strings', async () => {
    // Money must never round-trip through a float.
    const res = await request(app)
      .post(`${base}/compensation`)
      .set(...authHeader(USERS.admin))
      .send({ total_compensation_required: '1875000000.55', total_compensation_paid: '0' });

    expect(res.body.data.compensation.total_compensation_required).toBe('1875000000.55');
  });
});

describe('compensation — validation', () => {
  it.each([
    ['paid over required', { total_compensation_required: '100', total_compensation_paid: '200' }],
    ['negative required', { total_compensation_required: '-1' }],
    ['negative paid', { total_compensation_paid: '-1' }],
    ['bad payment status', { payment_status: 'MAYBE' }],
    ['non-numeric amount', { total_compensation_required: 'lots' }],
    ['unknown field', { total_compensation_required: '1', mystery: true }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app)
      .post(`${base}/compensation`)
      .set(...authHeader(USERS.admin))
      .send(body);

    expect(res.status).toBe(400);
  });

  it.each(['viewer', 'analyst'] as const)('refuses %s a write', async (who) => {
    const res = await request(app)
      .post(`${base}/compensation`)
      .set(...authHeader(USERS[who]))
      .send({ total_compensation_required: '100' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Legal issues
// ---------------------------------------------------------------------------

const validIssue = {
  issue_type: 'LITIGATION',
  court_case: true,
  case_reference: 'WP/123/2024',
  severity: 'HIGH',
  description: 'Writ petition contesting the award.',
  reported_date: '2024-03-01',
};

describe('legal issues', () => {
  it('creates an issue', async () => {
    const res = await request(app)
      .post(`${base}/legal-issues`)
      .set(...authHeader(USERS.admin))
      .send(validIssue);

    expect(res.status).toBe(201);
    expect(res.body.data.legal_issue.issue_type).toBe('LITIGATION');
    expect(res.body.data.legal_issue.project_id).toBe(PROJECTS.assigned);
  });

  it('lists issues for the project', async () => {
    await request(app)
      .post(`${base}/legal-issues`)
      .set(...authHeader(USERS.admin))
      .send(validIssue);

    const res = await request(app)
      .get(`${base}/legal-issues`)
      .set(...authHeader(USERS.viewer));

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
  });

  it('updates an issue', async () => {
    const created = await request(app)
      .post(`${base}/legal-issues`)
      .set(...authHeader(USERS.admin))
      .send(validIssue);

    const res = await request(app)
      .patch(`${base}/legal-issues/${created.body.data.legal_issue.id}`)
      .set(...authHeader(USERS.officer))
      .send({ status: 'RESOLVED', resolved_date: '2024-09-01' });

    expect(res.status).toBe(200);
    expect(res.body.data.legal_issue.status).toBe('RESOLVED');
  });

  it('deletes an issue', async () => {
    const created = await request(app)
      .post(`${base}/legal-issues`)
      .set(...authHeader(USERS.admin))
      .send(validIssue);

    const res = await request(app)
      .delete(`${base}/legal-issues/${created.body.data.legal_issue.id}`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(supabaseMock.getTable('legal_issues')).toHaveLength(0);
  });

  it.each([
    ['unknown issue type', { ...validIssue, issue_type: 'ALIEN_INVASION' }],
    ['unknown severity', { ...validIssue, severity: 'APOCALYPTIC' }],
    ['case reference without a court case', { ...validIssue, court_case: false }],
    ['resolved before reported', { ...validIssue, resolved_date: '2020-01-01' }],
    ['unknown field', { ...validIssue, mystery: 1 }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app)
      .post(`${base}/legal-issues`)
      .set(...authHeader(USERS.admin))
      .send(body);

    expect(res.status).toBe(400);
  });

  it('does not expose an issue through a different project', async () => {
    // Child rows are addressed as (project_id, id). Knowing an issue's UUID
    // must not be enough to reach it through another project.
    const created = await request(app)
      .post(`${base}/legal-issues`)
      .set(...authHeader(USERS.admin))
      .send(validIssue);

    const res = await request(app)
      .get(`/api/projects/${PROJECTS.unassigned}/legal-issues/${created.body.data.legal_issue.id}`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });

  it.each(['viewer', 'analyst'] as const)('refuses %s a write', async (who) => {
    const res = await request(app)
      .post(`${base}/legal-issues`)
      .set(...authHeader(USERS[who]))
      .send(validIssue);

    expect(res.status).toBe(403);
  });

  it('refuses an OFFICER an unassigned project', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECTS.unassigned}/legal-issues`)
      .set(...authHeader(USERS.officer))
      .send(validIssue);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Risk factors
// ---------------------------------------------------------------------------

const validFactor = {
  factor_type: 'ROW_ISSUE',
  factor_name: 'Right of way contested',
  severity: 'MEDIUM',
  reported_date: '2024-06-01',
};

describe('risk factors', () => {
  it('creates a factor with a valid schema code', async () => {
    const res = await request(app)
      .post(`${base}/risk-factors`)
      .set(...authHeader(USERS.admin))
      .send(validFactor);

    expect(res.status).toBe(201);
    expect(res.body.data.risk_factor.factor_type).toBe('ROW_ISSUE');
  });

  it('maps an unknown factor type to 422 with guidance', async () => {
    // The vocabulary lives in a lookup table so new codes are an INSERT. The
    // foreign key is the authority, not a hard-coded enum in the API.
    supabaseMock.failWith(
      'risk_factors',
      '23503',
      'insert or update on table "risk_factors" violates foreign key constraint "risk_factors_factor_type_fkey"',
    );

    const res = await request(app)
      .post(`${base}/risk-factors`)
      .set(...authHeader(USERS.admin))
      .send({ ...validFactor, factor_type: 'NOT_A_REAL_TYPE' });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('risk-factor-types');
  });

  it.each([
    ['lowercase code', { ...validFactor, factor_type: 'row_issue' }],
    ['empty name', { ...validFactor, factor_name: '' }],
    ['unknown severity', { ...validFactor, severity: 'MILD' }],
    ['resolved before reported', { ...validFactor, resolved_date: '2020-01-01' }],
    ['unknown field', { ...validFactor, mystery: 1 }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app)
      .post(`${base}/risk-factors`)
      .set(...authHeader(USERS.admin))
      .send(body);

    expect(res.status).toBe(400);
  });

  it('exposes the vocabulary so a frontend need not hard-code it', async () => {
    const res = await request(app)
      .get('/api/reference/risk-factor-types')
      .set(...authHeader(USERS.viewer));

    expect(res.status).toBe(200);
    expect(res.body.data.risk_factor_types.map((t: { code: string }) => t.code)).toContain(
      'ROW_ISSUE',
    );
  });

  it.each(['viewer', 'analyst'] as const)('refuses %s a write', async (who) => {
    const res = await request(app)
      .post(`${base}/risk-factors`)
      .set(...authHeader(USERS[who]))
      .send(validFactor);

    expect(res.status).toBe(403);
  });

  it('lets an assigned OFFICER record a factor', async () => {
    const res = await request(app)
      .post(`${base}/risk-factors`)
      .set(...authHeader(USERS.officer))
      .send(validFactor);

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Full project view
// ---------------------------------------------------------------------------

describe('GET /api/projects/:projectId/full', () => {
  beforeEach(() => {
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
      {
        id: 'li-2',
        project_id: PROJECTS.assigned,
        issue_type: 'LAND_DISPUTE',
        court_case: false,
        status: 'RESOLVED',
        severity: 'LOW',
        reported_date: '2023-01-01',
        resolved_date: '2023-06-01',
        case_reference: null,
        description: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-06-01T00:00:00Z',
      },
    ]);
  });

  it('composes every section in one response', async () => {
    const res = await request(app)
      .get(`${base}/full`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('project');
    expect(res.body.data).toHaveProperty('land_acquisition');
    expect(res.body.data).toHaveProperty('compensation');
    expect(res.body.data).toHaveProperty('legal_issues');
    expect(res.body.data).toHaveProperty('risk_factors');
    expect(res.body.data).toHaveProperty('summary');
  });

  it('summarises live issues only', async () => {
    const res = await request(app)
      .get(`${base}/full`)
      .set(...authHeader(USERS.admin));

    // Two issues recorded, one resolved.
    expect(res.body.data.legal_issues).toHaveLength(2);
    expect(res.body.data.summary.open_legal_issues).toBe(1);
    expect(res.body.data.summary.active_court_cases).toBe(1);
  });

  it('carries the database-computed values into the summary', async () => {
    const res = await request(app)
      .get(`${base}/full`)
      .set(...authHeader(USERS.admin));

    expect(res.body.data.summary.acquisition_percentage).toBe('40.0000');
    expect(res.body.data.summary.compensation_pending).toBe('750000.00');
  });

  it('refuses an OFFICER an unassigned project', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECTS.unassigned}/full`)
      .set(...authHeader(USERS.officer));

    expect(res.status).toBe(403);
  });

  it('never exposes secrets or internal metadata', async () => {
    const res = await request(app)
      .get(`${base}/full`)
      .set(...authHeader(USERS.admin));

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('service-role');
    expect(body).not.toContain('SUPABASE');
    expect(body).not.toContain('test-jwt-secret');
  });
});
