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
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),

  /**
   * The FastAPI ML service.
   *
   * Optional here, then required for production by the refinement below. It
   * previously defaulted to `http://localhost:8000` unconditionally, which
   * meant a production deploy that forgot the variable would start cleanly and
   * quietly try to reach a service on its own loopback — a misconfiguration
   * that looks like a healthy boot and fails only when a prediction is
   * requested.
   */
  ML_SERVICE_URL: httpUrl('ML_SERVICE_URL').optional(),

  /**
   * Shared secret for calling the ML service. Optional until the service is
   * deployed with authentication enabled (Phase 4).
   */
  ML_SERVICE_API_KEY: z.string().min(1).optional(),

  /**
   * OpenAI key for the optional LLM explanation layer.
   *
   * Optional by design, and the system must stay fully functional without it:
   * the LLM only rephrases already-computed results. Predictions, risk levels,
   * rule-engine warnings and recommendations are all deterministic code paths
   * that never depend on this key being present.
   */
  OPENAI_API_KEY: z.string().min(1).optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
});

/**
 * Production-only requirements.
 *
 * Applied as a refinement rather than by making the field required outright,
 * so local development and the test suite stay frictionless while production
 * cannot boot on a silent default.
 */
const envSchema = baseSchema.superRefine((cfg, ctx) => {
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
