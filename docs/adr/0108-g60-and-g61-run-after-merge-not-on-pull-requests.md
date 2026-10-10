# ADR-0108 — G60 and G61 run after merge and at deploy, not on pull requests

**Date:** 2026-10-10
**Status:** accepted, built in [#427](https://github.com/mephistopheles4/stacks/issues/427)
**Issue:** [#427](https://github.com/mephistopheles4/stacks/issues/427)
**Amends:** [ADR-0023](0023-ci-shape.md) (the gate's shape is unchanged; what a pull request runs inside it is not)

## Decision

`smoke:render` takes one flag, `--pull-request`, and the workflow passes it only
when `github.event_name == 'pull_request'`. Under it, G60
(`context-loss-fallback`) and G61 (`one-shadow-reader`) are skipped, and the
report says so in one line where their output would be. With no flag, every
check runs: on every push to `main`, in `deploy:site` and on a local run.

An unknown argument exits non-zero before the build, so a typo in the workflow
cannot run a different set and pass.

The workflow's `cancel-in-progress` is `true` only for pull-request runs. A run
on `main` is now the one place G60 and G61 run before a deploy, so two quick
merges must not cancel the first one's.

## Why

On CI's software renderer (SwiftShader) G60 and G61 were 258 s and 86 s of a
419 s `smoke:render` step on Node 24, and 210 s and 66 s of 342 s on Node 22:
about four fifths of every pull request's wait. The cost is frames drawn in
software, not page size (G61's pages were already 480×640), so a smaller viewport
does not buy it back.

Running them only on pull requests that touch the shelf was rejected: 44 of the
last 60 merged pull requests touched site code, the test scripts or the
lockfile, and a three.js bump in the lockfile is exactly what could break G61. A
filter safe enough to trust would have skipped under a third of them.

## What it costs

A regression in G60 or G61 is found **after the merge**, not before it. The
owner accepted this. Nothing else alerts on it: the failure arrives as GitHub's
failure email or the red mark on the commit.

**Default response to a red `main` run: revert the merge that turned it red
first, then fix in a new pull request.** Pull requests skip both checks, so they
keep going green on top of a regression, and `deploy:site` refuses to run
without naming the commit that broke it. A revert keeps later merges from
stacking on it.

## What stays the same

G59 (`large-library-lit`) and every other check still run on pull requests.
Nothing a check asserts changed: this decides where two of them run.
