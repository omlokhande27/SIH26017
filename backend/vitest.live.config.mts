import { defineConfig } from 'vitest/config';

/**
 * Live E2E configuration — REAL Supabase, REAL data.
 *
 * Separate from vitest.config.mts on purpose:
 *
 *  - no `setupFiles`, so `dotenv` loads the real backend/.env rather than the
 *    fake values the mocked suite injects;
 *  - `tests/live/**` only, so these never run under `npm test`;
 *  - single-threaded and serial, because the tests share real fixtures in one
 *    database and would race each other otherwise.
 */
export default defineConfig({
  test: {
    include: ['tests/live/**/*.live.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    // One file, run serially: the tests share real fixtures in one database
    // and would race each other otherwise.
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ['default'],
  },
});
