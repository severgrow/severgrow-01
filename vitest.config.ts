import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Bounded process workers also run in managed environments with restricted thread IPC.
    pool: 'forks',
    maxWorkers: 2,
    include: ['tests/**/*.test.ts', 'web/tests/**/*.test.ts'],
    // Simulation-heavy tests (many bot games) need more than the 5s default on slow CI runners.
    testTimeout: 60_000,
  },
});
