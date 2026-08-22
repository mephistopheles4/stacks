import { defineConfig } from 'vitest/config';

/**
 * The repo's `vitest.config.ts` with the two specs that cannot run inside
 * Stryker's sandbox removed. Nothing else is changed.
 *
 * ⚠️ **`scripts/lib/complexity-tree.test.ts` is the second, and it is the
 * filesystem warning further down made concrete.** It asserts the complexity of
 * this repository's own source — `parseNote` reads 12 — and the sandbox is a
 * copy of the tree with every mutant site rewritten into a `stryMutAct(...)`
 * conditional. ESLint reads text, so an instrumented file *is* a more complex
 * file: measured at **104** against 12, failing the dry run with
 * `expected 104 to be 12` and taking the whole run with it before a single
 * mutant was tested.
 *
 * **The consequence is smaller than `env.test.ts`'s, and is named for the same
 * reason.** Only that file's assertions lose their mutant-killing role.
 * `scripts/lib/complexity.test.ts` stays in: its inventory assertions read only
 * `fixtures/complexity/inventory.ts`, which no `mutate` glob matches and which
 * is therefore never instrumented, and its roll-up and population assertions are
 * pure. So `scripts/lib/complexity.ts` keeps an in-process oracle and needs
 * **no** exclusion in `stryker.scopes.json`.
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
 *
 * ⚠️ **`reporters` is declared here to keep Vitest's `github-actions` reporter
 * out of the mutation run, and it is load-bearing rather than cosmetic.** Vitest
 * appends that reporter to its own default list whenever `GITHUB_ACTIONS` is
 * `true` — and *only* when nothing is declared, which is what naming one here
 * turns off. Its job-summary half then writes to `$GITHUB_STEP_SUMMARY` with
 * `flag: 'a'`, once per `onTestRunEnd`.
 *
 * Under `pnpm test` that fires once and costs 179 bytes. **Under Stryker it
 * fires once per mutant**, because a mutation run is thousands of test runs
 * through one Vitest instance: measured at 5 appends / 923 bytes over a
 * four-mutant scope, and at **1054k over the real ~5900** — past the 1024k
 * GitHub accepts, so the nightly's summary upload aborted and the runs before
 * it uploaded a megabyte of the same six lines repeated, which is what made the
 * run page slow to open.
 *
 * ⚠️ **Nothing local can catch it.** `GITHUB_ACTIONS` is unset on a developer
 * machine, so the reporter is never added, so the appends never happen and the
 * file is never written — the harness fault is invisible everywhere except the
 * one place it fires. Declaring the list makes CI's resolved reporters equal to
 * a laptop's, which is the property that removes the divergence rather than
 * papering over one symptom of it.
 */
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'gates/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/cli/src/env.test.ts',
      'scripts/lib/complexity-tree.test.ts',
    ],
    environment: 'node',
    setupFiles: ['./gates/no-live-network.setup.ts'],
    reporters: ['default'],
  },
});
