# A clone is a relation between two places, so duplication is measured per scope *and* whole-tree

Duplication publishes **eight** trend series where every other measure in this
repository publishes four: the four counts over the eight declared scopes, and
the same four over whole-tree TypeScript.

> **A clone is a relation between two places, and a relation does not partition
> into scopes.**

Eight per-scope numbers are structurally blind to a clone whose halves sit in two
different scopes, and `gates/` is read by no scope at all. One whole-tree
TypeScript number sits beside the eight, and **no scope list can shrink it**.

The eight scope samples therefore **do not sum** to the tree number, deliberately:
a clone spanning two scopes is counted by both scopes it touches.

## Why this is not the obvious shape

The obvious shape is the one every other counter here uses — one population, four
counts, one sample per declared scope — and it is the shape
`complexity-on-the-trend-layer.md` §2 already argues for. Duplication is the one
measure it does not fit, and the reason is not a preference about coverage.

Complexity is a property of **one function**. You can ask a scope for its own
complexity and get a complete answer, because every function belongs to exactly
one place. Duplication is a property of a **pair**. Ask a scope for its own
duplication and the answer is complete only for clones that happen to sit inside
it; a clone between `packages/core/src` and `scripts` belongs to neither scope
alone, and eight independent runs cannot see it at all.

**The hole is latent today rather than hypothetical, and that is the argument for
closing it now.** [#232](https://github.com/mephistopheles4/stacks/issues/232)
ran the eight scopes separately and ran their union, and the two agree exactly —
12 clones, 133 duplicated lines, either way. There is no cross-scope clone in
this tree at the moment. So switching to a union run **costs nothing today**, and
it cannot be done cheaply once the first one appears: the numbers would move on
the commit that changed the method, and nothing would separate the two causes.

⚠️ **The per-scope numbers still come from one run, not eight.** The union run is
where every clone count and duplicated-line count comes from, attributed to every
scope whose glob matches either half. Eight separate runs are the configuration
this record exists to refuse.

## Why whole-tree is TypeScript only

**Measured, not argued.** Over every file jscpd reports 74 clones and 1042
duplicated lines, **of which 570 — 55% — are JSON this repository did not
write**: `fixtures/api/`'s cached provider responses, and the Grafana dashboard
provisioned from `grafana/`. Two O'Reilly fixtures share **105 identical lines**
because one book comes back from two endpoints.

**A recorded response cannot be de-duplicated without falsifying the fixture.** A
number more than half composed of duplication with no available remedy is not a
number about this codebase, and [#237](https://github.com/mephistopheles4/stacks/issues/237)'s
own question 4 had already named that outcome as a reason to refuse rather than
to tune.

Restricting by file type removes them all at once and removes nothing else:
190 files, 45,384 lines, 35 clones, 363 duplicated lines.

⚠️ **The earlier argument against whole-tree was weak and is replaced rather than
kept.** It said the cell *"reads code no scope declares, which is the opposite of
G38's rule."* Reading everything means nothing can silently leave the
measurement, which is **more** fail-closed than a declared list, not less. What
refutes the unrestricted version is the data.

⚠️ **The tree population includes test code, and that is a live open question
rather than a settled one.** [#239](https://github.com/mephistopheles4/stacks/issues/239)
refused a test population **for complexity**, on the measurement that test code
is structurally simple — four fifths of test functions score 1, and the maximum
across all 1931 of them is exactly 10, so both capped complexity series are
identically zero over it. **That reason inverts here.** Test code is the
population on which duplication is most extreme: #232 measured `gates/` moving
from 4 clones at jscpd's defaults to **119** one threshold step looser, a 30×
swing against 5× over the source scopes. A population that is flat for one
measure is the loudest for the other, and for the same underlying property —
repeated structure with few branches in it. Nothing has ruled on whether it
should be there; it is there because the whole-tree number is the one no
declaration can shrink, and carving test code out of it would be a declaration.

## What this costs

**Eight rows where every other measure has four**, on `docs/gates.md`'s `## Trends`
table and in `TREND_SERIES`, and a reader who has to know that two of them are
different populations rather than two statistics.

**Two numbers that look like they should add up and do not.** Stated in the
Measures column, in `docs/commands.md`, and printed under the table
`pnpm duplication:report` produces, because a reader who discovers it by
subtraction concludes the counter is broken.

**A population that cannot carry a cap.** Caps in `stryker.floors.json` are keyed
by declared mutation scope, and the whole tree is not one and never will be —
which is also why the duplication counters live in `jscpd.floors.json` rather
than beside the complexity caps: `correspondence()` compares that file's keys to
the declared scopes in both directions and would refuse every deploy over a
`whole-tree` key, and `parseCaps` treats any non-complexity cap name as a parse
error on purpose.

## What was considered and refused

**One number for the whole repository.** The only option with no cross-scope
blind spot at all. It buys that by giving up the per-scope reading every panel
offers, and by leaving no key for a cap to hang on.

**Eight separate runs, no whole-tree number.** The configuration this record
refuses. Structurally blind to the clone the effort exists to catch.

**Whole-tree over every file type.** Refuted by measurement, above.

**Whole-tree as a *label* on the scoped series rather than four names of its
own.** G36 holds series *names* to `## Trends` rows and reads no labels, so the
whole-tree number could then disappear entirely with no row going red.

## Consequences

- `duplication-*` and `duplication-tree-*` are eight names in `TREND_SERIES`,
  eight rows in `## Trends`, and eight entries in `GATED_SERIES`. The first
  `pnpm deploy:site` after this lands **refuses** until a CI run writes a record
  carrying them — inherent to adding any series, and failing in the safe
  direction.
- `jscpd.floors.json` carries **nine** populations: the eight scopes and
  `whole-tree`.
- **No duplication name joins `CAPPED_SERIES` here.** `countedIn` filters to
  records where every member of that roster has samples, keyed on the whole set
  on purpose — so a name added before twenty records carry its samples makes it
  return **nothing**.

  ⚠️ **What that breaks is the *reading*, not the window, and an earlier draft
  of this record said otherwise.** The calibration window is untouched:
  `capCalibration` derives it from `streakOf`, which reads `row.ok` and the
  fixture hash and **never** `row.counts`. What collapses is
  `scripts/deploy.ts`'s `newestCount`, which becomes `undefined` — so **every
  cap line prints `null`**, and `countedElsewhere` requires a `countedRun` it no
  longer has, so the counting-rule refusal **switches itself off**. Blind caps
  and a disarmed guard, with nothing red. ⚠️ **The wrong version was
  reassuring in the wrong direction** — *a delayed window* sounds survivable
  where *a silently disarmed refusal* does not, so anyone weighing an early add
  against it weighed it against the lesser harm. Corrected against the code by
  [#258](https://github.com/mephistopheles4/stacks/issues/258); that ticket owns
  the step and it may not be folded in here.
- The tool is **jscpd**, pinned exact. The ESLint rule that sounds like it does
  this job compares whole function bodies only and gets a fresh closure per file,
  so it is structurally unable to look across files — and it found **zero** clones
  here, including on the clearest cross-file duplicate present.

Decided in [#237](https://github.com/mephistopheles4/stacks/issues/237) and
[#232](https://github.com/mephistopheles4/stacks/issues/232); assembled in
[`docs/spec/static-analysis-and-style.md`](../spec/static-analysis-and-style.md)
§5; built in [#254](https://github.com/mephistopheles4/stacks/issues/254).
