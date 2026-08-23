# Stryker measures eight declared scopes, pinned exactly, and gates nothing

`@stryker-mutator/core` and `@stryker-mutator/vitest-runner` enter the repo at
**exactly `9.6.1`**, configured by [`stryker.config.mjs`](../../stryker.config.mjs)
over the eight scopes declared in
[`stryker.scopes.json`](../../stryker.scopes.json). `pnpm mutation:run` produces
one report; `pnpm mutation:score` turns it into one number per scope.

**Nothing here is a gate, and no row lands in [`gates.md`](../gates.md) for it.**
A mutation score is a trend — its failure is a movement a person reads, not a
red — and `pnpm test` and `pnpm build` do not call any of it. This record exists
because `CLAUDE.md` requires one per dependency and Stryker is a large tree: 242
packages.

The full reasoning is [`docs/spec/mutation-scoring.md`](../spec/mutation-scoring.md),
which this record does not restate. What is here is the part a reader hits
without the spec in hand: why the pin has no caret, why three ordinary-looking
settings are load-bearing, and why the scope list is eight entries rather than
one glob.

## Why now

[`gates.md`](../gates.md) parked mutation testing under _Not gated, deliberately_
with an explicit revisit condition — _"Revisit once the rows above are green"_ —
and all 35 rows are ✅. This is the parked decision coming due, not a new
proposal.

⚠️ **The parked row's own cost estimate had rotted, which is the first thing the
revisit found.** It says _"133 tests in ~2s"_; measured, the suite is **636 tests
across 66 files in 5.52s**. Mutation cost scales with suite runtime, so the
premise that made Stryker _"genuinely cheap"_ is weaker than the file recorded.

## `9.6.1` exactly — `^9.6.0` would be a correctness bug

`9.6.1` (2026-04-10) is the _first_ release that works against Vitest 4. Its
changelog entry is _"vitest-runner: fix vitest runner mutant hitcount and
coverage for v4.1"_, closing an issue titled _"No proper coverage with Vitest 4 …
completely uncovered functions are mutated and affect the resulting score."_

**9.6.0 produced a plausible wrong number rather than a crash**, which is the
whole reason the caret is unacceptable. A range that can resolve to a version
that silently misreports is not a compatibility statement about a tool whose
entire output is a number nobody can eyeball.

⚠️ **The peer range is worthless evidence, and it is worth saying why once.**
`vitest: ">=2.0.0"` was set in `9.0.0` on 2025-05-13, **five months before Vitest
4.0 existed**, and never moved while the pair was broken. The support is real;
the _evidence_ for it is the changelog and the code, never the range.

`@stryker-mutator/typescript-checker` is **not** installed and `checkers: []` is
set. `typescript@7.0.2`'s root export no longer carries the APIs the checker
calls, and its peer range `">=3.6"` admits `7.0.2` — so pnpm installs a
combination that fails at runtime rather than refusing. The cleanest specimen
this effort found of a range _asserting_ a compatibility that does not exist.

Dropping it costs little: Vitest transpiles through esbuild and never
type-checks, so a mutant that would fail `tsc` still runs and gets a real
verdict. Measured across eight runs, `CompileError` 0 and `RuntimeError` 0–1.

## Three settings that look like style and are not

Each of these contradicts what the published packages _say_, in the same
direction every time — reading a tarball sees what the source claims, not what
the run does. Without all three, the run fails in a way whose message points
somewhere else.

- **`tsconfigFile` names a file that is not in the project.**
  `@stryker-mutator/core`'s `ts-config-preprocessor.js` does a **dynamic**
  `await import('typescript')` — invisible to a grep — and calls
  `ts.parseConfigFileTextToJson`, the exact function with no TypeScript 7
  replacement. Stryker crashes on startup. Pointing the setting at an absent
  filename makes the preprocessor's lookup miss and the rewrite a no-op.

  ⚠️ **Safe _here_, and the qualification is the transferable half.** The
  preprocessor exists to rewrite `extends` and `references` paths that escape the
  sandbox; this repo's `tsconfig.json` extends a file inside the project and
  declares no `references`, so nothing needed rewriting. **A repo with a real
  project-references graph does not get this escape**, and for it Stryker 9.6.1
  is simply blocked under TypeScript 7.

- **`plugins` names the runner explicitly.** Stryker's default plugin glob loads
  nothing under pnpm. Both packages install and symlink correctly; the child
  test-runner process resolves none of them and reports _"no TestRunner plugins
  were loaded"_.

- **`mutate` keeps its `!**/*.test.ts` negation.** Specifying `mutate` **replaces**
  Stryker's default array, and the default is what excludes test files. The first
  successful run on this repo forgot it: **2,665 of 5,966 mutants were mutations
  of `*.test.ts` files**, and the report listed `frontmatter.test.ts` and friends
  with scores beside them. The headline read 57.86% against a real 66.59%.

  ⚠️ **A gaming specimen where nobody gamed anything.** A scoping mistake,
  invisible in the summary line, producing a number wrong by nine points — caught
  by reading a per-file table, which no dashboard would have shown.

`timeoutMS: 120000` belongs beside them but is a different kind of setting: it is
**part of the score's definition, not a tuning knob.** The run-to-run noise band
is **0.36 points** at Stryker's default and **0.01** here — six runs, two of them
byte-identical to a third, mutant for mutant. A floor derived under one value
does not transfer to another.

## Eight declared scopes, because one number cannot be read

Stryker reports one score for whatever `mutate` matched. That figure cannot say
which part of the tree moved, and _which scope moved_ is the entire signal this
instrument exists to produce. So the scopes are **declared** — in a JSON file
Stryker's flat `mutate` array is derived from — and `pnpm mutation:score`
aggregates the report back into them.

⚠️ **`packages/core/src` is the non-recursive scope**: the files directly in it,
**1,227 mutants at 71.7%**. The _directory rollup_ of the same name is **3,301 at
66.6%** and is the union of all five core scopes rather than a ninth. Nothing
about the name distinguishes them, so writing `packages/core/src/**` where the
table means non-recursive silently declares the union and four scopes vanish into
it, floors and all. **The glob is the scope's definition; the name is only its
identity.**

**Declared, never discovered.** Folding small scopes into their parents was put
and rejected: it derives the scope _structure_ from the measurement, which is the
same move as deriving the exclusion list from the numbers.

**The cost is stated rather than smoothed.** `packages/cli/src`'s reachable
surface is one file at **68 mutants, so one mutant moves that scope 1.47
points.**

## An exclusion owes a mechanism; a gap does not get one

**Two reasons only, and there is no third.** A file is excluded because a named
mechanism puts it out of reach, or it is not excluded. Every entry in
`stryker.scopes.json` carries that mechanism as a string beside it.

⚠️ **The criterion is the mechanism, never the measurement.** The report cannot
tell **unreachable** — `scene.ts`, 840 mutants, whose only oracle drives a
browser — from **untested**, a module nobody wrote a spec for. Both read 100%
`NoCoverage` and both score 0. Excluding _"anything at 100% NoCoverage"_ would
rebuild the global-coverage failure by hand, and it classifies inconsistently on
its own terms: `cover-viewer.ts` is 20 `NoCoverage` **plus 1 Survived**.

The case that forced the rule sits inside the flagship scope.
`packages/core/src/covers/measure.ts` — 11 mutants, no spec — was split out on
purpose so `backfill-covers.ts` could be tested without generating real images.
It is importable, has two real branches, and could be specced with a stub. **So
it is a gap, it stays in the denominator, and every core scope's exclusion list
is empty.** _"It is only glue"_ is the most available excuse for excluding
anything, and **a seam extracted to make its caller testable is precisely the
code an AI asked to raise a score would extract further.**

⚠️ **Two exclusions are testability defects rather than facts of nature**, so the
list doubles as a register of them: `scripts/deploy.ts` is the most irreversible
code in the repo and is reachable only through `spawnSync`, and
`scripts/lib/repo-root.ts` is read as text rather than imported. And _"no spec
imports it"_ is a mechanism **the attacker controls**, unlike _"the child never
sees the active mutant"_, which is a property of the harness — recorded as the
weaker half of the list.

## Two things the spec refused to invent, measured here

**`scripts/` had never been run.** The whole directory is **2,412 mutants at
7.71%** — and 2,103 of those are `NoCoverage` in files nothing executes
in-process. The declared scope, after exclusions, is **309 mutants at 60.19%**:
`scripts/lib/public-build.ts` (300, 60.00%) and `scripts/lib/walk.ts` (9,
66.67%).

⚠️ **`walk.ts` is in the scope against the spec's own draft list, and the
measurement is why.** §5 filed it under _"no spec imports them"_. True of direct
imports and false of execution: `gates/public-build.test.ts` imports
`lib/public-build.ts`, which imports `walk.ts`, in-process — and the run killed 6
of its 9 mutants. **A reachable file stays in the denominator**, which is the
same rule that keeps `covers/measure.ts` in. The draft list was written before
anyone ran this scope; running it is what this landing was for.

**What Stryker does with a declared scope that produced zero mutants is
_omission_** — not `100`, not `NaN`. Measured three ways:

| Case                                                                                  | What happens                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A scope's glob matches a file that yields no mutants, beside a scope that yields some | The file is absent from the clear-text table **and from `mutation.json`'s `files` map**. Exit 0. |
| A scope's glob matches no file at all                                                 | Identical. No warning, no error — a `mutate` pattern matching nothing is silent.                 |
| Every scope empty, so the run has no mutants at all                                   | `ConfigError: No tests were executed`, **exit 1**, and no report is written.                     |

⚠️ **That decides the shape of the residual check this rollout owes.** A check
reading a _score_ for an empty scope can never fire, because there is no row to
read — it has to assert that every declared scope **has an entry**. The spec
predicted `100` and named it the worst of the three; the real answer is worse
still, because `100` is at least a value something could compare against.
`pnpm mutation:score` therefore prints `n/a` rather than `100` for an empty
scope, which is the one place this instrument declines to reproduce Stryker's
arithmetic.

## `gates/` is out, and the return condition is written down

`gates/repo.ts:13` is `REPO_ROOT = resolve(process.cwd())`, and **Stryker's
sandbox is not the repository.** In a sandbox every repo-shape gate silently
retargets at a copy of the tree: four gates shell out to git into a directory
that is not a checkout, and G23 regex-matches source text Stryker has rewritten
by construction. Mutating anything under `gates/` pulls those specs in and the
run dies at the dry run. **Any gate asserting on the shape of the source is
unrunnable inside a mutation sandbox.**

⚠️ **G5's own `expectFound(…, 20)` anti-vacuity guard is what caught this.**
Without it, three repo-shape gates would have passed **vacuously against a copy
of the tree**, and the score would have been confidently wrong. _A gate that
cannot tell it is being run against the wrong tree is not yet a gate either._

**Out is a measurement fact rather than a ruling**, so the return condition is
stated: `REPO_ROOT` resolved from a marker rather than from `cwd`. Until then the
instrument for a gate stays the register's observed-red field, which does what a
mutation score cannot.

⚠️ **One finding recorded rather than repaired, and it is the sharpest here.**
_"A gate is the last thing in the chain, so nothing can notice it being wrong"_
is **false for `gates/repo.ts`**: it is not a gate, it is a shared library
holding `codeOf`, `tableCells` and `expectFound`, **20 of the 29 gate specs
import it, and it has no spec of its own.** Those 20 gates _are_ its oracles, so
it is the one place under `gates/` a mutation score would answer a real question,
and the one place a subtle error weakens twenty checks at once. **A gap, not an
exclusion.**

## Consequences

- **`pnpm test` and `pnpm build` are untouched.** No new gate, no new CI cost, no
  contributor ever sees this unless they run it.
- **`vitest.stryker.config.ts` exists and removes exactly one spec**, and the
  removal is a property of the harness rather than a choice: `env.test.ts` calls
  `process.chdir()` ten times, which does not exist in the worker thread
  Stryker's runner hardcodes. That removal is _why_ `packages/cli/src/env.ts`
  carries an exclusion, which is the shape to look for — a harness limit and the
  scope entry it forces are one fact written twice.
- **Cost.** ~5m20s for the core scopes on a 16-core workstation; ⚠️ extrapolated
  to a 4-vCPU runner, **~41 min**, against `gates.yml`'s `timeout-minutes: 20`.
  That is why the nightly that consumes this lands in its own workflow, later in
  the rollout, and why on-merge is a deferred move rather than a current one.
- **Reversible.** `pnpm remove` both packages, delete the three config files —
  `stryker.config.mjs`, `stryker.scopes.json`, `vitest.stryker.config.ts` — and
  the reporter, mark this record superseded. Nothing depends on it yet by
  construction.

## How this was decided

The spec, in full: [`docs/spec/mutation-scoring.md`](../spec/mutation-scoring.md)
§§1–5, assembled from
[#109](https://github.com/mephistopheles4/stacks/issues/109) (does it run),
[#114](https://github.com/mephistopheles4/stacks/issues/114) (what it costs),
[#116](https://github.com/mephistopheles4/stacks/issues/116) (what is scored) and
[#140](https://github.com/mephistopheles4/stacks/issues/140) (the structural half
of the scope check). The measurements behind every number above are committed on
`experiment/stryker-cost` at
[`b8ce094`](https://github.com/mephistopheles4/stacks/commit/b8ce094) as
`stryker-runs-114.json` — eight runs, per-file.

Landed by [#155](https://github.com/mephistopheles4/stacks/issues/155), which is
also the first run to include `scripts/`; that scope had never been measured and
the spec deliberately invented no number for it.
