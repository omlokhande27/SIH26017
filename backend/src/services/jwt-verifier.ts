import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { env, SUPABASE_JWKS_URL, SUPABASE_JWT_ISSUER } from '../config/env';

/**
 * Supabase JWT verification, for both signing schemes.
 *
 * A Supabase project signs user tokens one of two ways:
 *
 *   HS256   a project-wide shared secret (the legacy scheme; JWT_SECRET)
 *   JWKS    an asymmetric key published at
 *           <SUPABASE_URL>/auth/v1/.well-known/jwks.json, signed ES256 or RS256
 *
 * Which one applies is a property of the project, not something to assume.
 * `SUPABASE_JWT_MODE` selects the verifier; `auto` (the default) RESOLVES it by
 * asking the project's own JWKS endpoint, so the backend adapts to the real
 * configuration instead of guessing at it.
 *
 * ###########################################################################
 * # ALGORITHMS ARE PINNED PER MODE, AND THE TWO NEVER MIX.                  #
 * #                                                                        #
 * # Each mode passes an explicit `algorithms` list, so `alg: none` and any  #
 * # unlisted algorithm are rejected before a key is even selected.         #
 * #                                                                        #
 * # The modes are also mutually exclusive at runtime: HS256 verification    #
 * # only ever uses JWT_SECRET, and asymmetric verification only ever uses a #
 * # JWKS public key. That separation is what forecloses the classic         #
 * # algorithm-confusion attack, where a token is re-signed HS256 using an   #
 * # RSA public key as the HMAC secret. Here the public key is never a       #
 * # candidate HMAC secret, because HS256 has exactly one key source.        #
 * ###########################################################################
 */

export type JwtMode = 'hs256' | 'jwks';

/** Symmetric algorithms accepted in hs256 mode. */
const HS_ALGORITHMS = ['HS256'] as const;

/**
 * Asymmetric algorithms accepted in jwks mode.
 *
 * Supabase issues ES256 (ECC P-256) for new projects and RS256 for RSA
 * signing keys. Nothing else is accepted — notably no `none`, and no HS*,
 * which in this mode would be an algorithm-confusion attempt.
 */
const JWKS_ALGORITHMS = ['ES256', 'RS256'] as const;

export interface VerifiedToken {
  payload: JWTPayload;
  /** Which verifier accepted it, for diagnostics. */
  mode: JwtMode;
}

export class JwtConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtConfigurationError';
  }
}

/**
 * Remote key set.
 *
 * `createRemoteJWKSet` handles the parts that are easy to get wrong by hand:
 * it caches the fetched keys, selects by `kid`, re-fetches when an unknown
 * `kid` appears (so key rotation works without a redeploy), and rate-limits
 * that re-fetch with a cooldown so a stream of tokens carrying bogus `kid`
 * values cannot be turned into a request amplifier against the auth server.
 *
 * Built once per process and reused; building it per request would discard the
 * cache and issue a network call on every authenticated call.
 */
let jwks: JWTVerifyGetKey | null = null;

function getJwks(): JWTVerifyGetKey {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(SUPABASE_JWKS_URL), {
      cooldownDuration: 30_000,   // min gap between refetches for an unknown kid
      cacheMaxAge: 600_000,       // refresh the key set at least every 10 minutes
      timeoutDuration: 5_000,     // never hang a request behind a stalled fetch
    });
  }
  return jwks;
}

/**
 * The resolved mode, cached for the process lifetime.
 *
 * Only a SUCCESSFUL resolution is cached. A transient network failure during
 * detection must not pin the process to a fallback for as long as it runs.
 */
let resolvedMode: JwtMode | null = null;

/**
 * Probe the project's JWKS endpoint.
 *
 * ###########################################################################
 * # AN INDETERMINATE ANSWER IS NOT A "NO".                                  #
 * #                                                                        #
 * # Returning false on any failure — including a timeout — would let a      #
 * # transient JWKS outage silently downgrade an asymmetric project to       #
 * # HS256, and HS256 verification uses JWT_SECRET. If that secret is weak,  #
 * # stale, or still the placeholder from .env.example, the downgrade is     #
 * # directly exploitable: an attacker who knows it can forge tokens the     #
 * # backend will accept.                                                   #
 * #                                                                        #
 * # So the three outcomes are kept distinct. Only a DEFINITIVE answer from  #
 * # the server ("200 with no keys", or 404) concludes that the project is   #
 * # symmetric. A network failure concludes nothing and fails closed.        #
 * ###########################################################################
 */
type JwksProbe = 'published' | 'definitively-absent' | 'indeterminate';

async function probeJwks(): Promise<JwksProbe> {
  let response: Response;
  try {
    response = await fetch(SUPABASE_JWKS_URL, { signal: AbortSignal.timeout(5_000) });
  } catch {
    // Unreachable or timed out. We learned nothing.
    return 'indeterminate';
  }

  // 404 / 400 is a real answer: this project has no JWKS endpoint.
  if (response.status === 404 || response.status === 400) return 'definitively-absent';

  // A server-side fault tells us about the server, not about the project.
  if (!response.ok) return 'indeterminate';

  try {
    const body = (await response.json()) as { keys?: unknown[] };
    if (!Array.isArray(body.keys)) return 'indeterminate';
    return body.keys.length > 0 ? 'published' : 'definitively-absent';
  } catch {
    // 200 with a body we cannot parse. Not a usable answer.
    return 'indeterminate';
  }
}

/**
 * Determine which verifier this project needs.
 *
 * In `auto` mode the JWKS endpoint is the authority: a project with published
 * asymmetric keys uses them. An empty or absent key set means the legacy
 * shared secret, which must then actually be configured — if it is not, this
 * throws rather than silently accepting nothing.
 */
export async function resolveJwtMode(): Promise<JwtMode> {
  if (resolvedMode) return resolvedMode;

  if (env.SUPABASE_JWT_MODE === 'hs256' || env.SUPABASE_JWT_MODE === 'jwks') {
    resolvedMode = env.SUPABASE_JWT_MODE;
    return resolvedMode;
  }

  const probe = await probeJwks();

  if (probe === 'published') {
    resolvedMode = 'jwks';
  } else if (probe === 'indeterminate') {
    // Fail closed. Not cached, so the next request retries once the endpoint
    // recovers. Refusing requests during an outage is the correct trade
    // against silently downgrading to a weaker scheme.
    throw new JwtConfigurationError(
      'Could not reach the project JWKS endpoint, so the JWT signing scheme could not be ' +
        'determined. Refusing to fall back to HS256, because that would downgrade an ' +
        'asymmetric project to a shared secret. Set SUPABASE_JWT_MODE explicitly to remove ' +
        'this dependency.',
    );
  } else if (env.JWT_SECRET) {
    resolvedMode = 'hs256';
  } else {
    // Deliberately NOT cached: this is a configuration fault, and the operator
    // may fix it without restarting.
    throw new JwtConfigurationError(
      'Cannot determine how to verify Supabase JWTs. The project publishes no JWKS and ' +
        'JWT_SECRET is not set. Set JWT_SECRET (legacy HS256 projects) or ' +
        'SUPABASE_JWT_MODE=jwks once asymmetric keys are enabled.',
    );
  }

  console.info(
    `[auth] JWT verification mode resolved: ${resolvedMode}` +
      (env.SUPABASE_JWT_MODE === 'auto' ? ' (auto-detected)' : ' (configured)'),
  );
  return resolvedMode;
}

/** Reset cached state. Test-only. */
export function __resetJwtVerifierCache(): void {
  resolvedMode = null;
  jwks = null;
}

/**
 * Verify a Supabase access token.
 *
 * Throws on any failure — bad signature, disallowed algorithm, expired token,
 * wrong issuer, wrong audience. The caller maps that to a 401 without
 * distinguishing the cause, so the API does not become an oracle.
 *
 * `exp` and `nbf` are enforced by jose. Issuer and audience are asserted here
 * so a token minted by a different project, or for a different audience, is
 * refused even when the signature checks out.
 */
export async function verifySupabaseToken(token: string): Promise<VerifiedToken> {
  const mode = await resolveJwtMode();

  const claims = {
    issuer: SUPABASE_JWT_ISSUER,
    audience: env.SUPABASE_JWT_AUDIENCE,
  };

  if (mode === 'hs256') {
    if (!env.JWT_SECRET) {
      throw new JwtConfigurationError('JWT_SECRET is required for HS256 verification.');
    }
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [...HS_ALGORITHMS],
      ...claims,
    });
    return { payload, mode };
  }

  const { payload } = await jwtVerify(token, getJwks(), {
    algorithms: [...JWKS_ALGORITHMS],
    ...claims,
  });
  return { payload, mode };
}

/** The algorithms currently accepted, for diagnostics and tests. */
export function acceptedAlgorithms(mode: JwtMode): readonly string[] {
  return mode === 'hs256' ? HS_ALGORITHMS : JWKS_ALGORITHMS;
}
