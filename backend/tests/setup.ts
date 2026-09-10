/**
 * Test environment bootstrap.
 *
 * `src/config/env.ts` validates on import and calls `process.exit(1)` on
 * failure, so the variables it needs must exist BEFORE any module that imports
 * it is loaded. Vitest runs `setupFiles` before the test module graph, which is
 * the only reliable place to do this.
 *
 * These are fake values with the right shape. `dotenv.config()` does not
 * overwrite variables already present in `process.env`, so a developer's real
 * `.env` cannot leak into a test run and change what is being asserted.
 */
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'test-jwt-secret-not-a-real-key';

// Pin the verifier to HS256 for tests. In `auto` mode the verifier would probe
// the project's JWKS endpoint, which would mean a network call — slow, flaky,
// and pointless against a fake URL. The JWKS path has its own dedicated tests
// that stand up a local key set.
process.env.SUPABASE_JWT_MODE = 'hs256';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
