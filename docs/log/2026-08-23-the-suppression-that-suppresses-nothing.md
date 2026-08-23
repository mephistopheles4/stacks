# The suppression that suppresses nothing, and four measurements that were all the same special case

**2026-08-23** — [#254](https://github.com/mephistopheles4/stacks/issues/254),
jscpd and the eight duplication series.

The eight series landed as specified. What is worth writing down is that the
premise underneath one of them was wrong in a way nobody had noticed, including
the ticket that established it, and that the thing which found it was planting
rather than reading.

## What the spec said, and what was actually true

[`docs/spec/static-analysis-and-style.md`](../spec/static-analysis-and-style.md)
§5 records the measurement that justified the whole ignored-lines counter:

> the directive removes its lines from the clone count **and** from the
> total-line denominator together — 34 raw lines with a 12-line block report 20

That reproduces exactly. It is also the special case.

**Measured here at fourteen live lines and a three-line block, varying only what
follows the closing directive:**

| After the closing directive | jscpd removed |
|---|---|
| nothing — the block ends the file | **5**, the block |
| a blank line, or a comment | **6**, the block *and* the trailing line |
| **one line of code** | **0 — nothing at all** |

⚠️ **A `jscpd` suppression block in the middle of a file does nothing, silently.**
The author believes a region is excluded from the measurement; jscpd counts every
line of it; and nothing anywhere says which of the two happened. Where the
directive *is* honoured it truncates to end of file rather than stopping at the
closing directive, so it can take more than the block as well.

**Every prior measurement of this feature put the block at the end of a file** —
[#237](https://github.com/mephistopheles4/stacks/issues/237)'s three-row table,
and the first four taken during this implementation. All of them agreed with each
other, and all of them were the one position that works.

## What found it

**Not reading.** The gate was green, the unit tests were green, and the arithmetic
in them was right. The finding came from planting a real block into a real file —
`packages/cli/src/env.ts` — and comparing two numbers that were expected to
agree.

The first plant found a *different* bug first, in the sweep rather than in jscpd.
It was inserted mechanically at a line offset and landed with the closing
directive **inside the file's header comment**, where jscpd does not see it. The
sweep counted six lines; jscpd removed none. That produced
`commentStateAfter`, and it is the reason `ignoreBlocksIn` knows about block
comments at all.

The second plant, at a real code location, was byte-clean — LF endings, directive
alone on its own line — and jscpd *still* removed nothing. Isolating that took
five runs varying one thing at a time, and the answer was position.

**Three separate defects, none of which a reading of the code would have
surfaced, all from one afternoon of planting.**

## What was done about it

The counter records **what the source declares**, not what jscpd removed. That is
what the spec asks for in its own words — *lines inside `jscpd:ignore` blocks* —
and it is the right quantity either way: a block is an **intent** to take code out
of a measurement, and the intent belongs in a diff whether or not the tool acts on
it.

⚠️ **So `total-lines + ignored-lines` is an approximation and not an identity**,
and an earlier draft of `scripts/lib/duplication.ts` claimed it reconstructed the
raw total exactly. Corrected in the module, in `jscpd.floors.json`'s comment, and
in `docs/gates.md`.

**Two cases in `scripts/lib/duplication.test.ts` pin jscpd's behaviour**, so a
later jscpd that fixes this goes red here rather than moving eight series at once
with nothing to point at.

## Three other things the tools found about themselves

⚠️ **jscpd's line count cannot be reimplemented, and a first draft tried.** A
hand-rolled physical-line denominator disagreed on three of ninety-five files:
`enrich.ts` by one, `boot.ts` by one, and `repo-root.ts` by **twenty-seven** —
because a file whose token count falls under `--min-tokens` is declined *whole*
and reported as no source at all. Every count now comes from `statistics.total`,
which is why the emitter runs jscpd once per scope rather than deriving a
denominator.

⚠️ **`--absolute` is not optional.** Without it jscpd strips a common prefix that
is neither the repo root nor stable — one run reported `covers/cover-budget.ts`,
`library.ts` and `deploy.ts`, three different prefixes removed — and two files
named `types.ts` collapsed onto one name. Attribution keyed on that is
attribution keyed on a coincidence.

⚠️ **The counter found two clones in its own commit, and both were real.**
`treePopulationOf` duplicated `sourceFiles`'s walk (7 lines), and the report
script duplicated the emitter's loop (6, 6 and 8 lines). Extracted to
`walkSource` in `scripts/lib/walk.ts` and to `countAllPopulations` in
`scripts/lib/duplication.ts`. The second extraction was worth doing twice over:
that loop had been living in `scripts/emit-metrics.ts`, which is excluded from the
mutation scope and imported by no spec — *a rule written there is a rule nothing
holds*. `scripts` is back to its 5-clone baseline and the whole tree is at 34
clones against 35 before the branch, despite roughly a thousand added lines.

⚠️ **G1 caught a permission that had gone stale in the same edit.** Moving the
walk out of `scripts/lib/scope-check.ts` left that file no longer importing
`node:fs`, and the adapter-boundary gate's reverse direction reddened on its own
allowlist entry — *the exception is spent; remove it rather than leaving the
permission lying about*. Nothing else would have noticed.

## One consequence to expect

**Adding eight names widened `GATED_SERIES`**, which is derived from
`TREND_SERIES`. No record on the `metrics` branch carries `duplication-*` yet, so
the **first `pnpm deploy:site` after this lands refuses** until a CI run writes
one. That is inherent to adding any series — the pipe genuinely has not delivered
it — and it fails in the safe direction. `--check-only` reports it instead of
refusing. The remedy is to let the workflow run, never to exempt the names.

Two gate fixtures had to grow the same samples for the same reason, and
`gates/deploy-branch.test.ts`'s own comment had predicted it in writing:
*`GATED_SERIES` covers whatever `TREND_SERIES` holds, so a series added anywhere
lands here.*
