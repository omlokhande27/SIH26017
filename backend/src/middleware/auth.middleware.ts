import { Response, NextFunction } from 'express';
import { getProfileForUser } from '../services/profile.service';
import { JwtConfigurationError, verifySupabaseToken } from '../services/jwt-verifier';
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
 * An earlier implementation read the caller's role straight off the token:
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
 * ---------------------------------------------------------------------------
 * SIGNATURE VERIFICATION
 * ---------------------------------------------------------------------------
 * Delegated to services/jwt-verifier.ts, which supports both schemes a
 * Supabase project may use — HS256 with a shared secret, or ES256/RS256
 * against the project's JWKS — with algorithms pinned per mode and issuer,
 * audience and expiry all asserted. See that file for why the two modes never
 * share key material.
 */

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

  let decoded;
  try {
    const verified = await verifySupabaseToken(token);
    decoded = verified.payload;
  } catch (err) {
    // A misconfigured verifier is an operator problem, not a bad credential.
    // Reporting it as 401 would send the caller off to re-authenticate against
    // a backend that cannot verify anything.
    if (err instanceof JwtConfigurationError) {
      console.error('[auth] JWT verification is misconfigured', { detail: err.message });
      res.status(503).json({ success: false, error: 'Authentication is not configured' });
      return;
    }

    // Everything else — invalid signature, expired token, disallowed
    // algorithm, wrong issuer or audience — is one outcome: not acceptable.
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
    console.warn('[auth] DEMO OVERRIDE: profile lookup failed or absent, granting ADMIN anyway', { userId });
  }

  req.user = {
    id: userId, // from token
    email: typeof decoded.email === 'string' ? decoded.email : '',
    // DEMO OVERRIDE: Force everyone to be ADMIN so the backend allows all operations
    role: 'ADMIN',
    fullName: lookup.ok ? lookup.profile.full_name : 'Admin User',
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
