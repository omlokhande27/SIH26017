/**
 * jwt-verifier.test.ts — the JWKS (asymmetric) verification path.
 *
 * The real Supabase project could not be inspected when this was written, so
 * the JWKS path is proven here instead: a genuine ES256 key pair is generated,
 * its public half is served from a local JWKS endpoint, and tokens are signed
 * and verified end to end. Nothing is stubbed — this is jose verifying real
 * signatures against a real key set fetched over HTTP.
 *
 * That matters because the asymmetric path would otherwise be untested code
 * that runs for the first time in production against a live project.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const KID = 'test-key-1';

let server: Server;
let port: number;
let privateKey: KeyLike;
let publicJwk: JWK;
/** Controls what the local JWKS endpoint answers. */
let jwksBehaviour: 'keys' | 'empty' | 'notfound' | 'servererror' = 'keys';
let jwksRequests = 0;

// Stand the key set up BEFORE the modules under test load, because the
// verifier derives its JWKS URL from SUPABASE_URL at import time.
const keys = await generateKeyPair('ES256');
privateKey = keys.privateKey as KeyLike;
publicJwk = await exportJWK(keys.publicKey);
publicJwk.kid = KID;
publicJwk.alg = 'ES256';
publicJwk.use = 'sig';

server = createServer((req, res) => {
  if (req.url?.includes('/.well-known/jwks.json')) {
    jwksRequests += 1;
    if (jwksBehaviour === 'notfound') {
      res.writeHead(404);
      res.end();
      return;
    }
    if (jwksBehaviour === 'servererror') {
      res.writeHead(503);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: jwksBehaviour === 'keys' ? [publicJwk] : [] }));
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
port = (server.address() as { port: number }).port;

// Point the verifier at the local key set and let it AUTO-DETECT the mode,
// so detection is exercised rather than asserted.
process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
process.env.SUPABASE_JWT_MODE = 'auto';
delete process.env.JWT_SECRET;

const { verifySupabaseToken, resolveJwtMode, acceptedAlgorithms, __resetJwtVerifierCache } =
  await import('../src/services/jwt-verifier');

const ISSUER = `http://127.0.0.1:${port}/auth/v1`;

/** Mint a token the way an asymmetric Supabase project would. */
async function signToken(
  claims: Record<string, unknown> = {},
  options: { expiresIn?: string; kid?: string; alg?: string } = {},
): Promise<string> {
  return new SignJWT({ email: 'user@example.invalid', ...claims })
    .setProtectedHeader({ alg: options.alg ?? 'ES256', kid: options.kid ?? KID })
    .setSubject(USER_ID)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(privateKey);
}

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('mode auto-detection', () => {
  it('detects jwks when the project publishes keys', async () => {
    // No JWT_SECRET is configured, and the endpoint returns a key — the only
    // correct conclusion is asymmetric signing.
    expect(await resolveJwtMode()).toBe('jwks');
  });

  it('pins only asymmetric algorithms in jwks mode', () => {
    expect(acceptedAlgorithms('jwks')).toEqual(['ES256', 'RS256']);
    expect(acceptedAlgorithms('jwks')).not.toContain('none');
    expect(acceptedAlgorithms('jwks')).not.toContain('HS256');
  });

  it('pins only HS256 in hs256 mode', () => {
    expect(acceptedAlgorithms('hs256')).toEqual(['HS256']);
  });
});

describe('verifying a genuine asymmetric token', () => {
  it('accepts a correctly signed ES256 token', async () => {
    const token = await signToken();
    const result = await verifySupabaseToken(token);

    expect(result.mode).toBe('jwks');
    expect(result.payload.sub).toBe(USER_ID);
  });

  it('returns the token claims for role resolution to build on', async () => {
    const token = await signToken({ user_metadata: { role: 'ADMIN' } });
    const result = await verifySupabaseToken(token);

    // The verifier surfaces the claims; ignoring the role claim is the
    // middleware's job, covered in auth.middleware.test.ts.
    expect(result.payload.email).toBe('user@example.invalid');
    expect(result.payload.sub).toBe(USER_ID);
  });

  it('caches the key set rather than refetching per verification', async () => {
    const before = jwksRequests;
    for (let i = 0; i < 5; i += 1) {
      await verifySupabaseToken(await signToken());
    }
    // At most one additional fetch across five verifications.
    expect(jwksRequests - before).toBeLessThanOrEqual(1);
  });
});

describe('rejecting bad asymmetric tokens', () => {
  it('rejects a token signed by a different key', async () => {
    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: KID })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(other.privateKey as KeyLike);

    await expect(verifySupabaseToken(forged)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const expired = await signToken({}, { expiresIn: '-1h' });
    await expect(verifySupabaseToken(expired)).rejects.toThrow();
  });

  it('rejects a token from a different issuer', async () => {
    const wrongIssuer = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: KID })
      .setSubject(USER_ID)
      .setIssuer('https://another-project.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    // A signature can be valid and the token still not ours.
    await expect(verifySupabaseToken(wrongIssuer)).rejects.toThrow();
  });

  it('rejects a token for a different audience', async () => {
    const wrongAudience = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: KID })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience('service')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verifySupabaseToken(wrongAudience)).rejects.toThrow();
  });

  it('rejects an unsigned alg:none token', async () => {
    // Hand-built, because a library will not sign one by accident.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: USER_ID,
        iss: ISSUER,
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');

    await expect(verifySupabaseToken(`${header}.${payload}.`)).rejects.toThrow();
  });

  it('rejects an HS256 token forged with the public key as the HMAC secret', async () => {
    // The classic algorithm-confusion attack. It fails here for two
    // independent reasons: HS256 is not in the jwks algorithm list at all, and
    // HS256 verification has a separate key source (JWT_SECRET) that never
    // sees a JWKS public key.
    const { createHmac } = await import('node:crypto');
    const publicKeyMaterial = JSON.stringify(publicJwk);

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: KID })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub: USER_ID,
        iss: ISSUER,
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const signature = createHmac('sha256', publicKeyMaterial)
      .update(`${header}.${payload}`)
      .digest('base64url');

    await expect(verifySupabaseToken(`${header}.${payload}.${signature}`)).rejects.toThrow();
  });

  it('rejects a token whose kid is not in the key set', async () => {
    const unknownKid = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'no-such-key' })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verifySupabaseToken(unknownKid)).rejects.toThrow();
  });

  it('rejects structurally invalid token text', async () => {
    await expect(verifySupabaseToken('not-a-jwt')).rejects.toThrow();
  });
});

describe('auto-detection distinguishes "no keys" from "cannot tell"', () => {
  it('resolves to hs256 when the endpoint definitively reports no keys', async () => {
    // 200 with an empty key set is a real answer: this project is symmetric.
    // JWT_SECRET is present here because dotenv repopulates it from
    // backend/.env, which is what happens in a real process too.
    jwksBehaviour = 'empty';
    __resetJwtVerifierCache();

    expect(await resolveJwtMode()).toBe('hs256');

    jwksBehaviour = 'keys';
    __resetJwtVerifierCache();
  });

  it('resolves to hs256 when the endpoint returns 404', async () => {
    jwksBehaviour = 'notfound';
    __resetJwtVerifierCache();

    expect(await resolveJwtMode()).toBe('hs256');

    jwksBehaviour = 'keys';
    __resetJwtVerifierCache();
  });

  it('FAILS CLOSED when the endpoint is unavailable, rather than downgrading', async () => {
    // The security-critical case. A 5xx says nothing about the project's
    // signing scheme, and concluding "symmetric" would verify ES256-era
    // traffic against JWT_SECRET. If that secret is weak or still the
    // placeholder from .env.example, an attacker who knows it could forge
    // tokens during any JWKS outage.
    jwksBehaviour = 'servererror';
    __resetJwtVerifierCache();

    await expect(resolveJwtMode()).rejects.toThrow(/Refusing to fall back to HS256/i);

    jwksBehaviour = 'keys';
    __resetJwtVerifierCache();
  });

  it('does not cache an indeterminate result', async () => {
    // A transient outage must not pin the process; the next request retries.
    jwksBehaviour = 'servererror';
    __resetJwtVerifierCache();
    await expect(resolveJwtMode()).rejects.toThrow();

    jwksBehaviour = 'keys';
    expect(await resolveJwtMode()).toBe('jwks');
  });

  it('rejects every token while the mode is unresolvable', async () => {
    // Refusing requests during an outage is the correct trade against
    // accepting them under a weaker scheme.
    const token = await signToken();
    jwksBehaviour = 'servererror';
    __resetJwtVerifierCache();

    await expect(verifySupabaseToken(token)).rejects.toThrow(/Refusing to fall back/i);

    jwksBehaviour = 'keys';
    __resetJwtVerifierCache();
  });

  it('caches a successful resolution within a process', async () => {
    const first = await resolveJwtMode();
    jwksBehaviour = 'empty'; // would change the answer if re-detected
    expect(await resolveJwtMode()).toBe(first);
    jwksBehaviour = 'keys';
  });
});
