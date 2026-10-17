# The ratchet tightens — a print line that asks, and never acts

Source: [#322](https://github.com/mephistopheles4/stacks/issues/322), grilled
with the owner on 2026-10-17; the decisions are recorded on the issue and in
[ADR-0111](../adr/0111-the-ratchet-asks-to-tighten-in-a-print.md). Standard
tier, **one build session**, no gate row.

**This spec names no bound value, for any scope.** Like
[`the-ratchet.md`](the-ratchet.md), it names a rule; the values come from the
record.

⚠️ **Nothing is armed until this spec merges** (§S9, Q0). By the streak rule
the cap windows are already full and the floor windows fill in early November
(§S11); with arming held, neither is a deadline for this spec.

---

## S1. Problem statement

The ratchet sets a bound once, at arming, from the extreme value across a
calibration window, and then never reads that history again in the tightening
direction. Every tightening after arming is a hand edit that nothing asks for.
[ADR-0061](../adr/0061-the-mutation-floor-refuses-deploy.md) records the result
as an accepted risk — *the floor will probably never be raised* — and calls it
worse than a slack floor, because it is silent.

It also distorts the work around it: the complexity cleanup on
[#240](https://github.com/mephistopheles4/stacks/issues/240) reads as racing a
deadline because a loose bound, once set, will not be tightened later.

## S2. Solution

**Under each armed bound that the evidence says could be tighter, the
`pnpm deploy:site` print adds one clause**: the tighter value, and how long it
has been available.

```text
packages/core/src   armed 71.55   current 72.61  (+0.04)   1 mutant = 0.08   window lowest 72.40 - tightenable for 12 days
scripts  complexity-max            armed 14   current 11  (-1)   window highest 12 - tightenable for 5 days
```

⚠️ **Every number in that block is illustrative**, as in `the-ratchet.md`
§10; the shape is the spec's and the numbers come from the record.

The clause is the arming rule run again, in the tightening direction only. It
asks and does nothing else: no file is edited, nothing is filed, nothing
refuses. The owner tightens by hand, in a pull request, exactly as today.

## S3. Vocabulary

**Tighten**, defined in [`CONTEXT.md`](../../CONTEXT.md): a floor rises, a cap
falls. A bound is **tightenable** when §S4's rule holds for it. *Lower* and
*raise* are avoided because each means the opposite thing for the other family.

## S4. The rule

A **bound** here is one of the four per scope that `stryker.floors.json`
carries: the mutation `floor`, and the caps on each member of `CAPPED_SERIES` —
`complexity-max`, `complexity-mass-over-10` and `cognitive-max`. All four are in
scope (§S9, Q2).

**The window is arming's window, unchanged.** The same `streakOf` walk: CI
nightlies only, `WINDOW_RUNS` distinct trees, no gap over `MAX_GAP_DAYS`, a
failed run or a row under another stamp ends the streak, and the renovations
that declare `preserves` widen what counts — `calibration` for the floor and
`capCalibration` for the caps, with the arguments `deploy.ts` already passes.
**A window that is not full asks nothing**, so a stamp change that restarts the
window silences the clause until the window refills, and
[#227](https://github.com/mephistopheles4/stacks/issues/227)'s preservation
carries it across exactly as it carries arming.

| Bound | Tightenable when | The value named |
| --- | --- | --- |
| a floor `F` | the window's lowest score, rounded **down** to hundredths, is at least `F` plus one mutant at the scope's resolution | that rounded-down lowest |
| a cap `C` | the window's highest count is at most `C − 1` | that highest count |

- **One unit, never a chosen margin** (Q2). For a floor, one mutant is
  `resolutionOf(mutants)` — the same number the print's `1 mutant = …` shows.
  For a cap, any tighter whole count is already one unit.
- **Compare in hundredths, as integers.** The floor file stores two decimals;
  compare `round(value × 100)` integers so that a case on the boundary cannot
  turn on float error.
- **Round the named floor down, never to nearest.** A floor typed at a value
  above any score in its window refuses the next deploy on a run the window
  itself contains, because `breaches` is strictly-under. Rounding down keeps the
  named value at or below every score that produced it. (§S10 notes the same
  hazard in the existing armable line.)
- **Asks nothing** when the bound is `unarmed` (the armable line covers it), when
  the window is not full, when the scope has a hole in the window (`null`), or
  when that bound is breached this deploy — a breach is the refusal's line, and
  a tightening offer beside it would contradict it.

⚠️ **When the floor's resolution is unknown, the clause degrades and does not
vanish.** `deploy.ts` reads the mutant count from the newest *local* mutation
report, and a fresh checkout has none. Then the clause prints the window lowest
with no verdict — `window lowest 72.40 - run pnpm mutation:run to judge` — on
the rule `mutantsPerScope` already states: no report is a print, never a
silence. The caps need no resolution and never degrade.

## S5. The age

`tightenable for N days` is how long the rule has held without a break, and it
is **derived from the record at each deploy** (Q4). Nothing is stored.

- Walk the nightlies from the newest back. At each one, compute the window as
  it stood ending at that nightly, and test the rule against **today's** bound
  and today's resolution. Stop at the first nightly where it fails.
- The age is the whole days from the oldest nightly that passed to `today`, by
  the print's existing `days` helper. Zero is printed as `0 days`, as
  `unarmed for 0 days` already is.
- **Anything that empties the window resets the age**: a stamp change without
  `preserves`, a failed nightly, a gap over three days. That is the window's own
  rule, so #227 needs nothing new.
- ⚠️ **The age can overstate.** It tests history against today's bound, and the
  floors file does not record when a bound last moved. Accepted, and named in
  ADR-0111.

**Cost.** A walk over the record per bound, and the record `deploy.ts` reads is
bounded near the window — see `windowRecords` and its early break one nightly
past `WINDOW_RUNS`.
⚠️ **That bound is too short for an age** and the build must widen it: an age of
`N` days needs about `N` nightlies beyond the window. Read the record to the end
of the newest unbroken streak instead, which the walk needs anyway, keeping
`WINDOW_RECORD_CAP` as the hard stop. ⚠️ **The same bound is too short for the
window itself** — see §S11.

## S6. Implementation decisions

- **One new pure function in `scripts/lib/floors.ts`**, beside `calibration`
  and `capCalibration`: given the rows, the floors, the readings, the two stamps
  with their accepted values, and `today`, it returns per bound either nothing,
  *tightenable (value, age)*, or *unjudged (value)* for §S4's degraded case. It
  computes; it never writes. Its name and exact shape are the builder's.
- **`renderFloorLines` and `renderCapLines` append the clause** to an armed
  line, and their `PrintInput`/`CapPrintInput` gain what they need from that
  function. The unarmed lines do not change.
- **`deploy.ts` passes the rows through** and widens its record read per §S5.
  Nothing else in it changes. The block headers keep saying what the lines are;
  the cap header's *"a cap only falls, and raising one costs a notes entry"*
  stays true.
- **No change to `stryker.floors.json`'s schema, `parseFloors`, the refusals or
  any gate.** The clause escalates never and files nothing, so it stays inside
  the standing constraint `renderFloorLines`' docstring names.
- **`notes` on a tightening is optional** (Q5). The comment block at the top of
  `stryker.floors.json` and `ADR-0068`'s "raising a cap is a lowering, and
  costs a notes entry" stay as written; the spec adds that a tightening needs
  no line, and the floors file's `$comment` gains one sentence saying so.
- **`the-ratchet.md` and ADR-0061 are not edited.** ADR-0111 supersedes §8's
  *"never asks for improvement"* clause and points back.

## S7. Testing decisions

**One seam: record rows in, printed lines out** (Q7). Tests build `RunRow`
fixtures and a `Floors`, call the render functions with the new function's
result, and assert on the exact line — the shape `floors.test.ts` already uses
for the armable line (`'window full (10 trees), lowest 44.12 - armable'`,
`'highest 17 - armable'`). Unit tests of the new function's return value are
welcome beside them; the line is the contract.

The acceptance claims, for the behaviour and integrity lenses at Test:

1. **C1.** An armed floor whose full window's lowest beats it by at least one
   mutant prints `window lowest <value> - tightenable for <N> days`, with the
   value rounded down.
2. **C2.** The same floor beaten by less than one mutant prints no clause.
3. **C3.** An armed cap whose full window's highest is at least one below it
   prints `window highest <value> - tightenable for <N> days`; one at the cap
   prints none.
4. **C4.** A window that is not full, an `unarmed` bound, a hole in the window,
   and a breached bound each print no clause.
5. **C5.** The age counts from the oldest nightly of the unbroken run, and a
   failed nightly, a gap over three days or a stamp change inside that run
   resets it.
6. **C6.** A renovation declaring `preserves` carries the clause and its age
   across the stamp change it names.
7. **C7.** A floor with no known mutant count prints the degraded clause, never
   nothing.
8. **C8.** A boundary case — the lowest exactly `F` plus one resolution in
   hundredths — prints the clause, and one hundredth less does not.
9. **C9.** Nothing the function or the print does writes a file: the function
   takes no path and touches no disk, and `stryker.floors.json` is unchanged
   after a `pnpm deploy:site --dry-run`.

**Mutation.** `scripts/` is a declared Stryker scope, so the new code is
mutated. Keep every branch reachable from a test, as `renderFloorLines`' own
comment warns: an unreachable guard is an unkillable mutant in the module the
floor is made of.

## S8. How it is proved able to fail

| Plant this | Expect |
| --- | --- |
| arm one scope's floor at its window lowest minus two mutants, in a fixture | the clause appears, naming the rounded-down lowest |
| arm it at the lowest exactly | no clause |
| put one `run_ok 0` nightly inside the slack run | the age restarts after it |
| move `configHash` in the fixture with no renovation | no clause until ten new trees |
| the same, with a `preserves: true` renovation | the clause and its age survive |
| delete the local mutation report | the degraded clause, not a silence |

⚠️ **`--dry-run` exercises all of these and uploads nothing**, which is the
honest way to plant them on the real record, as in `the-ratchet.md` §12.

## S9. Override list — the owner's decisions

Every row was put to the owner one question at a time, each with a
recommendation, and answered in the session's own chat. The coupled rows were
also laid out as a morphological box, which is not in this checkout.

| # | Question | Answer |
| --- | --- | --- |
| Q0 | When may a bound be armed? | Not before this spec merges |
| Q1 | Does the ask overturn `the-ratchet.md` §8? | Yes, for a print only — ADR-0111 |
| — | Where does it ask? | The deploy print; a trend-page line is a follow-up issue; a nightly that files an issue was tried and dropped |
| Q2 | Series, margin, evidence, wording, decline | All four bounds; one unit; one full window; names the value; a printed age |
| Q3 | The term | *tighten*, in `CONTEXT.md` |
| Q4 | Where the age counts from | The record; it resets with the window |
| Q5 | `notes` on a tightening | Optional; a loosening still needs one |
| Q6 | What ships | This spec and ADR-0111 |
| Q7 | The test seam | Rows in, printed lines out, in `floors.test.ts` |

Taken by the spec author as following from those answers, and open to the
owner's override at sign-off: rounding the named floor **down** (§S4); the
degraded clause when the resolution is unknown (§S4); no clause beside a breach
(§S4); widening the record read for the age (§S5).

## S10. Out of scope

- **Moving any bound automatically**, or proposing a move outside the print.
- **Arming**, and anything that changes what arms a scope.
- **The window's length**, fixed by ADR-0084.
- **The trend-page line.** A follow-up issue: it would reach the owner on a day
  with no deploy, and it files nothing either.
- **The duplication caps** in `jscpd.floors.json`, which have no calibration
  window yet ([#269](https://github.com/mephistopheles4/stacks/issues/269)).
  When one exists, this rule is the one to apply to it.
- **The complexity cleanup**, which is #240 and independent of this.

## S11. Further notes

⚠️ **The existing armable line rounds to nearest, and that is the hazard §S4
avoids.** `unarmedState` prints `lowest.toFixed(2)`, so a window lowest of
`44.116` prints `44.12`. Arming at the printed value sets a floor above a score
the window holds, and `breaches` — strictly under — refuses the first deploy on
the very run the floor came from, which its own docstring names as the thing it
must not do. Not fixed here: it is outside #322's scope, and it is the owner's
call whether to file it.

⚠️ **The deploy reads too few nightlies to fill a window of trees.**
`windowRecords` in `deploy.ts` stops one nightly past `WINDOW_RUNS`, a bound
written when one nightly was one sample. Since
[ADR-0084](../adr/0084-the-counting-stamp-is-behaviour-not-a-version.md) a
sample is a distinct tree, and the record measured 1.85 nightlies per tree, so
eleven nightlies cover about six trees: the deploy print cannot show
`window full (10 trees)` unless ten of eleven consecutive nightlies measured
different commits. Its own docstring still says *"twenty consecutive
nightlies"*.

**Measured on the `metrics` branch on 2026-10-17**, replaying the streak rule
by hand over 63 nightlies:

| Window | Unbroken streak | Distinct trees | What the deploy can see |
| --- | --- | --- | --- |
| caps, `fixtureHash` `2af72f80…` | 27 nightlies since 2026-09-23 | **11 — already full** | the newest 11 nightlies, **5 trees** |
| floor, `configHash` `f1e545a1…` | 8 nightlies since 2026-10-11 | 3 | the same 8 |

So by the rule **the cap windows are full today, and the print says `5/10
trees`**. The floor window restarted on 2026-10-09's `configHash` renovation,
which declared `preserves: false`; at the record's pace of about one tree per
2.7 nightlies it fills in early November, not near 2026-10-24.

§S5's widened read fixes the print as a side effect, but **arming depends on it
before this spec is built**, so it is the owner's call whether it becomes its
own issue and lands first.

**Build order.** One ticket, one session: the function, the two render
functions, the record read in `deploy.ts`, the floors file's `$comment`
sentence, and the tests. `docs/spec/README.md` carries the row.
