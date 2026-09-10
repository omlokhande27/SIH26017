import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { getProfileForUser } from '../services/profile.service';
import { AuthenticatedRequest } from '../types';

/**
 * Authentication: prove who the caller is, then resolve what they may do.
 *
 * The two halves are deliberately separate and come from different sources of
 * truth:
 *
 *   IDENTITY  from the JWT signature — the token proves the user is who they
 *             say they are, and `sub` is set by Supabase Auth, not the client.
 *
 *   ROLE      from `public.profiles`, read server-side. NEVER from the token.
 *
 * ---------------------------------------------------------------------------
 * THE VULNERABILITY THIS REPLACES
 * ---------------------------------------------------------------------------
 * The previous implementation read the caller's role straight off the token:
 *
 *     role: (decoded.user_metadata?.role as string) ?? 'viewer'
 *
 * `user_metadata` is writable by the user. Any authenticated account could run
 *
 *     supabase.auth.updateUser({ data: { role: 'ADMIN' } })
 *
 * and Supabase would mint a correctly-signed token carrying that claim. The
 * signature check would pass, because the token is genuine — the claim inside
 * it is simply not trustworthy. `app_metadata` is the non-user-writable
 * counterpart, but the right fix is the one docs/DATABASE.md §9 already
 * mandates: resolve the role from `profiles`, where RLS forbids self-service
 * changes.
 *
 * Nothing was exploitable at the time of the fix, because no route had the
 * middleware attached yet. Phase 3 attaches it to every business route.
 */

/**
 * Signing algorithms this backend will accept.
 *
 * Pinning is mandatory, not defensive style. Without an explicit list,
 * `jwt.verify` accepts any algorithm the token's own header names — so an
 * attacker can choose it. The two classic attacks are `alg: "none"`, which
 * asserts the token needs no signature at all, and swapping an RS256 token for
 * an HS256 one signed with the public key as the HMAC secret.
 *
 * Supabase's legacy JWT scheme signs with the project's shared secret using
 * HS256, which is what `JWT_SECRET` holds. Projects migrated to asymmetric
 * signing keys (ES256/RS256 via JWKS) need a different verification path — see
 * the note in the Phase 2.2 report.
 */
const ALLOWED_JWT_ALGORITHMS: jwt.Algorithm[] = ['HS256'];

/**
 * Supabase sets `aud` to "authenticated" for a signed-in user. Checking it
 * rejects tokens minted for a different audience that happen to share the
 * signing secret (for example service tokens).
 */
const EXPECTED_AUDIENCE = 'authenticated';

/** Matches any RFC 4122 UUID, which is the shape Supabase Auth issues for `sub`. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unauthorized(res: Response, error: string): void {
  res.status(401).json({ success: false, error });
}

function forbidden(res: Response, error: string): void {
  res.status(403).json({ success: false, error });
}

/**
 * Verify the bearer token and attach the caller to `req.user`.
 *
 * Responses are deliberately coarse. A caller learns that authentication
 * failed, not which check failed — distinguishing "no such user" from "wrong
 * signature" hands an attacker a probing oracle. Detail goes to the server log.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(res, 'Missing or malformed Authorization header');
    return;
  }

  // "Bearer <token>" — exactly two parts. `split(' ')[1]` would silently accept
  // "Bearer a b c" and verify only "a".
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !parts[1]) {
    unauthorized(res, 'Missing or malformed Authorization header');
    return;
  }
  const token = parts[1];

  let decoded: jwt.JwtPayload;
  try {
    const verified = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ALLOWED_JWT_ALGORITHMS,
      audience: EXPECTED_AUDIENCE,
    });

    // A token whose payload is a bare string carries no claims we can use.
    if (typeof verified === 'string') {
      unauthorized(res, 'Invalid or expired token');
      return;
    }
    decoded = verified;
  } catch {
    // Covers an invalid signature, an expired token, a disallowed algorithm
    // and an audience mismatch alike — all are "this token is not acceptable".
    unauthorized(res, 'Invalid or expired token');
    return;
  }

  const userId = decoded.sub;
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    unauthorized(res, 'Invalid or expired token');
    return;
  }

  // ---------------------------------------------------------------------
  // Role resolution. The token got us an identity; the database decides
  // what that identity may do. Anything role-shaped in `decoded` —
  // user_metadata.role, app_metadata.role, a bare `role` claim — is ignored
  // by construction: it is never read.
  // ---------------------------------------------------------------------
  const lookup = await getProfileForUser(userId);

  if (!lookup.ok) {
    if (lookup.reason === 'lookup_failed') {
      console.error('[auth] profile lookup failed', {
        userId,
        detail: lookup.detail,
      });
      res.status(503).json({
        success: false,
        error: 'Authorization service unavailable',
      });
      return;
    }

    // `not_found` and `invalid_role` both mean: authentication succeeded, but
    // this account has no usable application role. That is a 403, not a 401 —
    // the credentials are fine, the authorization is not. Retrying with a
    // fresh token would not help, and 401 would invite exactly that.
    console.warn('[auth] no usable profile for authenticated user', {
      userId,
      reason: lookup.reason,
      ...(lookup.reason === 'invalid_role' && { storedRole: lookup.detail }),
    });
    forbidden(res, 'No application profile is provisioned for this account');
    return;
  }

  req.user = {
    id: lookup.profile.id,
    email: typeof decoded.email === 'string' ? decoded.email : '',
    role: lookup.profile.role,
    fullName: lookup.profile.full_name,
  };

  next();
}

/**
 * Backwards-compatible alias.
 *
 * @deprecated Use `requireAuth`. Kept so any future import of the old name
 * resolves to the fixed implementation rather than silently missing.
 */
export const authMiddleware = requireAuth;
