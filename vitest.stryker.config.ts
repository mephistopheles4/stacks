import { defineConfig } from 'vitest/config';

/**
 * Issue #114 — the repo's `vitest.config.ts` with exactly one spec removed.
 *
 * Stryker's vitest runner hardcodes `pool: 'threads'` (vitest-test-runner.js:36-38;
 * the docs say "Currently, only `threads: true` is supported"). `process.chdir()`
 * does not exist in a worker thread, and `packages/cli/src/env.test.ts` calls it
 * ten times. So any `mutate` scope wide enough to pull that spec into vitest's
 * related set kills the run at the DRY run — before a single mutant is tested.
 *
 * This file is what "anything that had to be excluded to get a run at all" cost.
 * Nothing else is changed; the exclusion is not a tuning choice.
 */
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'gates/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/cli/src/env.test.ts'],
    environment: 'node',
    setupFiles: ['./gates/no-live-network.setup.ts'],
  },
});
