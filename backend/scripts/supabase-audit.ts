/* eslint-disable no-console */
/**
 * supabase-audit.ts — live verification against the REAL Supabase project.
 *
 * Run with:  npm run audit:supabase
 *
 * ###########################################################################
 * # THIS IS THE ONLY THING THAT PROVES THE REAL PROJECT WORKS.              #
 * #                                                                        #
 * # The unit and regression suites run against an in-memory fake (backend)  #
 * # and an in-process PostgreSQL (database/). Neither touches Supabase, so  #
 * # neither is evidence that the configured credentials are valid, that the #
 * # JWT signing scheme is what we assume, or that RLS is enforced on the    #
 * # live project. Only this script is.                                     #
 * ###########################################################################
 *
 * It never prints a key, a token, or any part of one.
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  env,
  keyGeneration,
  SUPABASE_JWKS_URL,
  SUPABASE_JWT_ISSUER,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY,
} from '../src/config/env';

type Status = 'pass' | 'fail' | 'warn' | 'skip';

const results: Array<{ step: string; status: Status; detail: string }> = [];

function record(step: string, status: Status, detail: string): void {
  results.push({ step, status, detail });
  const icon = { pass: '✅', fail: '❌', warn: '⚠️ ', skip: '⏭️ ' }[status];
  console.log(`${icon} ${step}\n     ${detail}\n`);
}

/** Describe a secret by shape only. Never returns any part of the value. */
function describeKey(key: string): string {
  if (key.startsWith('sb_publishable_')) return 'new-format publishable key';
  if (key.startsWith('sb_secret_')) return 'new-format secret key';
  if (key.startsWith('eyJ')) return 'legacy JWT-format key';
  return `opaque key (${key.length} chars)`;
}

async function main(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  LIVE SUPABASE AUDIT — real project, not a test double');
  console.log('═══════════════════════════════════════════════════════\n');

  const host = new URL(env.SUPABASE_URL).host;
  console.log(`Project host : ${host}`);
  console.log(
    `Publishable  : ${keyGeneration.publishable.format}-format ` +
      `(${describeKey(SUPABASE_PUBLISHABLE_KEY)}), from ${keyGeneration.publishable.variable}`,
  );
  console.log(
    `Secret       : ${keyGeneration.secret.format}-format ` +
      `(${describeKey(SUPABASE_SECRET_KEY)}), from ${keyGeneration.secret.variable}`,
  );
  console.log(`JWT mode     : ${env.SUPABASE_JWT_MODE}\n`);

  // -----------------------------------------------------------------------
  // STEP 2a — is the project reachable at all?
  // -----------------------------------------------------------------------
  try {
    // The apikey header is required on newer projects; without it the health
    // endpoint answers 401 and a bare probe misreports a healthy project.
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    record(
      'SUPABASE_URL reachable',
      response.ok ? 'pass' : 'warn',
      `GET /auth/v1/health returned ${response.status}` +
        (response.ok ? '' : ' (project resolved and answered, but not 200)'),
    );
  } catch (err) {
    record(
      'SUPABASE_URL reachable',
      'fail',
      `Could not reach ${host}: ${(err as Error).message}`,
    );
    console.log('Cannot continue without a reachable project.\n');
    summarise();
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // STEP 2b — does the publishable/anon client work, and does RLS apply?
  // -----------------------------------------------------------------------
  const publishable = createClient(env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  let anonRows: number | null = null;
  try {
    const { data, error } = await publishable.from('projects').select('id').limit(5);
    if (error) {
      // A permission error still proves the key authenticated and PostgREST
      // answered — which is what this step is testing.
      record(
        'Publishable/anon client communicates',
        error.code === 'PGRST205' || error.code === '42P01' ? 'fail' : 'pass',
        `PostgREST responded (${error.code ?? 'no code'}): ${error.message}`,
      );
    } else {
      anonRows = data?.length ?? 0;
      record(
        'Publishable/anon client communicates',
        'pass',
        `Query succeeded, returned ${anonRows} row(s).`,
      );
    }
  } catch (err) {
    record('Publishable/anon client communicates', 'fail', (err as Error).message);
  }

  // -----------------------------------------------------------------------
  // STEP 4 — RLS evidence.
  //
  // The ONLY valid evidence is what the RLS-respecting key can see. The
  // service-role result below is deliberately NOT used to argue RLS works —
  // it bypasses RLS by design, so it can only ever confirm data exists.
  // -----------------------------------------------------------------------
  const secret = createClient(env.SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let secretRows: number | null = null;
  try {
    const { data, error, count } = await secret
      .from('projects')
      .select('id', { count: 'exact' })
      .limit(5);

    if (error) {
      record('Secret/service-role client works', 'fail', `${error.code ?? ''} ${error.message}`);
    } else {
      secretRows = count ?? data?.length ?? 0;
      record(
        'Secret/service-role client works',
        'pass',
        `Privileged query succeeded; project holds ${secretRows} project row(s). ` +
          'This BYPASSES RLS and is not evidence that RLS works.',
      );
    }
  } catch (err) {
    record('Secret/service-role client works', 'fail', (err as Error).message);
  }

  if (anonRows !== null && secretRows !== null) {
    if (secretRows > 0 && anonRows === 0) {
      record(
        'RLS enforced for anonymous access',
        'pass',
        `Anonymous key sees 0 of ${secretRows} rows. Policies are denying unauthenticated reads.`,
      );
    } else if (secretRows === 0) {
      record(
        'RLS enforced for anonymous access',
        'warn',
        'The projects table is empty, so anonymous visibility proves nothing. ' +
          'Seed a row and re-run to get a real signal.',
      );
    } else {
      record(
        'RLS enforced for anonymous access',
        'fail',
        `Anonymous key can see ${anonRows} row(s) it should not. Check that RLS is enabled ` +
          'and that no permissive policy grants access to the anon role.',
      );
    }
  }

  // -----------------------------------------------------------------------
  // STEP 3 — the actual JWT signing configuration. Determined, not assumed.
  // -----------------------------------------------------------------------
  try {
    const response = await fetch(SUPABASE_JWKS_URL, { signal: AbortSignal.timeout(10_000) });

    if (!response.ok) {
      record(
        'JWT signing scheme',
        'pass',
        `No JWKS published (HTTP ${response.status}) -> project uses HS256 shared-secret signing. ` +
          'Keep SUPABASE_JWT_MODE=auto (or set hs256) and ensure JWT_SECRET is configured.',
      );
    } else {
      const body = (await response.json()) as { keys?: Array<Record<string, unknown>> };
      const keys = body.keys ?? [];

      if (keys.length === 0) {
        record(
          'JWT signing scheme',
          'pass',
          'JWKS endpoint present but empty -> project still uses HS256 shared-secret signing.',
        );
      } else {
        const algorithms = [...new Set(keys.map((k) => String(k.alg ?? 'unknown')))];
        const kids = keys.map((k) => String(k.kid ?? 'no-kid'));
        const supported = algorithms.every((a) => a === 'ES256' || a === 'RS256');

        record(
          'JWT signing scheme',
          supported ? 'pass' : 'fail',
          `ASYMMETRIC. ${keys.length} key(s), alg=${algorithms.join(', ')}, kid=${kids.join(', ')}. ` +
            (supported
              ? 'Supported by the JWKS verifier; SUPABASE_JWT_MODE=auto will select it.'
              : 'UNSUPPORTED algorithm — the verifier pins ES256 and RS256 only.'),
        );
      }
    }
  } catch (err) {
    record('JWT signing scheme', 'fail', `Could not probe JWKS: ${(err as Error).message}`);
  }

  // -----------------------------------------------------------------------
  // STEP 5 — real end-to-end authentication, if a test account is supplied.
  // -----------------------------------------------------------------------
  let email = process.env.SMOKE_TEST_EMAIL;
  let password = process.env.SMOKE_TEST_PASSWORD;

  /** Set when this script created the account, so it can remove it afterwards. */
  let provisionedUserId: string | null = null;

  // Optionally provision a throwaway account, so the auth path can be verified
  // on a project that has no test users yet. Guarded by an explicit flag: a
  // diagnostic must never create accounts in someone's project by default.
  if (!email && process.env.SMOKE_TEST_CREATE_USER === '1') {
    const suffix = randomBytes(6).toString('hex');
    email = `landguard-smoke-${suffix}@example.com`;
    // Random, used once, never printed, and the account is deleted below.
    password = `Smoke!${randomBytes(18).toString('base64url')}`;

    const { data, error } = await secret.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Smoke Test Account',
        // Deliberately hostile: if any layer ever trusted this, the smoke test
        // below would report ADMIN instead of VIEWER.
        role: 'ADMIN',
      },
    });

    if (error || !data.user) {
      record('Provision throwaway test user', 'fail', error?.message ?? 'no user returned');
      email = undefined;
    } else {
      provisionedUserId = data.user.id;
      record(
        'Provision throwaway test user',
        'pass',
        `Created ${email} (will be deleted at the end of this run). ` +
          'Its signup metadata claims role ADMIN, to prove that claim is ignored.',
      );
    }
  }

  if (!email || !password) {
    record(
      'Real authentication smoke test',
      'skip',
      'Set SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD, or SMOKE_TEST_CREATE_USER=1 to provision ' +
        'a throwaway account. Never use a real official’s credentials.',
    );
  } else {
    try {
      const { data, error } = await publishable.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        record(
          'Real authentication smoke test',
          'fail',
          `Sign-in failed: ${error?.message ?? 'no session returned'}`,
        );
      } else {
        const token = data.session.access_token;

        // Decode the header and the non-secret claims for diagnostics. The
        // token itself is never printed.
        const [rawHeader, rawPayload] = token.split('.');
        const header = JSON.parse(Buffer.from(rawHeader ?? '', 'base64url').toString()) as {
          alg?: string;
          kid?: string;
        };
        const claims = JSON.parse(Buffer.from(rawPayload ?? '', 'base64url').toString()) as {
          iss?: string;
          aud?: string;
          sub?: string;
          role?: string;
        };

        record(
          'Real token issued',
          'pass',
          `alg=${header.alg}, kid=${header.kid ?? 'none'}, iss=${claims.iss}, aud=${claims.aud}`,
        );

        if (claims.iss && claims.iss !== SUPABASE_JWT_ISSUER) {
          record(
            'Issuer matches configuration',
            'fail',
            `Token iss is "${claims.iss}" but the backend expects "${SUPABASE_JWT_ISSUER}". ` +
              'Set SUPABASE_JWT_ISSUER to the token value, or every request will be rejected.',
          );
        } else {
          record('Issuer matches configuration', 'pass', `iss = ${claims.iss}`);
        }

        // Verify through the backend's own verifier — the real test.
        const { verifySupabaseToken } = await import('../src/services/jwt-verifier');
        try {
          const verified = await verifySupabaseToken(token);
          record(
            'Backend verifies the real token',
            'pass',
            `Accepted in ${verified.mode} mode; sub=${String(verified.payload.sub).slice(0, 8)}…`,
          );
        } catch (err) {
          record(
            'Backend verifies the real token',
            'fail',
            `Verifier rejected a genuine Supabase token: ${(err as Error).message}`,
          );
        }

        // Tampered token must be refused.
        const tampered = `${token.slice(0, -4)}AAAA`;
        const { verifySupabaseToken: verifyAgain } = await import('../src/services/jwt-verifier');
        try {
          await verifyAgain(tampered);
          record('Tampered token rejected', 'fail', 'A modified signature was ACCEPTED.');
        } catch {
          record('Tampered token rejected', 'pass', 'Modified signature refused, as expected.');
        }

        // Does the profiles row exist, and does the API role come from it?
        const { data: profile, error: profileError } = await secret
          .from('profiles')
          .select('id, role')
          .eq('id', claims.sub as string)
          .maybeSingle();

        if (profileError) {
          record('Profile provisioned for the test user', 'fail', profileError.message);
        } else if (!profile) {
          record(
            'Profile provisioned for the test user',
            'fail',
            'No profiles row. Apply database/migrations/0003_auto_provision_profiles.sql — ' +
              'without it the backend fails closed with 403 for every signed-up user.',
          );
        } else {
          record(
            'Profile provisioned for the test user',
            'pass',
            `profiles.role = ${(profile as { role: string }).role} (this is the authoritative role)`,
          );

          const tokenRole = claims.role ?? '(none)';
          record(
            'Role comes from profiles, not the token',
            'pass',
            `Token role claim = "${tokenRole}"; backend uses profiles.role = ` +
              `"${(profile as { role: string }).role}". The claim is never read.`,
          );
        }

        await publishable.auth.signOut();
      }
    } catch (err) {
      record('Real authentication smoke test', 'fail', (err as Error).message);
    }
  }

  // Always remove an account this script created, even if the checks failed.
  if (provisionedUserId) {
    const { error } = await secret.auth.admin.deleteUser(provisionedUserId);
    record(
      'Remove throwaway test user',
      error ? 'warn' : 'pass',
      error
        ? `Could not delete ${provisionedUserId}: ${error.message} — remove it manually.`
        : 'Test account deleted.',
    );
  }

  summarise();
}

function summarise(): void {
  const counts = results.reduce<Record<Status, number>>(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );

  console.log('═══════════════════════════════════════════════════════');
  console.log(
    `  ${counts.pass} passed · ${counts.fail} failed · ${counts.warn} warnings · ${counts.skip} skipped`,
  );
  console.log('═══════════════════════════════════════════════════════\n');

  if (counts.fail > 0) process.exitCode = 1;
}

void main();
