import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'web/tests/**/*.test.ts'],
    // Simulation-heavy tests (many bot games) need more than the 5s default on slow CI runners.
    testTimeout: 60_000,
  },
});
