import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Load `.env` (git-ignored) when it exists, so the real-database integration suite in
// server/tests runs locally instead of skipping. In CI there is no `.env`, so DATABASE_URL stays
// unset and that suite skips — which is honest: it is separately pinned by `npm run server:db-test`.
// `loadEnvFile` does not overwrite variables already present in the environment.
if (existsSync('.env') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env');

export default defineConfig({
  test: {
    // Bounded process workers also run in managed environments with restricted thread IPC.
    pool: 'forks',
    maxWorkers: 2,
    include: ['tests/**/*.test.ts', 'web/tests/**/*.test.ts', 'server/tests/**/*.test.ts', 'admin/tests/**/*.test.ts'],
    // Simulation-heavy tests (many bot games) need more than the 5s default on slow CI runners.
    testTimeout: 60_000,
  },
});
