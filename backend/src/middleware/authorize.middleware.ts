import { Response, NextFunction } from 'express';
import { canAccessProject, type AccessMode } from '../services/authorization.service';
import { AuthenticatedRequest } from '../types';
import type { AppRole } from '../config/roles';

/** RFC 4122 UUID, the shape every id column in this schema uses. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reusable authorization guards.
 *
 * These exist so no controller re-implements a policy decision. Authorization
 * logic scattered across handlers is how one route ends up checking assignment
 * and the next one forgets — the failure is silent and looks like working code.
 *
 * All guards run AFTER `requireAuth`, which is what populates `req.user`. A
 * guard that finds no `req.user` treats it as a wiring mistake and fails
 * closed with 401 rather than waving the request through.
 */

function unauthenticated(res: Response): void {
  res.status(401).json({ success: false, error: 'Authentication required' });
}

function forbidden(res: Response, error = 'Insufficient permissions'): void {
  res.status(403).json({ success: false, error });
}

/**
 * Restrict a route to specific roles.
 *
 *     router.post('/projects', requireAuth, requireRole('ADMIN'), createProject)
 *
 * Use this for capabilities that are not tied to one project — creating a
 * project, managing the model registry, editing reference data. For anything
 * addressed by a project id, use `requireProjectAccess`, which also handles
 * OFFICER assignment scoping.
 */
export function requireRole(...allowed: AppRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      unauthenticated(res);
      return;
    }
    if (!allowed.includes(req.user.role)) {
      forbidden(res);
      return;
    }
    next();
  };
}

export interface ProjectAccessOptions {
  /** Which request param carries the project id. Defaults to `projectId`, falling back to `id`. */
  param?: string;
  /** Read or write. Defaults to `read`. */
  mode?: AccessMode;
}

/**
 * Guard a project-scoped route.
 *
 *     router.get('/projects/:projectId',        requireAuth, requireProjectAccess(), show)
 *     router.patch('/projects/:projectId/land', requireAuth, requireProjectAccess({ mode: 'write' }), update)
 *
 * Enforces the documented policy: ADMIN/ANALYST/VIEWER read any project,
 * OFFICER reads only assigned ones; ADMIN writes any, OFFICER writes only
 * assigned, ANALYST and VIEWER never write.
 *
 * On success the resolved project id is attached to `req.projectId`, so the
 * handler does not have to re-read and re-validate the param.
 */
export function requireProjectAccess(options: ProjectAccessOptions = {}) {
  const { param = 'projectId', mode = 'read' } = options;

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      unauthenticated(res);
      return;
    }

    const raw = req.params[param] ?? req.params.id;
    if (typeof raw !== 'string' || raw.length === 0) {
      res.status(400).json({ success: false, error: `Missing project identifier ("${param}")` });
      return;
    }

    // Reject a malformed id here rather than letting it reach PostgreSQL.
    //
    // A non-UUID compared against a uuid column raises SQLSTATE 22P02, which
    // the error translator cannot distinguish from a genuine database fault —
    // so a typo in a URL came back as 503 "database unavailable". That is wrong
    // twice over: it tells operators there is an outage when there is not, and
    // it invites the client to retry a request that can never succeed.
    //
    // Checking the format costs nothing and reveals nothing: a string that
    // cannot be a UUID cannot identify any project, so refusing it leaks no
    // information about what exists.
    if (!UUID_PATTERN.test(raw)) {
      res.status(400).json({ success: false, error: 'Invalid project identifier' });
      return;
    }

    const decision = await canAccessProject(req.user, raw, mode);

    if (decision.allowed) {
      req.projectId = raw;
      next();
      return;
    }

    switch (decision.reason) {
      case 'lookup_failed':
        console.error('[authorize] project access lookup failed', {
          userId: req.user.id,
          projectId: raw,
          detail: decision.detail,
        });
        res.status(503).json({ success: false, error: 'Authorization service unavailable' });
        return;

      case 'project_not_found':
        // Only reachable by a caller who would have been allowed had the
        // project existed, so this leaks nothing about other projects.
        res.status(404).json({ success: false, error: 'Project not found' });
        return;

      case 'not_assigned':
        forbidden(res, 'You are not assigned to this project');
        return;

      case 'role_forbidden':
      default:
        forbidden(res);
        return;
    }
  };
}

/** Convenience wrappers for the two common cases. */
export const requireProjectRead = (param?: string) =>
  requireProjectAccess({ param, mode: 'read' });

export const requireProjectWrite = (param?: string) =>
  requireProjectAccess({ param, mode: 'write' });
