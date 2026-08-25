# ADR-0073 — Cognitive complexity is published beside cyclomatic, never instead of it

**Date:** 2026-08-23
**Status:** accepted
**Decided in:** [#234](https://github.com/mephistopheles4/stacks/issues/234),
measured in [#230](https://github.com/mephistopheles4/stacks/issues/230),
assembled by [`docs/spec/static-analysis-and-style.md`](../spec/static-analysis-and-style.md)
§5, implemented by [#255](https://github.com/mephistopheles4/stacks/issues/255).

## Decision

`sonarjs/cognitive-complexity` is enabled as a **second counter**, in a config
of its own, publishing **four trend series** — `cognitive-functions`,
`cognitive-mass`, `cognitive-mass-over-15`, `cognitive-max` — beside the four
cyclomatic ones on the same cadence.

**It is not a replacement**, and the four cyclomatic series are untouched.

Three consequences that are the actual content of this record, because each is
hard to reverse and surprising without it:

1. **The cognitive series has its own denominator**, smaller than the
   cyclomatic one, and *absent at zero counts as zero*.
2. **One `fixtureHash` covers both counting rules**, so a plugin upgrade refuses
   a *cyclomatic* cap comparison too.
3. **An extraction that resets a nesting penalty is work**, which is the
   opposite of what this repo says about cyclomatic splitting — on purpose.

**No name joins `CAPPED_SERIES` here.** That is
[#258](https://github.com/mephistopheles4/stacks/issues/258), twenty records
later.

## Context

### Why not a replacement

Two measures, one of them strictly better, would be the cheap outcome — one
series instead of eight, one number to read. [#230](https://github.com/mephistopheles4/stacks/issues/230)
measured both across **1105 function pairs** and found they agree broadly *and*
diverge really: Pearson r **0.9159** overall (0.856–0.984 per scope), with **54
inversions** where cognitive exceeds cyclomatic, in 7 of 8 scopes. Seven of the
eight scopes agree on their worst function and `packages/core/src/import` does
not.

The decisive case is a single function. `resolveSettings` scores **cyclomatic
17 and cognitive 0**, because ESLint's `complexity` counts every `?.` link as a
branch and the cognitive specification counts optional chaining as neither
branching nor nesting. **A replacement makes a 17-branch function invisible.**

The same divergence runs the other way — `enrichBook` is CC41/cog75 and
`inspectPublicBuild` is CC57/cog80 — which is the argument for the second
series rather than against the first.

A replacement also **does not hold structurally**: it would delete the
cyclomatic caps and every calibration window behind them, leaving the trend
layer with no teeth at all.

The fixture now carries the argument rather than asserting it.
`fixtures/complexity/inventory.ts` holds `overTheCut` — twelve *flat* `if`s,
cyclomatic 13, cognitive 12, the two measures agreeing — and `deeplyNested`,
six *nested* `if`s at cyclomatic 7 and cognitive **21**. Half the branches,
nearly twice the score.

### The denominator is its own, and smaller by nine

⚠️ **The durable number is the gap of nine, not either total.** #230 measured
**1105 against 1114**; re-measured at adoption it was **1124 against 1133**.
Both totals grow with the tree and the difference does not, so the figures below
are dated evidence rather than current facts — check the difference, never the
totals.

**Two silences, and they are not the same silence.** Both had to be written
down, or two implementations of this spec produce different numbers — which
[`complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md)
§2 forbids in as many words.

- The rule hooks the `:function` selector, which **never visits** a
  `PropertyDefinition` or a `StaticBlock`. ESLint's `complexity` scores both as
  implicit functions. **Nine such nodes** existed across the eight declared
  scopes at both measurements — 1114 − 9 = 1105 on #230's, 1133 − 9 = 1124 at
  adoption — and they are **not in the cognitive population at all**. All nine
  live in `packages/site/src/shelf`.
- The rule reports only when a score is **above** its threshold, so at `0` a
  function scoring zero is **silently absent**. Those functions *are* in the
  population, and **absent at zero counts as zero**.

⚠️ **A shared denominator was refused for the reason this repo always refuses
that shape:** the error is small — nine in 1114 — and it is silent.

The structural consequence is that **this counter cannot derive its own
population**. ESLint's `complexity` at `max: 0` reports every function, so its
report *is* the population; the cognitive report is a subset of unknown size.
So `countCognitivePopulation` runs **both** rules over the same files and takes
the denominator from the cyclomatic one. That is a second ESLint pass per scope,
and it is not optional.

### The cut is the supplier's 15, and nothing may ever refuse on it

There is no published bound for cognitive complexity. `complexity-mass-over-10`
rests on McCabe's own 1976 number, published **with his reasoning**. The only
number available here is `DEFAULT_THRESHOLD = 15` in the plugin's source,
published without any.

**The distinguishing test, stated so it can be applied again: is the number
published with reasoning, or merely published?** By that test 10 passes and 15
fails.

So 15 is adopted as a definition inside a number on a page, and the guard
against a silent change is the series *name* — `cognitive-mass-over-15` — which
is the guard the cyclomatic side already uses, because neither cut is a hash
input. Move a cut and it is either a red test or a rename, and a rename is G36's
to catch.

⚠️ **The condition on accepting 15 is that nothing may ever refuse on it**, and
the next section satisfies that by construction rather than by care.

### There is exactly one cognitive ratchet, and it is `cognitive-max` alone

A mirrored cap — capping `max` and `mass-over` together, the way the cyclomatic
side does — **is unreachable**. Follow the chain: a mirrored cap requires the
mass-over count; that count requires a cut; and **every available cut is
underived for this measure**. The supplier's 15 has no published derivation.
McCabe's 10 is *worse*, not better — it is a bound about cyclomatic complexity,
so it must not refuse a publication about a different measure.

**So `cognitive-max` carries a cap and nothing else does.** With nothing capping
`cognitive-mass-over-15`, the supplier's constant can never refuse anything, and
the condition above is discharged.

⚠️ **What is given up, recorded rather than hidden.**
[`complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md)
§7 caps `complexity-mass-over-10` beside `complexity-max` for one stated reason
— *a split is the cheapest way under a `max` cap, and a split that leaves a 30
still counts*. **That closer does not close here**, because under cognitive
complexity a split lowers both numbers. The cognitive cap has no partner. What
stands in its place is the position below.

### An extraction that resets a nesting penalty is work

**This is a stated position, not a measurement, and it is what the cap rests
on.**

A developer extracts three helpers from a sixty-line nested function. No branch
is removed. Cyclomatic mass is flat — §7's tell fires, and this repo calls that
*satisfying the letter*. **Cognitive mass falls**, because the nesting penalty
resets at every function boundary.

The repo's answer for the two measures is now **different, on purpose**: the two
measures disagree about extraction because they disagree about what complexity
*is*. Cognitive complexity's whole thesis is that nested code is harder to read,
so removing the nesting removes the cost. That disagreement is the same argument
as `resolveSettings` at cyclomatic 17 / cognitive 0, seen from the other end —
and it is the strongest argument for carrying both series rather than one.

It is written here in those words because §7 says the opposite about the other
measure, and a reader who meets only one of the two will think one of them is a
mistake.

## The supplier objection, answered rather than outvoted

Cognitive complexity is one vendor's measure with no independent
reimplementation. No measurement dissolves that, and the objection had to be
answered rather than outvoted.

The answer this repo's own machinery offers: **the plugin version pinned exact,
an inventory fixture carrying expected cognitive totals per construct, and the
version folded into `fixtureHash`.** That converts *"the implementation is the
specification"* into *"a pinned implementation, and a drift is red rather than
quiet"*.

⚠️ **This makes the rule reproducible, not public.** The objection changes shape;
it does not dissolve. What the repo buys is that nobody can move the number
without a red build.

The fixture pins **both silences separately** — a function the rule visits and
scores zero, and a node kind it never visits — because a fixture that only
checked the reported functions could not see the silence at all.

## Consequences

### One hash over two rules, and what adoption cost

⚠️ **`fixtureHash` now covers both counting rules**, so a `sonarjs` upgrade
refuses every *cyclomatic* cap comparison as well, although no cyclomatic number
moved. That is the fail-closed direction and the refusal names the hash. A
second stamp was the alternative and was refused: a cap is a number about *the
counting rule this repository runs*, and after this ticket that rule is two
rules — a second hash would make *which stamp does this cap answer to* a
question every reader of the floors file has to hold.

⚠️ **Adoption changed the stamp once, and exactly one thing moves.** The
calibration window goes **1 → 0**.

`capCalibration` is the **only** hash-filtered path: it walks `streakOf` with
`(row) => row.fixtureHash === fixtureHash`. Of the 12 records carrying the
previous stamp, **exactly one is a nightly** — the other 11 are `push`, and
`streakOf` starts from `nightliesIn`. Run against the real store before
adoption it read `runs: 1, candidates: 5, days: 0, full: false`. So the window
loses one run. Every entry in `stryker.floors.json` is `unarmed`.

⚠️ **`countedIn` does *not* move here, and an earlier draft of this record said
it did.** It filters on `row.ok` and on `CAPPED_SERIES` samples and never reads
`fixtureHash`, so a hash change cannot touch it. The only thing that can is a
change to the roster itself — [#258](https://github.com/mephistopheles4/stacks/issues/258)'s
ticket, not this one. **The two are separate events and must not be recorded as
a pair:** *this merge moves the hash* → window 1 → 0, `countedIn` unchanged;
*#258 adds roster names* → `countedIn` drops, window unchanged.

⚠️ **What `countedIn` feeds is the reason the second event is dangerous, and it
is not a delay.** `scripts/deploy.ts` calls it once and takes `newestCount` and
`previousCount` off the result. Those flow two ways: into `capReadings`, which
is every printed cap line; and into `countedRun`, which is the **only** input to
the counting-rule refusal below. `deploy.ts` spreads `countedRun` in **only when
`newestCount` is defined**. So a roster name added before records carry its
family empties `countedIn`, and then:

- every cap reading prints `null`, and
- `countedRun` is absent, `countedElsewhere` is `false`, and **the
  counting-rule refusal cannot fire at all**.

**The caps go blind and the guard switches itself off, with nothing red.** That
is the argument for waiting.

⚠️ **And it is the *only* argument, because the widely-repeated one is false.**
Both this map's spec and an earlier draft of this record said a roster add
"zeroes both cyclomatic calibration windows". **It does not.** `capCalibration`
takes its window from `streakOf`, which filters on `row.ok` and the fixture
hash and **never reads `row.counts`** — so the window is roster-independent.
Only the hash moves a window, which is this merge's doing and not #258's.
Verified in `streakOf` rather than reasoned from the roster's shape, after
[#258](https://github.com/mephistopheles4/stacks/issues/258) and
[#254](https://github.com/mephistopheles4/stacks/issues/254) converged on it
independently. ⚠️ **The false version is the more dangerous one to leave
standing**, because a delayed window sounds survivable and a silently disarmed
refusal is not — so anyone weighing an early add against the wrong sentence
weighs it against the lesser harm.

⚠️ **A transient deploy refusal exists between this merge and the next CI
record, and it has no override.** `floorRefusals` computes `countedElsewhere`
as `counted !== floors.fixtureHash` **whether or not a cap is armed**. In the
gap, `stryker.floors.json` carries the new hash while the newest counted record
in the local store still carries the old one, so `pnpm deploy:site` refuses with
*"these caps were derived under a different counting rule"*. It heals on its
own: the `push: main` run for this merge writes a record under the new hash
within minutes, and `pnpm trend:sync` brings it local. **A deploy attempted
before that sync will refuse and there is no flag to clear it** — `--check-only`
reports instead, as it does for staleness. Same shape as the freshness gap
below, and worth knowing rather than rediscovering at a publish.

⚠️ **Every count here is as-of, because the branch is live.** At 41 records it
was 10 stamped; at 43 it is 12, the two new ones being the #259 and #260 merge
records, both carrying the old hash. Also measured: only **5 of the 43** are
non-`push` at all, so a twenty-*nightly* window fills far more slowly than
"twenty records" suggests. **Re-measure rather than citing any of these.**

`stryker.floors.json`'s `fixtureHash` is updated in the same commit, which is
not optional — `floorRefusals` compares a run's stamp against the floors file's
and refuses on a mismatch whether or not a cap is armed.

### The freshness bound grows with the series list

⚠️ **`GATED_SERIES` is derived from `TREND_SERIES`, and an absent sample and a
stale one are the same verdict.** So the four new names are names
`pnpm deploy:site` demands a fresh sample of from the moment this lands, and no
record on the branch carries one yet. The gap closes on the first `push: main`
run after the merge, and `pnpm trend:sync` brings it local. Until then a deploy
refuses and `--check-only` reports.

This is inherent to adding any series rather than special to this one, and it is
recorded because three test fixtures — G17's, G39's and `metrics-read`'s — had
to grow the same way, each of them planting a record CI no longer writes.

### Runtime

Two ESLint passes per declared scope instead of one, for the denominator reason
above. Both are syntactic — no `project`, no type information — which is the
same choice `eslint.config.mjs` makes and for the same reason.

## Alternatives refused

| Alternative | Why not |
| --- | --- |
| **Replace cyclomatic with cognitive** | `resolveSettings` is cyclomatic 17 / cognitive 0, so a replacement blinds a 17-branch function. It also deletes every cyclomatic cap and calibration window, leaving the trend layer with no teeth. |
| **A local advisory print** | Nothing watches a local surface. [`complexity-on-the-trend-layer.md`](../spec/complexity-on-the-trend-layer.md) §7 already grades *the hook stops running* as **open by nature**, which is why CRAP is a preview and not the record. |
| **Three counts, dropping `mass-over` entirely** | Loses the concentration reading — *is the mass in a few bad functions or spread thin* — which is the one question the four counts answer that a single sum cannot. Recorded as the closest call in the box. |
| **A shared denominator with the cyclomatic series** | Wrong by nine in 1114, and **silently** so. Small and silent is the combination this repo refuses. |
| **A second `fixtureHash`** | See above: it makes *which stamp does this cap answer to* a live question for every reader of the floors file, to avoid a refusal that is fail-closed. |
| **Cap `cognitive-mass-over-15` too** | Needs a defensible cut and there is none. A constant nobody derived must not be what stops a deploy. |
| **Add `cognitive-max` to `CAPPED_SERIES` now** | `countedIn` is keyed on the whole set, so every existing record stops qualifying at once — and because `deploy.ts` derives `countedRun` from its output, that **disarms the counting-rule refusal and blanks every cap reading, with nothing red**. Not merely a delay. Waiting costs nothing because `countedIn` reads what a record carries, not when the list changed. [#258](https://github.com/mephistopheles4/stacks/issues/258). |
| **Enable the rule in `eslint.config.mjs`** | That file holds one rule on purpose: a second rule puts findings in the same report that the counter must then filter, and a filter is a place for a count to go quietly wrong. Also measured on the linter side — merging configs drags the type service onto the counter through flat config's per-file merge. |
