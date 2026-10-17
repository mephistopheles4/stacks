# The deploy reads a full window, the 2026-10-09 renovation preserves, and the armable line rounds down

The spec for [#464](https://github.com/mephistopheles4/stacks/issues/464).
Standard tier: planned and built in one session, `spec-464`, on Opus. Written
on 2026-10-17 and **signed off by the owner the same day (q4)**, so every
decision in it, the one marked *Claude's recommendation* included, is settled.
It must land before any bound is armed
([#322](https://github.com/mephistopheles4/stacks/issues/322), Q8 and Q9).
Revised after the spec pair; the crossing is on
[#471](https://github.com/mephistopheles4/stacks/pull/471).

Every line number below is on `main` at `4e97f22`.

## S1. Problem statement

The owner chose to arm every bound from the deploy print once
[#462](https://github.com/mephistopheles4/stacks/pull/462) merges (#322, Q9).
Three faults make that print wrong today, and each one is measured on #464.

1. **The deploy reads too few nightlies.** `windowRecords` in
   `scripts/deploy.ts:852` stops after `WINDOW_RUNS + 1` nightlies. That bound
   was written when one nightly was one sample. Since
   [ADR-0084](../adr/0084-the-counting-stamp-is-behaviour-not-a-version.md) a
   sample is a distinct tree, and `main` stands still for days, so eleven
   nightlies cover about five trees. Over the whole record the cap window is
   full, 11 trees since 2026-09-23. Over what the deploy reads it prints
   `5/10 trees`.
2. **The 2026-10-09 `configHash` renovation said `preserves: false`, and the
   runs either side of it are comparable.** The stamp moved because two
   exclusions joined `stryker.scopes.json`, `pickup.ts` and `pickup-tuner.ts`,
   and both files were created in that same commit. On every older tree the two
   negations match nothing. So the floor window restarted for no score's sake,
   and reads `3/10 trees` where it would read 11 trees over 24 days, full.
3. **The armable line rounds to nearest.** `unarmedState` in
   `scripts/lib/floors.ts:1526` prints `lowest.toFixed(2)`, so a window lowest
   of `44.116` prints `44.12`. Arming at the printed value sets a floor above a
   score the window holds, and `breaches` refuses the next deploy on the very run
   the floor came from. `breaches` refuses on `score < floor` over raw floats.

## S2. Solution

1. **The read stops at the end of both streaks.** One pure function in
   `scripts/lib/floors.ts` runs the read. It reads newest-first until both
   streaks have ended inside the read, or until the record cap stops it.
   `windowRecords` in `deploy.ts` becomes a thin caller.
2. **The 2026-10-09 entry is corrected to `preserves: true`**, with S6's
   measurement in its reason, as the owner approved (q2, S7).
3. **The armable line never prints a value above the window's lowest**, by the
   rule in S4, which the owner chose (q3).

## S3. User stories

1. As the owner deploying, I see `window full (10 trees)` on a scope whose
   window is full in the record, so the print never understates the evidence.
2. As the owner arming a scope, I can type the printed lowest into `floor` and
   the next deploy does not refuse on the run the floor came from.
3. As the builder of #462, I am handed rows that reach the oldest nightly of
   each unbroken run, plus the row that broke it. From those rows alone I can
   tell when an age is only a lower bound: when the streak reaches the oldest
   nightly read.

## S4. Implementation decisions

### The read — `readWindow` and `windowReadEnough`

```ts
export interface WindowStamps {
  configHash: string;
  configAccepted: readonly string[];
  fixtureHash: string;
  fixtureAccepted: readonly string[];
}

/** Whether the rows read so far are enough. */
export function windowReadEnough(rows: readonly RunRow[], stamps: WindowStamps): boolean;

/** Newest-first names in, the records the window needs out. */
export function readWindow(
  names: readonly string[],
  load: (name: string) => ParsedRecord | undefined,
  stamps: WindowStamps,
  cap: number,
): ParsedRecord[];
```

`windowReadEnough` returns `true` when **both** of these hold:

- **The read holds more than `WINDOW_RUNS` nightlies.** That is today's rule,
  kept as a minimum, so the new read never reads less than the old one. The
  print's delta needs the run before the newest, and that is what the old rule
  bought.
- **Each of the two streaks has ended inside the read.** The floor's streak
  runs under `configHash` and its accepted values, and the caps' streak runs
  under `fixtureHash` and its accepted values. A streak has ended when
  `streakBack` over the nightlies read returns fewer rows than there are
  nightlies. So the read holds the nightly that broke it: a failed run, a gap
  over three days, or a stamp the chain does not accept. That covers the empty
  streak too, where the newest nightly is itself the break.

`readWindow` loads names in order and stops on the first of three things:
`windowReadEnough` holding, `cap` names tried, or the names running out. An
unreadable name is skipped and still counts toward the cap, as today.

*Claude's recommendation:* **the read keeps the row that breaks each streak.**
With it, #462 can tell from rows alone, with no flag, whether its age is exact.
**An age is a lower bound when the streak reaches the oldest nightly read**,
because only the cap or the end of the record can stop a read inside a streak.
#462's walk must apply that test itself. Its current wording would stop where
the windows near the oldest row stop being full, and print a capped age as an
exact, understated number. That is a note for #462, not a change here.

The rule reuses `nightliesIn`, `streakBack` and `countsTowardWindow` rather
than restating them, because `floors.ts` already warns that the window's
predicates must not drift between copies. It sits beside `calibration` and
`capCalibration`, where a test can reach it. `scripts/deploy.ts` has no test
file, which is why the loop moves too.

### The caller

- `reportFloors` reads `renovations.json` before the records, because the read
  needs the two stamps and their accepted values. It already reads the floors
  file first.
- `windowRecords(store, stamps)` sorts the names as today and calls
  `readWindow(names, (name) => parse what readRecord returns, stamps,
  WINDOW_RECORD_CAP)`. `WINDOW_RECORD_CAP` stays 200 and stays in `deploy.ts`.
- **Cost.** At most 200 records are read, as the cap already allows, and the
  rows are rebuilt once per record. The build states two figures before and
  after in its pull request: the records read and the milliseconds spent in
  `reportFloors`. A whole `--dry-run` is not timed, because its gates and
  build are minutes of noise against this.

### The stale text

These go false with this change, and each is corrected in the same commit:

- `windowRecords`' docstring, *"twenty consecutive nightlies"*;
- `floors.ts:1256` and `:1985`, *"twenty consecutive"*;
- `deploy.ts:754-755`, *"which is every stamp today"*;
- `gates/config-hash.test.ts:143-144`, *"which is every entry in the file
  today"*, which is already false since the 2026-10-17 `true`.

### The armable line — `roundDownToHundredths`

```ts
export function roundDownToHundredths(value: number): number;
```

`unarmedState` prints `roundDownToHundredths(lowest).toFixed(2)`, and the
function is exported so #462 §S4 can name its value through it.

⚠️ **The issue's rule, `⌊L × 100 + 10⁻⁶⌋` hundredths, can still print above
`L`.** A score is stored as the record's fraction times 100, so `0.29` arrives
as `28.999999999999996`. The rule prints `29.00`, and a floor of `29` is under
no score but over this one, so `breaches` refuses the run it came from.
Measured in Node on 2026-10-17.

**Decided by the owner (q3, 2026-10-17): the largest hundredth that is not
above `L`, compared as `breaches` compares.** ⚠️ **For #322's build session:**
#462 §S4's named value `N` uses this function, `roundDownToHundredths`, and not
the `⌊L × 100 + 10⁻⁶⌋` it states. That is
`k = ⌊L × 100⌋`, then one step up if `(k + 1) / 100 ≤ L`, then one step down
if `k / 100 > L`. A printed floor is then never above a score the window holds,
whatever the float. The cost is that it departs from the rule the owner named
on #464 and #462 §S4 uses, so #462 adopts this function. The cap line does not
change: counts are whole numbers and `capBreaches` is strictly over.

### The renovation

Contingent on S7's first question.

- **In place, not appended.** `acceptedValues` walks a stamp's entries newest
  first and stops at the first `preserves: false`. An appended entry naming the
  same value with `true` would stop at the old entry, which names the same
  value and says `false`, so the chain would never reach `2d2a34f1…`. The
  correction is to the newest `configHash` entry, which G57's own message
  allows.
- **It costs one `pnpm trend:sync --rebuild` on the owner's machine.** The
  local store already holds this entry, and `trend:sync` refuses any edit to an
  entry it holds, because `reason` is a series label and the edited entry would
  be drawn twice. The refusal names `--rebuild` as the recovery. The deploy
  print does not wait on it: `reportFloors` reads the git `metrics` ref, not the
  time-series store.
- **The docs that say no entry joins a window are corrected in the same
  commit.** These are `renovations.json`'s `$comment`, which says *"THE THREE
  ENTRIES BELOW ARE ALL `false`"* and is stale already, and a dated note on
  ADR-0085's *"`preserves` is built and unused"* bullet. The bullet itself is
  left verbatim, by the repo's convention for records. `the-ratchet.md` §10 is
  a locked spec kept as written, and #462 leaves it unedited too.

### Rollback

- The read and the armable line: revert the commit; git alone undoes them.
- The renovation: revert the entry. That changes the stored prefix again, so
  it costs a second `pnpm trend:sync --rebuild`.

## S5. Testing decisions

Test-first, one test per claim, in `scripts/lib/floors.test.ts`.

| # | Claim | Test |
| --- | --- | --- |
| C1 | The read is not enough until both streaks have ended inside it | rows whose `configHash` streak has ended and whose `fixtureHash` streak has not: `false`; add the older row that ends the second: `true` |
| C2 | Each of the three streak ends counts: a failed nightly, a gap over three days, an unaccepted stamp, the newest nightly included | an `it.each` over a failed nightly and an unaccepted stamp, and one test for the gap, which needs two rows to exist; each also as the newest nightly |
| C3 | An accepted value does not end a streak | a stamp change the chain accepts: `false` until the next unaccepted one |
| C4 | The read never stops short of today's minimum | both streaks ended within five nightlies: `false` until `WINDOW_RUNS + 1` |
| C5 | The armable line never prints above the lowest | `44.116` prints `44.11`; an exact `44.11` prints `44.11`; `28.999999999999996` prints a value that, armed as the floor, gives no breach through `breaches` |
| C6 | Through the real callers' arithmetic, the read fills the windows the whole record fills, and reaches each streak's oldest nightly and the row that broke it | a planted record with a `fixtureHash` streak longer than the `configHash` one and nightlies past both breaks; `readWindow` over it; `runs`, `full`, `days` and `lowest` of `calibration`, and `highest` of `capCalibration`, equal to the same over every record; the returned rows hold each streak's oldest nightly and its breaking row |
| C7 | The read stops at the cap or at the end of the record | a planted record whose streaks never end: `readWindow` returns `cap` records, or every record when there are fewer |

C6 is the claim the issue's comment asks for: *"given enough nightlies past the
window, it returns enough rows for a full window of trees, and for #462's age,
back to the oldest nightly of the unbroken run."* It goes red if the rule stops
one row early, because the planted record holds nightlies past each break. C2's
gap test is the one test beyond one per claim: Tests added is 1 of 2. There is
no gate row, and the build is one ticket in this pull request.

**Done means** `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`
green, with the new tests observed failing first.

The renovation has no unit test: G57 already holds the newest entry to the
floors file, and `acceptedValues`' chain is tested. Its evidence is S6, and its
live check is the deploy print after merge, where `packages/site/src/shelf`
reads `window full (10 trees)`.

## S6. The renovation's measurement

The question ADR-0085 asks before a `true`: **were the counts measured
unchanged?** Measured on 2026-10-17. **They were.**

- **Premise, on every tree.** Both pickup files are absent from the trees of all
  13 nightly commits under the old stamp `2d2a34f1…`, from `171a96f` to
  `f1c252c`, the failed nightly's `3b702f3` included. Both are present on
  `3c94634`, the commit that added them.
- **Scores, on one tree.** Stryker ran twice on `f1c252c`, the newest tree
  under the old stamp, in a scratch checkout with its own install, narrowed to
  the shelf scope by editing `stryker.scopes.json`. One run used the old
  exclusions and one the two new ones, both at `--concurrency 6`. The narrowing
  is done in the scopes file, not with `--mutate`, which would replace the very
  negations being compared. **Both found 25 of 578 files and instrumented 2,688
  mutants. Mutant for mutant (file, location, mutator and replacement), the two
  inventories are identical, and not one status differs**: 1,741 killed, 18
  timed out, 425 survived, 504 with no coverage, in each.
- **Canary.** The same construction on `3c94634` finds 32 files under the old
  exclusions and 30 under the new: exactly the two files, 563 mutants between
  them. So the measurement can tell the two configurations apart.
- **The tolerance it was held to.** The inventory had to be identical. A
  Timeout-to-Killed flip would have meant re-running the old configuration once
  as a control. None occurred.
- **The chain over the corrected file**, through `acceptedValues` and
  `calibration` over all 209 records in the store: today it accepts
  `f1e545a1…` alone and reads `3/10 trees, 6 days`. Corrected, it accepts
  `f1e545a1…` and `2d2a34f1…`, stops at the 2026-09-08 entry, and reads
  **11 trees over 24 days, full**. The cap window reads 11 trees over 24 days,
  full, either way.

**Had they differed**, the entry would have stayed `false` and items 1 and 3
would have shipped alone. The same holds if the owner refuses the correction.

## S7. Needs a human

| Decision | Who | When |
| --- | --- | --- |
| Correct the 2026-10-09 entry to `preserves: true` | **decided: yes** (q2, the owner through the head chef, 2026-10-17) | edited in the build |
| The armable line's rule | **decided: never above the lowest** (q3, the owner through the head chef, 2026-10-17) | built here; #462 adopts it |
| Sign-off: proceed, fix or kill | **decided: proceed** (q4, the owner through the head chef, 2026-10-17) | built in #471 |
| `pnpm trend:sync --rebuild`, once | the owner, by hand | after merge, before the next `pnpm trend:sync` |
| Whether the added deploy time is acceptable | the owner | at the pull request |

### For #462's builder

#462's spec ([#322](https://github.com/mephistopheles4/stacks/issues/322))
states two things this build changes. Read these before building it.

1. **The named value `N` is `roundDownToHundredths(L)`, not
   `⌊L × 100 + 10⁻⁶⌋`.** The owner chose it (q3), because the formula #462
   §S4 names prints `29.00` for a stored `28.999999999999996`, and a floor typed
   from that refuses the run it came from.
2. **An age is a lower bound when a streak reaches the oldest nightly read.**
   Test that first, before the full-window test: a window ending near the oldest
   row read is not full, so #462 §S5's wording would print an age the cap cut
   short as an exact number. The read reaches the end of **both** streaks,
   `configHash` and `fixtureHash`, not one, and keeps the row that broke each,
   so the test needs nothing but the rows.

## S8. Out of scope

- Arming itself, which stays a hand edit per scope after #462 merges.
- #462's age, its tightening clause and its rendering, beyond the lower-bound
  test S4 hands it.
- A duplication calibration window, which is #269's.

## S9. Further notes

⚠️ **The floors this arms are slack, and the owner accepted that** (#322, Q9).
The corrected window reaches trees from before recent test work. #462's
tightening clause is how they come back up.
