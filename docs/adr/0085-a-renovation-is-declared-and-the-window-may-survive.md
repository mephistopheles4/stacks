# ADR-0085 — A renovation is declared, it is due at merge, and the window may survive it

**Date:** 2026-09-12
**Status:** accepted
**Ticket:** [#227](https://github.com/mephistopheles4/stacks/issues/227)

## Decision

Six choices, taken together as one configuration rather than one at a time.

1. **`renovations.json` is the home of record**, at the repository root beside
   the two floors files it explains. One dated entry per change, each naming the
   stamp, its new value, the reason, and the pull request.
2. **It covers all three stamps** — `configHash` and `fixtureHash` from
   `stryker.floors.json`, `duplicationHash` from `jscpd.floors.json` — and it is
   **keyed on the stamp, never on the file**.
3. **It also accepts a free entry**, `"stamp": "none"`, for a change a reader
   notices and no stamp records.
4. **A merge gate forces it.** [G57](../gates.md) compares each stamp on disk to
   the newest entry naming it. A stamp that moves without an entry is a red pull
   request.
5. **A marker reaches the trend page** as a Prometheus series, drawn by a Grafana
   annotation query provisioned from `grafana/`.
6. **A marker may preserve the calibration window**, per entry, through a
   required `preserves` field.

**The deploy is explicitly rejected as the enforcement point.** See below.

## Context

A **stamp** records the rule a number was produced under. When one moves, the
numbers either side of it are not comparable, so the calibration window restarts.
The stamp therefore *detects* a change and says nothing about **why** — a reader
of the trend page meets a step change and supplies their own story.

**The pattern was invisible until somebody asked.** Four windows restarted in
about three weeks. Every one was individually justified, and
`stryker.floors.json` recorded each as dated prose in its own `$comment`. Nothing
summed them, and dated prose marks the **file** rather than the series.

**What triggers a renovation changed under this ticket's feet, and the issue body
is now wrong about it.** #227's table says a version upgrade *"shifts, and
refuses"*. Since [#342](https://github.com/mephistopheles4/stacks/pull/342) a
version bump moves no stamp at all. The same table already measured that extra
ESLint rules, markdownlint and Prettier move no count. So **every remaining
trigger is human-caused and has an author** — which is the argument for demanding
the reason at the moment somebody restamps, rather than reconstructing it later.

## Why a merge gate, and not the deploy

[#227](https://github.com/mephistopheles4/stacks/issues/227)'s fourth question
warns that a marker must not become an override flag by the back door, and
[ADR-0061](./0061-the-mutation-floor-refuses-deploy.md) and
[ADR-0068](./0068-the-complexity-cap-only-falls.md) provide none on purpose.

⚠️ **That warning binds hardest in exactly the configuration chosen here.** A
deploy refusal cleared by writing a sentence is tolerable while the marker only
*explains* a restart: the floor refusal is untouched, and the reason is the only
thing supplied. It stops being tolerable once a marker can **preserve** the
window, because then the sentence changes what the floor is derived from. A
written sentence would move a number that gates the deploy. That is the flag both
records decline, arriving through a door neither of them named.

The gate also acts **first** rather than last. A deploy refusal arrives with a
release in hand, which this repository has paid for once already: a stale stamp
blocked a deploy for two days ([#292](https://github.com/mephistopheles4/stacks/issues/292)).
G57 reads the disk and needs no metrics record, which is what lets it run at
merge — [G56](../gates.md)'s footing exactly.

## What this does to ADR-0079, which is not amended

[ADR-0079](./0079-the-floors-stamp-is-compared-at-merge.md) declined a gate over
`fixtureHash` because *a gate over an installed version goes red on every
Dependabot bump, and a bot cannot re-derive a stamp*. #342 removed the first half
of that premise.

**This record does not restore the gate it declined, and the distinction is the
point.** G57 watches the **reason**, never the value. Re-deriving `fixtureHash`
still needs a full counting run, which a merge check will not do, so the value
stays unwatched at merge — on **cost** now, rather than on ADR-0079's reason. The
question that record left for #227 was *whether a detected change with no
declared reason should itself refuse*, and the answer here is **yes, at merge,
about the reason**.

ADR-0079 is left exactly as written, per this repository's rule that records
carry their original reasoning verbatim.

## Why the free entry is not a hole

`renovations.json` accepts `"stamp": "none"` for a change no stamp records.
**Nothing can force such an entry**, because forcing means a comparison and there
is no stamp to compare against. That is a property of the class rather than a gap
in the gate, and it is stated in three places — the file, the gate's header, and
here — rather than left to be discovered.

⚠️ **A morphological box is what found this.** *Any declared event* was drawn as a
peer of the three stamps in a row called *what a marker covers*. Read against the
three forcing mechanisms, it conflicted with **all** of them, for one reason each
time. A cell that nothing can ever force is not a peer of cells that can: the row
was two dimensions wearing one, and it split into *what must carry a marker* and
*what else the file accepts*.

## Why `preserves` is required and never defaulted

`preserves` says whether the calibration window survives a change. It is required
on every stamp entry and has no default.

**A default would let *nobody decided* read as a decision.** `false` is the
conservative value, and the failure it invites is not a wrong number — it is a
field nobody thought about reading as a field somebody answered. This is
`private:`'s fail-closed reasoning applied to a different question: the safe value
is still stated rather than fallen into.

⚠️ **All three seeded entries are `false`, and that is deliberate rather than
lazy.** [ADR-0084](./0084-the-counting-stamp-is-behaviour-not-a-version.md)
landed the same day, saying every window reads `0 of 10` from that commit and that
records are not rewritten. Seeding `true` would silently reverse an ADR one day
old, on the strength of a measurement (#342's 64 identical rows) that was taken to
prove a stamp need not move — not to prove that two windows may be joined. **The
mechanism applies forward.**

## Alternatives considered

- **A label on the CI run record.** Declined: CI writes the record to an orphan
  branch *after* the merge, so no merge gate can read it, and a restamp writes no
  run record. It would also date the marker at the run rather than at the change.
- **Dated prose in each floors file, as today.** Declined: prose carries no field
  a gate can compare, no date a series can plot, and it marks the file rather than
  the series — which is exactly what ADR-0084 said was still missing.
- **An annotation typed into Grafana.** Declined: nothing in the repository can
  read Grafana's store, so no gate, command or deploy could check it, and
  [ADR-0062](./0062-the-dashboard-is-provisioned-from-the-repo.md) exists to keep
  the page a diff somebody reviews rather than a state on one machine.
- **A text panel listing renovations.** Declined: it does not sit on the time
  axis, so a reader still matches dates by eye against four timeseries panels.
- **The restamp command demands a reason and writes the entry.** Not declined —
  **deferred, and it is the cheaper half of the same idea.** It was the first
  recommendation here. ⚠️ **Measured against it:** `pnpm mutation:stamp` writes
  `configHash` only, deliberately, and `fixtureHash` and `duplicationHash` have no
  writing command at all — both were hand-copied on #342. So the command route
  costs a writer for two more stamps before it forces anything, and it only ever
  forces the stamp somebody remembers to restamp. A gate catches all three
  whatever route moved them.
- **Rebasing each cap by a declared amount** so history stays one series.
  Declined: it needs a measured delta per scope, and a typo in that number lowers
  a cap with nothing saying so.

## Consequences

- **G57 is green on the commit that lands it**, because three entries are seeded
  carrying the three values now on disk. Observed red three ways first.
- **Every stamp change now costs a sentence.** That is the intended friction, and
  it is smaller than the two-day deploy block the same machinery has already
  caused once.
- ⚠️ **The gate asserts that a reason exists and never that it is any good.** The
  entry is prose, read by a person and by nothing else. This is the relationship
  G41 has to the quality of a register entry, and it is a real limit rather than
  an oversight.
- ⚠️ **The free-entry class decays quietly.** Nobody is obliged to write one, so
  it rots into an empty section with no red anywhere. The only signal is a reader
  meeting a step change the record does not explain — which is the original
  complaint, surviving in the one corner no gate can reach.
- **`preserves` is built and unused.** Every seeded entry says `false`, so no
  window is joined today. The first `true` will be a deliberate act with a
  measurement behind it.
