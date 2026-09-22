# Incremental mode is not score-neutral, and it is still worth running locally

**2026-09-22** — [#347](https://github.com/mephistopheles4/stacks/issues/347).
`SCORE_NEUTRAL_OPTIONS` in `scripts/lib/floors.ts` listed `incremental` and
`incrementalFile` as options that *"decide where output goes, and nothing
else"*. Nobody had tested that. This entry is the test.

## The answer

**Neutral fails.** Stryker's `--incremental` carries a verdict forward whenever
a mutant's own text and the set of tests covering it look unchanged. Two kinds
of edit change neither, and both produced verdicts a fresh full run on the
identical tree contradicts:

- **A fixture a spec reads.** Removing `"Books"` from
  `fixtures/api/apple-search-hit.json` left three mutants `Killed` in the
  incremental report — *"0 files changed, 10644 of 10644 mutant result(s) are
  reused"* — where the full run said `Survived`.
- **A one-line source edit elsewhere in the same file.** A redundant filter at
  the call site of `genresOf`, on line 108 — 17 to 61 lines from the three
  mutants at 47, 125 and 127 — masks the same three. Stryker saw the file change,
  re-ran the ten new mutants on that line, and reused the three stale kills.

A third plant diverges without moving the score: excluding a spec from
`vitest.stryker.config.ts` left 32 mutants `Survived` where the full run said
`NoCoverage`. Both statuses are undetected, so the percentage is the same, but
the per-file lists of surviving versus uncovered mutants are not.

**Both entries are removed from `SCORE_NEUTRAL_OPTIONS`**, so the list and its
own definition agree again. Today that moves no stamp — `stryker.config.mjs`
carries neither key, and `pnpm mutation:stamp --check` still reports the same
hash — but writing either into the config file now moves `configHash`, and G56
refuses it. ⚠️ **The brief said to keep them**, reasoning that they only matter
inside the config file. That is exactly where keeping them was wrong: listed,
`incremental: true` in the config would have been hashed away, and the change the
comment called *"the change to refuse"* would have passed silently. Both review
axes found it. A spec in `floors.test.ts` now holds it, planted red against the
old list.

**A command-line flag is outside the list's reach either way.**
`configHashOf` reads only the object `stryker.config.mjs` exports, so
`stryker run --incremental` is stamped exactly like a full run. What keeps
verdict reuse out of the trend store is the nightly's fresh checkout:
`metrics.yml` runs plain `pnpm mutation:run` on a new runner that caches only
the pnpm store. That guarantee is recorded in `docs/gates.md` under *Not gated,
deliberately*.

**It is still worth using while you work**, as a triage aid and never as a
score. See [`docs/commands.md`](../commands.md#incremental-runs-are-fast-and-they-are-not-a-score).

## Why reuse goes stale — read from the source, then planted

`IncrementalDiffer` in `@stryker-mutator/core@9.6.1`
(`dist/src/mutants/incremental-differ.js`) reuses an old verdict when:

- the mutant's own source span is unchanged, found by `diff-match-patch` over
  the mutated file only; and
- for a `Killed` mutant, at least one old killing test still covers it
  unchanged; or, for any other status, no *new* test covers it.

Per-test coverage is **re-collected by the dry run on every incremental run**,
which is what caught the span plant below — a plant the source reading
predicted would go stale.
The failure needs the covering tests to be identical and the outcome to
differ. A fixture, a helper outside the mutated span, and a lost test (the
survived-mutant rule only looks for *added* tests) each do that.

## Mapping granularity — per test for coverage, per file for change

**Coverage is per test.** Across the 9,386 `Killed` and `Survived` mutants of
the baseline, `coveredBy` lists a median of 8 tests (p25 3, p90 44, max 161).

**Change detection is per spec file**, because the Vitest runner reports no
test location. The baseline report's `testFiles` holds 84 spec files and
1,407 tests, and every test is `{ id, name }` and nothing else, for example
`{"id":"0","name":"G39 — the harness reaches the check at all gets past a fresh record, and prints it"}`.
The differ therefore gives every test a span of line 0 to infinity. The
control plant proves it: one `it.skip` in
`packages/core/src/adapters/update-book.test.ts` logged
*"Tests: 1 files changed (+6 -7)"*, which is all seven tests in that file
removed and six re-added. Eighty-nine mutants were re-run.

So a spec edit re-runs **too much, never too little**. A helper defined in a
non-spec file is the opposite: invisible.

## Method

Every run went through one wrapper that timed it, kept the log, and copied
`artifacts/stryker/current/mutation.json` out before the next run overwrote it.
Every `--incrementalFile` sat under the ignored `artifacts/stryker/347/`.
Before the no-change control ran, the baseline's results file was copied to
`base.incremental.pristine.json`; that control then reused `base.incremental.json`
in place, and every plant after it started from its own copy of the pristine
file, so no plant's reuse fed another's. The commands, exactly as run:

```sh
# Baseline, and the no-change control (the same command twice)
pnpm exec stryker run --incremental --incrementalFile artifacts/stryker/347/base.incremental.json

# control, span, fixture: incremental, then plain full, on the identical tree
pnpm exec stryker run --incremental --incrementalFile artifacts/stryker/347/control.incremental.json --logLevel debug
pnpm exec stryker run
pnpm exec stryker run --incremental --incrementalFile artifacts/stryker/347/span.incremental.json --logLevel debug
pnpm exec stryker run
pnpm exec stryker run --incremental --incrementalFile artifacts/stryker/347/fixture.incremental.json --logLevel debug
pnpm exec stryker run

# mask: narrowed to the one file
pnpm exec stryker run --incremental --incrementalFile artifacts/stryker/347/mask.incremental.json --logLevel debug --mutate packages/core/src/metadata/apple-books.ts
pnpm exec stryker run --mutate packages/core/src/metadata/apple-books.ts

# config: narrowed to the 17 files the excluded spec's tests reach
pnpm exec stryker run --incremental --incrementalFile artifacts/stryker/347/config.incremental.json --logLevel debug --mutate packages/core/src/adapters/obsidian-adapter.ts,packages/core/src/add-book.ts,packages/core/src/covers/cache-cover.ts,packages/core/src/covers/cover-keys.ts,packages/core/src/covers/cover-source.ts,packages/core/src/frontmatter.ts,packages/core/src/metadata/apple-books.ts,packages/core/src/metadata/google-books.ts,packages/core/src/metadata/index.ts,packages/core/src/metadata/open-library.ts,packages/core/src/metadata/precedence.ts,packages/core/src/metadata/types.ts,packages/core/src/test-support.ts,packages/core/src/identity.ts,packages/core/src/key-if-present.ts,packages/core/src/metadata/oreilly.ts,packages/core/src/types.ts
pnpm exec stryker run --mutate <the same 17 files>

# Last: a plain full run on the committed tree, so `current/` holds a real report
pnpm exec stryker run
```

Reports were compared **mutant by mutant**, keyed exactly as Stryker's own
`mutantToIdentifyingKey` keys them: file, start and end position, mutator and
replacement. The report's mutant `id` is only unique within one report, so it
was never used. Each plant was reverted with `git checkout -- <file>` after
`git status` showed only that file.

**Two plants ran narrowed with `--mutate`**, on both sides identically. The
dry run still executes all 1,407 tests, and reuse is decided per mutant, so the
verdicts inside the scope are unaffected. The file list for the config plant was derived
from the baseline's coverage rather than guessed: every file holding a mutant
any test in the excluded spec covers, 17 of them.

## Results

| Plant | What changed | Scope | Compared | Stale | Load noise |
| --- | --- | --- | --- | --- | --- |
| no change | nothing | full | 10,644 | 0 | 0 |
| control | `it.skip` on the one test that kills four `updateBook` mutants | full | 10,644 | 0 | 6 |
| span | a duplicate guard above `updateBook`'s frontmatter check | full | 10,649 | 0 | 6 |
| fixture | `"Books"` removed from `fixtures/api/apple-search-hit.json` | full | 10,644 | **3** | 6 |
| mask | redundant `Books` filter at `apple-books.ts:108` | `apple-books.ts` | 95 | **3** | 0 |
| config | `add-book.test.ts` excluded in `vitest.stryker.config.ts` | 17 files | 2,188 | **32** | 0 |

**The must-flip control was caught.** In the full run, the four `updateBook`
mutants flipped — `obsidian-adapter.ts` 96:35 and 97:23 to `NoCoverage`, 96:9
(`ConditionalExpression`, `OptionalChaining`) to `Survived` — and the incremental
run, through the byte-identical invocation, agreed on all four.

**The span plant was caught too, and that was not the prediction.** It is a
behaviour-preserving refactor: the new guard throws the same message for exactly
the inputs the old check did, since the pattern's one group always participates
when it matches. But the guard stopped the no-frontmatter test from reaching the
old check, so the covering tests changed and all ten affected mutants were
re-run. Its 51 s stands as the one-file-refactor timing.

**Both columns count incremental-against-full disagreements on the planted
tree.** *Stale* is the ones the plant caused; *load noise* is the ones two plain
full runs also disagree on, explained below.

**The stale mutants, by name:**

- Fixture and mask, the same three, `Killed` kept against `Survived`:
  `apple-books.ts` 47:23 `StringLiteral` (`GENERIC_GENRE` → `""`), 127:24
  `ConditionalExpression` (`true`) and 125:17 `MethodExpression` (the Books
  filter removed).
- Config, all 32 in `packages/core/src/add-book.ts`, `Survived` kept against
  `NoCoverage`: 58:44 ArrayDeclaration, 85:92 StringLiteral, 125:19
  MethodExpression, 125:40 LogicalOperator, 126:45 EqualityOperator, 135:13
  LogicalOperator, 135:31 StringLiteral, 136:21 StringLiteral, 137:21
  StringLiteral, 137:29 ConditionalExpression, 138:21 StringLiteral, 144:21
  StringLiteral, 145:21 StringLiteral, 147:7 StringLiteral, 148:7
  ConditionalExpression, 150:21 StringLiteral, 151:21 StringLiteral, 152:21
  StringLiteral, 153:21 StringLiteral, 164:7 ConditionalExpression, 192:18
  MethodExpression, 193:25 MethodExpression, 194:7 ConditionalExpression, 217:7
  ConditionalExpression, 217:7 EqualityOperator, 219:17 ConditionalExpression
  (twice, two spans), 219:17 LogicalOperator, 219:44 ConditionalExpression, 221:9
  ConditionalExpression, 224:35 LogicalOperator and 224:45 StringLiteral. The
  112 mutants whose *killing* test vanished were re-run correctly.

**Load noise is not staleness, and it is named so it is not mistaken for it.**
Six mutants disagreed in each of the three full-scope pairs, but not the same
six each time. In the control and span pairs they were `scripts/lib/metrics.ts`
746:13, 783:7, 783:43, 786:13 and 787:16, and `scripts/lib/pr-conventions.ts`
212:44 (`Timeout` against `RuntimeError`). In the fixture pair, 746:13 and 783:43
held still and 635:55 and 721:54 moved instead. Every `metrics.ts`
flip is a static mutant whose kill reads *"Test timed out in 5000ms"* — Vitest's
per-test timeout, not Stryker's `timeoutMS` — and **two plain full runs
disagree on them with each other**, so they cannot be attributed to reuse.
Three other sessions were running on the machine throughout.

⚠️ **The same mechanism reaches a plain run with no plant at all.** A last full
run after every plant was reverted, taken so `artifacts/stryker/current/` ends holding a
real report, disagreed with the baseline on seven `metrics.ts` mutants — 635:55,
655:16, 717:11, 746:13, 751:13, 783:7 and 785:15 — every kill again *"Test timed
out in 5000ms"*. That is about 0.07 points, against the 0.01 noise band
`stryker.config.mjs` records for `timeoutMS` on a quiet machine. The floors are
calibrated on CI runners, not a shared workstation, so this is recorded as an
observation and not acted on here.

## What it saves

One machine, 32 logical processors, shared with three other sessions:

| Run | Wall time |
| --- | --- |
| Full, 10,644 mutants (baseline) | 1,074 s |
| Full, plain, on a planted or a reverted tree | 799–949 s |
| Incremental, nothing changed | 52 s |
| Incremental after a one-file refactor (span) | 51 s |
| Incremental after a test-only edit (control) | 86 s |

**The floor is the dry run**: about 44 s of the 52, every time, because
coverage is re-collected from all 1,407 tests. That dry run is also what made
the span plant safe.

## Where it may be used

- **Locally, while working, as a triage aid.** It answers *which mutants moved
  in the code I just touched* in about a minute, against 13–18 minutes for a
  full run.
- **Never for a number anyone quotes**, and never in CI or the nightly. A scope
  score for a before-and-after comparison comes from plain
  `pnpm mutation:run`.
