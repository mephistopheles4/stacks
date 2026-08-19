import { defineConfig } from 'vitest/config';

/**
 * The repo's `vitest.config.ts` with the one spec that cannot run inside
 * Stryker's sandbox removed. Nothing else is changed.
 *
 * `packages/cli/src/env.test.ts` calls `process.chdir()` ten times. Stryker's
 * vitest runner hardcodes `pool: 'threads'` — its own docs say *"Currently, only
 * `threads: true` is supported"* — and `process.chdir()` does not exist in a
 * worker thread. Any scope wide enough to pull this spec in kills the run at the
 * **dry** run, before a single mutant is tested.
 *
 * **The removal is not a tuning choice, and it has a consequence worth naming.**
 * It is a property of the harness, and it puts the only code that spec is an
 * oracle for out of reach — which is why `packages/cli/src/env.ts` carries an
 * exclusion in `stryker.scopes.json` whose mechanism points here.
 *
 * ⚠️ **A spec under `scripts/` must not touch the filesystem**, for the same
 * reason as the paragraph below. `scripts/lib/repo-root.ts` resolves from
 * `process.cwd()`, and inside the sandbox that is not the repository — so a spec
 * that reads a real file passes under `pnpm test` and fails here, which reads as
 * a mutation-run fault rather than as a spec that made an assumption.
 * `scripts/lib/mutation-score.test.ts` passes its scopes and reports in as data
 * for exactly that reason.
 *
 * ⚠️ **`gates/` is out of the mutation scope for a related reason**, recorded
 * here because this is where a future session will come looking. `gates/repo.ts`
 * resolves `REPO_ROOT` from `process.cwd()`, and **Stryker's sandbox is not the
 * repository** — four repo-shape gates shell out to git into a directory that is
 * not a checkout. They are not excluded below because nothing under `gates/` is
 * mutated, so Vitest's related-file filter never pulls them in. Mutate anything
 * there and they come back, along with the dry-run failure.
 */
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'gates/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/cli/src/env.test.ts'],
    environment: 'node',
    setupFiles: ['./gates/no-live-network.setup.ts'],
  },
});
