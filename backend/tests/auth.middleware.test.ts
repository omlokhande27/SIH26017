/**
 * auth.middleware.test.ts — authentication and, above all, the fix for the
 * privilege-escalation vulnerability.
 *
 * The central assertion in this file is that a role claim inside the JWT has
 * NO effect on the resolved role. Supabase's `user_metadata` is writable by the
 * user, so a correctly-signed token can carry `role: 'ADMIN'` chosen by the
 * account holder. The middleware must ignore it and read `public.profiles`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { supabaseMock } from './helpers/supabase-mock';
import { mockRequest, mockResponse, mockNext } from './helpers/express-mock';

// The middleware reaches the database through `supabaseAdmin`. Point it at the
// in-memory double before the module graph loads.
vi.mock('../src/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAdmin: supabaseMock,
}));

const { requireAuth } = await import('../src/middleware/auth.middleware');

const SECRET = 'test-jwt-secret-not-a-real-key';
const USER_ID = '11111111-1111-4111-8111-111111111111';

/** Mint a valid, correctly-signed token — the same thing Supabase would issue. */
function signToken(payload: Record<string, unknown> = {}, options: jwt.SignOptions = {}): string {
  return jwt.sign(
    { sub: USER_ID, aud: 'authenticated', email: 'officer@example.invalid', ...payload },
    SECRET,
    { algorithm: 'HS256', expiresIn: '1h', ...options },
  );
}

function seedProfile(role: string, id = USER_ID): void {
  supabaseMock.setTable('profiles', [{ id, role, full_name: 'Test User' }]);
}

beforeEach(() => {
  supabaseMock.reset();
});

describe('privilege escalation via token claims is impossible', () => {
  it('IGNORES user_metadata.role and uses the profiles row', async () => {
    // The exact attack the previous implementation allowed: the user calls
    // supabase.auth.updateUser({ data: { role: 'ADMIN' } }), Supabase mints a
    // genuine signed token carrying that claim, and the old code trusted it.
    seedProfile('VIEWER');
    const token = signToken({ user_metadata: { role: 'ADMIN' } });

    const req = mockRequest({ token });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(true);
    expect(statusCode()).toBeUndefined();
    expect(req.user?.role).toBe('VIEWER');
    expect(req.user?.role).not.toBe('ADMIN');
  });

  it('ignores app_metadata.role as well', async () => {
    seedProfile('VIEWER');
    const req = mockRequest({ token: signToken({ app_metadata: { role: 'ADMIN' } }) });
    const { res } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(req.user?.role).toBe('VIEWER');
  });

  it('ignores a bare top-level role claim', async () => {
    seedProfile('OFFICER');
    const req = mockRequest({ token: signToken({ role: 'ADMIN' }) });
    const { res } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(req.user?.role).toBe('OFFICER');
  });

  it('ignores every role-shaped claim at once', async () => {
    seedProfile('VIEWER');
    const req = mockRequest({
      token: signToken({
        role: 'ADMIN',
        user_metadata: { role: 'ADMIN', is_admin: true },
        app_metadata: { role: 'ADMIN', roles: ['ADMIN'] },
      }),
    });
    const { res } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(req.user?.role).toBe('VIEWER');
  });

  it('uses the profile role even when the token carries no role at all', async () => {
    seedProfile('ADMIN');
    const req = mockRequest({ token: signToken() });
    const { res } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(req.user?.role).toBe('ADMIN');
  });

  it('reflects a role change in the database on the next request', async () => {
    // Proves the role is read per-request from the database rather than
    // captured from the token: a demotion takes effect immediately.
    seedProfile('ADMIN');
    const token = signToken({ user_metadata: { role: 'ADMIN' } });

    const first = mockRequest({ token });
    await requireAuth(first, mockResponse().res, mockNext());
    expect(first.user?.role).toBe('ADMIN');

    seedProfile('VIEWER');

    const second = mockRequest({ token });
    await requireAuth(second, mockResponse().res, mockNext());
    expect(second.user?.role).toBe('VIEWER');
  });
});

describe('role normalisation', () => {
  it('uppercases a lowercase stored role, so no case mismatch can occur', async () => {
    // The previous code defaulted to lowercase 'viewer', which silently failed
    // every comparison against the uppercase values the database stores.
    seedProfile('viewer');
    const req = mockRequest({ token: signToken() });
    const { res } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(true);
    expect(req.user?.role).toBe('VIEWER');
  });

  it('normalises mixed case and surrounding whitespace', async () => {
    seedProfile('  Officer  ');
    const req = mockRequest({ token: signToken() });
    const { res } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(req.user?.role).toBe('OFFICER');
  });

  it('rejects an unrecognised stored role rather than guessing', async () => {
    // Falling back to VIEWER would grant national read access under the
    // prototype visibility policy, so "safe default" is not safe here.
    seedProfile('SUPERUSER');
    const req = mockRequest({ token: signToken() });
    const { res, statusCode, body } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(403);
    expect(body()).toMatchObject({ success: false });
  });
});

describe('JWT algorithm pinning', () => {
  it('accepts a token signed with the allowed algorithm (HS256)', async () => {
    seedProfile('ANALYST');
    const req = mockRequest({ token: signToken({}, { algorithm: 'HS256' }) });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(true);
    expect(statusCode()).toBeUndefined();
  });

  it('rejects an unsigned "alg: none" token', async () => {
    // The classic attack: the token asserts it needs no signature. Without an
    // explicit algorithm list, the verifier would honour that assertion.
    seedProfile('VIEWER');
    const unsigned = jwt.sign({ sub: USER_ID, aud: 'authenticated' }, '', {
      algorithm: 'none',
    });

    const req = mockRequest({ token: unsigned });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });

  it('rejects a token signed with a different HMAC algorithm (HS512)', async () => {
    // Same secret, disallowed algorithm — must still be refused.
    seedProfile('VIEWER');
    const hs512 = jwt.sign({ sub: USER_ID, aud: 'authenticated' }, SECRET, {
      algorithm: 'HS512',
      expiresIn: '1h',
    });

    const req = mockRequest({ token: hs512 });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });
});

describe('token validation', () => {
  it('rejects a missing Authorization header', async () => {
    const req = mockRequest({});
    const { res, statusCode, body } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
    expect(body()).toMatchObject({ success: false });
  });

  it.each([
    ['no scheme', 'abc.def.ghi'],
    ['wrong scheme', 'Basic abc.def.ghi'],
    ['lowercase scheme', 'bearer abc.def.ghi'],
    ['scheme only', 'Bearer'],
    ['empty token', 'Bearer '],
    ['extra segments', 'Bearer aaa bbb'],
  ])('rejects a malformed Authorization header: %s', async (_label, header) => {
    const req = mockRequest({ authorizationHeader: header });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    seedProfile('ADMIN');
    const forged = jwt.sign({ sub: USER_ID, aud: 'authenticated' }, 'attacker-secret', {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

    const req = mockRequest({ token: forged });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });

  it('rejects structurally invalid token text', async () => {
    const req = mockRequest({ token: 'not-a-jwt-at-all' });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });

  it('rejects an expired token', async () => {
    seedProfile('ADMIN');
    const expired = signToken({}, { expiresIn: '-1h' });

    const req = mockRequest({ token: expired });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });

  it('rejects a token minted for a different audience', async () => {
    seedProfile('ADMIN');
    const wrongAudience = jwt.sign({ sub: USER_ID, aud: 'service' }, SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

    const req = mockRequest({ token: wrongAudience });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });

  it('rejects a token whose sub is not a UUID', async () => {
    supabaseMock.setTable('profiles', [{ id: 'admin', role: 'ADMIN', full_name: 'x' }]);
    const badSub = jwt.sign({ sub: 'admin', aud: 'authenticated' }, SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

    const req = mockRequest({ token: badSub });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });

  it('rejects a token with no sub claim', async () => {
    const noSub = jwt.sign({ aud: 'authenticated' }, SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

    const req = mockRequest({ token: noSub });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(401);
  });
});

describe('profile provisioning', () => {
  it('fails closed with 403 when the user has no profile row', async () => {
    // Authentication succeeded but the account was never provisioned. Falling
    // back to VIEWER would hand national read access to any valid token
    // holder, so the request is refused instead.
    supabaseMock.setTable('profiles', []);
    const req = mockRequest({ token: signToken() });
    const { res, statusCode, body } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(403);
    expect(req.user).toBeUndefined();
    expect(body()).toMatchObject({ success: false });
  });

  it('does not fall back to any role when the profile is missing', async () => {
    supabaseMock.setTable('profiles', []);
    const req = mockRequest({ token: signToken({ user_metadata: { role: 'ADMIN' } }) });
    const { res } = mockResponse();

    await requireAuth(req, res, mockNext());

    expect(req.user).toBeUndefined();
  });

  it('returns 503, not 403, when the lookup itself fails', async () => {
    // A database outage is not an authorization decision. Reporting it as 403
    // would tell an operator the user lacks permission when the truth is that
    // the check could not run.
    supabaseMock.failTable('profiles', 'connection refused');
    const req = mockRequest({ token: signToken() });
    const { res, statusCode } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(false);
    expect(statusCode()).toBe(503);
  });
});

describe('the populated request', () => {
  it('attaches id, role and email from their correct sources', async () => {
    seedProfile('OFFICER');
    const req = mockRequest({ token: signToken({ email: 'field@example.invalid' }) });
    const { res } = mockResponse();

    await requireAuth(req, res, mockNext());

    expect(req.user).toEqual({
      id: USER_ID,
      email: 'field@example.invalid',
      role: 'OFFICER',
      fullName: 'Test User',
    });
  });

  it('tolerates a token with no email claim', async () => {
    seedProfile('ADMIN');
    const noEmail = jwt.sign({ sub: USER_ID, aud: 'authenticated' }, SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

    const req = mockRequest({ token: noEmail });
    const { res } = mockResponse();
    const next = mockNext();

    await requireAuth(req, res, next);

    expect(next.called()).toBe(true);
    expect(req.user?.email).toBe('');
  });
});
