# `trend:sync` refuses a rewritten record

The sync stores the `metrics` branch tip it last imported, and **refuses to
import when that tip is no longer an ancestor of the branch**. `--rebuild` is the
deliberate way past it: drop the local blocks and replay the branch as it now
stands, plus every surface-D row, which only this machine holds.

**Tamper-evident, and explicitly not tamper-proof.** Nothing here can prevent a
force-push to an unprotected branch. What this buys is that the **next sync
notices**, rather than importing across a rewrite and leaving a store nobody can
reconcile with the branch it claims to mirror.

## Why it is worth a refusal

**Once any mutation floor is armed, the branch's history _is_ its calibration
evidence.** Rewrite it and every armed floor becomes a number nobody can
re-derive — which is worse than an unarmed floor, because it is
_indistinguishable from a good one_. A store that silently followed the rewrite
would destroy the only local copy of the evidence at the same moment.

**The record is durable, never immutable**
([ADR-0055](./0055-ci-writes-a-durable-record.md)): the branch is unprotected and
force-pushable by construction, and append-only is a convention enforced by
nothing. This is the first thing in the design that can _detect_ the convention
being broken.

## What it costs

- **A legitimate rewrite now needs a flag.** Deliberate: `--rebuild` reads in
  shell history as what it is, and the message says to establish what happened
  before running it. A rewritten record is not a sync problem.
- **It cannot see a rewrite it has no objects for.** If the stored tip's commit
  has been pruned locally, the check answers _fast-forward_ rather than guessing
  — the honest reading for a store that cannot know, and the one case this
  guarantee does not cover. Stated here so it is not read as stronger than it is.
- **It says nothing about a record edited in place before it was ever fetched.**
  This compares two tips; it does not verify content.

## How this was decided

[`docs/spec/trend-layer.md`](../spec/trend-layer.md) §8 recorded the mechanism as
a **candidate and not adopted**, so the next reader would not re-derive it, and
left the choice to the implementation session in as many words: _"adopting it is
the implementation session's call, not this spec's."_

Adopted while building [#158](https://github.com/mephistopheles4/stacks/issues/158),
on cost: the sync already persists per-record state to make a second run a no-op,
so the tip is one more field and the check is one `merge-base --is-ancestor`. The
argument against — that a detection which cannot prevent anything is theatre —
loses to the calibration-evidence point above: the whole design is a record that
survives things, and _noticing_ is the only move available to the reading end.
