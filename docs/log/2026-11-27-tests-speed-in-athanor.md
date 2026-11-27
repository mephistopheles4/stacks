# The tests in athanor are not slow the way STACKS-18 estimated

**Date:** 2026-11-27. **Work:** STACKS-18. **Base:** `b6bdbdb`. STACKS-18 asked for a faster suite from four causes, estimated by reading the code. Measured, the 5 s git wait does not happen, so causes 1 to 3 were not built. Cause 4, tests writing into the checkout, held and is fixed. **Nothing got faster.**

## Method

athanor 0.2.0 on the owner's Windows machine, its default of 2 runs at once, each run capped at 4 CPUs. Another project's runs held the second slot for part of this, so read seconds as rough.

- Wall time: `time athanor run`, in Git Bash.
- Per-file ranking: `athanor run -- pnpm vitest run --reporter=json`, each file's `endTime` minus its `startTime`.

## What was measured

| Reading | Spec revision 1, at `b6bdbdb` | The build |
| --- | --- | --- |
| `time athanor run` | 34.6 s (Vitest 25.6 s) | 35.2 s at `b6bdbdb` (Vitest 26.8 s); 35.9 s with the change (Vitest 27.4 s) |
| Test files, tests | not counted as files; 4,505 passed, 2 skipped | 229 files, 1,082 suites, 4,505 passed, 2 skipped |
| `gates/deploy-branch.test.ts` (10 tests) | 5.9 s | 6.3 s, the slowest file |
| `gates/metrics-freshness.test.ts` (12 tests) | 5.2 s | 5.7 s, second |

The spec also timed each cold `tsx` start of `scripts/deploy.ts` at about 0.35 to 0.5 s; the build did not re-time that.

The spec's amendments on STACKS-18 correct three of its facts. The one that matters here: it read 1,082 as a file count and concluded that per-file overhead sets the wall clock. 1,082 is the suite count, so **what sets the wall clock is not established.**

## Why causes 1 to 3 were dropped

1. **git waits 5 s with no identity:** it does not. The container has no git identity, but Docker writes its hostname into `/etc/hosts`, so git's fallback email lookup returns at once (spec S1).
2. **About 40 cold `tsx` starts** and 3. **a fresh repo for every test:** both live mostly in the two files above, about 6 s each, running beside the others. The spec estimates that removing every spawn from both would save a few seconds at most, probably none. That is an estimate, not a measurement.

## Cause 4, before and after

The check, in athanor, where the snapshot is a one-commit repository and its own main checkout:

```sh
athanor run -- sh -c 'touch /tmp/m; sleep 1; pnpm vitest run >/dev/null 2>&1; echo suite=$?; find . -newer /tmp/m -not -path "./node_modules*" -not -path "*/node_modules/*" -print | sort'
```

| Tree | Paths listed |
| --- | --- |
| `b6bdbdb` | `.`, `./.git`, `./artifacts` |
| With the change | none |
| With `worktree add` planted back to the checkout's cwd | `./.git` and the new `./.git/worktrees/` entry; the suite failed, as it should: the worktree belonged to a repository other than the one the tests ask about |

`env.test.ts` now builds a scratch repository, with a linked worktree beside it, in a temp folder. G23's comment test calls `blankComments` on a string; with the regex's `//` arm removed it went red, and so did G23's copy sweep.

Not run on Windows: the realpath and the `prune` fallback in `env.test.ts` have only run on Linux.

## Left as notes

- What sets the wall clock, and the 4-CPU cap against Vitest's worker count: not looked into.
- `scripts/lib/scope-check.test.ts` leaves its temp folder behind, and a temp-only `rmSync` in `gates/deploy-branch.test.ts` runs only if its test reaches it. Both outside the checkout.
