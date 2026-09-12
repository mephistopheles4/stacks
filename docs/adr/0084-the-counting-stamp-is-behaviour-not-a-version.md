# ADR-0084 — The counting stamp is behaviour, not a version, and a sample is a tree

**Date:** 2026-09-12
**Status:** accepted
**Ticket:** [#341](https://github.com/mephistopheles4/stacks/issues/341)

## Decision

Three changes, all of which reach the **mutation floor and the complexity cap
together**, because one `streakOf` walks both.

1. **`fixtureHashOf` stops digesting the three installed versions.** `eslint`,
   `@typescript-eslint/parser` and `eslint-plugin-sonarjs` leave the hash. The
   two rule-option sets and the two inventories stay, and the inventories are
   what now stand for behaviour.
2. **One sample is one distinct commit**, not one build. `RunRow` gains
   `commit`, and a row carrying none is its own sample.
3. **The window is ten samples**, not twenty. The deploy print says `trees`.

`CounterInputs.eslintVersion`, `.parserVersion` and `CognitiveInputs.sonarjsVersion`
are **kept and no longer hashed**. They are provenance, read off the installed
package rather than off `package.json`, and nothing downstream may treat them as
an input to a number.

**Not decided here**: whether merges join the window. See *Consequences*.

## Context

A complexity cap and a mutation floor are both derived from a calibration
window: the extremum a scope reached across a run of healthy nightlies. A stamp
records the rule those numbers were produced under, so numbers from two
different rules are never compared — a sound guard, and
[ADR-0079](./0079-the-floors-stamp-is-compared-at-merge.md) deliberately leaves
`fixtureHash` unwatched at merge because a gate over an installed version would
redden on every Dependabot bump.

**The window had never filled, and could not.** Measured on #341:

| quantity | measured |
| --- | --- |
| a release moving the stamp | every **6.8 days** (typescript-eslint minors 10.1, eslint minors 21.0) |
| twenty nightlies | about **20 days** |
| best window ever reached | **14 of 20**, then reset |

Three resets in three weeks, none reaching twenty. Every one was individually
justified, and `stryker.floors.json` recorded each as an incident. Nothing summed
them, so the pattern was invisible until somebody asked whether the window ever
fills.

**A version string is not a behaviour, and that was measured rather than
argued.** The same tree counted under parser 8.67.0 with eslint 10.9.1, then
under 8.70.0 with 10.10.0: **all 64 complexity and cognitive rows identical**, a
planted one-row change proving the comparison could see a difference. That is the
upgrade pair that blocked a deploy the same day. Four upgrades are now measured
across two counters — [#328](https://github.com/mephistopheles4/stacks/pull/328)
and [#339](https://github.com/mephistopheles4/stacks/pull/339) for duplication,
[#337](https://github.com/mephistopheles4/stacks/pull/337) and
[#338](https://github.com/mephistopheles4/stacks/pull/338) for complexity — and
none moved a number.

**The second finding was not in the ticket.** The window counts *builds* as a
proxy for how much code it has seen. Measured over the whole `metrics` record:
**24 nightlies across 23.2 days covered 13 distinct commits** — 1.85 builds per
tree, one new tree every 1.78 days, because `main` stands still for days on a
repository with one maintainer. So twenty runs delivered about eleven trees and
named more evidence than it held; asking for twenty real trees takes about 36
days. **A twenty-run window cannot be made to mean what it says**, which is why
the size fell as the unit was corrected.

## Why the inventory is a stronger guard, not a weaker one

The hash keeps `canonical(inputs.inventory)` and `canonical(cognitive.inventory)`.
An inventory is what each rule is held to say about **every counted construct and
every function-shaped node**, total and not sampled, in
`fixtures/complexity/inventory.ts` and its cognitive twin.

So an upgrade that really counts differently turns `complexity.test.ts` or
`cognitive.test.ts` **red at merge**, and correcting the fixture is what moves the
stamp. The chain is: behaviour moves → a gate goes red → the fixture is corrected
→ the stamp moves → every window restarts. An upgrade that changes nothing
restarts nothing. That replaces a string nobody checked with an assertion CI runs.

⚠️ **What is lost, stated rather than hidden.** An upgrade could change counting
on a construct no fixture exercises, and the stamp would not move. The guarantee
is bounded by how total the inventories are. That is a real gap and it is smaller
than the failure it replaces: a window that never filled at all.

## Alternatives considered

- **Count merges as well as nightlies.** Rejected by
  [ADR-0068](./0068-the-complexity-cap-only-falls.md), and see *Consequences* —
  that rejection turns out to be narrower than it reads, but nothing here decides
  to include them.
- **Shorten the window and change nothing else.** Ten runs still race a 6.8-day
  reset, and ten runs deliver about five trees. It buys nothing and costs half
  the evidence.
- **Pin the two tools and upgrade them deliberately**, as `three` already is.
  Cheapest possible change, one line of `.github/dependabot.yml`. Declined
  because it trades dependency freshness for a working window and leaves the
  stamp still lying about what it measures.
- **Recount the earlier commits under the new rule** so history becomes
  comparable. Declined: it buys fast recovery from an event measured at zero
  occurrences, and when that event finally happens the counts genuinely differ —
  which is exactly when rewriting the record to claim the old tool produced
  today's numbers is most wrong.
- **Delete the cap machinery.** Declined; the counters, the stamp and the deploy
  comparison are built and tested.

## Consequences

- **Every window reads 0 of 10 from this commit**, because no run in the record
  carries the new stamp. It fills in about 18 days. Unlike the four refreshes
  before it, **no dependency bump can restart it**, which is the point.
- **`pnpm deploy:site` refuses until the first record carrying the new stamp
  lands.** Push records carry counts, so the merge itself clears it; no nightly
  wait. Observed refusing on this branch on purpose.
- **The mutation floor moves too**, though #341 was about the cap. One `streakOf`
  walks both and `stryker.floors.json` states that as deliberate; splitting them
  would add a second path to keep in step. The floor had no never-fills problem —
  `configHash` moves on configuration edits, not weekly bumps — but it shares the
  distinct-tree correction, and its print immediately fell from `14/20 runs` to
  `1/10 trees` because four consecutive nightlies had measured one commit. That
  number is not a regression; it is what the record always held.
- ⚠️ **ADR-0068 is narrower than it reads, and is not amended.** It rejects
  merges because *twenty merges can land in two days, so the maximum covers less
  history* — an argument about **calendar time**, sound while each build is a
  sample. Counting trees, twenty merges are twenty distinct trees: more code
  variety, not less. So merges are no longer excluded *for that reason*. They
  stay excluded because nothing has decided otherwise. Including them is the
  cheapest way to shorten the 18 days if that ever matters.
- **A row with no commit is its own sample, permanently.** Records are not
  rewritten, so every row written before this ADR lacks one, and two unknown
  trees cannot be proved equal.
- **The gap clause still reads run timestamps**, never sample timestamps. It asks
  whether CI kept running, not whether the code moved; a branch idle for a week
  is a filling window and not a broken one.
- **Nothing is armed and nothing refuses differently.** Every floor and cap in
  `stryker.floors.json` ships `unarmed`, so this lowers nothing and owes no
  `notes` entry.
