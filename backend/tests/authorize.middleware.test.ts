/**
 * authorize.middleware.test.ts — the role and project-access guards.
 *
 * These cover the backend authorization layer, which is the one that actually
 * runs for API traffic: the backend connects with the service-role key and
 * bypasses RLS entirely, so the database policies are a backstop rather than
 * the control. The equivalent policy matrix is verified against a real
 * PostgreSQL engine in database/tests/rls.test.ts; the two must agree.
 *
 * Policy under test (docs/DATABASE.md §9):
 *
 *   READ   ADMIN / ANALYST / VIEWER  any project (prototype national scope)
 *          OFFICER                   assigned only
 *
 *   WRITE  ADMIN                     any project
 *          OFFICER                   assigned only
 *          ANALYST / VIEWER          never
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabaseMock } from './helpers/supabase-mock';
import { mockRequest, mockResponse, mockNext } from './helpers/express-mock';
import type { AppRole } from '../src/config/roles';
import type { AuthenticatedUser } from '../src/types';

vi.mock('../src/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAdmin: supabaseMock,
}));

const { requireRole, requireProjectAccess, requireProjectWrite } = await import(
  '../src/middleware/authorize.middleware'
);

const OFFICER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
/** An officer with no assignment and no authorship anywhere in the fixture. */
const STRANGER_ID = '44444444-4444-4444-8444-444444444444';
const ASSIGNED_PROJECT = 'aaaaaaaa-0000-4000-8000-000000000001';
const UNASSIGNED_PROJECT = 'aaaaaaaa-0000-4000-8000-000000000002';
const CREATED_PROJECT = 'aaaaaaaa-0000-4000-8000-000000000003';
const MISSING_PROJECT = 'aaaaaaaa-0000-4000-8000-00000000dead';

function user(role: AppRole, id = OFFICER_ID): AuthenticatedUser {
  return { id, email: 'u@example.invalid', role, fullName: 'Test User' };
}

beforeEach(() => {
  supabaseMock.reset();

  supabaseMock.setTable('projects', [
    { id: ASSIGNED_PROJECT, created_by: OTHER_ID },
    { id: UNASSIGNED_PROJECT, created_by: OTHER_ID },
    // Created by the officer but with no explicit assignment row — the
    // schema's is_assigned_to_project() treats authorship as access, and the
    // backend must match or officers lose their own projects.
    { id: CREATED_PROJECT, created_by: OFFICER_ID },
  ]);

  supabaseMock.setTable('project_assignments', [
    { id: 'assignment-1', user_id: OFFICER_ID, project_id: ASSIGNED_PROJECT },
  ]);
});

describe('requireRole', () => {
  it('allows a permitted role through', async () => {
    const req = mockRequest({ user: user('ADMIN') });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    requireRole('ADMIN')(req, res, next);

    expect(next.called()).toBe(true);
    expect(statusCode()).toBeUndefined();
  });

  it.each<AppRole>(['ANALYST', 'OFFICER', 'VIEWER'])('denies %s on an ADMIN-only route', (role) => {
    const req = mockRequest({ user: user(role) });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    requireRole('ADMIN')(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(403);
  });

  it('accepts any one of several permitted roles', () => {
    for (const role of ['ADMIN', 'ANALYST'] as AppRole[]) {
      const req = mockRequest({ user: user(role) });
      const next = mockNext();
      requireRole('ADMIN', 'ANALYST')(req, mockResponse().res, next);
      expect(next.called()).toBe(true);
    }
  });

  it('fails closed with 401 when no user is attached', () => {
    // Reachable only if a route forgets requireAuth. It must refuse rather
    // than treat "no user" as "no restrictions".
    const req = mockRequest({});
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    requireRole('ADMIN')(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });
});

describe('project READ access', () => {
  it.each<AppRole>(['ADMIN', 'ANALYST', 'VIEWER'])(
    'allows %s to read a project they are not assigned to (prototype national scope)',
    async (role) => {
      const req = mockRequest({ user: user(role), params: { projectId: UNASSIGNED_PROJECT } });
      const { res, statusCode } = mockResponse();
      const next = mockNext();

      await requireProjectAccess()(req, res, next);

      expect(next.called()).toBe(true);
      expect(statusCode()).toBeUndefined();
    },
  );

  it('allows an OFFICER to read an assigned project', async () => {
    const req = mockRequest({ user: user('OFFICER'), params: { projectId: ASSIGNED_PROJECT } });
    const { res } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('denies an OFFICER reading an unassigned project', async () => {
    const req = mockRequest({ user: user('OFFICER'), params: { projectId: UNASSIGNED_PROJECT } });
    const { res, statusCode, body } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(403);
    expect(body()).toMatchObject({ success: false });
  });

  it('treats a project the OFFICER created as accessible', async () => {
    const req = mockRequest({ user: user('OFFICER'), params: { projectId: CREATED_PROJECT } });
    const { res } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('does not let one officer inherit another officer’s assignment', async () => {
    // STRANGER_ID has neither an assignment row nor authorship of this
    // project. The only assignment row in the fixture belongs to OFFICER_ID,
    // and it must not carry over.
    const req = mockRequest({
      user: user('OFFICER', STRANGER_ID),
      params: { projectId: ASSIGNED_PROJECT },
    });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(403);
  });

  it('attaches the validated project id for the handler', async () => {
    const req = mockRequest({ user: user('ADMIN'), params: { projectId: ASSIGNED_PROJECT } });
    const { res } = mockResponse();

    await requireProjectAccess()(req, res, mockNext());

    expect(req.projectId).toBe(ASSIGNED_PROJECT);
  });
});

describe('project WRITE access', () => {
  it('allows ADMIN to write to any project', async () => {
    const req = mockRequest({ user: user('ADMIN'), params: { projectId: UNASSIGNED_PROJECT } });
    const { res } = mockResponse();
    const next = mockNext();

    await requireProjectWrite()(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('allows an OFFICER to write to an assigned project', async () => {
    const req = mockRequest({ user: user('OFFICER'), params: { projectId: ASSIGNED_PROJECT } });
    const { res } = mockResponse();
    const next = mockNext();

    await requireProjectWrite()(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('denies an OFFICER writing to an unassigned project', async () => {
    const req = mockRequest({ user: user('OFFICER'), params: { projectId: UNASSIGNED_PROJECT } });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireProjectWrite()(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(403);
  });

  it.each<AppRole>(['ANALYST', 'VIEWER'])(
    'denies %s writing, even to a project they can read',
    async (role) => {
      // The prototype national READ scope must not leak into write access.
      const readReq = mockRequest({ user: user(role), params: { projectId: ASSIGNED_PROJECT } });
      const readNext = mockNext();
      await requireProjectAccess()(readReq, mockResponse().res, readNext);
      expect(readNext.called(), `${role} should be able to read`).toBe(true);

      const writeReq = mockRequest({ user: user(role), params: { projectId: ASSIGNED_PROJECT } });
      const { res, statusCode } = mockResponse();
      const writeNext = mockNext();
      await requireProjectWrite()(writeReq, res, writeNext);

      expect(writeNext.called(), `${role} must not be able to write`).toBe(false);
      expect(statusCode()).toBe(403);
    },
  );

  it('denies a VIEWER write even with an assignment row present', async () => {
    // Assignment does not confer write access on a read-only role.
    supabaseMock.setTable('project_assignments', [
      { id: 'a2', user_id: OFFICER_ID, project_id: ASSIGNED_PROJECT },
    ]);
    const req = mockRequest({ user: user('VIEWER'), params: { projectId: ASSIGNED_PROJECT } });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireProjectWrite()(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(403);
  });
});

describe('error handling', () => {
  it('returns 404 for a project that does not exist', async () => {
    const req = mockRequest({ user: user('ADMIN'), params: { projectId: MISSING_PROJECT } });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(404);
  });

  it('returns 403, not 404, when an OFFICER probes a project they cannot see', async () => {
    // A 404 here would let an officer enumerate which project ids exist.
    const req = mockRequest({ user: user('OFFICER'), params: { projectId: UNASSIGNED_PROJECT } });
    const { res, statusCode } = mockResponse();

    await requireProjectAccess()(req, res, mockNext());

    expect(statusCode()).toBe(403);
  });

  it('returns 400 when the project id param is missing', async () => {
    const req = mockRequest({ user: user('ADMIN'), params: {} });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(400);
  });

  it('falls back to the :id param when :projectId is absent', async () => {
    const req = mockRequest({ user: user('ADMIN'), params: { id: ASSIGNED_PROJECT } });
    const { res } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('honours a custom param name', async () => {
    const req = mockRequest({ user: user('ADMIN'), params: { project: ASSIGNED_PROJECT } });
    const { res } = mockResponse();
    const next = mockNext();

    await requireProjectAccess({ param: 'project' })(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('returns 503 when the database lookup fails', async () => {
    supabaseMock.failTable('projects', 'connection refused');
    const req = mockRequest({ user: user('ADMIN'), params: { projectId: ASSIGNED_PROJECT } });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(503);
  });

  it('returns 503 when the assignment lookup fails for an OFFICER', async () => {
    supabaseMock.failTable('project_assignments', 'connection refused');
    const req = mockRequest({ user: user('OFFICER'), params: { projectId: ASSIGNED_PROJECT } });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(503);
  });

  it('fails closed with 401 when no user is attached', async () => {
    const req = mockRequest({ params: { projectId: ASSIGNED_PROJECT } });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireProjectAccess()(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });
});
