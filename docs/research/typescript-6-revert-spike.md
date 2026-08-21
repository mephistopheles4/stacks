# Spike: can this repo run on TypeScript 6.x, and what does that unblock?

**Status: throwaway spike, not a proposal.** Branch
`experiment/typescript-6-revert`, not pushed, no PR. This answers one question:
does dropping from the pinned `typescript@^7.0.2` (ADR-0002) to the newest
TS 6.x change anything the repo depends on, and does it revive the three tools
ADR-0003 and `docs/spec/mutation-scoring.md` record as blocked by TS 7.

**Answer: yes to both.** `typescript@6.0.3` (the newest stable 6.x; 6.0.0 was
the last JS-based release before 7's Go-ported native compiler) is a drop-in
replacement here — `pnpm typecheck && pnpm test && pnpm build` are green with
zero code changes, zero tsconfig changes, and zero deprecation warnings. All
three previously-blocked tools work under it.

## Baseline vs TS 6.0.3

| Check | TS 7.0.2 (baseline) | TS 6.0.3 | Notes |
| --- | --- | --- | --- |
| `pnpm typecheck` | pass, 0.76s | pass, 2.50s | zero errors either version |
| `pnpm test` | pass, 890/890, 13.08s | pass, 890/890, 12.99s | no test changed behavior |
| `pnpm build` | pass, 3.32s | pass, 4.73s | astro build needs no network on either version |
| `pnpm install` | — | clean, **no peer warnings** | only the root pins `typescript`; no package pin needed updating |

TS 7 is measurably faster on `typecheck` alone (its whole reason for existing
— a native, Go-ported compiler) but the difference is under 2 seconds on this
codebase and invisible next to `pnpm test`'s ~13s. Reverting costs raw
typecheck speed and nothing else observed.

**Deprecations: none found.** `tsconfig.base.json` uses `moduleResolution:
"bundler"`, `target: "ES2022"`, no `baseUrl`, no `node10` resolution, no
`--target es5`, no `esModuleInterop` override. None of the options TS 6
deprecates are present, so `tsc --noEmit` produced zero errors and zero
deprecation diagnostics under 6.0.3 — `ignoreDeprecations` was never needed.
`packages/site/tsconfig.json` (extends `astro/tsconfigs/strict`) is equally
clean.

## The three unblock probes

### (a) `@typescript-eslint/parser` + `eslint-plugin-sonarjs`

`pnpm add -D -w eslint @typescript-eslint/parser eslint-plugin-sonarjs`
installed clean — **no peer warnings**, resolving to `@typescript-eslint/parser
^8.67.0` and `eslint-plugin-sonarjs ^4.2.0` against `typescript@6.0.3` (peer
pin `typescript < 6.1.0` is satisfied since 6.0.3 < 6.1.0).

A throwaway flat config (`complexity: ['warn', 0]`,
`sonarjs/cognitive-complexity: ['warn', 0]`) run against
`packages/core/src/frontmatter.ts` via `eslint -f json` returned, for the two
functions named in the task:

```
parseNote:  complexity (cyclomatic) = 12   cognitive-complexity = 7
asPrivate:  complexity (cyclomatic) = 11   cognitive-complexity = 4
```

The repo's hand-rolled prototype reportedly gave 11/11 with `?.` uncounted.
ESLint's `complexity` rule counts `?.` as a branch, so `parseNote` came out
one higher (12 vs 11) — consistent with the prediction. `asPrivate` matched at
11; its optional-chaining use is lighter, so the delta didn't show there. The
two metrics (cyclomatic vs cognitive) diverge sharply, which is expected — they
count different things (branch count vs. nesting-weighted control flow).

Reverted: `pnpm remove -w eslint @typescript-eslint/parser
eslint-plugin-sonarjs`, spike config file deleted. `package.json`/lockfile
carry no trace of this probe.

### (b) `@stryker-mutator/typescript-checker`

`pnpm add -D -w @stryker-mutator/typescript-checker@9.6.1` installed clean —
no peer warnings, despite the peer range `">=3.6"` also (still) wrongly
admitting TS 7.

Enabling `checkers: ['typescript']` and adding the plugin to
`stryker.config.mjs`'s `plugins` array, a `--dryRunOnly` run against
`packages/core/src/covers/measure.ts` **failed first** with the tsconfig
workaround still in place: the config points `tsconfigFile` at
`tsconfig.stryker-absent.json`, a file that deliberately doesn't exist — the
documented workaround for a *different* TS 7 crash (`ts-config-preprocessor.js`
calling `ts.parseConfigFileTextToJson`, which TS 7 doesn't export). Under TS 6
that crash doesn't apply, so the absent-file trick is no longer just
harmless — it now actively breaks the checker, which needs a real file.
Pointing `tsconfigFile` at the real `tsconfig.json` fixed it:

```
INFO DryRunExecutor Initial test run succeeded. Ran 9 tests in 0 seconds
INFO MutationTestExecutor The dry-run has been completed successfully.
```

A full (non-dry) run on the same one-file scope then produced real checker
verdicts — 2 of the file's 11 mutants came back `CompileError` (the rest
`Survived`, since `measure.ts` has no dedicated spec, matching what
`mutation-scoring.md` §5 already says about that file). This is exactly the
signal `checkers: []` currently forfeits: a mutant that fails `tsc` gets
caught before a test runner ever sees it.

Reverted: `checkers` back to `[]`, `plugins` back to just the vitest-runner,
`tsconfigFile` back to `tsconfig.stryker-absent.json`, dependency removed,
`artifacts/stryker/current` and `.stryker-tmp` deleted. `git diff
stryker.config.mjs` is empty.

### (c) `@astrojs/check` / `astro check`

`pnpm add -D -w @astrojs/check` installed clean, no peer warnings.
`pnpm exec astro check` from `packages/site` ran to completion in 6.2s over
44 files:

```
src/shelf/boot.ts:27:14 - error ts(2717): Subsequent property declarations
must have the same type. Property 'env' must be of type 'ImportMetaEnv',
but here has type '{ readonly DEV: boolean; }'.

Result (44 files):
- 1 error
- 0 warnings
- 0 hints
```

The tool runs — no crash, no missing-API failure, which is the exact failure
mode ADR-0003 records under TS 7 (`@astrojs/check` needs a programmatic
compiler API TS 7's native compiler doesn't expose,
withastro/roadmap#1321). The single error it finds is a real, pre-existing
type conflict (an ambient `ImportMetaEnv` augmentation narrower than Vite's
own), unrelated to the TS-version question — the kind of thing `astro check`
existing to catch would have caught long ago had it been runnable.

Reverted: `pnpm remove -w @astrojs/check`. No config files were changed for
this probe.

## Other TS-version-sensitive surfaces checked

- **`@types/node@26.2.0`** — typechecks clean under both TS versions; nothing
  in this repo's `.ts` files depends on a `@types/node` API TS 6 can't see.
- **`tsx@4.23.12`** — no `peerDependencies` entry at all (esbuild-based,
  never calls `tsc`), so it is TS-version-agnostic by construction.
- **`vitest@4.1.10`** — peers on `@types/node`, `vite`, `happy-dom`/`jsdom`,
  never on `typescript` — consistent with `mutation-scoring.md`'s note that
  Vitest transpiles through esbuild and never type-checks. Both baselines
  ran all 890 tests unchanged.
- **`astro@7.2.1`** — its own `peerDependencies` name only
  `@astrojs/markdown-remark`; astro core has no opinion on the `typescript`
  version at all. The TS dependency lives entirely in the separate
  `@astrojs/check` package tested above, so `pnpm build` (plain `astro
  build`, no check) was always going to pass on either TS version, and did.
- **`typescript/unstable/*` imports** — not present anywhere in this
  worktree's source (`grep` for `typescript/unstable` across all `.ts` files
  returned nothing). The task description attributes a hand-rolled complexity
  prototype using this API to a parallel effort; it isn't part of this repo as
  checked out here, so nothing to revert. If such a prototype exists
  elsewhere, TS 6's classic `ts.createSourceFile` / `ts.forEachChild` API is
  the fallback once TS 7-only APIs go away, and is simpler, not harder — the
  same functions ESLint's own complexity rule walks.

## Risks

- **You give up TS 7's native-compiler speed.** Real but small at this
  codebase's current size (under 2s difference on typecheck, invisible next
  to the test suite). Would matter more as the codebase grows.
- **The `tsconfigFile: 'tsconfig.stryker-absent.json'` workaround becomes
  actively wrong**, not just unnecessary, if the TS pin reverts — it must be
  changed back to a real path in the same commit that re-enables the
  checker, or the checker fails outright (as observed above). This is a
  one-line, well-understood fix, not a landmine, but it is not automatic.
- **ADR-0002's "latest at scaffold time" was a default, not a requirement.**
  Reverting means deliberately choosing an older major over the newest
  available, which needs its own ADR recording *why* — the tooling unblocked
  is the why, but nothing here evaluates whether that trade is worth taking
  project-wide.
- **This spike did not run `pnpm smoke:render`, `pnpm mutation:run` full,
  `pnpm gate:public`, or `pnpm deploy:site`** — only `typecheck`/`test`/`build`
  plus the three targeted probes, per the brief. A revert decision should
  re-run the full gate suite once, not just these three.

## Recommendation

The revert is technically clean: no peer conflicts, no deprecated-option
fallout, no behavior change in 890 tests, and all three blocked tools come
back to life exactly as their blocking docs predicted they would. If any one
of ESLint/sonarjs complexity gating, Stryker's TypeScript checker, or
`astro check` is wanted enough to justify losing TS 7's speed, this spike
shows the path is a one-line `package.json` change plus the two `stryker.config.mjs`
lines (`checkers`, `tsconfigFile`) reverted together — not a multi-file
migration. Whether that trade is worth taking is a product decision this
spike doesn't make; it only confirms the technical door is open.
