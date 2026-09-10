import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Each test file builds its own PGlite instance. PGlite is a WebAssembly
    // PostgreSQL and a cold start costs a second or two, so the default
    // 5s timeout is too tight for the schema-application tests.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Files are independent (separate in-memory databases), so they may run in
    // parallel; a single fork keeps the WASM memory footprint predictable in CI.
    pool: 'forks',
    reporters: ['default'],
  },
});
