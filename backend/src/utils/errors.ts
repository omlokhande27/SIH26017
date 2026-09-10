import { AppError } from '../middleware/error.middleware';

/**
 * Named errors for the status codes the API uses.
 *
 * These are thin subclasses of the existing `AppError` rather than a parallel
 * system: the error middleware already knows how to render an `AppError`, and
 * these only make the intent readable at the throw site.
 */

/** 404 — the addressed resource does not exist. */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

/** 409 — the request conflicts with the current state of the resource. */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

/**
 * 422 — the request was well-formed and syntactically valid, but violates a
 * business rule or a database invariant.
 *
 * Distinct from the 400 that Zod produces: 400 means "this payload is not
 * shaped like a request", 422 means "this is a valid request that the domain
 * refuses". Land acquired exceeding land required is the second kind.
 */
export class UnprocessableError extends AppError {
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(422, message);
    this.name = 'UnprocessableError';
    this.details = details;
  }
}

/** 503 — a dependency the request needed was unavailable. */
export class DependencyUnavailableError extends AppError {
  constructor(message = 'A required service is unavailable') {
    super(503, message);
    this.name = 'DependencyUnavailableError';
  }
}
