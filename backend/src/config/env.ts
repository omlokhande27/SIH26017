import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Environment configuration, validated once at startup.
 *
 * Failing here is the point: a missing secret should stop the process
 * immediately with a readable message, not surface later as a confusing 500
 * from a handler. Nothing outside this module reads `process.env` directly.
 *
 * SECRETS ARE NEVER LOGGED. The failure path below prints the names of the
 * variables that failed and Zod's messages, never their values — a validation
 * error on a malformed key must not put that key in the log.
 */

/**
 * An http(s) URL.
 *
 * `z.string().url()` alone is not enough: it delegates to `new URL()`, which
 * happily parses `localhost:8000` as scheme "localhost" with path "8000".
 * A service URL written that way would pass validation and then fail at
 * request time with a confusing protocol error, which is exactly the class of
 * silent misconfiguration this file exists to prevent.
 */
const httpUrl = (label: string) =>
  z
    .string()
    .url(`${label} must be a valid URL`)
    .refine(
      (value) => {
        try {
          const { protocol } = new URL(value);
          return protocol === 'http:' || protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: `${label} must use http:// or https://` },
    );

const baseSchema = z.object({
  PORT: z.string().default('5000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  SUPABASE_URL: httpUrl('SUPABASE_URL'),

  // -------------------------------------------------------------------------
  // API KEYS — TWO GENERATIONS, BOTH SUPPORTED
  //
  // Supabase is migrating from the legacy JWT-format keys to a new opaque
  // format:
  //
  //   legacy `anon`         -> `sb_publishable_…`   (RLS applies)
  //   legacy `service_role` -> `sb_secret_…`        (RLS bypassed)
  //
  // Both are accepted so a project can migrate without a coordinated deploy.
  // Every field is optional HERE so the refinement below can emit one clear
  // message naming both acceptable variables, rather than two confusing
  // "required" errors for keys that are alternatives to each other.
  //
  // What does NOT change is the privilege boundary. Whichever generation is
  // configured, the publishable/anon key respects RLS and the secret/
  // service-role key bypasses it entirely. Migration changes the key format,
  // never the trust model.
  // -------------------------------------------------------------------------
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),

  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // -------------------------------------------------------------------------
  // JWT VERIFICATION
  //
  // Supabase signs user tokens either with a project-wide shared secret
  // (HS256) or with an asymmetric key published as JWKS (ES256/RS256). Which
  // one a given project uses is a property of that project, not something to
  // assume — SUPABASE_JWT_MODE selects the verifier, and `auto` resolves it by
  // asking the project's own JWKS endpoint.
  //
  // JWT_SECRET is required only in hs256 mode; an asymmetric project has no
  // shared secret to configure.
  // -------------------------------------------------------------------------
  SUPABASE_JWT_MODE: z.enum(['auto', 'hs256', 'jwks']).default('auto'),
  JWT_SECRET: z.string().min(1).optional(),

  /**
   * Expected `iss` claim. Defaults to `<SUPABASE_URL>/auth/v1`, which is what
   * Supabase issues; override only for a proxied deployment.
   */
  SUPABASE_JWT_ISSUER: z.string().min(1).optional(),

  /** Expected `aud` claim. Supabase uses "authenticated" for a signed-in user. */
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),

  ML_SERVICE_URL: httpUrl('ML_SERVICE_URL').optional(),
  ML_SERVICE_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
});

const envSchema = baseSchema.superRefine((cfg, ctx) => {
  // At least one key from each pair must be present. The issue is reported
  // against the new variable name, because that is what a fresh setup should
  // use, but the message names both.
  if (!cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_ANON_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SUPABASE_PUBLISHABLE_KEY'],
      message:
        'A publishable key is required: set SUPABASE_PUBLISHABLE_KEY (new format, sb_publishable_…) ' +
        'or SUPABASE_ANON_KEY (legacy). This client respects Row Level Security.',
    });
  }

  if (!cfg.SUPABASE_SECRET_KEY && !cfg.SUPABASE_SERVICE_ROLE_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SUPABASE_SECRET_KEY'],
      message:
        'A secret key is required for privileged backend operations: set SUPABASE_SECRET_KEY ' +
        '(new format, sb_secret_…) or SUPABASE_SERVICE_ROLE_KEY (legacy). This client BYPASSES ' +
        'Row Level Security and must never reach a browser.',
    });
  }

  // HS256 verification needs the shared secret. In `auto` mode it stays
  // optional, because the project may turn out to be asymmetric.
  if (cfg.SUPABASE_JWT_MODE === 'hs256' && !cfg.JWT_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET is required when SUPABASE_JWT_MODE is "hs256".',
    });
  }

  if (cfg.NODE_ENV === 'production' && !cfg.ML_SERVICE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ML_SERVICE_URL'],
      message:
        'ML_SERVICE_URL must be set explicitly in production — it has no safe default, ' +
        'and falling back to localhost would point the API at its own loopback.',
    });
  }
});

/**
 * Pure validation entry point.
 *
 * Exported separately from the module-level parse below so the rules can be
 * tested directly. The module-level code owns the `process.exit`; this
 * function only decides pass or fail, which is what makes it testable at all.
 */
export function parseEnv(source: NodeJS.ProcessEnv) {
  return envSchema.safeParse(source);
}

const parsed = parseEnv(process.env);

if (!parsed.success) {
  // Names and messages only — never the offending values.
  console.error('❌ Invalid environment variables:');
  for (const [key, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`   ${key}: ${(messages ?? []).join('; ')}`);
  }
  for (const issue of parsed.error.issues.filter((i) => i.path.length === 0)) {
    console.error(`   ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

// ---------------------------------------------------------------------------
// Resolved values
// ---------------------------------------------------------------------------

/**
 * The key used for RLS-respecting access.
 *
 * The new format wins when both are set, so a migration completes simply by
 * adding the new variable — the legacy one can be removed afterwards.
 */
export const SUPABASE_PUBLISHABLE_KEY: string =
  env.SUPABASE_PUBLISHABLE_KEY ?? (env.SUPABASE_ANON_KEY as string);

/** The key used for privileged access. BYPASSES RLS. Server-side only. */
export const SUPABASE_SECRET_KEY: string =
  env.SUPABASE_SECRET_KEY ?? (env.SUPABASE_SERVICE_ROLE_KEY as string);

/**
 * Which generation of key is in use, for diagnostics.
 *
 * Determined from the key's FORMAT, not from which variable it was found in.
 * Those are independent: a project can perfectly well hold a new-format
 * `sb_publishable_…` key in the legacy `SUPABASE_ANON_KEY` variable, which is
 * exactly what a partial migration looks like. Reporting the variable name as
 * the generation would then say "legacy" about a new-format key.
 *
 * Reports the generation and the source variable only — never any part of a
 * key value.
 */
function detectKeyFormat(key: string): 'new' | 'legacy' | 'unknown' {
  if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) return 'new';
  // Legacy anon/service_role keys are themselves JWTs.
  if (key.startsWith('eyJ')) return 'legacy';
  return 'unknown';
}

export const keyGeneration = {
  publishable: {
    format: detectKeyFormat(SUPABASE_PUBLISHABLE_KEY),
    variable: env.SUPABASE_PUBLISHABLE_KEY ? 'SUPABASE_PUBLISHABLE_KEY' : 'SUPABASE_ANON_KEY',
  },
  secret: {
    format: detectKeyFormat(SUPABASE_SECRET_KEY),
    variable: env.SUPABASE_SECRET_KEY ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_SERVICE_ROLE_KEY',
  },
} as const;

/** The project's JWKS endpoint, derived from SUPABASE_URL. */
export const SUPABASE_JWKS_URL: string = new URL(
  '/auth/v1/.well-known/jwks.json',
  env.SUPABASE_URL,
).toString();

/** Expected token issuer. */
export const SUPABASE_JWT_ISSUER: string =
  env.SUPABASE_JWT_ISSUER ?? new URL('/auth/v1', env.SUPABASE_URL).toString();

/**
 * Resolved ML service URL.
 *
 * Production is guaranteed to have supplied one by the refinement above; other
 * environments fall back to the local default. Keeping the fallback here
 * rather than in the schema is what makes the production requirement real.
 */
export const ML_SERVICE_URL: string = env.ML_SERVICE_URL ?? 'http://localhost:8000';

/** Feature flags derived from which optional secrets are configured. */
export const features = {
  /** The LLM explanation layer is available only when a key is configured. */
  llmExplanations: Boolean(env.OPENAI_API_KEY),
  /** Whether calls to the ML service will be authenticated. */
  mlServiceAuth: Boolean(env.ML_SERVICE_API_KEY),
} as const;
