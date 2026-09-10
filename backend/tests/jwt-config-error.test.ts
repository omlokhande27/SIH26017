/**
 * jwt-config-error.test.ts — a misconfigured verifier is an operator problem,
 * not a bad credential.
 *
 * If the backend cannot determine how to verify tokens (no published JWKS and
 * no shared secret), every request would fail. Reporting that as 401 would
 * send users off to re-authenticate against a backend that cannot verify
 * anything they bring back, and would hide a configuration fault behind what
 * looks like ordinary auth churn. It must be 503.
 *
 * Isolated in its own file because it mocks the verifier module wholesale.
 */
import { describe, it, expect, vi } from 'vitest';
import { supabaseMock } from './helpers/supabase-mock';
import { mockRequest, mockResponse, mockNext } from './helpers/express-mock';

class FakeJwtConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtConfigurationError';
  }
}

vi.mock('../src/services/jwt-verifier', () => ({
  JwtConfigurationError: FakeJwtConfigurationError,
  verifySupabaseToken: vi.fn(async () => {
    throw new FakeJwtConfigurationError(
      'Cannot determine how to verify Supabase JWTs. The project publishes no JWKS and ' +
        'JWT_SECRET is not set.',
    );
  }),
}));

vi.mock('../src/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAdmin: supabaseMock,
}));

const { requireAuth } = await import('../src/middleware/auth.middleware');

describe('verifier misconfiguration', () => {
  it('responds 503, not 401', async () => {
    const req = mockRequest({ token: 'any.token.value' });
    const { res, statusCode, body } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(503);
    expect(body()).toMatchObject({ success: false });
  });

  it('does not leak the configuration detail to the caller', async () => {
    // The operator needs the detail; the caller must not learn which secrets
    // are or are not configured.
    const req = mockRequest({ token: 'any.token.value' });
    const { res, body } = mockResponse();

    await requireAuth(req, res, mockNext());

    const serialised = JSON.stringify(body());
    expect(serialised).not.toContain('JWT_SECRET');
    expect(serialised).not.toContain('JWKS');
  });

  it('never attaches a user', async () => {
    const req = mockRequest({ token: 'any.token.value' });
    await requireAuth(req, mockResponse().res, mockNext());
    expect(req.user).toBeUndefined();
  });
});
