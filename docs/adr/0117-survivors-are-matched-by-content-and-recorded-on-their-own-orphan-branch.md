# ADR-0117 — Survivors are matched by content and recorded on their own orphan branch

**Date:** 2026-10-18
**Status:** accepted
**Issue:** [#344](https://github.com/mephistopheles4/stacks/issues/344)
**Spec:** [`docs/spec/survivor-record.md`](../spec/survivor-record.md)

## Decision

After a clean mutation run on `main`, the nightly writes one survivor record to
a second orphan branch, `survivors`, as `survivors/<timestamp>-<sha>.jsonl`: a
header line, then one sorted JSON object per surviving mutant. Survivors are
matched across nights by **content key** — file, mutator, the original text the
mutation replaced, and the replacement — counted as a multiset, and never by the
report's `id` or by position. The header carries `keySchema`, the installed
Stryker version and the `configHash`, and a diff across a change in any of the
three is not computed. The job summary gets one line: tonight's total, how many
are new and how many are gone since the previous record. Writing the record never
turns a night red.

`scripts/commit-metrics.ts` serves both branches and never checks a tip's tree
out: its worktree is `--no-checkout`, its index comes from `git read-tree`, the
new file is added by its full path, and the commit is made with `commit-tree`. It
writes one file to disk.

## Why

A report's `mutants[]` is out of `id` order in 70 of 74 files and differs from
run to run, and an `id` is a position in one run's count, so one new mutant early
in the file order renumbers every later one. Keyed on position, 558 survivors read
as gone across a real edit; keyed on content, none did
([the identical-tree control](../log/2026-09-21-the-survivor-set-diffs-cleanly.md),
[the real edit](../log/2026-09-22-the-content-key-holds-across-a-real-edit.md)).
The point is the equivalent mutants the floors' calibration windows will need to
find before a scope is armed: survivors that stay on the same code night after
night, which two reports cannot show and many nights can.

A set is not a time series, so it is not a ninth trend series, and a record kept
as a file per night is small enough for a branch: about 72.7 KiB gzipped. Its own
branch rather than `metrics` because `trend:sync` and G39 read `metrics` and
should not meet a file they do not know.

## What it costs

- **Attribution is lost on a collision.** 16.9% of survivors share a key with
  another in the same run. The count stays exact; which of two identical `'cover'`
  literals is the survivor does not. Stability was taken over attribution, because
  the record's use is counting persistence, not pointing at lines.
- **The identical tree is not an identical set.** One `Survived`↔`Timeout` flip in
  `head-cap.ts` moves a count by one on unchanged code, so the line says up to two
  either way is noise.
- **A silent record.** A failed write leaves the night green. The summary line
  names the reason, and nothing else watches ([`docs/gates.md`](../gates.md), *Not
  gated, deliberately*).
- **About 818 KiB raw a night, never pruned**, at most 25.9 MiB a year before git
  finds any similarity. The nightly's fetch is the cost that grows with it, so its
  budget — under 60 s and under 50 MB — is printed every night.
- **No new entry script.** The git half lives in `commit-metrics.ts`, the file
  half in `mutation-scopes.ts`, both already excluded from mutation, and the
  decisions in the pure `scripts/lib/survivor-record.ts`. A new script would have
  needed an exclusion in `stryker.scopes.json`, moved the hashed Stryker config
  and restarted the calibration windows before November.

## The fetch

The tip is fetched at depth 1, which still downloads every blob at the tip, about
26 MB a year before deltas. `--filter=blob:none` would avoid that, and **it was not
measured against GitHub**: the spec's way to measure it needed a scratch branch
pushed to the public repository, and the owner declined the push (q1, relayed by
the head chef), so the depth-1 fetch stays. The residual is about 73 KiB more
download a night, against a budget of 50 MB.

⚠️ **Measured against a local `file://` remote instead, and it did not work.** In a
full clone that is not a partial clone, `git fetch origin survivors --depth=1
--filter=blob:none` exits 0 and `git ls-tree` and `git show` of one file succeed,
but `git cat-file -e` finds every blob at the tip present, the five that arrived
in the fetch among them. The filter avoided nothing there, so the spec's test for
"working" (the other blobs absent) fails even before GitHub's behaviour is in
question. The script ran the commands above with a remote carrying
`uploadpack.allowFilter`, ten 40 KB files over two commits, and a clone made
between them.

## How this was decided

The owner took the shape on #344: a stripped survivor list each night, keyed by
content, matched as a multiset, on its own orphan branch. The grilling settled the
rest and [the spec](../spec/survivor-record.md) §S9 lists each choice, who took it
and what changing it would move. The fetch question (q1) was put to the owner
during the build: skip the GitHub measurement and keep the depth-1 fetch.
