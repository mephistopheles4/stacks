# Does `coverage.include` put a never-imported file in the report at 0%?

**Throwaway spike**, branch `experiment/coverage-include-orphan`. Not adopted,
not wired into any pnpm script or gate. Follows on from
`docs/research/crap-untestedness-term.md` on branch
`research/crap-untestedness-term` (not present on this branch — read via
`git show research/crap-untestedness-term:docs/research/crap-untestedness-term.md`),
which could not confirm this empirically and flagged open Vitest issues as
reason for caution. Does not reopen
[`docs/spec/no-coverage-floor.md`](../spec/no-coverage-floor.md), which
refused coverage **as a floor**; this asks whether coverage is even
*computable* per function, a precondition for the CRAP question, not a floor
proposal.

## Answer: yes, present at 0% — not missing

With `coverage.include` set to the eight `stryker.scopes.json` globs, a file
nothing imports gets a full `fnMap`/`statementMap`/`f`/`s` entry, all zero.
Planted `packages/core/src/orphan-spike.ts` (two functions, never imported by
any source or test file). `.coverage-spike/coverage-final.json`:

```json
"fnMap": {
  "0": { "name": "orphanClassify", "loc": { "start": {"line":17,...}, "end": {"line":26,"column":null} }, ... },
  "1": { "name": "orphanSum",      "loc": { "start": {"line":29,...}, "end": {"line":38,"column":null} }, ... }
},
"f": { "0": 0, "1": 0 },
"statementMap": { /* 13 entries */ },
"s": { "0": 0, "1": 0, "2": 0, ..., "12": 0 }
```

Removing `include` entirely: `orphan-spike.ts` is **absent** as a key (report
drops from 93 files to 72). This is the Vitest 4 default the migration guide
describes — *"coverage report will include only files that were loaded during
test run."*

**Generalized, not just the one planted file.** I counted every `.ts` file on
disk matching the eight scope globs (excluding `*.test.ts`): **93**. The
with-`include` report has exactly **93** keys, and every on-disk path matches
a report key 1:1 — `include` pre-instruments the *entire* declared scope, not
only files some test happens to touch. This is the fact the prior research
doc flagged as unconfirmed from a primary source (citing open issues #2879,
#2674); this run confirms it directly for `@vitest/coverage-v8@4.1.10`,
Vitest 4.1.10. The 21 files present without `include` that don't reflect the
full 93 either way are the 28 real never-in-process files `include` adds back
in — `packages/cli/src/index.ts`, `packages/site/src/shelf/scene.ts`,
`scripts/deploy.ts`, `packages/core/src/adapters/vault-adapter.ts` (a
type-only interface file) among them — exactly the files `stryker.scopes.json`
already documents as excluded from mutation testing because they have no
in-process oracle. **Version caveat**: measured on `4.1.10` exactly; the open
issues the prior doc cited were against older/istanbul-provider versions and
may not describe current behavior.

**`coverage.all` (Vitest 3 flag, removed in 4):** setting `all: true` is a
**silent no-op at runtime** — no warning, no error, the run completes
identically. It **is** a `tsc` error under this repo's strict typecheck:

```
vitest.config.ts(44,7): error TS2769: No overload matches this call.
  Object literal may only specify known properties, and 'all' does not exist in type 'CoverageOptions'.
```

So the only place this repo would ever learn `coverage.all` is gone is
`pnpm typecheck`, not the coverage run itself — worth knowing since a
hand-edited config carrying it would look like it "worked."

## Cost

| Run | Wall clock (`Measure-Command` around the pnpm/vitest process) | Vitest's own reported duration |
| --- | --- | --- |
| `pnpm test` (baseline, no coverage) | 12.2–12.5s | 11.4–11.6s |
| `pnpm vitest run --coverage` (full suite, `include` set) | 14.3–15.3s | 12.1–14.3s |
| `pnpm vitest related <file> --coverage --run` (identity.ts only) | 3.3s | 1.8s |

82 test files / 890 tests both ways. Coverage instrumentation adds roughly
**2–3s (about 20%)** to a full run. `related` mode cuts the suite to 23 files
/ 199 tests and the wall clock to about a quarter of the full run — this is
the number that matters for a hook.

**Gates and the network guard, unaffected.** All 82 test files (including
every `gates/*.test.ts`) passed identically under `--coverage` and without
it — same 890/890. `gates/no-live-network.ts` (G21) replaces `fetch` inside
the suite and would fail loudly on any request; nothing failed, so the
coverage run made no network calls. V8-provider coverage instruments via
Node's built-in profiler outside the source text (unlike Istanbul's
line-injection), so it does not touch `process.cwd()` or rewrite source the
way `docs/spec/no-coverage-floor.md`'s Stryker-sandbox caveat (`gates/repo.ts`
resolving `REPO_ROOT` from `process.cwd()`) describes for Stryker's sandbox —
that risk is specific to Stryker's separate sandbox copy, not to running
coverage in-place, and nothing here reproduced it.

## Per-function derivation

A ~40-line script (`scratchpad/per-function.mjs` at spike time) intersects
`statementMap` entries against each `fnMap` entry's `loc` (the function's full
body span — `decl` is only the name token, too narrow) and reports
hit/total per function. `js-crap-score` (cited in the prior research doc) does
the same join; this reproduces it directly against a real report.

Orphan file — both functions 0/N statements, 0.0%, as expected:

```
orphanClassify  calls=0  0/7 statements  0.0%
orphanSum       calls=0  0/6 statements  0.0%
```

`packages/core/src/identity.ts` (imported, exercised, comparison case) —
`toObsidianTag` is called from `obsidian-adapter.ts`'s `writeBook` but has no
dedicated test in `identity.test.ts`; `titleMatchScore` and `rankingScore` are
each missing one statement:

```
normaliseIsbn        calls=223   1/1    100.0%
isValidIsbn          calls=64    15/15  100.0%
toObsidianTag         calls=21    3/4    75.0%
normaliseTitleAuthor  calls=1690  1/1    100.0%
isProbablySameBook    calls=250   13/13  100.0%
titleMatchScore       calls=408   8/9    88.9%
rankingScore          calls=69    9/10   90.0%
(anonymous_7/9/11)     ...        1/1    100.0%
```

**Reliability, named functions:** clean and exact — every declared function
in the file resolved to a distinct `fnMap` entry with a correct `loc` span,
and the intersection matched Vitest's own claimed line/statement counts.

**Reliability, nested/arrow functions — a real caveat:** Istanbul's `fnMap`
*does* include them (three `(anonymous_N)` entries above are arrow-function
callbacks inside `isProbablySameBook`/`titleMatchScore`/`rankingScore`), so
they are not dropped. But they carry no stable name — `anonymous_7` is a
**positional id**, and a rename or reorder of surrounding code can shift which
id an unrelated arrow function gets. A per-function CRAP time series keyed by
name would misattribute history across a refactor for every nested arrow; a
series keyed by `(file, decl.start.line)` would be more stable but still
breaks on an inserted line above it. This is a derivation-design problem, not
a blocker, but it means "per-function" for CRAP purposes has to decide what
counts as a function identity before the numbers mean anything across commits.

## `related` mode and the hook case

`pnpm vitest related packages/core/src/identity.ts --coverage --run` selected
23 of 82 test files transitively touching `identity.ts` and produced
**identical** per-function numbers for `identity.ts` to the full run (every
statement/call count matched). `related` follows Vite's static import graph,
so any test that imports `identity.ts` — directly or transitively — was
included; nothing here found a gap. Two caveats worth stating plainly for a
hook: (1) this is one favorable file where all its consumers are statically
imported — a file only reached through a dynamic `import()` or an
out-of-process runner would not get credited by `related` at all; (2) the
`related` report still contains **every** file matching `coverage.include`,
not just the changed one — a hook computing CRAP for the changed file must
read only that file's row out of the JSON, not treat the whole report as
scoped to `related`'s selection, or it will read stale/zero numbers for files
the related run's test subset never touched.

## Feasibility and cost for a pre-commit/pre-push hook

**Mechanically feasible, cheap per invocation, expensive as a standing
decision.** `related --coverage` costs about 3s wall clock for one file's
transitive test set — acceptable for a hook. The derivation script is ~40
lines and reliable for named functions. But:

- It requires `@vitest/coverage-v8`, pinned exactly to the installed `vitest`
  version, as an ADR-worthy new dependency this repo has already declined
  once (`docs/spec/no-coverage-floor.md` §3) — reopening that decision, even
  narrowly, needs the same weighing that spec did, not a silent reinstatement
  through a hook.
- Coverage is silently absent for any file reached only through an
  out-of-process oracle (browser render, `spawnSync`, `tsx` script runner) —
  28 real files in this repo alone, already enumerated by name in
  `stryker.scopes.json`'s own exclusion list. A per-function CRAP for one of
  those would read 0% and rank it maximally risky despite a real oracle
  existing outside Vitest's view — the identical failure mode
  `no-coverage-floor.md` found disqualifying for lines, reproduced at
  function grain.
- Function identity across commits (the nested-arrow caveat above) needs a
  deliberate design choice before a CRAP *trend*, as opposed to one snapshot,
  is trustworthy.
- Per the companion research doc (`crap-untestedness-term.md`), no published
  CRAP implementation substitutes anything else for coverage, and this repo's
  own mutation-score numbers suggest most real functions get too few Stryker
  mutants to trust a percentage either — so even with this spike's coverage
  question answered, CRAP-as-published still needs the coverage term, which
  is the dependency this repo declined.

**Recommendation:** the coverage-availability half of the question is settled
— `coverage.include` works as advertised, cheaply, for in-process code. That
does not by itself clear CRAP for a hook. Adoption would need: an ADR
accepting `@vitest/coverage-v8` as a dependency (reopening a closed decision,
narrowly), an explicit function-identity scheme, and an explicit answer for
the 28 out-of-process files — none of which this spike was scoped to decide.
