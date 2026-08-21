# CRAP's untestedness term: coverage or mutation score?

Research question, not yet a proposal: if this repo adopted `CRAP(m) = CC² ×
(1 − untestedness)³ + CC` per method, which measure should fill
*untestedness* — line coverage, or Stryker's mutation score — and is either
one actually available **per function**? Nothing here is implemented, and
nothing here reopens [`docs/spec/no-coverage-floor.md`](../spec/no-coverage-floor.md),
which refused coverage **as a floor**. This is a narrower question: coverage
as one *input term* inside a different formula.

**Bottom line, stated first:** neither term is cleanly available per function
today. Coverage would need a new dependency this repo has already declined
once, and Vitest 4's own default silently drops never-executed functions from
the report rather than scoring them 0 — the exact failure mode
`no-coverage-floor.md` documented for lines, reproduced at function
granularity. Mutation score is already running here, but Stryker's report
schema has no function field at all — a per-function score has to be derived
by intersecting mutant locations against function spans from a separate
parse, and this repo's own numbers show that at real granularity most
functions would get too few mutants for the result to mean anything. Worse:
**no published CRAP implementation substitutes mutation score for
coverage** — the formula's exponents were tuned against coverage percentages,
never against a kill rate, so plugging in a mutation score is naming a new
metric that borrows CRAP's label, not applying CRAP.

---

## 1. Coverage as the term

**What `@vitest/coverage-v8` reports, and at what grain.** Vitest's coverage
report is Istanbul-shaped: `@vitest/coverage-v8`'s own `package.json` lists
`ast-v8-to-istanbul` among its dependencies, which converts V8's coverage
output into the Istanbul `fnMap`/`statementMap`/`branchMap`/`f`/`s`/`b`
structure (github.com/vitest-dev/vitest, `packages/coverage-v8/package.json`).
That structure **does** carry a function boundary per function — Istanbul's
own format doc defines `fnMap` entries as `{name, line, loc, skip}` keyed by
function id, with a parallel `f` object holding call counts per id
(github.com/gotwarlost/istanbul, `coverage.json.md`). But `f` is a **call
count**, not a line-coverage percentage — it says a function was invoked N
times, not what fraction of its body executed. A per-function *percentage*
(the number CRAP needs) requires a second step: intersect `statementMap`
entries by their `loc` against each function's `loc` range and compute the
hit ratio for that subset. Vitest's own coverage guide documents "function
coverage" only as one of the four summary metrics (statements, branches,
functions, lines), with no discussion of exposing a per-function percentage
directly (github.com/vitest-dev/vitest, `docs/guide/coverage.md`). **This
derivation is exactly what one existing tool already does**: `js-crap-score`
takes "an istanbul JSON coverage report as input" and produces "the CRAP
score of each function in the original istanbul report" by this same
loc-intersection (github.com/ahilke/js-crap-score, README). So per-function
coverage is reachable, but only by writing the same kind of join this repo
would also need for a per-function mutation score (§2) — neither engine
reports "per function" as a first-class number.

**Dependency and runtime cost.** This repo currently has **no coverage
tooling at all**, by deliberate decision:
[`docs/spec/no-coverage-floor.md`](../spec/no-coverage-floor.md) §3 lists
`@vitest/coverage-v8` / `@vitest/coverage-istanbul` among the costs it
avoided paying — "neither, no exact-peer coupling to keep in step with
`vitest`, no `@babel/core` tree" — and that decision stands independent of
this question. Adding it now would be a new dependency requiring an ADR per
`AGENTS.md`'s rule, and it pins to an exact Vitest 4 version the way
`@stryker-mutator/vitest-runner` already does (`docs/spec/mutation-scoring.md`
§1: `^9.6.0` "would be a correctness bug, not a style preference").
`@vitest/coverage-v8`'s dependency list (`@bcoe/v8-coverage`,
`ast-v8-to-istanbul`, `istanbul-lib-coverage`, `istanbul-lib-report`,
`istanbul-reports`, `magicast`) is the Istanbul-tooling tree the earlier
decision named and declined.

**Offline, no uploader.** Coverage collection itself is local: it reads V8's
built-in profiler inside the same process running the tests, with the only
documented environment restriction being platforms that don't expose that
profiler at all, e.g. Cloudflare Workers (vitest.dev/guide/coverage.html).
Nothing in coverage generation talks to the network. The network risk
`no-coverage-floor.md` §3 flagged was a **separate uploader step** (Codecov)
outside the Vitest process, invisible to `gates/no-live-network.ts` (G21)
because G21 only intercepts `fetch` inside the suite. A per-function CRAP
computation that stays local — read the JSON, compute, write a trend row —
does not need an uploader and does not reintroduce that risk. That risk is
specific to *publishing* a coverage badge/status, not to *computing* CRAP.

**The `coverage.all` removal, confirmed at function grain.** Vitest's own
migration guide states it plainly: *"In Vitest v4 we have removed
`coverage.all` completely and defaulted to include only covered files in the
report"* and *"If `coverage.include` is not defined, coverage report will
include only files that were loaded during test run"*
(vitest.dev/guide/migration.html). This is the same fact
`no-coverage-floor.md` §Leg 2 already established for lines — *"a pull
request adding a wholly untested module contributes zero lines to numerator
**and** denominator and scores 100%"* — and it transfers to functions without
modification: a function whose file is never imported by any test never gets
a `fnMap`/`f` entry at all, so it is **MISSING from the report**, not present
at 0%. For CRAP, missing means the term is **undefined**, not "high" — the
formula has nothing to compute against. Setting `coverage.include` to the
source globs is Vitest's documented mitigation (same migration guide: *"we
recommend to always define `coverage.include`"*), and community guidance
describes the intent as making untested files appear at 0% rather than
absent. I could not confirm from a primary Vitest source that this reliably
extends to full function-level pre-instrumentation of a file that is *never
touched at all* by any import graph — several still-open Vitest issues
(`#2879` "coverage-istanbul report does not include files with no tests",
`#2674` "Coverage report missing for untested files") describe this exact
gap recurring across versions, which is reason for caution rather than
confidence that `coverage.include` fully closes it. **This is disqualifying
for a per-function CRAP as stated**, for the same reason `no-coverage-floor.md`
found it disqualifying at line grain: a check "structurally green in
precisely the case it exists to catch" is worse than no check, because a
never-tested function — the one case CRAP exists to flag as maximally risky —
is the one most likely to fall into the report's blind spot rather than its
red zone.

## 2. Mutation score as the term

**The report schema.** `mutation-testing-report-schema` (the format
Stryker's `jsonReporter` writes — this repo sets
`jsonReporter: { fileName: 'artifacts/stryker/current/mutation.json' }` in
`stryker.config.mjs`) defines each mutant with `status` (one of `Killed`,
`Survived`, `NoCoverage`, `CompileError`, `RuntimeError`, `Timeout`,
`Ignored`, `Pending`), a `location` (`start`/`end` line and column, 1-based),
and `mutatorName`
(github.com/stryker-mutator/mutation-testing-elements,
`packages/report-schema/src/mutation-testing-report-schema.json`). Files are
keyed by relative path at the top level, so file + location + status are all
present. **There is no function or method field anywhere in the schema** — a
per-function score, like per-function coverage in §1, has to be derived by
grouping mutants whose `location` falls inside a function span computed from
a separate AST parse of the same file. Both terms need the identical kind of
join; neither engine hands you the grouping for free.

**Is there a report on disk to measure against?** No. I searched this
worktree for `artifacts/stryker/`, `.stryker-tmp/`, and any `mutation.json`
and found nothing — both are gitignored (`.gitignore`: `artifacts/`,
`.stryker-tmp/`) and no run has happened in this worktree. Per the task
constraint, I did not run `pnpm mutation:run` to generate one (it takes
"minutes, not seconds," `AGENTS.md` §Commands).

**Estimating from the repo's own figures instead.**
[`docs/spec/mutation-scoring.md`](../spec/mutation-scoring.md) §4 records a
real run: `packages/core/src` full scope — **3,301 mutants across 35 files**,
66.6% score, 5m20s wall time (line 101, line 162). That is **~94 mutants per
file on average**, but the same document shows the distribution is nowhere
near uniform: `packages/cli/src/index.ts` alone is **435 mutants, every one
`NoCoverage`, score 0** (line 142), and `packages/core/src/covers/measure.ts`
is called out as **11 mutants, no spec, split out on purpose** as a
worked example of a near-empty surface (line 238). §4 also notes, at the
*scope* level, that *"one mutant moves that scope 1.47 points"* for a
68-mutant surface (line 214) — the smaller the population, the more one
mutant's fate swings the percentage. A function is a much smaller population
than a scope. If a 35-file, ~3,300-mutant directory divides into, generously,
8-12 functions per file, that is a **rough** 8-12 mutants/function average —
but `measure.ts`'s 11 mutants likely split across 2-3 functions puts several
real functions under 5 mutants already, and any short accessor, guard clause,
or one-branch helper — common in a strict-TypeScript codebase — will land at
0-3. **This is an estimate from existing figures, not a measurement**: no
report exists to count directly, and the task's constraint against running
Stryker here stands. The qualitative conclusion is nonetheless well
supported by the repo's own data: at the granularity CRAP asks for, a large
share of functions would carry mutant counts too small for a percentage to
be stable — the same "1.47 points per mutant" instability §4 already flags
at scope level, amplified.

## 3. Calibration: was CRAP ever tuned against a detection measure?

**No.** Every primary and near-primary source found ties the formula
specifically to coverage, and none discusses mutation testing as an input:

- The original crap4j authors' own writeup states the formula as
  `CRAP(m) = comp(m)² × (1 – cov(m)/100)³ + comp(m)` and defines `cov(m)` as
  *"basis path coverage"* measured by a JUnit-based runner — chosen because
  *"the default JUnit runner does not have the built-in code coverage
  information"* needed (artima.com, "The Code C.R.A.P. Metric Hits the Fan").
  The same piece is candid about the gap: *"we know very well… that you can
  have great code coverage and lousy tests"* — but the fix proposed there is
  supporting more coverage tools (Emma), not a different kind of measure.
- Three independent modern reimplementations all took the same coverage-only
  path: **GMetrics** (Groovy/Grails) requires a `CoberturaLineCoverageMetric`
  instance and never mentions mutation testing
  (dx42.github.io/gmetrics/metrics/CrapMetric.html); **js-crap-score**
  (JS/TS) consumes Istanbul line/statement coverage
  (github.com/ahilke/js-crap-score); **cargo-crap** (Rust) consumes an LCOV
  report from `cargo llvm-cov`, and its own author acknowledges *"Coverage
  can execute a line without asserting the right behavior… fully covered and
  still poorly tested"* without adopting mutation testing as the answer
  (minikin.me/blog/cargo-crap). PHP's `sebastianbergmann/php-code-coverage`
  likewise takes a precomputed `$method->coverage` percentage
  (`src/Report/Crap4j.php`).
- No source search turned up a published paper, blog post, or tool that
  substitutes a mutation score for `cov(m)` in this specific formula, or that
  re-derives the exponents 2 and 3 against a kill-rate distribution instead
  of a coverage distribution. None of the sources above explain *why* 2 and 3
  were chosen at all, beyond that CC ≥ ~30 makes the method un-rescuable by
  any coverage value — the exponents look chosen for that shape, not fit to
  data.

**Consequence for the repo's question.** Swapping in Stryker's score is not
"CRAP with a better untestedness term" — it is a new formula that happens to
reuse CRAP's exponents and its name, with no calibration evidence for either.
That may still be defensible (a kill rate is a more honest "was this tested"
signal than a line-hit rate), but it should be named as a new metric, not
presented as CRAP.

## 4. The honest alternative: two panels instead of a formula

The maintainer could read complexity-per-scope and mutation-score-per-scope
side by side — the trend layer already has both instruments
([`docs/spec/trend-layer.md`](../spec/trend-layer.md),
[`docs/spec/mutation-scoring.md`](../spec/mutation-scoring.md)) — instead of
collapsing them into one number. What that loses:

- **Ranking within a scope.** A single number sorts; two panels don't. If
  the goal is "which function should I look at first," a formula answers
  directly and two panels require the reader to eyeball a scatter.
- **A single alert threshold.** CRAP's own literature leans on one number
  (30) precisely so a CI check or review gate can fire on it. Two panels
  need two thresholds and a rule for combining them, which is most of the
  design work a formula would have hidden.
- **Compression for reporting.** A trend-layer dashboard or a PR comment can
  carry "score: 41" more cheaply than two charts. This repo's own dashboard
  discipline (`docs/commands.md`: *"Read panel 1 before panel 2… there is no
  confidence figure on it and there will not be one,"* ADR-0062) suggests the
  project has already decided in favor of exactly this trade **once before**
  — it prefers a panel a human reads in order over a synthesized confidence
  number, for reasons likely to apply here too.
- **What is *not* lost:** the formula's proven exponents don't transfer
  anyway (§3), and mutation score at function grain is itself noisy (§2), so
  a formula built from these two ingredients would not obviously be *more*
  trustworthy than the panels it replaces — only more compact.

## 5. Recommendation

**Neither term is ready today. Mutation score is the sounder direction if
pursued further, but not by computing CRAP as such.** Reasoning:

- Coverage requires a new dependency this repo has already declined once
  (§1, `no-coverage-floor.md`), and Vitest 4's default behavior drops
  never-tested functions from the report entirely rather than scoring them
  0 — undermining CRAP at exactly the function it is meant to flag as
  riskiest. That is disqualifying as stated, not just costly.
- Mutation score is already running here and needs no new dependency, but
  Stryker's schema carries no function field, so a per-function score is a
  derived join, and this repo's own numbers (§2) suggest a large share of
  real functions would land on mutant counts too small (0-10) to trust as a
  percentage.
- No published source calibrates CRAP's exponents against a detection
  measure (§3), so "CRAP with mutation score" would be a new, uncalibrated
  metric wearing CRAP's name — worth building only with that framed
  honestly, e.g. as a from-scratch weighting decided empirically against
  this repo's own scope data, not as "the CRAP formula."
- The two-panel alternative (§4) is cheap because both instruments already
  exist, and it is what this project has chosen in the one directly
  analogous precedent (the trend dashboard's two ordered panels over a
  synthesized score).

**What is still unknown:**

- Whether `coverage.include` actually forces a 0% (not missing) entry for a
  function whose file is *never touched by any import*, as opposed to a file
  that is imported but only partially exercised — I found guidance that this
  is the intent but not a primary-source confirmation, and found open
  GitHub issues describing the gap recurring across Vitest versions.
- The real (not estimated) distribution of mutants-per-function across this
  repo's scopes — only a live `pnpm mutation:run` plus an AST-based grouping
  script would answer this, and the task deliberately avoided running it.
- Whether a from-scratch, repo-specific weighting of complexity and mutation
  score (not CRAP's exponents) would rank functions usefully — untested
  here and outside this research's scope.
- Whether cyclomatic complexity itself is available per function in this
  repo's toolchain at all — not investigated; this research took CC as given
  by the question and focused entirely on the untestedness term.

---

### Sources

- [`docs/spec/no-coverage-floor.md`](../spec/no-coverage-floor.md) — this
  repo's prior refusal of coverage as a floor; §Leg 2 and §3 sourced directly
  above.
- [`docs/spec/mutation-scoring.md`](../spec/mutation-scoring.md) — this
  repo's Stryker setup and measured mutant counts.
- [`docs/gates.md`](../gates.md) — "Not gated, deliberately" table.
- `stryker.config.mjs`, `.gitignore` (this repo) — report location and
  gitignore status, checked directly; no report present in this worktree.
- Vitest coverage guide — <https://vitest.dev/guide/coverage.html>
- Vitest migration guide (v4) — <https://vitest.dev/guide/migration.html>
- Vitest coverage guide source —
  <https://github.com/vitest-dev/vitest/blob/main/docs/guide/coverage.md>
- `@vitest/coverage-v8` package manifest —
  <https://github.com/vitest-dev/vitest/blob/main/packages/coverage-v8/package.json>
- Istanbul coverage JSON format —
  <https://github.com/gotwarlost/istanbul/blob/master/coverage.json.md>
- Mutation testing report schema —
  <https://github.com/stryker-mutator/mutation-testing-elements/blob/master/packages/report-schema/src/mutation-testing-report-schema.json>
- crap4j authors, "The Code C.R.A.P. Metric Hits the Fan" —
  <https://www.artima.com/weblogs/viewpost.jsp?thread=215899>
- GMetrics CRAP metric docs —
  <https://dx42.github.io/gmetrics/metrics/CrapMetric.html>
- js-crap-score — <https://github.com/ahilke/js-crap-score>
- cargo-crap — <https://minikin.me/blog/cargo-crap>
- `sebastianbergmann/php-code-coverage`, `Crap4j.php` —
  <https://github.com/sebastianbergmann/php-code-coverage/blob/main/src/Report/Crap4j.php>
- Vitest GitHub issues on missing/uncovered files (context for the open
  gap, not primary confirmation): `#2879`, `#2674`.
