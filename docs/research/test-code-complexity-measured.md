# Test-code complexity, measured

Support for [#239](https://github.com/mephistopheles4/stacks/issues/239) on
[map #228](https://github.com/mephistopheles4/stacks/issues/228). **This branch
never merges.** It exists so the numbers in that ticket's resolution have a
provenance somebody can re-run, and so the eagle-eye box that carries the
argument survives the worktree it was built in.

Counted with the repo's own counter — `complexityOf` from
`scripts/lib/complexity.ts`, which is ESLint's `complexity` rule at
`variant: "classic"`, at the versions installed on 2026-08-23 (`eslint` 10.9.0,
`@typescript-eslint/parser` 8.67.0). **The same rule that produces the four
product series.** No second implementation, so the test numbers below and the
product numbers on the dashboard mean the same thing.

Tree state: `claude/mattpocock-skills-wayfinder-1c02b6`, cut from `main` at
`c8ba4ee`.

---

## 1. The headline

**No test function in this repository exceeds McCabe 10.** The maximum across
all 1931 of them is exactly 10, and `complexity-mass-over-10` counts functions
*above* the cut — so that count is **identically zero** for every candidate test
population.

Those are the two capped series. Both are dead on arrival over test code.

| Population | files | functions | mass | mean | max | over 10 | mass-over-10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All source, non-test | 100 | 1140 | 3328 | 2.92 | 57 | 41 | 726 |
| All `*.test.ts` | 87 | 1931 | 2642 | 1.37 | **10** | **0** | **0** |
| `gates/**/*.test.ts` | 38 | 672 | 955 | 1.42 | 9 | 0 | 0 |
| `packages/**/*.test.ts` | 37 | 724 | 1018 | 1.41 | 10 | 0 | 0 |
| `scripts/**/*.test.ts` | 12 | 535 | 669 | 1.25 | 8 | 0 | 0 |

## 2. The gates are not special

The ticket's case for a `gates/` population is that the gates *are* the
constitution's enforcement, and nothing tests the tests. The measurement does
not support a different instrument for them.

**Gate test code is indistinguishable from package test code.** Mean 1.42
against 1.41. Max 9 against 10. Zero functions over the cut on both sides. If a
complexity series is worth building for one, it is worth exactly as much for the
other — and it is worth the same amount for both, which is nothing the numbers
can act on.

⚠️ **A `gates/**/*.ts` entry in `stryker.scopes.json` would not measure the
gates.** `populationOf` drops every `*.test.ts` file, so such an entry reaches
the four non-test helpers only:

| Population | files | functions | mass | mean | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `gates/**/*.ts` minus tests | 4 | 24 | 42 | 1.75 | 6 |

Those four files are `no-live-network.setup.ts`, `no-live-network.ts`,
`recall-corpus.ts` and `repo.ts`. The 38 gate specs are not in it.

## 3. Per declared scope, product against its test twin

The eight declared scopes, each with the test files that sit beside it.

| Scope | prod fns | prod mean | prod max | test fns | test mean | test max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `packages/core/src` | 84 | 3.68 | 41 | 199 | 1.22 | 5 |
| `packages/core/src/adapters` | 23 | 4.13 | 27 | 50 | 1.10 | 4 |
| `packages/core/src/covers` | 28 | 4.46 | 15 | 84 | 1.26 | 4 |
| `packages/core/src/import` | 22 | 3.23 | 14 | 19 | 1.74 | 7 |
| `packages/core/src/metadata` | 87 | 3.30 | 22 | 79 | 1.72 | 7 |
| `packages/site/src/shelf` | 394 | 2.36 | 28 | 277 | 1.55 | 10 |
| `packages/cli/src` | 26 | 4.54 | 14 | 16 | 1.06 | 2 |
| `scripts` | 450 | 3.00 | 57 | 535 | 1.25 | 8 |

**The test column sums to 1259**, which is the number the charting session put in
the ticket. Its source figure of 1116 is 1114 on this tree — two functions of
drift across the commits that landed since. **Neither number counts `gates/`**,
whose 672 test functions match no scope glob. The test code of the gates was
invisible even to the count of the invisible.

## 4. Distribution

| Cyclomatic | test functions | share | source functions | share |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1536 | 79.5% | 554 | 48.6% |
| 2 | 245 | 12.7% | 202 | 17.7% |
| 3–4 | 109 | 5.6% | 194 | 17.0% |
| 5–10 | 41 | 2.1% | 149 | 13.1% |
| 11–20 | 0 | 0.0% | 33 | 2.9% |
| 21+ | 0 | 0.0% | 8 | 0.7% |

**Four fifths of test functions are straight-line code.** A `it(...)` callback
with no branch scores 1. That is what a test population would mostly measure.

## 5. Where the complexity in test code actually is

The 41 functions between 5 and 10 are the whole live signal, and they are
**named helpers**, not test bodies.

| cc | location | label |
| ---: | --- | --- |
| 10 | `packages/site/src/shelf/shelf-width.test.ts:188` | `shelfCost` |
| 10 | `packages/site/src/shelf/shelf-width.test.ts:492` | arrow function |
| 9 | `gates/cover-budget.test.ts:121` | async arrow function |
| 9 | `gates/lookup-recall.test.ts:56` | async arrow function |
| 8 | `packages/site/src/shelf/head-cap.test.ts:187` | arrow function |
| 8 | `packages/site/src/shelf/shelf-width.test.ts:449` | arrow function |
| 8 | `scripts/lib/floors.test.ts:1178` | arrow function |
| 7 | `packages/core/src/import/audible.test.ts:13` | arrow function |
| 7 | `packages/core/src/metadata/metadata.test.ts:35` | async arrow function |
| 7 | `packages/site/src/shelf/books.test.ts:95` | arrow function |
| 7 | `gates/constitution-scoreboard.test.ts:366` | `citations` |
| 7 | `gates/public-build-artifact.test.ts:161` | `indexHtml` |
| 7 | `gates/site-core-imports.test.ts:93` | `coreImports` |

`citations`, `indexHtml` and `coreImports` are extraction helpers inside gates —
the code that decides what a gate *sees* before it asserts anything. That is the
one place the ticket's *nothing tests the tests* worry has a target. **A list of
thirteen functions is not a series.** It is a list, and this file is it.

## 6. Two filters, not one

Test files are dropped twice on the way to the counter, and both drops are
deliberate:

- `scripts/lib/scope-check.ts`, `isSourceFile` — the walk never yields a
  `*.test.ts` path, so no glob ever sees one.
- `scripts/lib/complexity.ts:185`, `populationOf` — the filter is applied again,
  idempotently, so the rule holds whichever file list arrives.

Any test population requires both to change. That is what makes *drop the
filter* a repo-wide fold rather than an addition: the filter is not per-scope.

## 7. How to re-run it

`scripts/measure-test-complexity.ts` on this branch. It imports the repo's own
counter and prints every table above.

```bash
pnpm exec tsx scripts/measure-test-complexity.ts
```

## 8. The argument

`docs/decisions/test-code-complexity.box.json` on this branch, with the rendered
page beside it as `test-code-complexity.html`. Seven coupled decisions, 33
options, 46 edges. Read the findings with:

```bash
node ~/.claude/skills/eagle-eye/render.mjs docs/decisions/test-code-complexity.box.json
```
