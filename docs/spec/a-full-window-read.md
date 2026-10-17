# The deploy reads a full window, the 2026-10-09 renovation preserves, and the armable line rounds down

The spec for [#464](https://github.com/mephistopheles4/stacks/issues/464).
Standard tier: planned and built in one session, `spec-464`, on Opus. Written
on 2026-10-17 for the owner to sign off. **Every decision marked *Claude's
recommendation* is open until then.** It must land before any bound is armed
([#322](https://github.com/mephistopheles4/stacks/issues/322), Q8 and Q9).

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
   score the window holds, and `breaches`, which is strictly under, refuses the
   next deploy on the very run the floor came from.

## S2. Solution

1. **The read stops at the end of both streaks.** A new pure function in
   `scripts/lib/floors.ts` says whether the rows read so far are enough, and
   `windowRecords` reads newest-first until it says so, or until
   `WINDOW_RECORD_CAP` (200 records) stops it.
2. **The 2026-10-09 entry is corrected to `preserves: true`**, with the
   measurement in its reason, once the owner approves it as a question (S7).
3. **The armable line rounds down**, by the rule #462 §S4 uses for its named
   value: `⌊L × 100 + 10⁻⁶⌋` hundredths.

## S3. User stories

1. As the owner deploying, I see `window full (10 trees)` on a scope whose
   window is full in the record, so the print never understates the evidence.
2. As the owner arming a scope, I can type the printed lowest into `floor` and
   the next deploy does not refuse on the run the floor came from.
3. As the builder of #462, I am handed rows reaching the oldest nightly of the
   unbroken run plus the row that broke it, so an age is a lower bound only
   when the read was cut short.

## S4. Implementation decisions

### The stopping rule — `windowReadEnough`

```ts
export interface WindowStamps {
  configHash: string;
  configAccepted: readonly string[];
  fixtureHash: string;
  fixtureAccepted: readonly string[];
}

export function windowReadEnough(rows: readonly RunRow[], stamps: WindowStamps): boolean;
```

It returns `true` when **both** of these hold:

- **The read holds more than `WINDOW_RUNS` nightlies.** That is today's rule,
  kept as a minimum, so the new read never reads less than the old one. The print's
  delta needs the run before the newest, and that is what the old rule bought.
- **Each of the two streaks has ended inside the read.** The floor's streak
  runs under `configHash` and its accepted values, and the caps' streak runs
  under `fixtureHash` and its accepted values. A streak has ended when the read
  holds a nightly older than the streak, which is the nightly that broke it: a
  failed run, a gap over three days, or a stamp the chain does not accept.

*Claude's recommendation:* **the read keeps the row that breaks each streak.**
Without it, #462's age walk cannot tell *the streak ended here* from *the read
ran out*, and would print every age as `at least`. With it, the walk reaches its
oldest row with the rule still holding only when `WINDOW_RECORD_CAP` cut the
read short, which is exactly when `at least` is true. So #462 needs no flag and
gets only rows, which is the shape its §S6 names: `deploy.ts passes the rows
through`.

The rule reuses `streakBack` and `countsTowardWindow` rather than restating
them, because `floors.ts` already warns that the window's predicates must not
drift between copies. It sits beside `calibration` and `capCalibration`, where a
test can reach it. `scripts/deploy.ts` has no test file.

### The caller

- `reportFloors` reads `renovations.json` before the records, because the rule
  needs the two stamps and their accepted values. It already reads the floors
  file first.
- `windowRecords` takes the stamps, reads newest-first, and after each record
  asks `windowReadEnough` of the rows read so far. `WINDOW_RECORD_CAP` stays the
  hard stop.
- **Cost.** At most 200 records are read, as the cap already allows. The rows are
  rebuilt per record, which at 200 records is 200 small passes. The build times
  `pnpm deploy:site --dry-run` before and after, and states the difference in
  its pull request.
- The docstring's *"twenty consecutive nightlies"* becomes what the read does.
  So do `floors.ts`'s two stale *"twenty consecutive"* lines, at `:1256` and
  `:1985`.

### The armable line — `roundDownToHundredths`

```ts
export function roundDownToHundredths(value: number): number;
// Math.floor(value * 100 + 1e-6) / 100
```

`unarmedState` prints `roundDownToHundredths(lowest).toFixed(2)`. It is exported
so #462 §S4 can name the same value through the same function. The `10⁻⁶` keeps a
value that is already an exact hundredth, such as `44.11`, whose float times 100
can land a hair under `4411`. The cap line does not change: counts are whole
numbers and `capBreaches` is strictly over.

### The renovation

Contingent on S7's question.

- **In place, not appended.** `acceptedValues` walks a stamp's entries newest
  first and stops at the first `preserves: false`. An appended entry naming the
  same value with `true` would stop at the old entry, which names the same
  value and says `false`, so the chain would never reach `2d2a34f1…`. The
  correction is to the newest `configHash` entry, which G57's own message
  allows.
- **It costs one `pnpm trend:sync --rebuild` on the owner's machine.** The
  local store already holds this entry, and `trend:sync` refuses any edit to an
  entry it holds, because `reason` is a series label and the edited entry would
  be drawn twice. The refusal names `--rebuild` as the recovery.
- **The docs that say no entry joins a window are corrected in the same
  commit.** These are `renovations.json`'s `$comment`, which says *"THE THREE
  ENTRIES BELOW ARE ALL `false`"* and is stale already, and a dated note on
  ADR-0085's *"`preserves` is built and unused"* bullet, with the bullet itself
  left verbatim by the repo's convention for records. `the-ratchet.md` §10 is a
  locked spec kept as written, and #462 leaves it unedited too.

## S5. Testing decisions

Test-first, one test per claim, in `scripts/lib/floors.test.ts`.

| # | Claim | Test |
| --- | --- | --- |
| C1 | The read is not enough until both streaks have ended inside it | rows whose `configHash` streak has ended and whose `fixtureHash` streak has not: `false`; add the older row that ends the second: `true` |
| C2 | Each of the three streak ends counts: a failed nightly, a gap over three days, an unaccepted stamp | one `it.each` over the three |
| C3 | An accepted value does not end a streak | a stamp change the chain accepts: `false` until the next unaccepted one |
| C4 | The read never stops short of today's minimum | both streaks ended within five nightlies: `false` until `WINDOW_RUNS + 1` |
| C5 | The armable line rounds down | `44.116` prints `44.11`; an exact `44.11` prints `44.11` |
| C6 | Through the real caller's arithmetic, a read stopped by the rule fills the window the whole record fills | `calibration` over the rows the rule stopped at equals `calibration` over all rows, on a planted record with a long streak |

C6 is the integration claim the issue's comment asks for: *"given enough
nightlies past the window, it returns enough rows for a full window of trees,
and for #462's age, back to the oldest nightly of the unbroken run."* C4 is
within the cost limit of two tests beyond one per claim.

The renovation has no unit test: G57 already holds the newest entry to the
floors file, and `acceptedValues`' chain is tested. Its evidence is the
measurement in S6, and its live check is the deploy print after the owner
rebuilds the store: `packages/site/src/shelf` reads `window full (10 trees)`.

## S6. The renovation's measurement

The question ADR-0085 asks before a `true`: **were the counts measured
unchanged?**

- **Premise, on every tree.** Both pickup files are absent from the trees of all
  13 nightly commits under the old stamp `2d2a34f1…`, from `171a96f` to
  `f1c252c`, the failed nightly's `3b702f3` included, and present on
  `3c94634`, the commit that added them.
- **Scores, on one tree.** Stryker is run twice on `f1c252c`, the newest tree
  under the old stamp, narrowed to the shelf scope by editing
  `stryker.scopes.json` in a scratch checkout. Once is with the old exclusions
  and once is with the two new ones. The narrowing is done in the scopes file,
  not with `--mutate`, which would replace the very negations being compared.
  The per-mutant inventory and statuses of the two runs are compared.
- **Canary.** The same construction on `3c94634` must differ by exactly the two
  files.

*Result: pending, filled in before the S7 question is sent.*

## S7. Needs the owner

| Decision | Asked as | When |
| --- | --- | --- |
| Correct the 2026-10-09 entry to `preserves: true`, and rebuild the trend store once | a question to the head chef | after S6's measurement, before the commit |
| Sign-off: proceed, fix or kill | a question to the head chef | after the spec pair, if run |
| Whether the added deploy seconds are acceptable | the pull request | at Test |

## S8. Out of scope

- Arming itself, which stays a hand edit per scope after #462 merges.
- #462's age, its tightening clause and its rendering.
- A duplication calibration window, which is #269's.

## S9. Further notes

⚠️ **The floors this arms are slack, and the owner accepted that** (#322, Q9).
The corrected window reaches trees from before recent test work. #462's
tightening clause is how they come back up.
