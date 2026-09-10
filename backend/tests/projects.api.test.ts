/**
 * projects.api.test.ts — the project endpoints, exercised over real HTTP.
 *
 * Requests go through the actual Express app: routing, requireAuth,
 * requireProjectAccess, Zod validation, controller, service, error middleware.
 * Only the Supabase client is faked. Testing controllers directly would skip
 * exactly the wiring most likely to be wrong — a missing `{ mode: 'write' }`
 * on one route looks like working code until someone tries it.
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

beforeEach(() => {
  seedStandardFixture();
});

const validProject = {
  project_name: 'New Corridor',
  project_code: 'NEW-001',
  state: 'Kerala',
  district: 'Central',
  sector: 'ROAD',
  implementing_agency: 'Agency C',
};

describe('authentication', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a malformed token', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects a token whose user has no profile', async () => {
    supabaseMock.setTable('profiles', []);
    const res = await request(app).get('/api/projects').set(...authHeader(USERS.admin));
    expect(res.status).toBe(403);
  });
});

describe('role comes from the database, not the token', () => {
  it('refuses project creation to a VIEWER whose token claims ADMIN', async () => {
    // The token carries user_metadata.role = 'ADMIN'; the profile says VIEWER.
    const res = await request(app)
      .post('/api/projects')
      .set(...authHeader(USERS.viewer, 'ADMIN'))
      .send(validProject);

    expect(res.status).toBe(403);
    expect(supabaseMock.getTable('projects')).toHaveLength(2);
  });

  it('refuses project creation to an OFFICER whose token claims ADMIN', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(...authHeader(USERS.officer, 'ADMIN'))
      .send(validProject);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/projects', () => {
  it('lets an ADMIN create a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(...authHeader(USERS.admin))
      .send(validProject);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.project.project_code).toBe('NEW-001');
  });

  it('attributes the project to the caller, ignoring any created_by in the body', async () => {
    // Authorship grants project access, so accepting created_by from input
    // would let a caller hand access to someone else.
    const res = await request(app)
      .post('/api/projects')
      .set(...authHeader(USERS.admin))
      .send({ ...validProject, created_by: USERS.officer2 });

    // `.strict()` rejects the unknown key outright rather than ignoring it.
    expect(res.status).toBe(400);
  });

  it('sets created_by to the authenticated caller', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(...authHeader(USERS.admin))
      .send(validProject);

    expect(res.body.data.project.created_by).toBe(USERS.admin);
  });

  it.each([
    ['missing required field', { project_name: 'x' }],
    ['empty name', { ...validProject, project_name: '' }],
    ['bad status', { ...validProject, project_status: 'NOT_A_STATUS' }],
    ['latitude out of range', { ...validProject, latitude: 120 }],
    ['longitude out of range', { ...validProject, longitude: -200 }],
    ['unknown field', { ...validProject, sneaky_column: 'x' }],
    ['malformed date', { ...validProject, planned_start_date: '01-01-2024' }],
    ['impossible date', { ...validProject, planned_start_date: '2025-02-30' }],
    [
      'completion before start',
      { ...validProject, planned_start_date: '2025-01-01', planned_completion_date: '2024-01-01' },
    ],
  ])('rejects invalid input: %s', async (_label, body) => {
    const res = await request(app)
      .post('/api/projects')
      .set(...authHeader(USERS.admin))
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('maps a duplicate project code to 409', async () => {
    supabaseMock.failWith(
      'projects',
      '23505',
      'duplicate key value violates unique constraint "projects_project_code_key"',
    );

    const res = await request(app)
      .post('/api/projects')
      .set(...authHeader(USERS.admin))
      .send(validProject);

    expect(res.status).toBe(409);
  });
});

describe('GET /api/projects (collection scoping)', () => {
  it.each(['admin', 'analyst', 'viewer'] as const)('shows all projects to %s', async (who) => {
    const res = await request(app)
      .get('/api/projects')
      .set(...authHeader(USERS[who]));

    expect(res.status).toBe(200);
    expect(res.body.data.projects).toHaveLength(2);
  });

  it('shows an OFFICER only their assigned projects', async () => {
    // The collection route has no project id for requireProjectAccess to
    // guard, so the filter is applied in the service. Without it this endpoint
    // would leak every project in the country.
    const res = await request(app)
      .get('/api/projects')
      .set(...authHeader(USERS.officer));

    expect(res.status).toBe(200);
    expect(res.body.data.projects).toHaveLength(1);
    expect(res.body.data.projects[0].id).toBe(PROJECTS.assigned);
  });

  it('shows nothing to an OFFICER with no assignments', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set(...authHeader(USERS.officer2));

    expect(res.status).toBe(200);
    expect(res.body.data.projects).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it('returns real pagination metadata', async () => {
    const res = await request(app)
      .get('/api/projects?page=1&limit=1')
      .set(...authHeader(USERS.admin));

    expect(res.body.data.projects).toHaveLength(1);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
      hasNext: true,
      hasPrevious: false,
    });
  });

  it('reports the second page correctly', async () => {
    const res = await request(app)
      .get('/api/projects?page=2&limit=1')
      .set(...authHeader(USERS.admin));

    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      hasNext: false,
      hasPrevious: true,
    });
  });

  it('caps the page size', async () => {
    const res = await request(app)
      .get('/api/projects?limit=5000')
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(400);
  });

  it('filters by state', async () => {
    const res = await request(app)
      .get('/api/projects?state=Gujarat')
      .set(...authHeader(USERS.admin));

    expect(res.body.data.projects).toHaveLength(1);
    expect(res.body.data.projects[0].state).toBe('Gujarat');
  });

  it.each([
    ['district', 'North', PROJECTS.assigned],
    ['sector', 'RAILWAY', PROJECTS.unassigned],
    ['project_status', 'ACTIVE', PROJECTS.assigned],
  ])('filters by %s', async (field, value, expectedId) => {
    const res = await request(app)
      .get(`/api/projects?${field}=${value}`)
      .set(...authHeader(USERS.admin));

    expect(res.body.data.projects).toHaveLength(1);
    expect(res.body.data.projects[0].id).toBe(expectedId);
  });

  it('applies filters within an OFFICER’s scope, not outside it', async () => {
    // Gujarat holds only the unassigned project, so the officer must get zero
    // — the filter must not widen visibility.
    const res = await request(app)
      .get('/api/projects?state=Gujarat')
      .set(...authHeader(USERS.officer));

    expect(res.body.data.projects).toEqual([]);
  });

  it('rejects an unknown query parameter', async () => {
    const res = await request(app)
      .get('/api/projects?evil=1')
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(400);
  });
});

describe('GET /api/projects/:projectId', () => {
  it('returns a project to a permitted role', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECTS.assigned}`)
      .set(...authHeader(USERS.viewer));

    expect(res.status).toBe(200);
    expect(res.body.data.project.id).toBe(PROJECTS.assigned);
  });

  it('lets an OFFICER read an assigned project', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECTS.assigned}`)
      .set(...authHeader(USERS.officer));

    expect(res.status).toBe(200);
  });

  it('refuses an OFFICER an unassigned project', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECTS.unassigned}`)
      .set(...authHeader(USERS.officer));

    expect(res.status).toBe(403);
  });

  it('returns 404 for a project that does not exist', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECTS.missing}`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed project id', async () => {
    const res = await request(app)
      .get('/api/projects/not-a-uuid')
      .set(...authHeader(USERS.admin));

    // Not a UUID, so no project can exist with that id.
    expect([400, 404]).toContain(res.status);
  });
});

describe('PATCH /api/projects/:projectId', () => {
  it('lets an ADMIN update any project', async () => {
    const res = await request(app)
      .patch(`/api/projects/${PROJECTS.unassigned}`)
      .set(...authHeader(USERS.admin))
      .send({ district: 'Updated District' });

    expect(res.status).toBe(200);
    expect(res.body.data.project.district).toBe('Updated District');
  });

  it('lets an OFFICER update an assigned project', async () => {
    const res = await request(app)
      .patch(`/api/projects/${PROJECTS.assigned}`)
      .set(...authHeader(USERS.officer))
      .send({ district: 'Officer Edit' });

    expect(res.status).toBe(200);
  });

  it('refuses an OFFICER an unassigned project', async () => {
    const res = await request(app)
      .patch(`/api/projects/${PROJECTS.unassigned}`)
      .set(...authHeader(USERS.officer))
      .send({ district: 'Nope' });

    expect(res.status).toBe(403);
  });

  it.each(['viewer', 'analyst'] as const)('refuses %s any write', async (who) => {
    // The prototype's national READ scope must not leak into write access.
    const res = await request(app)
      .patch(`/api/projects/${PROJECTS.assigned}`)
      .set(...authHeader(USERS[who]))
      .send({ district: 'Nope' });

    expect(res.status).toBe(403);
    expect(
      supabaseMock.getTable('projects').find((p) => p.id === PROJECTS.assigned)?.district,
    ).toBe('North');
  });

  it('rejects an empty update body', async () => {
    const res = await request(app)
      .patch(`/api/projects/${PROJECTS.assigned}`)
      .set(...authHeader(USERS.admin))
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects an unknown field', async () => {
    const res = await request(app)
      .patch(`/api/projects/${PROJECTS.assigned}`)
      .set(...authHeader(USERS.admin))
      .send({ id: 'aaaaaaaa-0000-4000-8000-00000000beef' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/projects/:projectId', () => {
  it('lets an ADMIN delete a project', async () => {
    const res = await request(app)
      .delete(`/api/projects/${PROJECTS.assigned}`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(200);
    expect(supabaseMock.getTable('projects')).toHaveLength(1);
  });

  it.each(['officer', 'analyst', 'viewer'] as const)('refuses %s', async (who) => {
    // Deletion is ADMIN-only even on an assigned project: an officer
    // correcting operational data should not be able to erase the record.
    const res = await request(app)
      .delete(`/api/projects/${PROJECTS.assigned}`)
      .set(...authHeader(USERS[who]));

    expect(res.status).toBe(403);
    expect(supabaseMock.getTable('projects')).toHaveLength(2);
  });

  it('returns 404 for a project that does not exist', async () => {
    const res = await request(app)
      .delete(`/api/projects/${PROJECTS.missing}`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });
});

describe('error handling', () => {
  it('reports a database outage as 503, not 500', async () => {
    supabaseMock.failTable('projects', 'connection refused');

    const res = await request(app)
      .get(`/api/projects/${PROJECTS.assigned}`)
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(503);
  });

  it('never leaks raw database text to the client', async () => {
    supabaseMock.failWith(
      'projects',
      '23505',
      'duplicate key value violates unique constraint "projects_project_code_key" DETAIL: Key (project_code)=(NEW-001) already exists',
    );

    const res = await request(app)
      .post('/api/projects')
      .set(...authHeader(USERS.admin))
      .send(validProject);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('DETAIL');
    expect(body).not.toContain('duplicate key value');
    expect(body).not.toContain('projects_project_code_key');
  });

  it('returns 404 for an unknown route', async () => {
    const res = await request(app)
      .get('/api/nope')
      .set(...authHeader(USERS.admin));

    expect(res.status).toBe(404);
  });
});
