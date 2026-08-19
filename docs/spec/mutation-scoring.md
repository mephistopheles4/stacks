# Mutation scoring — Stryker, the scopes, and what a score is allowed to mean

Sources: [#109](https://github.com/mephistopheles4/stacks/issues/109) (does it
run), [#114](https://github.com/mephistopheles4/stacks/issues/114) (what it
costs), [#116](https://github.com/mephistopheles4/stacks/issues/116) (what is
scored), [#140](https://github.com/mephistopheles4/stacks/issues/140) (the
structural half of the scope check).

**This is not a new proposal.** `docs/gates.md` parked mutation testing with an
explicit revisit condition — *"Revisit once the rows above are green"* — and all
35 rows are ✅. This is the parked decision coming due.

⚠️ **The parked row's own cost estimate is wrong by enough to matter.** It says
*"133 tests in ~2s"*; measured at `1d0548f`, the suite is **636 tests across 66
files in 5.52s**. Mutation cost scales with suite runtime, so the premise that
made Stryker *"genuinely cheap"* is weaker than recorded. The row is corrected —
see [§8](#8-what-lands-where).

**Audience: both.** The versions and the three startup fixes are stacks-specific
facts about one toolchain; **the unit rule in [§3](#3-the-unit-is-the-oracles-mechanism-not-the-directory)
is the transferable half**, and it is the part worth carrying.

---

## 1. The dependency

```
@stryker-mutator/core          9.6.1   (pinned exactly)
@stryker-mutator/vitest-runner 9.6.1   (pinned exactly)
checkers: []
```

**`^9.6.0` would be a correctness bug, not a style preference.** `9.6.1`
(2026-04-10) is the *first* release that works against Vitest 4; its changelog
entry is *"vitest-runner: fix vitest runner mutant hitcount and coverage for
v4.1"*, closing an issue titled *"No proper coverage with Vitest 4 … completely
uncovered functions are mutated and affect the resulting score."* **9.6.0
produced a plausible wrong number, not a crash.** Pin exactly.

⚠️ **The peer range is worthless evidence and the spec says so.** `vitest:
">=2.0.0"` was set in `9.0.0` on 2025-05-13, **five months before Vitest 4.0
existed**, and never moved while the pair was broken. The support is real; the
*evidence* is the changelog and the code, never the range.

**`checkers: []` — the TypeScript checker is dead here and cannot be revived.**
`typescript@7.0.2`'s root export no longer carries the APIs
`typescript-checker@9.6.1` calls. ⚠️ **Its peer range `">=3.6"` admits `7.0.2`**,
so pnpm installs a combination that fails at runtime rather than refusing — the
cleanest specimen this effort found of a range *asserting* a compatibility that
does not exist. Dropping the checker costs little: Vitest transpiles through
esbuild and never type-checks, so a mutant that would fail `tsc` still runs and
gets a real verdict. Measured across eight runs: `CompileError` 0,
`RuntimeError` 0–1.

**ADR owed.** `CLAUDE.md` requires a record per dependency and Stryker is a large
tree. See [`after-the-scoreboard.md`](after-the-scoreboard.md#what-belongs-in-docsadr).

### ⚠️ Three things must be fixed before a single mutant runs

Every one of them contradicts the compatibility research, in the same direction
each time: reading a published tarball sees what the source *says*, not what the
run *does*. **An implementation session that skips these gets three failures
whose messages point somewhere else.**

1. **`@stryker-mutator/core` *does* touch `typescript`, and Stryker crashes on
   startup under TS 7.** `ts-config-preprocessor.js` does `await
   import('typescript')` — a **dynamic** import, invisible to a grep — and calls
   `ts.parseConfigFileTextToJson`, the exact function with no TS 7 replacement.
   Worked around by pointing `tsconfigFile` at a filename not in the project, so
   the rewrite becomes a no-op. ⚠️ **Safe here specifically**: the preprocessor
   exists to rewrite `extends` and `references` paths escaping the sandbox, and
   this repo's `tsconfig.json` extends a file inside the project and declares no
   `references`. **A repo with a real project-references graph does not get this
   escape**, and for it Stryker 9.6.1 is simply blocked under TypeScript 7 —
   which is a transferable warning, not a stacks footnote.
2. **Stryker's default plugin glob loads nothing under pnpm.** Both packages
   install and symlink correctly; the child runner process resolves none of
   them. `plugins: ["@stryker-mutator/vitest-runner"]` fixes it.
3. **Specifying `mutate` replaces Stryker's default array — including its
   `!**/*.test.ts` negation.** The first successful run mutated the test suite:
   **2,665 of 5,966 mutants were mutations of `*.test.ts` files**, and the report
   listed `frontmatter.test.ts` and friends with scores beside them. The headline
   read 57.86% against a real 66.59%.

   ⚠️ **That third one is a gaming specimen where nobody gamed anything** — a
   scoping mistake, invisible in the summary line, producing a number wrong by
   nine points. **It was caught by reading a per-file table, which no dashboard
   would have shown.** It is why [§6](#6-the-scope-check-splits-by-what-evidence-it-can-reach)
   gates the scope list rather than commenting it.

---

## 2. What it costs

Measured on `experiment/stryker-cost` at
[`b8ce094`](https://github.com/mephistopheles4/stacks/commit/b8ce094); per-file
counts for all eight runs are committed there as `stryker-runs-114.json`.

| | |
| --- | --- |
| `packages/core/src`, full scope | **5m20s**, **66.6%**, 3,301 mutants across 35 files |
| Machine | 16 cores / 32 threads; Stryker chose **31 runner processes** |
| ⚠️ **Extrapolated to a 4-vCPU `ubuntu-latest` runner** | **~41 min** for core alone, ~50 for the wider scope |
| Noise band, Stryker's default timeout | **0.36 points** |
| Noise band, `timeoutMS: 120000` | **0.01 points** — six runs, two of them byte-identical to a third, mutant for mutant |

**The variance this repo has is a configuration artifact, not the upstream bug.**
[stryker-js#6073](https://github.com/stryker-mutator/stryker-js/issues/6073) —
open, root-caused, unfixed — does reproduce, and is **confined to `static`
mutants**: 0 false survivors in core across six runs, 5 in the wider scope, all in
one file (`packages/site/src/shelf/head-cap.ts`), all static. That is the same
population as the twelve timeout flips.

⚠️ **~41 min against `gates.yml`'s `timeout-minutes: 20` is why the nightly lives
in its own workflow** ([`trend-layer.md`](trend-layer.md)), and why on-merge is
recorded as a later move rather than a current one.

⚠️ **Nobody has ever run Stryker on a runner**, and the failure direction is the
bad one: if 120s is tight on a slower machine, mutants cross into timeout, timeout
counts as *detected*, and the score reads **higher**. A floor calibrated on a
16-core workstation would be flatteringly high. That is what
[`the-ratchet.md`](the-ratchet.md)'s calibration window exists to expose, before
anything refuses.

---

## 3. The unit is the oracle's mechanism, not the directory

**The question "which directories are scored" is derivable rather than debatable,
once one thing is measured: a mutation score means something only where a spec
executes the code in-process.** This repo has four kinds of oracle and **three of
them produce a zero that measures the harness rather than the tests.**

| Oracle | Example | What a mutation run reports |
| --- | --- | --- |
| in-process import, assert on behaviour | `library.test.ts` → `library.ts` | a real score |
| **source-text regex** | G14 reads `packages/cli/src/index.ts` as *text* | nothing — no import edge, so `vitest.related` never pulls the spec in |
| **subprocess drive** | `gates/deploy-branch.test.ts` spawns `scripts/deploy.ts` under `tsx` | nothing — the child never sees the active mutant |
| **browser drive** | `smoke:render` → `scene.ts` | nothing — not a Vitest spec at all |

⚠️ **The decisive number is in the directory that looked easy.**
`packages/cli/src/index.ts` is **435 mutants, every one `NoCoverage`, score 0** —
*not* untested, since **G14 checks it by regex over its source text**, which kills
nothing and never could. So `packages/cli/src` reads **5.4% with 88% of that
denominator structurally invisible**, and published as-is it invites deleting the
code Stryker cannot see. **A number that invites the wrong action is worse than no
number**, and it turned out to be worst in the directory nobody was worried about.

**This is the transferable half of the whole piece.** *Score only what an
in-process oracle reaches, and name the mechanism that puts everything else out of
reach* transfers to any codebase; the eight scopes below do not.

---

## 4. Eight declared scopes — reachable only, declared never discovered

**Directory rollups first** — these are *packages*, not declared scopes, and the
distinction is load-bearing enough to have its own warning below:

```
                       whole directory        reachable half
packages/core/src/**   3301 mutants  66.6%    3301  66.6%   (nothing excluded)
packages/cli/src/**     573 mutants   5.4%      68  45.6%   (505 excluded)
packages/site/src/**   3612 mutants  19.6%    1503  47.1%   (2109 excluded)
```

**The declared scopes:**

| Scope | Glob | Mutants | Score |
| --- | --- | --- | --- |
| `packages/core/src` | **non-recursive** — the files directly in it | 1227 | 71.7% |
| `packages/core/src/adapters` | recursive | 366 | 66.9% |
| `packages/core/src/covers` | recursive | 493 | 62.3% |
| `packages/core/src/import` | recursive | 256 | 66.0% |
| `packages/core/src/metadata` | recursive | 959 | 62.3% |
| `packages/site/src/shelf` (reachable) | recursive, minus the exclusions | 1503 | 47.1% |
| `packages/cli/src` (reachable) | recursive, minus the exclusions | 68 | 45.6% |
| `scripts/` (reachable) | one file — see §5 | **unmeasured** | — |

**The five core rows partition `packages/core/src/**`; they do not sit beside
it.** The declared scope `packages/core/src` at 1227 is the files **directly** in
it, and 3,301 at 66.6% is the union of all five rather than a ninth scope.

⚠️ **One string, two populations, and the spec says which is which because the
implementer cannot tell from the name.** `packages/core/src` is a **declared
scope** at 1227 mutants / 71.7% *and* a **directory rollup** at 3,301 / 66.6%.
Nothing about the name distinguishes them, so **an implementer who writes
`packages/core/src/**` where this table means non-recursive silently declares the
union** — four of the eight scopes vanish into it, their floors with them, and
`mutation-scope`'s partition assertion is what goes red. **The glob is the scope's
definition; the name is only its identity.** Recorded here rather than left to be
discovered because the two numbers are five points apart, and a floor derived from
the wrong one is slack forever with nothing able to notice.

⚠️ **#114's *"all 18 `packages/core/src/*` directories"* is 5** — the glob matches
18 entries, 14 of them files — and it is mildly load-bearing, since the
granularity decision rests on how many floors exist.

⚠️ **`scripts/` has never been measured and this spec invents no number for it.**
No run included it; the widest scope was abandoned at the dry run.
`scripts/lib/public-build.ts` is 386 *lines*, which is not a mutant count. **The
first implementation session measures it.**

**Scope stability is stronger than #114 stated**: re-derived across the core-only
and wide runs, every per-scope delta is exactly `0.00` — agreement, not rounded
agreement. A floor on one scope does not move when another scope's membership
changes, which is one fewer way for a floor to be argued down.

**Full depth, declared not derived.** Folding small scopes into their parents was
put and rejected: it derives the scope *structure* from the measurement, which is
the same move as deriving the exclusion list from the numbers.

⚠️ **The cost, stated rather than smoothed:** `packages/cli/src`'s reachable
surface is one file at **68 mutants, so one mutant moves that scope 1.47 points.**
That is handed to [`the-ratchet.md`](the-ratchet.md) as an input, and it is where
the first floor lowering will land.

**Package boundaries cannot express this**: `gates/` and `scripts/` are in the
Vitest project and in no package, so the directory-or-package question answers
itself the moment either is considered.

---

## 5. The exclusion list: named files, a mechanism each

**Two reasons only, and there is no third.** A file is excluded because a named
mechanism puts it out of reach, or it is not excluded.

⚠️ **The criterion is the mechanism, never the measurement.** The report cannot
tell **unreachable** (`scene.ts`, 840 mutants, whose only oracle drives a browser)
from **untested** (a new module nobody wrote a spec for) — both are 100%
`NoCoverage` and both score 0. Excluding *"anything at 100% NoCoverage"* would be
[#110](https://github.com/mephistopheles4/stacks/issues/110)'s `coverage.all`
finding rebuilt by hand, and it would classify inconsistently on its own terms:
`cover-viewer.ts` is 20 `NoCoverage` **+ 1 Survived**.

**The case that forced the rule is inside the flagship scope.**
`packages/core/src/covers/measure.ts` — 11 mutants, no spec, split out on purpose
so `backfill-covers.ts` could be tested without generating real images. It is
importable, has two real branches, and could be specced with a stub. **So it is a
gap, and it stays in the denominator.** *"It is only glue"* is the most available
excuse for excluding anything, and **a seam extracted to make its caller testable
is precisely the code an AI asked to raise a score would extract further.**
`packages/core/src`'s exclusion list is therefore **empty**.

`scripts/` is a scope of one file and it is the publisher's:
`scripts/lib/public-build.ts`, carrying `NOTE_BODY_CANARY` and
`PUBLIC_BUILD_RULES`, is the only file in it any spec executes in-process.

| Excluded from `scripts/` | Mechanism |
| --- | --- |
| `deploy.ts` (580 lines) | only oracle is `spawnSync` in `gates/deploy-branch.test.ts`; the child never sees the active mutant |
| `lib/repo-root.ts` | G22 reads it as text via `codeOf`, never imports it |
| `check-public-build.ts`, `smoke-render.ts` | run by `tsx` from a pnpm script; never a Vitest spec |
| `lib/git.ts`, `lib/run.ts`, `lib/walk.ts`, the `make-*` and `capture-*` one-offs, `dev-watch.ts`, `worktree.ts` | no spec imports them |

⚠️ **Two of those are testability defects rather than facts of nature** —
`deploy.ts` is the most irreversible code in the repo, and `gates/repo.ts` weakens
twenty checks if it is wrong. Both are unreachable *because of how they are
structured*. **The exclusion list therefore doubles as a register of them**, which
is the one genuinely useful by-product of writing a mechanism beside every entry.

⚠️ **A residual nothing here closes: appending logic to an already-excluded file
is invisible to both halves of the scope check.**

⚠️ **And *"no spec imports them"* is a mechanism the attacker controls** — unlike
*"the child never sees the active mutant"*, which is a property of the harness.
Recorded as the weaker half of the list.

### `gates/` is out, for a measured reason

`gates/repo.ts:13` is `REPO_ROOT = resolve(process.cwd())`. **Stryker's sandbox is
not the repository**, so in a sandbox every repo-shape gate silently retargets at
a copy of the tree: four gates shell out to git into a directory that is not a
checkout, and G23 regex-matches source text Stryker has rewritten by construction.
Mutating anything under `gates/` pulls those specs in and the run dies at the dry
run. **Any gate asserting on the shape of the source is unrunnable inside a
mutation sandbox.**

⚠️ **G5's own `expectFound(…, 20)` anti-vacuity guard is what caught this.**
Without it, three repo-shape gates would have passed **vacuously against a copy of
the tree**. *A gate that cannot tell it is being run against the wrong tree is not
yet a gate either.*

**The return condition is written down**, which makes *out* a reversible
measurement fact rather than a ruling: `REPO_ROOT` resolved from a marker rather
than from `cwd`. The instrument for a gate stays the register's **observed-red**
field, which does what a mutation score cannot.

⚠️ **One finding recorded rather than repaired, and it is the sharpest here.**
*"A gate is the last thing in the chain, so nothing can notice it being wrong"* is
**false for `gates/repo.ts`**: it is not a gate, it is a 144-line shared library
holding `codeOf`, `tableCells` and `expectFound`, **20 of the 29 gate specs import
it, and it has no spec of its own.** Those 20 gates *are* its oracles, so it is the
one place in `gates/` a mutation score would answer a real question, and the one
place a subtle error weakens twenty checks at once. **A gap, not an exclusion.**

---

## 6. The scope check splits by what evidence it can reach

**A scope list living only in `stryker.config` is *a rule nothing can fail on*.**
Excluding a directory removes it from numerator and denominator together, so the
score does not move — it simply stops covering that code, and the trend layer's
"is this real" panel has nothing to show. **The change is invisible in the
instrument designed to catch changes.**

The claim has two halves with different evidence available, and
[#141](https://github.com/mephistopheles4/stacks/issues/141) sorted them with
Clause B:

| Direction | Depends on how much test code exists? | Lands as |
| --- | --- | --- |
| every declared scope exists on disk; every source directory is declared-or-excluded; every exclusion carries a non-empty mechanism; no overlap; `expectFound` floors on both lists | **No** — the disk answers | **gate**, in `pnpm test` |
| **a declared scope's glob matches at least one file** | **No** | **gate**, same spec ([#140](https://github.com/mephistopheles4/stacks/issues/140)) |
| the glob matched files and **Stryker still produced zero mutants** | **No** — mutants come from source | **gate**, at `pnpm deploy:site` |
| an excluded file produced ≥1 **executed** mutant | **Yes** — write a test that touches it and it flips | **trend**, the `live-exclusions` series |

### G37 `mutation-scope` — Contract seams, two surfaces, one row

⚠️ **`mutation-scope` is a wider row than any existing one**, naming a `pnpm test`
assertion *and* a deploy refusal under one slug, and `docs/gates.md` has no column
saying which surface a row runs on. **Stated here rather than found later.**
G17 (`deploy-branch`) is the precedent that makes the deploy half spec-able: it
drives `scripts/deploy.ts`'s refusal logic onto a scratch repository via `GIT_DIR`
rather than asserting live state.

**Why the zero-denominator clause splits at the evidence.** Walking its causes —
the owner's question was *"if we block then we should fix something, what would we
fix?"*, which is Clause A applied to a refusal that had never been tested against
it — every cause is a declaration or config fault needing no mutation run to
detect:

| Why a declared scope empties | Remedy |
| --- | --- |
| file renamed or moved; the glob stops matching | point the scope at the new path — one line |
| an exclusion widens until it covers the last file | narrow the exclusion — one line |
| the `mutate` config changes | fix the config — one line ([§1](#1-the-dependency)'s third fix is this case, live) |
| the code genuinely went away | **delete the scope** — floors file and Stryker config |
| Stryker crashed mid-run | not this clause — a crash writes `run_ok 0`, see [`trend-layer.md`](trend-layer.md) |

**So the common case is caught at merge, in two seconds, in front of whoever
caused it — against ~41 min on a runner.** Deploy keeps only the residual a
structural gate cannot see.

⚠️ **The finding nobody set out to make: the remedy list contains the weakening.**
*Delete the scope* is a legitimate fix **and** the cheapest way to stop measuring
an inconvenient one — and unlike lowering a floor, **it does not read as a
lowering; it reads as cleanup.** [§7](#7-a-scopes-identity-is-its-declared-name)
closes rename and split; **removal is closed here, by the same rule**, or this
refusal teaches the move it exists to prevent.

⚠️ **A measurement is owed rather than guessed: nobody knows what Stryker prints
for an empty scope** — `100`, `NaN`, or omission from the report. It changes how
the residual check is *written*, never whether it is wanted. Expect the worst of
the three: Vitest 4 scores a wholly untested module **100%**, and zero mutants is
the same arithmetic. **The implementation session measures this before writing the
check.**

---

## 7. A scope's identity is its declared name

The structural gate asserts every declared scope exists on disk, so **a rename
cannot happen silently** — it goes red until the config is edited. The spec then
requires that edit to carry the floor across explicitly:

- **Rename** — a delete and an add in one diff, **with the number visible on both
  sides**.
- **Split** — every child gets the parent's floor, never a fresh start.
- **Removal** — the same visible-diff rule, and the floors-file `notes` entry that
  every other lowering carries. ⚠️ **Added by
  [#140](https://github.com/mephistopheles4/stacks/issues/140); #116 closed rename
  and split and said nothing about removal.**

⚠️ **The reason is that `git mv packages/core/src/covers packages/core/src/cover`
is otherwise the cheapest weakening on this map** — it resets a floor and reads as
a refactor in review.

**Static mutants cannot live in the scope list at all.** `mutate` selects *files*;
`static` is a property of individual *mutants within* a file. So it is a score-time
filter, and it belongs to [`the-ratchet.md`](the-ratchet.md), which counts them.
Flagged rather than left silent because **all five stryker-js#6073 ghosts sit in
`head-cap.ts`, inside a scope declared reachable here.**

---

## 8. What lands where

| Artifact | Change |
| --- | --- |
| `package.json` | `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` at **exactly** `9.6.1` |
| `stryker.config.*` | eight declared scopes, the exclusion list with a mechanism per entry, `checkers: []`, `plugins: ["@stryker-mutator/vitest-runner"]`, `timeoutMS: 120000`, the `mutate` array **including its `!**/*.test.ts` negation**, and the `tsconfigFile` workaround with its comment |
| `gates/mutation-scope.test.ts` | **G37**, the structural assertions plus the glob-matches-a-file clause |
| `scripts/deploy.ts` | the zero-mutant residual refusal |
| [`docs/gates.md`](../gates.md) | **row G37 `mutation-scope`, *Contract seams → gates*** |
| [`docs/gates.md`](../gates.md), *Not gated, deliberately* | the **Mutation testing (Stryker)** row **marked in place, dated, with the corrected count beside the wrong one** — see below |
| [`docs/adr/`](../adr/) | one record for the Stryker dependency |
| [`docs/gate-register.md`](../gate-register.md) | an entry for G37, triaged in the commit that lands it |

**The rejection row is marked, never deleted.** The documented retirement
mechanism is for *numbered* rows — *"keeps its number and its row"* — and this
table has neither numbers nor a status column, so **there was no marking
vocabulary for a rejection row whose condition has fired.** There is now, and it
is prose in place:

**The exact replacement text**, as a fenced block rather than a quotation because
its `#trends` link resolves in **`docs/gates.md`**, where the `## Trends` section
lands — not in this file:

```markdown
**Mutation testing (Stryker)** — *Genuinely cheap here … Revisit once the rows
above are green.* ⚠️ **Revisited 2026-08-11: condition met, and the cost estimate
in this cell was wrong — 636 tests / 5.52s, not 133 / ~2s. Now a trend; see
[Trends](#trends). Still not gated: the number never goes red.**
```

In place rather than as a new column, for three reasons: a column is a thing to
keep true on all five rows including three nobody will revisit; the cell is already
prose; and **the stale estimate must stay beside its correction**, because it is a
decay specimen and moving the row would separate the claim from the evidence that
it rotted.

⚠️ **The ratio between those two numbers is not `4.8×`.** That is the *test-count*
ratio (636 ÷ 133); the argument needs **runtime**, which is **2.76×** (5.52 ÷ 2.0).
The corrected row states both counts and no ratio, so nothing has to be right about
the arithmetic.

---

## 9. How it is proved able to fail

`docs/gates.md`'s standard is *"a gate never observed failing is not yet a gate"*,
and a statistical check makes that harder rather than optional.

| Check | Plant this | Expect |
| --- | --- | --- |
| **G37**, structural | rename a scope's directory without editing the config | red: *declared scope does not exist on disk* |
| **G37**, structural | add a source directory that is neither declared nor excluded | red |
| **G37**, structural | blank an exclusion's mechanism string | red |
| **G37**, glob clause | point a scope's glob at a path matching nothing | red |
| **G37**, vacuity floors | empty the declared-scope list | red, not a vacuous pass |
| **deploy residual** | declare a scope containing only type re-exports | refusal at `pnpm deploy:site` |
| **the score itself** | delete a test that killed two mutants in `packages/core/src` | the nightly moves ~0.16 points — *reported, never red* |

⚠️ **The last row is the honest one and belongs in the register**: mutation score
is a trend, so its "failure" is a movement a person reads, not a red. **The gate
half of this piece is G37, and it is what has an observed-red obligation.**
