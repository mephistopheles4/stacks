# Complexity on the trend layer — four counts, no ratio, and CRAP decided on its merits

The locked spec for [Map: complexity on the trend layer, and CRAP decided on its
merits](https://github.com/mephistopheles4/stacks/issues/186) — eight closed
tickets, three of them research on a `research/` branch each and one a prototype
run over the whole repo, assembled into something an implementation session can
execute **without reopening any of them**.

**Successor to [`after-the-scoreboard.md`](after-the-scoreboard.md)**, and an
application of [`gate-or-trend.md`](gate-or-trend.md): nothing here is a gate,
nothing here allocates a gate number, and every series below is held by the two
gates the trend layer already has. **This spec does not implement.** It states
the edits; the implementation session makes them.

⚠️ **Every decision in it was made overnight by Claude on the owner's
instruction, and each is reversible.** The map carries an *override list*
naming the alternative to each and what changing it would ripple into. A reader
who disagrees with a section should find its line there first.

---

## 1. What the series is for

A source the owner brought — a vendor post on CRAP and cyclomatic complexity —
split along a line this repo had already drawn: *track trends over absolute
values* is the trend layer's own doctrine, and its 0–30 / 30–60 / 60+ thresholds
are what the trend layer refuses. Behind the post, the research
([#188](https://github.com/mephistopheles4/stacks/issues/188)) found the
question the series actually answers:

> **Is the code this project ships — most of it written by an AI — getting
> harder to reason about over time, per scope? And when a number falls, was
> something simplified, or merely moved?**

The only trajectory study of agentic code (SlopCodeBench, March 2026, one
source) found complexity *concentration* rose in 80% of agent runs and
duplication in 89.8%, while matched human repositories stayed flat. A nightly
series watching this repo's own history is the one way to learn which regime it
is in. That is the judgment the series serves, written here the way
`mutation-score`'s is in [`docs/gates.md`](../gates.md)'s Trends table.

**Audience: both.** The series transfers whole. The one inversion is in
[§4](#4-crap-refused-as-a-series-adopted-as-a-reading).

---

## 2. Four counts, never a ratio

Source: [#190](https://github.com/mephistopheles4/stacks/issues/190), decided
from [#194](https://github.com/mephistopheles4/stacks/issues/194)'s measurement.

The prototype walked all eight declared scopes — 92 files, 1,009 functions,
224ms — then put every candidate statistic through two games on the repo's own
worst function (`enrichBook`, CC 40): a mechanical three-way split, and thirty
trivial one-line functions appended beside it.

| Statistic | Split | Thirty trivial functions |
| --- | --- | --- |
| functions | +3 | +30 |
| sum | **+5** — branches moved, none removed | **+30** — exactly the noise |
| mean | −0.07 | **−0.67** |
| max | **−10** | 0 |
| p90 | 0 | −1 |
| share of functions > 10 | −0.3pp | −1.6pp |
| share of mass in functions > 10 | **−3.8pp** | **−2.9pp** |

**No ratio survives both.** The mass-share is SlopCodeBench's own erosion
measure and the best of them, and it still fell 2.9 points on thirty functions
that touch nothing. The raw counts, read side by side, hide neither game:
dilution is *functions and sum up by the same amount and nothing else moving*; a
split is *functions up, sum flat, max down*.

**So the record carries counts and the page derives shares** — the reason
`mutation-score` is spelled *killed ÷ total*, applied one step earlier. Per
population:

| Series | Measures |
| --- | --- |
| `complexity-functions` | functions counted — the denominator the other three are read against |
| `complexity-mass` | Σ cyclomatic complexity over those functions |
| `complexity-mass-over-10` | Σ complexity over functions with CC > 10 |
| `complexity-max` | the largest single function's complexity |

**The cut is McCabe's own.** His 1976 paper proposes 10 as the upper bound for a
module, so the number in `mass-over-10` is a sourced constant inside the
measure's definition — **not a threshold**, because nothing goes red when a
function crosses it. A definition with a number in it and a verdict with a
number in it are different things, and this spec has only the first.

**Why a sum is fine here when Landman 2016 says a sum tracks size.** It does,
and it is never read alone: `mass` is the one figure neither game can shrink,
which is what it is on the page for. `functions` ships on the transferable rule
*every counter ships with its denominator* and on this spec's own evidence — it
is what makes a split visible.

### The population

**The eight declared scopes' globs, read from `stryker.scopes.json` itself.**
Same names, so the complexity panels sit under the mutation panels per scope,
which is the reading [§4](#4-crap-refused-as-a-series-adopted-as-a-reading)
lands on. No second list: G38 (`mutation-scope`) already holds that file to the
tree, so the populations are held to the tree by a gate that was never edited
for this.

- **Mutation exclusions are not applied.** Every exclusion mechanism is about
  *oracle reach* — "no in-process test ever sees the mutant" — which says
  nothing about a static measure. Applying them would drop
  `packages/site/src/shelf` from 385 functions to 113 and `packages/cli/src` to
  **three**, a population no number can be read from. The prototype reports
  both tables so this is visible rather than asserted.
- **`*.test.ts` is excluded**, as Stryker's default does. Test-code complexity
  is a different question and is on the map as fog.
- **The two `excludedDirectories` are not walked.** `gates/` is test files plus
  helpers, so excluding tests excludes it for the same reason; the top level of
  `packages/site/src` is one file. **Both are on the override list** — the
  gates are the constitution's own enforcement, and a population for them is a
  call only the owner makes.

### What a function is, and what counts

Every function-like node is its own scope: `FunctionDeclaration`,
`FunctionExpression`, `ArrowFunction`, `MethodDeclaration`, constructors,
get/set accessors. A nested function's branches never count toward its parent
— that is what makes splitting show up, because the split-off pieces are
counted. The prototype met no other function-shaped kind in the repo.

**The counting rule, written once.** Start at 1; +1 per `if`, `?:`, each loop
(`for`, `for…in`, `for…of`, `while`, `do`), each `case`, each `catch`, each
`&&` / `||` / `??` and their assignment forms. **`?.` and default parameters
are not counted** — ESLint's `complexity` rule takes the same stance on
defaults, so the rule is one somebody else also chose, and the prototype's
numbers are on it. Whether `?.` should count is on the override list.

### Labels

One `scope` label per series, as `mutation-score` carries. Four series names
rather than one series with a `stat` label, because G36 (`trend-layer`) holds
*names* to Trends rows, and a `stat` label would put four measures behind one
row's *Measures* text.

---

## 3. The emitter, the cadence, and how it is proved able to fail

Source: [#192](https://github.com/mephistopheles4/stacks/issues/192), on
[#187](https://github.com/mephistopheles4/stacks/issues/187)'s tooling finding.

⚠️ **Gate numbers are cited from today's `docs/gates.md`, and the ticket's own
title got one wrong.** Freshness is G39 (`metrics-freshness`); the `G38` in
[`trend-layer.md`](trend-layer.md)'s prose and in #192's title is the
pre-rollout number, shifted when `agents-import` took G37 out of band — exactly
the correction [`README.md`](README.md) warns about. **This spec allocates no
gate number**, which is also why it cannot repeat that mistake.

### The tooling: a hand-rolled walk, because TypeScript 7 closed every other door

`typescript@7.0.2`'s root export is a version string. The only AST surface is
`typescript/unstable/ast` — type guards, and `forEachChild` now a method on
`Node` — and `typescript/unstable/sync`, whose `API` class **spawns the bundled
native `tsc` as a subprocess** and returns `SourceFile`s over RPC. There is no
in-process `createSourceFile(text)` left in the package. Every ESLint-based tool
is blocked at `pnpm install`: `@typescript-eslint/parser` and
`eslint-plugin-sonarjs` each pin `typescript` below 6.1.0 in their published
manifests, independently. `fta` is TS 7-safe and per-file only.

So: **no new dependency**, and "a few dozen lines against a free function" is
not what it is either. The unit of work is a `tsconfig`-rooted project and a
long-lived process.

### Where it lives

| File | Change |
| --- | --- |
| `scripts/lib/complexity.ts` (new) | the walk — `SourceFile` in, `{ name, line, complexity }[]` out — and the roll-up to four counts per population. **Pure, and in the `scripts` mutation scope unexcluded**, like `lib/metrics.ts`: a spec reaches it in-process, so it gets scored |
| `scripts/lib/complexity.test.ts` (new) + a fixture | the inventory spec, below |
| `scripts/emit-metrics.ts` | **one** `unstable/sync` `API` instance for the whole run, rooted at the package tsconfigs, every file opened in that session — 224ms measured that way, ~9s spawning per file. The population read from `stryker.scopes.json`. Four facts into `RunFacts`. Already excluded with a mechanism |
| `scripts/lib/metrics.ts` | four `TREND_SERIES` entries, `help` carrying the Measures column verbatim, families under the existing `stacks_trend_` prefix with a `scope` label |
| `.github/workflows/metrics.yml` | the four names on **both** `--expect` lists |
| `docs/gates.md`, `## Trends` | four rows |
| `scripts/lib/trend-report.ts` | four lines per scope in the print block, with a delta against the previous record **of the same event** |
| `grafana/dashboards/trend-layer.json` | the panels [§4](#4-crap-refused-as-a-series-adopted-as-a-reading) places, and the reading sentence on panel 1 |
| `docs/adr/` | one record: the counting rule, and `unstable/sync` over a parser dependency |

### Cadence: both events, same bound

`metrics.yml` already writes on `push: main` and on the nightly, and
`gate-suite-runtime` is already emitted on both — the precedent exists. The
walk is sub-second, so the four series join the merge half's `--expect` list as
well as the nightly's. That buys **per-merge resolution**: the PR window the
record already carries then says *which pull request* moved `mass`, which a
nightly alone cannot. Bound: **3 days, unchanged** — a series on both events is
only fresher.

⚠️ **The merge half must not make a merge record read as scored.**
`scoredRecords()` in `scripts/lib/trend-report.ts` decides which records carry a
*mutation* score, and the mutation panel's PR window is computed between those.
`scoresOf` is mutation-specific today and stays that way.

### Proved able to fail — on existing gates, plus one unit spec

| Demonstration | Held by | Expected |
| --- | --- | --- |
| emit `complexity-mass` with no Trends row | G36 (`trend-layer`), forward | red |
| add a `complexity-p90` row nothing emits | G36 (`trend-layer`), reverse | red |
| age the newest `complexity-max` sample four days | G39 (`metrics-freshness`) | `deploy:site` refuses, naming the series |
| a population whose glob matches **no function** | `emit-metrics`' own `--expect` path | that series *did not compute*; `run_ok 0`, file still written |

The fourth is the vacuous-green closer and it is **per population**: one glob
matching nothing while seven work is the partial-silence failure the per-series
bound exists to expose, and "computed if any scope yielded functions" would
fail open. It reuses `scoresFrom`'s shape — *no tally for scope X* is already
the precedent. A parse refusal is a population that did not compute; the
prototype recorded zero of them across 92 files, and it recorded the zero
because silence there is the vacuous result.

**The counting rule is pinned by a fixture, and the fixture is a total
inventory.** `complexity.test.ts` walks a fixture file containing **every
counted construct at least once** — `if`, `?:`, each loop kind, `case`,
`catch`, `&&`, `||`, `??`, the three assignment forms — and every *uncounted*
one — `?.`, a default parameter — with the expected total written beside it.
Editing `lib/complexity.ts` to stop counting `&&` is then a red spec unless the
fixture's number moves in the same diff: the visible-diff property the ratchet's
floors file relies on, applied to a rule. **A sampled fixture would leave the
un-sampled construct as the silent weakening**, which is why *total* is in the
sentence.

### Runtime

+224ms on a nightly carrying a Stryker run of minutes; +~0.3s on the merge
half. `mutation-run-runtime` is unaffected. **No new runtime series** — a number
that cannot move is a line nobody reads.

---

## 4. CRAP: refused as a series, adopted as a reading

Source: [#191](https://github.com/mephistopheles4/stacks/issues/191), on
[#188](https://github.com/mephistopheles4/stacks/issues/188) and
[#189](https://github.com/mephistopheles4/stacks/issues/189). **First on the
override list**, because it reverses the impulse the map started from.

`CRAP(m) = CC² × (1 − untestedness)³ + CC`, per method. The map's Notes said
coverage is banned as a *goal* and not as an *input*, and that if CRAP needed
it and earned it, coverage would enter as an ingredient. **It did not earn
it**, and neither did the other term.

### Borrowed weights are still a weight vector

The argument for letting CRAP past [`trend-layer.md`](trend-layer.md) §3's
refusal — *any composite is a weight vector* — was that its exponents were
published, not chosen here. #188 read the publications. **Savoia gave a
boundary-case reading for the square and no argument for the cube**, called the
formula v0.1, and said the 30 was chosen "INITIALLY … after much debate." The
weights were not calibrated by anyone; they were chosen by someone else. A
weight vector that looks like a fact was what §3 refused, and a borrowed one
looks more like a fact, not less.

### Neither term

- **Coverage** is disqualified at function grain by the blind spot that sank
  the floor. Vitest 4 removed `coverage.all`; a function whose file no test
  imports is **missing** from the report, not 0%, so its CRAP is *undefined
  exactly where it should be maximal*. `coverage.include` is the documented
  mitigation and no primary source confirms it reaches a file no import graph
  touches (open Vitest issues #2879, #2674). Plus the dependency tree
  [`no-coverage-floor.md`](no-coverage-floor.md) §3 declined, now with an
  exact-peer pin. **#117 is not reopened — for new reasons, not the old ones.**
  The part of the old objection that *did not* survive is recorded too:
  coverage collection is local and needs no uploader, so the no-network claim
  was never at stake in the computation, only in publishing it.
- **Mutation score** is already here and needs nothing — and **no CRAP
  implementation in existence has ever used it**: crap4j, GMetrics,
  js-crap-score, cargo-crap and php-code-coverage's report all consume
  line/statement coverage, and none re-derives the exponents against a kill
  rate. Per-function mutant populations here are 0–10 for much of the repo
  (an estimate from [`mutation-scoring.md`](mutation-scoring.md)'s figures; the
  prototype branch can measure it against a live run). The result would be *a
  new uncalibrated composite wearing CRAP's label* — which fails §3 as a
  composite and fails honesty as a name.

### The reading, on the page

`grafana/dashboards/trend-layer.json` gains the four complexity panels
**directly under the mutation-score panel, per scope, same scope order**, and
panel 1 — the one that already says there is no confidence figure — gains the
reading:

> *A scope whose `mass` is rising while its mutation score holds or falls is
> where the next tests go. A scope whose `max` fell while `mass` held was
> split, not simplified.*

No derived CRAP panel either: a panel computing `mass² × (1 − score)³` is the
composite by another route, and
[ADR-0062](../adr/0062-the-dashboard-is-provisioned-from-the-repo.md) put the
refusal *on the page* for exactly this reason.

**What is lost, named**: ranking *within* a scope. `max` carries the worst
function's value and not its name. The prototype's top-25 table is the by-hand
version of that ranking, and running it is the ritual for *which function
first*. A reading obligation, not a series.

### Reversal condition

CRAP reopens as a series if **any one** holds: a published calibration of the
exponents against a kill-rate distribution; per-function mutant populations in
this repo **measured** at ≥ 30 for the functions that matter; or Vitest
confirming from a primary source that `coverage.include` scores a
never-imported file's functions at 0% *and* a ranking need the top-N table
cannot meet. Short of one, re-raising it is re-litigating.

### The inversion, and what flips it

In a production tree with JaCoCo, Cobertura or `llvm-cov`, **the disqualifier
disappears**: those instrument every class or function at build time, so an
untested method is 0%, not absent. The blind spot is Vitest 4's, not the
formula's. With ten thousand methods a per-method ranking is worth more than a
top-25 table, and the coverage tooling is already paid for. There CRAP is a
legitimate **triage ranking** — never a gate, for Clause A's reason, and still
with exponents nobody calibrated, which the dashboard should say. *What flipped
it*: whether the coverage tool reports absence as zero, and how many functions
there are to rank. Written as a derivation, per
[`after-the-scoreboard.md`](after-the-scoreboard.md#the-four-inversions), and
the first map's four become five.

---

## 5. Gaming categories, graded

Source: [#193](https://github.com/mephistopheles4/stacks/issues/193). Every
vector was measured on the prototype, not reasoned about.

| Category | Vector | Disposition |
| --- | --- | --- |
| Weakening | edit the walk to count less | **Closed** by the inventory fixture — red unless the fixture's number moves in the same diff |
| Satisfying the letter | function splitting: `max` −10, erosion share −3.8pp, **no branch removed** | **Carried open, made visible** — no ratio is emitted, so the signature (*functions up, mass flat, max down*) is on the page and panel 1 names it. A split is sometimes a real refactor; a measure that could not tell would be wrong to claim it could |
| Routing around | code outside the populations: the two `excludedDirectories`, `*.test.ts`, and `.astro` files no TypeScript walk sees | **Open** for the first two (override list). **Closed by an existing rule** for `.astro` — *no logic in `.astro` files* — though nothing greps `.astro` bodies for logic, a gap that predates this map and is not widened into a gate here |
| Vacuous green | a glob that matches nothing, a parser that skips what it cannot read | **Closed, per population**: no function → *not computed* → `run_ok 0` |
| Decay | the number moves with no code change | *Counting-rule drift*: **closed** — no third-party tool's version can change a rule that is this repo's. *Compiler drift*: `unstable/ast` is named unstable by its authors and TS 7.0 already made `forEachChild` a method — **carried open, with the fixture as tripwire**: it goes red on the upgrade that renames a kind, which is the upgrade where the number would otherwise have moved quietly |

**Nothing inherits §6 of `gate-or-trend.md`** — the composite was refused, so
no series carries mutation-score dilution. The interaction that remains is the
reading, and a reading is gameable only by not reading; that is the trend
layer's standing obligation, met at `deploy:site`.

**One transferable rule gained**, derived from a measurement rather than
asserted, the fourth after
[`after-the-scoreboard.md`](after-the-scoreboard.md#the-four-inversions)'s
three: **emit the denominator and the total, never the ratio, and let the page
derive.** *Relocation* — satisfying the letter without touching the total — is
an instance of an existing category and needs no sixth; what is new is the
closer.

---

## 6. The build order

One landing, because there is one new thing and it is sub-second:

1. `lib/complexity.ts` with its inventory spec and fixture — **the spec goes
   red once on purpose** (comment out `&&`) before it is believed.
2. The four `TREND_SERIES` entries and the four Trends rows **in the same
   commit**, so G36 (`trend-layer`) is green in both directions at every
   commit.
3. The emitter session and both `--expect` lists; the first merge record with
   the series is the observed-red opportunity for the G39 (`metrics-freshness`)
   demonstration, run under `--dry-run`.
4. The print block and the dashboard panels, with panel 1's sentence — **after**
   a record exists to print, never before.
5. The ADR, in the commit that lands the counting rule.

No floor, no arming, no calibration window: a series with no verdict has no
ratchet, and the first spec's waiting-overlaps-with-work argument does not
apply.

---

## 7. What was ruled out, and the fog that remains

**Out of scope** — a complexity gate or threshold at any surface; coverage as a
standalone series, floor or goal; a per-PR complexity delta as a check; building
any of it in this effort.

**Not yet specified**, on the map: a duplication/verbosity series (the signal
that moved *more* consistently than complexity in the only trajectory study);
test-code complexity, and whether the gates deserve a population; cognitive
complexity as a second walk with its own inventory, if the split signature
turns out to be common in this repo's history.

**Research, kept on its branches**, each linked from its ticket:
`research/complexity-tooling-for-typescript`,
`research/complexity-metrics-and-crap`, `research/crap-untestedness-term`; the
prototype on `prototype/complexity-walk`. None merges; the tickets carry the
findings that mattered.
