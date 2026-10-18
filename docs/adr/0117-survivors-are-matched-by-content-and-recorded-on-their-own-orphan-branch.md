# ADR-0117 — Survivors are matched by content and recorded on their own orphan branch

**Date:** 2026-10-17
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
new file's blob goes in by `hash-object --no-filters` and `update-index` under its
full path, and the commit is made with `commit-tree`. It writes one file into the
worktree.

This **replaces ADR-0055's `git pull --rebase` retry** for both branches: a
rejected push now fetches again, reads the new tip into the index, adds the one
file and commits again, up to three times. One file per run still reduces the
race to a ref update, which is the premise ADR-0055 rests on; its text is not
edited.

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
  finds any similarity. The cost that grows with it is not only the record step's
  fetch: both jobs check out with `fetch-depth: 0`, which fetches every branch,
  `survivors` included, so every push to `main` and every nightly downloads the
  whole branch. The step prints the repository's size before it runs so that cost
  can be read; narrowing the checkout is open (see the pull request). A plain
  `git clone` or `git fetch` on a developer machine pulls it too;
  `git clone --single-branch` or a narrowed `remote.origin.fetch` opts out.
- **Mutated source is copied verbatim and kept.** The `original` field is the text
  of the mutated code at that night's commit. Removing a leaked value from
  `main`'s history would not reach this copy: it also means rewriting or deleting
  the matching files on the `survivors` branch.
- **The branch is unprotected, like `metrics`.** Anyone with write access can
  rewrite or delete records, plant a name, or create a tag of the same name. The
  script reads the full ref, ignores a record dated more than a day ahead, takes
  the blob without filters and by literal path, and treats an unreadable previous
  record as a first record. A ruleset blocking deletion and non-fast-forward
  updates on `survivors` is the owner's setting to make.
- **One bare `spawnSync('git', …)` stays in `commit-metrics.ts`**, to read a
  record's bytes untrimmed. It keeps ADR-0030's no-shell rule and not its one-home
  rule; adding a capture helper to `scripts/lib/git.ts` would put untested lines
  in a mutated scope during the calibration window.
- **No new entry script.** The git half lives in `commit-metrics.ts`, the file
  half in `mutation-scopes.ts`, both already excluded from mutation, and the
  decisions in the pure `scripts/lib/survivor-record.ts`. A new script would have
  needed an exclusion in `stryker.scopes.json`, moved the hashed Stryker config
  and restarted the calibration windows before November.
- **One night's two records share the commit half of their names, not the
  timestamp.** `emit-metrics.ts` and the record step each read their own clock.

## The fetch

The tip is fetched at depth 1, which still downloads every blob at the tip, about
26 MB a year before deltas. `--filter=blob:none` would avoid that, and **it was not
measured against GitHub**: the spec's way to measure it needed a scratch branch
pushed to the public repository, and the owner declined the push, so the depth-1
fetch stays. The residual is about 73 KiB more download a night, against a budget
of 50 MB.

⚠️ **Measured against a local `file://` remote instead, and it did not work.** The
setup: a bare remote with `uploadpack.allowFilter` set, ten 40 KB files over two
commits, and a full clone made between the two commits. In that clone,
`git fetch origin survivors --depth=1 --filter=blob:none` exits 0, and
`git ls-tree` and `git show` of one file succeed, but `git cat-file -e` finds
every blob at the tip present, the five the second commit added among them. The
filter avoided nothing there, so the spec's test for "working" (the other blobs
absent) fails even before GitHub's behaviour is in question. The script that ran
it was a throwaway and is not kept.

## How this was decided

The owner took the shape on #344: a stripped survivor record each night, keyed by
content, matched as a multiset, on its own orphan branch. The grilling settled the
rest and [the spec](../spec/survivor-record.md) §S9 lists each choice, who took it
and what changing it would move. During the build the owner was asked whether to
push a scratch branch to measure the blob filter against GitHub, and answered to
skip it and keep the depth-1 fetch.
