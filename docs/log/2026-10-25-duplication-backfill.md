# The duplication backfill — 2026-10-25

[#454](https://github.com/mephistopheles4/stacks/issues/454). The whole-tree
duplication series now reach back to the first commit, measured once by
`jscpd --history` and kept in `jscpd.history.json`. The spec is
[`docs/spec/duplication-backfill.md`](../spec/duplication-backfill.md), and the
storage decision is
[ADR-0126](../adr/0126-the-duplication-backfill-is-a-committed-file.md).

## What was measured

All runs at jscpd 5.4.1, 50 tokens, 5 lines, `mild`, over
`. --format typescript --ignore "**/*.d.ts"`.

- **One commit.** At `e6cce7c`: 315 files, 96,116 lines, 74 clones and 783
  duplicated lines, equal to the nightly record. Without the `.d.ts` ignore,
  lines come out 40 high.
- **The overlap.** `--history 4596155~1..origin/main` gave 142 points in 39 s.
  Compared commit by commit with all 202 records that carry tree series:

  | `duplication_hash` era | jscpd | Records | Match |
  | --- | --- | --- | --- |
  | `fcddde52…` (today) | 5.4.1 | 42 | 42 |
  | `c624c341…` | 5.3.2 | 55 | 55 |
  | three older eras | 5.0.16 – 5.2.0 | 105 | total lines only |

- **The backfill.** `--history aecb7cf` gave 170 points: 169 commits, because
  jscpd walks side branches too, plus the working tree. All 137 first-parent
  commits are among them. It took 26 s in a throwaway clone and 67 s in the
  linked build worktree, with identical points.
- **The generator.** `pnpm duplication:report --history` wrote 136 points:
  137 commits, less one for #181 and #183, which landed in the same second. A
  rerun wrote byte-identical output. Prettier passes the file, every point has
  the same six keys, and no temporary report was left behind.
- **No suppression directive exists before #262.** `git log -S` for the
  directive's halves finds nothing, while a canary search through the same
  invocation finds its commit.

## Into the store

In the build worktree's own store:

1. The first sync wrote `1787677348-history.prom` and imported it beside 249
   branch records. Prometheus then held 136 backfilled samples and 202 nightly
   tree samples.
2. A second sync left the history alone.
3. An edit to one point made the next sync refuse, naming `--rebuild`.

⚠️ **Every sync re-imports all ten renovation markers and writes a new ratchet
row.** That is not this change. `readState` in `scripts/trend-sync.ts` returns
only `tip` and `imported`, so the digests the sync keeps for both are dropped on
every read. Filed as
[#522](https://github.com/mephistopheles4/stacks/issues/522).

## A describe body hides mutants from Stryker

The test that reads the committed file first parsed it once, at the top of its
`describe` block. A scoped Stryker run on `duplication-history.ts` then scored
**50.58**, against 62.35 the round before, with 74 survivors. Most of the new
survivors were parser guards the refusal tests plainly kill: the tip check and
the empty-points check among them. Code that a `describe` body runs at
collection time belongs to no test, and Stryker's per-test coverage then left
those mutants unpaired with the tests that would kill them. With the read moved
inside each test, the same run scored **66.37**, with 20 survivors, all of them
equivalent guards or wording.
