# ADR-0110 — Node 24 is the floor, and CI tests it alone

**Date:** 2026-10-16
**Status:** accepted, built in [#430](https://github.com/mephistopheles4/stacks/issues/430)
**Issue:** [#430](https://github.com/mephistopheles4/stacks/issues/430)
**Supersedes:** [ADR-0023](0023-ci-shape.md)'s "CI runs Node 22 and 24" entry, and nothing else in it

## Decision

`package.json` declares `engines.node: >=24`, and the `suite` matrix in
`.github/workflows/gates.yml` runs Node 24 alone. The `gates` aggregator is
unchanged, and it is still the only required check, so removing the
`suite (node 22)` leg blocks no pull request.

## Why

Development and deploys already run on Node 24. The Node 22 leg existed only to
check the `engines` claim, which ADR-0023 refused to leave unchecked. With the
floor raised to 24, the one remaining leg runs the suite on the floor. Node
22's upstream support ends in April 2027.

⚠️ **The floor and the matrix agree by hand, not by a gate.** No test reads
`engines.node` or the `suite` matrix, so raising one without the other stays
green. A gate asserting that the lowest matrix version equals the `engines`
floor would close that; it is left as a follow-up rather than built here.

The two legs ran in parallel, so this saves runner minutes rather than wall
time: it is a simplification, not a speed-up.

## Consequences

- Anyone on Node 22 gets an `engines` warning from pnpm and no promise that the
  suite passes there.
- The matrix stays a matrix, so adding a version back is a one-line change.
- Timings recorded on Node 22 in `docs/log/`, `docs/progress.md` and ADR-0108
  are history and stay as written.
