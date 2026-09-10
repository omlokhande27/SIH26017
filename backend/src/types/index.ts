import { Request } from 'express';
import type { AppRole } from '../config/roles';

/**
 * The caller, as established by `requireAuth`.
 *
 * `role` is typed as `AppRole` rather than `string` on purpose: it can only
 * have come from `public.profiles` via `normalizeRole`, so the type reflects
 * where the value is allowed to originate. A plain `string` here would let a
 * future handler assign a role from a request body without the compiler
 * objecting.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: AppRole;
  fullName: string | null;
}

/** Express Request carrying the verified caller after `requireAuth` has run. */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  /**
   * The project id a `requireProjectAccess` guard validated for this request.
   * Present only once that guard has allowed the request through, so a handler
   * reading it knows access was already checked.
   */
  projectId?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginationQuery {
  page: number;
  limit: number;
}
