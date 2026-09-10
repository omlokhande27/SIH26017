import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middleware/error.middleware';
import * as projectService from '../services/project.service';
import { getProjectFullView } from '../services/project-view.service';
import type {
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from '../validators/project.validator';

/**
 * Project controllers.
 *
 * These stay thin on purpose: read the request, call a service, send a
 * standard response. No business rules, no query building, no authorization
 * decisions — those belong to the service and middleware layers respectively,
 * and duplicating them here is how the two drift apart.
 *
 * Errors are passed to `next()` rather than handled locally, so every failure
 * goes through the one error middleware and gets a consistent shape.
 */

/**
 * The authenticated caller.
 *
 * `requireAuth` guarantees `req.user` on every route in this file. If it is
 * missing, the route was wired without the middleware — a programming error,
 * not a client error, so it fails as a 500 rather than silently proceeding.
 */
function callerOf(req: AuthenticatedRequest) {
  if (!req.user) {
    throw new AppError(500, 'Route misconfiguration: requireAuth did not run');
  }
  return req.user;
}

/**
 * The project id a `requireProjectAccess` guard already validated.
 *
 * Reading it from `req.projectId` rather than `req.params` means a handler
 * cannot accidentally operate on an id that was never authorised.
 */
function authorisedProjectId(req: AuthenticatedRequest): string {
  if (!req.projectId) {
    throw new AppError(500, 'Route misconfiguration: requireProjectAccess did not run');
  }
  return req.projectId;
}

export async function listProjects(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await projectService.listProjects(
      callerOf(req),
      req.query as unknown as ListProjectsQuery,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getProject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const project = await projectService.getProjectById(authorisedProjectId(req));
    sendSuccess(res, { project });
  } catch (err) {
    next(err);
  }
}

export async function getFullProject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const view = await getProjectFullView(authorisedProjectId(req));
    sendSuccess(res, view);
  } catch (err) {
    next(err);
  }
}

export async function createProject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const project = await projectService.createProject(
      req.body as CreateProjectInput,
      callerOf(req).id,
    );
    sendSuccess(res, { project }, 201, 'Project created');
  } catch (err) {
    next(err);
  }
}

export async function updateProject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const project = await projectService.updateProject(
      authorisedProjectId(req),
      req.body as UpdateProjectInput,
    );
    sendSuccess(res, { project }, 200, 'Project updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await projectService.deleteProject(authorisedProjectId(req));
    sendSuccess(res, { deleted: true }, 200, 'Project deleted');
  } catch (err) {
    next(err);
  }
}

export { callerOf, authorisedProjectId };
