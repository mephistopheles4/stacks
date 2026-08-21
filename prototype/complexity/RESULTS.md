# Complexity walk over every declared scope

Cyclomatic (McCabe) complexity, per function, computed against the pinned `typescript@7.0.2` using `typescript/unstable/{sync,ast}` (there is no classic compiler API in this TS version — see `git show research/complexity-tooling-for-typescript:docs/research/complexity-tooling-for-typescript.md`). One long-lived `API` session was used for the whole run.

Counting rule: each function-like (`FunctionDeclaration`, `FunctionExpression`, `ArrowFunction`, `MethodDeclaration`, constructor, get/set accessor) starts at 1; +1 per `IfStatement`, `ConditionalExpression`, each loop (`for`/`for-in`/`for-of`/`while`/`do`), each classic `CaseClause`, each `CatchClause`, and each `&&`, `||`, `??` `BinaryExpression` (including `&&=`, `||=`, `??=`). `?.` and default parameters are **not** counted. Nested functions are separate scopes: their branches never count toward the enclosing function.

## 1. Top 25 functions, repo-wide

Repo-wide = the union of all 8 declared scopes' full globs (`*.test.ts` excluded, matching Stryker), deduplicated. 1009 functions across 92 files.

| # | Function | File | Scope | CC |
| --- | --- | --- | --- | --- |
| 1 | `enrichBook` | `packages/core/src/enrich.ts:135` | packages/core/src | 40 |
| 2 | `inspectPublicBuild` | `scripts/lib/public-build.ts:228` | scripts | 39 |
| 3 | `report` | `scripts/smoke-render.ts:578` | scripts | 35 |
| 4 | `renderNote` | `packages/core/src/adapters/obsidian-adapter.ts:217` | packages/core/src/adapters | 27 |
| 5 | `applyLive` | `packages/site/src/shelf/scene.ts:1731` | packages/site/src/shelf | 27 |
| 6 | `fillGaps` | `packages/core/src/metadata/index.ts:274` | packages/core/src/metadata | 22 |
| 7 | `renderPanel` | `scripts/lib/trend-report.ts:116` | scripts | 20 |
| 8 | `buildBook` | `packages/site/src/shelf/scene.ts:1098` | packages/site/src/shelf | 19 |
| 9 | `declarationFaults` | `scripts/lib/scope-check.ts:174` | scripts | 19 |
| 10 | `<anonymous>:151` | `packages/site/src/shelf/diagnostics.ts:151` | packages/site/src/shelf | 17 |
| 11 | `render` | `packages/site/src/shelf/diagnostics.ts:238` | packages/site/src/shelf | 17 |
| 12 | `cardFailures` | `scripts/smoke-render.ts:520` | scripts | 16 |
| 13 | `refuseReuse` | `scripts/trend-sync.ts:348` | scripts | 16 |
| 14 | `addBook` | `packages/core/src/add-book.ts:52` | packages/core/src | 15 |
| 15 | `compareShelfPosition` | `packages/core/src/shelf-order.ts:19` | packages/core/src | 15 |
| 16 | `toAudibleBook` | `packages/core/src/import/audible.ts:50` | packages/core/src/import | 14 |
| 17 | `placeRow` | `packages/site/src/shelf/placement.ts:85` | packages/site/src/shelf | 14 |
| 18 | `readTune` | `packages/site/src/shelf/shelf-url.ts:255` | packages/site/src/shelf | 14 |
| 19 | `<anonymous>:348` | `packages/cli/src/index.ts:348` | packages/cli/src | 14 |
| 20 | `main` | `scripts/trend-sync.ts:648` | scripts | 14 |
| 21 | `cacheCover` | `packages/core/src/covers/cache-cover.ts:59` | packages/core/src/covers | 13 |
| 22 | `findRecord` | `packages/core/src/metadata/apple-books.ts:49` | packages/core/src/metadata | 13 |
| 23 | `<anonymous>:282` | `packages/cli/src/index.ts:282` | packages/cli/src | 13 |
| 24 | `tally` | `packages/core/src/covers/dominant-colour.ts:155` | packages/core/src/covers | 12 |
| 25 | `loadEnv` | `packages/cli/src/env.ts:79` | packages/cli/src | 12 |

## 2. Per-scope statistics

Two tables per scope: the full glob, and the same scope after applying its declared mutation exclusions (`stryker.scopes.json`). "CC>10 share" = share of *functions* with complexity over 10. "Mass share CC>10" = sum of complexity over those functions, divided by the scope's total complexity — SlopCodeBench's structural-erosion figure.

### `packages/core/src`

Glob: `packages/core/src/*.ts` — 15 files (full), 15 files (post-exclusion).

| Set | Functions | Sum | Mean | Max | p90 | CC>10 share | Mass share CC>10 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full glob | 84 | 298 | 3.55 | 40 | 6 | 6.0% | 30.9% |
| Post-exclusion | 84 | 298 | 3.55 | 40 | 6 | 6.0% | 30.9% |

### `packages/core/src/adapters`

Glob: `packages/core/src/adapters/**/*.ts` — 2 files (full), 2 files (post-exclusion).

| Set | Functions | Sum | Mean | Max | p90 | CC>10 share | Mass share CC>10 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full glob | 23 | 92 | 4.00 | 27 | 7 | 4.3% | 29.3% |
| Post-exclusion | 23 | 92 | 4.00 | 27 | 7 | 4.3% | 29.3% |

### `packages/core/src/covers`

Glob: `packages/core/src/covers/**/*.ts` — 8 files (full), 8 files (post-exclusion).

| Set | Functions | Sum | Mean | Max | p90 | CC>10 share | Mass share CC>10 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full glob | 28 | 122 | 4.36 | 13 | 11 | 10.7% | 29.5% |
| Post-exclusion | 28 | 122 | 4.36 | 13 | 11 | 10.7% | 29.5% |

### `packages/core/src/import`

Glob: `packages/core/src/import/**/*.ts` — 2 files (full), 2 files (post-exclusion).

| Set | Functions | Sum | Mean | Max | p90 | CC>10 share | Mass share CC>10 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full glob | 22 | 68 | 3.09 | 14 | 5 | 9.1% | 36.8% |
| Post-exclusion | 22 | 68 | 3.09 | 14 | 5 | 9.1% | 36.8% |

### `packages/core/src/metadata`

Glob: `packages/core/src/metadata/**/*.ts` — 8 files (full), 8 files (post-exclusion).

| Set | Functions | Sum | Mean | Max | p90 | CC>10 share | Mass share CC>10 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full glob | 87 | 255 | 2.93 | 22 | 6 | 2.3% | 13.7% |
| Post-exclusion | 87 | 255 | 2.93 | 22 | 6 | 2.3% | 13.7% |

### `packages/site/src/shelf`

Glob: `packages/site/src/shelf/**/*.ts` — 24 files (full), 16 files (post-exclusion).

Mutation-excluded but still walked here: `packages/site/src/shelf/book-inspector.ts`, `packages/site/src/shelf/boot.ts`, `packages/site/src/shelf/contact-shadow.ts`, `packages/site/src/shelf/debug-panel.ts`, `packages/site/src/shelf/diagnostics.ts`, `packages/site/src/shelf/post.ts`, `packages/site/src/shelf/scene.ts`, `packages/site/src/shelf/start.ts`.

| Set | Functions | Sum | Mean | Max | p90 | CC>10 share | Mass share CC>10 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full glob | 385 | 858 | 2.23 | 27 | 4 | 1.6% | 12.6% |
| Post-exclusion | 113 | 322 | 2.85 | 14 | 5 | 1.8% | 8.7% |

### `packages/cli/src`

Glob: `packages/cli/src/**/*.ts` — 3 files (full), 1 files (post-exclusion).

Mutation-excluded but still walked here: `packages/cli/src/env.ts`, `packages/cli/src/index.ts`.

| Set | Functions | Sum | Mean | Max | p90 | CC>10 share | Mass share CC>10 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full glob | 26 | 113 | 4.35 | 14 | 12 | 15.4% | 45.1% |
| Post-exclusion | 3 | 13 | 4.33 | 6 | 6 | 0.0% | 0.0% |

### `scripts`

Glob: `scripts/**/*.ts` — 30 files (full), 11 files (post-exclusion).

Mutation-excluded but still walked here: `scripts/capture-api-fixtures.ts`, `scripts/capture-lookup-recall.ts`, `scripts/check-public-build.ts`, `scripts/commit-metrics.ts`, `scripts/deploy.ts`, `scripts/dev-watch.ts`, `scripts/emit-metrics.ts`, `scripts/lib/docker.ts`, `scripts/lib/git.ts`, `scripts/lib/repo-root.ts`, `scripts/lib/run.ts`, `scripts/make-50-book-fixture.ts`, `scripts/make-fixture-covers.ts`, `scripts/make-icons.ts`, `scripts/make-readme-image.ts`, `scripts/mutation-scopes.ts`, `scripts/smoke-render.ts`, `scripts/trend-sync.ts`, `scripts/worktree.ts`.

| Set | Functions | Sum | Mean | Max | p90 | CC>10 share | Mass share CC>10 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full glob | 354 | 996 | 2.81 | 39 | 6 | 2.8% | 19.5% |
| Post-exclusion | 176 | 494 | 2.81 | 39 | 7 | 2.8% | 20.6% |

## 3. Distribution — all 1009 functions, repo-wide

| Bucket | Count |
| --- | --- |
| 1 | 512 |
| 2-3 | 271 |
| 4-6 | 141 |
| 7-10 | 52 |
| 11-20 | 27 |
| 21+ | 6 |

## 4. Gaming and dilution experiments

Both experiments target `enrichBook` in `packages/core/src/enrich.ts:135` (CC 40, the repo-wide max) and recompute the `packages/core/src` scope (84 functions, sum 298, mean 3.55, max 40, p90 6, CC>10 share 6.0%, mass share CC>10 30.9%) with that one file's functions swapped for a modified copy. Both scratch copies were parsed with the same walker in a throwaway inferred TS project (no repo files were touched); neither was committed.

**Gaming — mechanical extract-function split.** `enrichBook` was split into 3 helpers (`fillSpineColourFromCoverOnDisk` CC 5, `lookupAndApplyMetadata` CC 30 — it inherited almost all of the original branching, `writeAboutSection` CC 4) plus a thinner orchestrator (CC 6, down from 40), with state threaded through a shared mutable object rather than closures. Scope-level effect:

| Stat | Baseline | After split | Delta |
| --- | --- | --- | --- |
| Functions | 84 | 87 | +3 |
| Sum | 298 | 303 | +5 |
| Mean | 3.55 | 3.48 | -0.07 |
| Max | 40 | 30 | -10 |
| p90 | 6 | 6 | 0 |
| CC>10 share | 6.0% | 5.7% | -0.3pp |
| Mass share CC>10 | 30.9% | 27.1% | -3.8pp |

Max and the structural-erosion figure both dropped noticeably from moving code around, not from removing any branch — the sum barely moved (+5, from the extra `if`/return-kind checks the split itself introduced to pass results back up). A per-function ceiling like max, or a metric built on `CC>10`, is exactly what a purely mechanical split games: no branch was deleted, but the single function that carried them is gone, so the file now clears whatever `max`-based gate it used to fail. `sum` is the one figure here a mechanical split can't shrink — it went up slightly, because splitting is never quite free.

**Dilution — 30 trivial CC-1 functions appended to the same file.** `enrichBook` itself was left untouched; only noise was added:

| Stat | Baseline | After dilution | Delta |
| --- | --- | --- | --- |
| Functions | 84 | 114 | +30 |
| Sum | 298 | 328 | +30 |
| Mean | 3.55 | 2.88 | -0.67 |
| Max | 40 | 40 | 0 |
| p90 | 6 | 5 | -1 |
| CC>10 share | 6.0% | 4.4% | -1.6pp |
| Mass share CC>10 | 30.9% | 28.0% | -2.9pp |

Max is untouched (dilution can't move it), but mean, p90, CC>10 share, and even the mass-share erosion figure all fell — the last one is supposed to resist exactly this ('mass' is meant to survive denominator padding better than a plain count-based share does), and it still moved 2.9 points on 30 one-line functions that touch nothing real. `sum` moved too, but only by the amount of noise added (+30 for +30 CC-1 functions) — visible as noise rather than hidden as improvement, which is the property that makes it the one number here dilution can't use to fake a healthier file.

## 5. Wall-clock

92 files, one API session, 224.2ms total (spawn of the native `tsc` binary + project load + every file's parse + the JS-side complexity walk).

## 6. Parse refusals and skipped function kinds

No file in the walked set was refused by `program.getSourceFile` — every file returned a `SourceFile`.

No function-shaped AST node kind was encountered outside the 7 handled kinds (FunctionDeclaration, FunctionExpression, ArrowFunction, MethodDeclaration, Constructor, GetAccessor, SetAccessor) — e.g. no class static initialization blocks were found in the walked scopes.
