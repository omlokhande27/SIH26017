import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Each file gets a fresh module registry so the mocked Supabase client and
    // the validated env are rebuilt per file rather than shared.
    isolate: true,
    pool: 'forks',
    reporters: ['default'],
  },
});
