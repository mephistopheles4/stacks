# ADR-0126 — The duplication backfill is a committed file under series names of its own

**Date:** 2026-10-25
**Status:** accepted, built in [#454](https://github.com/mephistopheles4/stacks/issues/454)
**Issue:** [#454](https://github.com/mephistopheles4/stacks/issues/454)
**Spec:** [`docs/spec/duplication-backfill.md`](../spec/duplication-backfill.md)

## Decision

The whole-tree duplication series before #262 are measured once by
`jscpd --history` and kept in **`jscpd.history.json`**, committed beside
`jscpd.floors.json`. `pnpm trend:sync` renders that file into the local store,
as it renders `renovations.json`, under the prefix **`stacks_backfill_`**, with
no `stacks_run_ok` and no `stacks_run_info`. Nothing is written to the
`metrics` branch.

**A chart title may name a direction and never a verdict.** "Lower is better"
says which way a number moves when the code improves. It names no threshold
and no target, so ADR-0062's rule that trends carry no verdicts stands. Where a
direction would read as a verdict, the title names none: functions counted
grow with the code, and the exclusion counts carry their own rule.

## Why

The backfill must never feed the ratchet: a point nobody watched being produced
could arm a cap or move one. Three marks were weighed.

- **`event="backfill"` on a record in `metrics/`.** Declined, by the code
  rather than by preference: `floors.ts` takes every event but `push` as a
  nightly, and `halfOf` in `metrics-read.ts` agrees, so the mark would have
  counted.
- **Today's series names on a record with no run markers.** No floors row forms
  without an unlabelled `stacks_run_ok`, so this works today. But the exclusion
  rests on a missing sample, and any later reader keyed on the series name —
  `GATED_SERIES` already is, and a duplication window (#269) would be — reads
  the points.
- **Names of its own, in a file only the sync reads.** Taken. No reader of the
  `metrics` branch can list a file that lives in `.trend/local/`, and no reader
  of today's series matches the prefix. That holds by construction, with no
  reader cooperating.

A committed file rather than a record on the branch, because the branch is
append-only once a scope is armed and every ratchet reader lists it. A file is
reviewed in a diff and reverted by a revert. The issue named this option: "a
separate one-off record that only the dashboard reads".

**Only the tree's four series**, because the scopes were first declared on
2026-08-19 and changed 15 times since. A July value under today's globs would
measure a scope nobody had declared. The tree population is one rule
throughout, and it reproduces the nightly exactly: 97 of 97 records under the
two newest counting stamps.

## What it costs

- **A dip where the two lines meet.** The backfill is counted by jscpd 5.4.1,
  and the first two nightlies by 5.0.16, which read 0.73% against the
  backfill's 0.86%. The line is back at 0.86% within the hour, so the dip shows
  only zoomed to that day. It is mostly the counter: 5.4.1 reads 0.83% at #262
  itself. No renovation marker stands there, because those runs predate any
  declared bump, so the page's text and the chart's tooltip name it instead.
  Re-measuring the nightly stretch would remove it, at the price of a second
  line over data the store already holds.
- **A revert does not reach a store that imported the file.** The rendered copy
  stays in `.trend/local/`, and `--rebuild` replays it. The rollback is a
  revert, then deleting `.trend/local/1787677348-history.prom`, then
  `pnpm trend:sync --rebuild`.
- **The file's stamps are self-declared.** Nothing proves the file came from the
  generator rather than a hand edit, beyond the diff review and the rerun in the
  pull request. A byte-compare check would be a new guard, and the owner
  accepted the risk instead, on 2026-10-25, in the lead's chat, relayed. They
  also accepted three more, each by class:
  - the reader caps neither the number of points nor how early one may be
    dated;
  - it drops extra keys and allows a repeated commit, where it could refuse
    them;
  - an interrupted generator run may leave jscpd's temporary report behind, and
    a malformed jscpd report could quote a fragment in its parse error.

  The repository has no threat model, so this record, the spec's §S3 and the
  pull request say so, and no threat-model entry exists.

## How this was decided

Planned on #454, from three measured runs and a reading of every branch reader
by a subagent. The marking and series choices are the lead's picks under the
owner's standing instruction of 2026-10-25. The committed file revises an
earlier pick that would have put one record on `metrics` after merge.
