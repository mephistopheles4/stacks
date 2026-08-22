import { readFileSync } from 'node:fs';

/**
 * Stryker, configured for this stack. Spec: docs/spec/mutation-scoring.md §§1-5.
 *
 * Nothing here is gated and nothing here goes red. This is the measurement
 * instrument the rest of the mutation rollout consumes; `pnpm mutation:score`
 * turns one run into a number per declared scope.
 *
 * The eight scopes and their exclusions live in `stryker.scopes.json`, because
 * a flat `mutate` array cannot say which of eight populations a glob belongs to
 * and every exclusion owes a named mechanism. `mutate` is derived from it below.
 */

// The shape is documented once, in `scripts/mutation-scopes.ts`'s `Scope` and
// `Exclusion` interfaces — restating it here would be a second copy nothing
// holds to the first. This file is `.mjs` because Stryker's config loader cannot
// read a `.ts` one, so the two halves cannot share a type; only one of them gets
// to be the definition.
const { scopes } = JSON.parse(readFileSync(new URL('./stryker.scopes.json', import.meta.url), 'utf8'));

/**
 * The declared scopes, then every exclusion as a negation, then the test-file
 * negation last.
 *
 * ⚠️ **Specifying `mutate` REPLACES Stryker's default array, and the default is
 * what excludes `*.test.ts`.** The first successful run on this repo forgot the
 * negation and mutated the test suite: 2,665 of 5,966 mutants were mutations of
 * `*.test.ts` files, and the headline read 57.86% against a real 66.59%. The
 * summary line looked fine; it was caught by reading a per-file table.
 */
const mutate = [
  ...scopes.map((scope) => scope.glob),
  ...scopes.flatMap((scope) => scope.exclusions.map((exclusion) => `!${exclusion.path}`)),
  '!**/*.test.ts',
];

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  packageManager: 'pnpm',
  testRunner: 'vitest',
  mutate,

  /**
   * ⚠️ **Off by decision now, not by impossibility.** This said the TypeScript
   * checker was *"dead here and cannot be revived"*, and that was true of
   * `typescript@7.0.2`, whose root export no longer carried the APIs
   * `@stryker-mutator/typescript-checker@9.6.1` calls — with a peer range
   * `">=3.6"` that admitted `7.0.2`, so pnpm installed a combination failing at
   * runtime rather than refusing. The repo is on `typescript@6.0.3` since
   * [ADR-0064](docs/adr/0064-typescript-6-until-7-1.md), and the spike measured
   * the checker **starting and working**: 2 of `measure.ts`'s 11 mutants come
   * back `CompileError`.
   *
   * It stays `[]` regardless, because turning it on is a *scoring* change, not
   * a configuration one. A `CompileError` is neither killed nor survived, so
   * every scope's number moves and every calibration window behind
   * `stryker.floors.json` restarts. That is its own decision with its own
   * record, kept as fog on
   * [the map](https://github.com/mephistopheles4/stacks/issues/186).
   *
   * Off costs little in the meantime: Vitest transpiles through esbuild and
   * never type-checks, so a mutant that would fail `tsc` still runs and gets a
   * real verdict. Measured across eight runs, `CompileError` 0 and
   * `RuntimeError` 0-1.
   */
  checkers: [],

  /**
   * ⚠️ **Stryker's default plugin glob loads nothing under pnpm.** Both packages
   * install and symlink correctly; the child test-runner process resolves none
   * of them and reports *"no TestRunner plugins were loaded"*. Naming the plugin
   * explicitly is the fix.
   */
  plugins: ['@stryker-mutator/vitest-runner'],

  /**
   * The project's real tsconfig, which is the unremarkable value — and it is
   * only unremarkable again.
   *
   * ⚠️ **This read `tsconfig.stryker-absent.json`, a filename deliberately not
   * in the project**, for the whole of TypeScript 7:
   * `@stryker-mutator/core`'s `ts-config-preprocessor.js` does a **dynamic**
   * `await import('typescript')` — invisible to a grep — and calls
   * `ts.parseConfigFileTextToJson`, the exact function with no TypeScript 7
   * replacement, so Stryker crashed on startup. Pointing the lookup at a file
   * that could not be found made the rewrite a no-op and the crash go away.
   *
   * **It had to come back in the same commit as the pin**, because on
   * `typescript@6.0.3` the trick stops being harmless: `parseConfigFileTextToJson`
   * exists again, and an absent file is now just a checker that cannot start.
   * The spike hit exactly that — a `--dryRunOnly` run failed with the workaround
   * still in place and succeeded the moment this line named the real file. See
   * [ADR-0064](docs/adr/0064-typescript-6-until-7-1.md).
   */
  tsconfigFile: 'tsconfig.json',

  /**
   * ⚠️ **Part of the score's definition, not a tuning knob.** At Stryker's
   * default the run-to-run noise band on this suite is **0.36 points**; at 120s
   * it is **0.01** — six runs, two of them byte-identical to a third, mutant for
   * mutant. Every one of the twelve verdict flips at the default was a `static`
   * mutant forcing a full suite rerun and straddling the 15s budget.
   *
   * Changing this number changes what a score means, so a floor derived under
   * one value does not transfer to another.
   */
  timeoutMS: 120000,

  /**
   * The repo's own Vitest config with the specs that cannot run inside Stryker's
   * sandbox removed — see the file for which, and why each one is a property of
   * the harness rather than a choice.
   */
  vitest: { configFile: 'vitest.stryker.config.ts' },

  /**
   * `html` is not decoration. The nine-point error in the first run was invisible
   * in the summary line and obvious in the per-file table, so the artifact that
   * carries a per-file table is part of the instrument.
   */
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'artifacts/stryker/current/mutation.html' },
  jsonReporter: { fileName: 'artifacts/stryker/current/mutation.json' },
  ignorePatterns: ['artifacts', '.stryker-tmp'],
  tempDirName: '.stryker-tmp',

  /**
   * ⚠️ **This cleans after a run that *completes*, and not after one that
   * crashes** — measured: the two failed runs of 2026-08-18 each left a 3 MB
   * `.stryker-tmp/sandbox-*` behind. The directory is gitignored, so nothing
   * notices; delete it by hand.
   *
   * It cannot reach `pnpm test`, which was checked rather than assumed by
   * planting specs in a fake sandbox: `vitest.config.ts`'s includes are anchored
   * at `packages/` and `gates/`, and a leftover sits under `.stryker-tmp/`. No
   * exclude is added for it, because a guard against something measured
   * impossible is a check that can never go red.
   */
  cleanTempDir: true,
};
