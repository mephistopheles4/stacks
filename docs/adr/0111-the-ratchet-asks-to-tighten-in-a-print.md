# ADR-0111 — The ratchet asks to tighten, in a print and nowhere else

**Date:** 2026-10-17
**Status:** accepted, built in [#322](https://github.com/mephistopheles4/stacks/issues/322)
**Issue:** [#322](https://github.com/mephistopheles4/stacks/issues/322)
**Spec:** [`docs/spec/the-ratchet-tightens.md`](../spec/the-ratchet-tightens.md)
**Supersedes:** one clause of [`the-ratchet.md`](../spec/the-ratchet.md) §8, *"It never asks for improvement"*, and nothing else in it. [ADR-0061](0061-the-mutation-floor-refuses-deploy.md) and [ADR-0068](0068-the-complexity-cap-only-falls.md) are not amended.

## Decision

When an armed bound has been slack for a full calibration window, the
`pnpm deploy:site` print says so: one line beside that bound naming the tighter
value and how long it has been available. A mutation floor is **tightenable**
when its window's lowest score beats it by at least one mutant; a complexity cap
is tightenable when its window's highest count is at least one below it.

**The line asks and does nothing else.** It edits no file, opens no issue and no
pull request, refuses nothing and escalates nothing. Every bound still moves by
hand, in a pull request, and a tightening needs no `notes` line, while a
loosening still does.

**Nothing is armed until the spec this record belongs to has merged**, so the
rule is written down before any bound exists for it to apply to.

## Why

The ratchet's mechanical half ran once: arming derives a bound from history, and
nothing afterwards ever reads that history again in the tightening direction.
ADR-0061 recorded the result as an accepted risk — *the floor will probably
never be raised*, and the piece looks armed and does nothing — and #322 is the
owner declining to keep accepting it: the ratchet exists to raise the floor
*"with something that is deterministic and mechanical"*.

**The rule adds no number.** It is the arming rule run again, in one direction
only: the same window, the same distinct-tree count, the same stamp,
preservation and gap rules, walked by the same code. The margin is the smallest
change a test or a refactor can make — one mutant, one count — rather than a
figure chosen now, which [`the-ratchet.md`](../spec/the-ratchet.md) §2 refuses
for the same reason it refused a noise margin: nobody has measured the churn it
would have to absorb. And because the rule is fixed before any bound is armed,
it cannot be chosen after watching the numbers, which is the gameability #322's
first decision names.

**`the-ratchet.md` §8's "re-deriving is lowering" still holds.** The arming
rule run again would produce a *looser* bound after a regression, which is why
§2 says it initialises and does not maintain. This record runs it again in the
tightening direction only, and only to ask. A looser window never prints
anything.

## What was rejected

- **Leaving §8 as it stands.** The accepted risk stays, and the ratchet stays
  silent after arming.
- **A nightly that opens an issue.** It reaches the owner without a deploy, and
  a closed issue would record a decline for free. It was tried in the
  decision box and dropped: it files something, and §10's line *"escalates
  never, files nothing"* is what keeps the print inside the standing constraint.
  ADR-0061 already rejected an auto-opened pull request as *a job acting on a
  metric movement*; an auto-opened issue is the same kind of act.
- **A margin chosen in the spec**, in points or counts. One number cannot serve
  a percentage and a count, and either figure would be invented.
- **The newest reading alone.** A value named from one sample is a bound derived
  from one sample, which §2 forbids for arming.
- **A line that names no value.** The armable line already names one, and a
  person would recompute what the tool knows.
- **A decline recorded in `notes`, or a dated snooze.** A note costs a pull
  request per decline, which pushes toward accepting the value unread; a snooze
  is a second value somebody can type to make a prompt go away, the weakness §7
  already names for `unarmed`.

## What it costs

- ⚠️ **You still only see it if you deploy.** This is the fourth mechanism to
  reach the owner through `pnpm deploy:site` alone. A line on the trend page,
  which reaches the owner on a day with no deploy, is a follow-up rather than
  part of this record, and it files nothing either.
- ⚠️ **The line can be ignored forever.** The printed age makes a long
  ignore visible; it does not make it impossible. That is §7's answer for
  `unarmed`, carried over unchanged.
- **The named value invites acceptance unread.** It is what the arming rule
  would produce, so accepting it unread lands the bound the window supports and
  no tighter — but nothing checks that anyone looked.
- **The age can overstate.** It walks back against today's bound, and the
  record does not say when a bound last moved, so a run of slack that began
  before the last tightening is counted whole.

## Amendment, 2026-10-17: nothing while the current reading is worse

The build found that a cap's current count is read from the newest counted run, often a merge run, while the window that names the tighter cap reads nightlies alone, so the print could read `current 13` beside `window highest 11 - tightenable`, and typing 11 would refuse the next deploy. The spec's rule (§S4) produced this, as the armable line already does for arming. **The owner chose, as q2, that the clause names nothing while the current reading is worse than the value it would name**: a cap whose current count is above the window's highest, a floor whose current score is under the window's lowest, whole or degraded. A reading equal to the value still asks. This departs from §S4, which is locked and not edited; this is the only departure from its rule. The arming line is unchanged. Floors cannot hit it today, since a merge run carries no score, so it is guarded rather than observed there.

## Amendment, 2026-10-24: the same asks reach the trend page

[#463](https://github.com/mephistopheles4/stacks/issues/463) built the follow-up named under *What it costs*. `pnpm trend:sync` now asks the same question from the same call. `askTightenings` in `scripts/lib/floors.ts` assembles the readings and runs `tightenings` for both the deploy print and the sync, over the same reads in `scripts/lib/ratchet-inputs.ts`, so neither the window walk nor its inputs exist twice. The sync writes the asks as a local `-ratchet.prom` row only when they change, and the trend page's last panel reads the newest row. **The decision above is unchanged**: the page asks and does nothing else, and it refuses, files and edits nothing. The first cost, *you still only see it if you deploy*, is closed for anyone who syncs. The title is left as it stands, per the append rule.
