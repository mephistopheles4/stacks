# ADR-0079 — The floors stamp is compared at merge, and the hash stays global

**Date:** 2026-08-26
**Status:** accepted
**Ticket:** [#224](https://github.com/mephistopheles4/stacks/issues/224)

## Decision

A gate compares `stryker.floors.json`'s `configHash` to
`configHashOf(strykerConfig)` and fails the build when they disagree. It watches
**`configHash` only**. Its failure prints the command that re-derives the stamp.
The deploy print gains the stamp it is counting under, beside the count.

Three widenings are **declined**, and the rest of this record is why. The hash
stays one hash over the whole configuration. `tsconfigFile` stays hashed.
`fixtureHash` stays unwatched at merge. A fourth question — folding the resolved
`typescript` version into a stamp — stays where [ADR-0070](./0070-the-type-checker-stays-off-until-the-compiler-is-hashed.md)
left it.

## Context

`stryker.floors.json` records a hash of the Stryker configuration that scored
the floors beside it. Two commits — [`738ee75`](https://github.com/mephistopheles4/stacks/commit/738ee75)
and [`6478a69`](https://github.com/mephistopheles4/stacks/commit/6478a69) —
changed scoring configuration and did not re-derive that stamp. Both reached
`main` with every check green.

**The drift was never silent, and the correction matters.** `floorRefusals`
reads a run stamped with a *different* hash as evidence that somebody changed
scoring configuration without re-deriving, so it refuses whatever is armed —
`unarmed` buys no quiet. Measured against `main`'s floors file with zero armed
scopes: one refusal with the stale stamp, zero with the refreshed one. So
`pnpm deploy:site` stops, and it stops with a release in hand.

What nothing did was catch it **earlier**. No gate, no test and no CI check
compared the two files, although both sit in the repository root and neither
needs an armed scope or a metrics record to compare.

⚠️ **The genuinely silent half is the calibration window**, and it stays half
solved by this record. `calibration()` counts only rows carrying the floors
file's stamp, so a restarted window reads `0 of 20` — indistinguishable from a
window that has not filled yet. Printing the stamp beside the count separates
the two states for a reader who remembers the last one. It does not say *why*
the stamp moved; that is [#227](https://github.com/mephistopheles4/stacks/issues/227)'s
renovation marker, and this record does not pre-empt it.

## The precedent, and why the asymmetry ends here

[G47](../../gates/ignored-clones.test.ts) already compares
`jscpd.floors.json`'s `duplicationHash` to the rule this checkout would count
with, and its own comment states that it deliberately does nothing for
`stryker.floors.json`, *"whose stamps are still unwatched until #224"*. The
repository therefore already accepted this gate's one real cost — a legitimate
two-step edit shows red in between — for the sibling file.
[`docs/spec/the-ratchet.md`](../spec/the-ratchet.md) §4's table already names
the diff as `stryker.config.*` **and** the floors file's hash.

Measured on the day of this record: the two agree at
`sha256:d63e1214…`, so the gate lands green.

## The three widenings, and why each is declined

**A per-scope hash — declined, and deferred to #227 rather than refused.** One
exclusion on one scope resets all eight calibration windows; at twenty runs on a
nightly cadence that is about three weeks across every scope, for a change that
in general touches one. The complaint is real. What defeats acting on it *here*
is that the pain is the **unexplained** reset more than the frequent one, and
#227 addresses exactly that from the other end. The cost of acting early is not
small: `calibration()` computes one streak from one filter
(`row.configHash === configHash`), so per-scope stamps mean eight streaks, eight
entries in the floors file, and a change to `stacks_run_info`, which carries one
`config_hash` per run. And the trap #224 states stands — the score-affecting
options are genuinely global, so a per-scope hash must still fold them in.
Building the expensive half of a problem whose cheap half may dissolve it is the
wrong order.

**`tsconfigFile` added to `SCORE_NEUTRAL_OPTIONS` — declined, as correct
conservatism.** It changed in `738ee75` with `checkers: []` set, where it cannot
reach a verdict, and it was hashed anyway. The list's own doctrine answers this:
a field wrongly hashed produces a loud refusal that costs one re-derivation; a
field wrongly ignored produces two numbers that do not mean the same thing and
nothing that says so. `tsconfigFile` is neutral only **while** the checker is
off, and ADR-0070 makes that a condition rather than a permanent state — so
adding it plants a hole that opens on the day the checker flips on, in the half
nobody re-reads.

**`fixtureHash` watched by the same gate — declined for now, and the gate says
so.** The hole is the same shape; the cost is not. `fixtureHash` pins the
resolved `eslint` and `@typescript-eslint/parser` versions, so a gate over it
goes red on every dependency bump, and a bot cannot re-derive a stamp. #227's
second question is precisely whether a detected change with no declared reason
should itself refuse, and deciding `fixtureHash` here would answer it early. The
gate names what it declines to cover, the way G47 does.

## The compiler version stays where ADR-0070 left it

ADR-0070 keeps Stryker's type checker off until the resolved `typescript`
version is an ingredient of the score's stamp. That condition is unchanged here.

⚠️ **One of ADR-0070's supporting sentences is looser than it reads, and it is
recorded rather than quietly relied on.** It argues that flipping `checkers`
would be visible while *"a Dependabot bump of `typescript` would not"*.
Measured: `typescript` is pinned **exact** at `6.0.3` — no caret — so a bump is
a reviewable `package.json` diff, and the resolved version moved once in the
repository's first 26 days, deliberately, at `738ee75`. The bump is therefore
visible. ADR-0070's conclusion survives intact, because visibility to a reviewer
was never the failure: the failure is that scores shift and **nothing in the
record says so**. The pin changes who might notice, not what is recorded.

## Consequences

- A two-step edit that changes scoring configuration is red between the two
  steps. That is the accepted cost, and it is the same one G47 already charges.
- The gate needs a small script that writes the stamp, because none exists: no
  `pnpm` command re-derives it today, so the current remedy is a hand-copied
  hash that nothing checks until the next run.
- `gates/ignored-clones.test.ts` and `stryker.floors.json`'s own `$comment` both
  assert that nothing compares this stamp. Both become false when the gate lands
  and are corrected in the same diff.
- The calibration print separates a restarted window from a young one for a
  reader who remembers the previous stamp. It still cannot explain the restart.
- Nothing here arms anything. Every floor and every cap stays `unarmed`; arming
  remains a human judgement per scope after that scope's window fills.
- The window stays at **20 runs, counted in runs**, with the three-day gap
  clause. Shortening it was considered and declined here: the spec's own warning
  is that a rule fixed in advance is *"still gameable once"*, by choosing the
  window's length after watching the numbers, and `the-ratchet.md`'s *"Why 20"*
  rests on twenty runs being enough that a CI variance band is computed rather
  than assumed. ⚠️ **The honest counter is recorded too** — no window has
  filled and every floor is unarmed, so this is the last moment the length can
  change without that objection attaching. It was not taken.
