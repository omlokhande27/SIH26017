/**
 * Tiny Express request/response doubles.
 *
 * Middleware is awkward to assert on directly because it communicates through
 * side effects: it either calls `next()` or writes a status and a body. These
 * doubles capture both so a test can state plainly which of the two happened.
 */
import { vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, AuthenticatedUser } from '../../src/types';

export interface MockResponse {
  res: Response;
  /** HTTP status written, or undefined if the middleware called next() instead. */
  statusCode: () => number | undefined;
  /** JSON body written, or undefined. */
  body: () => Record<string, unknown> | undefined;
}

export function mockResponse(): MockResponse {
  let statusCode: number | undefined;
  let body: Record<string, unknown> | undefined;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      body = payload;
      return this;
    },
  } as unknown as Response;

  return { res, statusCode: () => statusCode, body: () => body };
}

export function mockRequest(init: {
  token?: string;
  authorizationHeader?: string;
  params?: Record<string, string>;
  user?: AuthenticatedUser;
}): AuthenticatedRequest {
  const headers: Record<string, string> = {};

  if (init.authorizationHeader !== undefined) {
    headers.authorization = init.authorizationHeader;
  } else if (init.token !== undefined) {
    headers.authorization = `Bearer ${init.token}`;
  }

  return {
    headers,
    params: init.params ?? {},
    ...(init.user && { user: init.user }),
  } as unknown as AuthenticatedRequest;
}

export function mockNext(): NextFunction & { called: () => boolean } {
  const fn = vi.fn();
  const wrapped = ((...args: unknown[]) => fn(...args)) as NextFunction & {
    called: () => boolean;
  };
  wrapped.called = () => fn.mock.calls.length > 0;
  return wrapped;
}
