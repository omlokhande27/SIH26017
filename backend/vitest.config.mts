import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Live E2E tests write to the REAL database and are gated behind
    // LIVE_E2E=1. They must never be swept into `npm test`.
    exclude: ['tests/live/**'],
    setupFiles: ['./tests/setup.ts'],
    // Each file gets a fresh module registry so the mocked Supabase client and
    // the validated env are rebuilt per file rather than shared.
    isolate: true,
    pool: 'forks',
    reporters: ['default'],
  },
});
