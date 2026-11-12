# ADR-0148 — Stacks has a threat model, boundaries first, capped at 3,000 words

**Date:** 2026-11-12
**Status:** accepted, built in [#584](https://github.com/mephistopheles4/stacks/issues/584)
**Issue:** [#584](https://github.com/mephistopheles4/stacks/issues/584), ticket 6 of the-pact's [#542](https://github.com/mephistopheles4/the-pact/issues/542)
**Spec:** [revision 3 on #542](https://github.com/mephistopheles4/the-pact/issues/542#issuecomment-6823747749)

## Decision

`docs/threat-model.md` is this repository's first threat model. It opens with
the boundaries, six of them: the public site, the deploy, outside lookups and
imports, the tracker and pull requests, updates and CI, and the Ask the library
Worker. Each names what crosses, the controls that hold it by source with when
each does not hold, and its residual as an accepted class. Then come the scope,
the accepted classes, a residual-risk chart and the open issues. It holds no
provenance: no dates, no history, no author.

`SECURITY.md` keeps how to report a vulnerability and points at it. The file is
capped at 3,000 words, counted over the whole file by splitting on whitespace,
by G71 (`threat-model-cap`). Raising the cap is a spec change.

## Why

`SECURITY.md` held the threat content as a list of risks with no boundaries, no
named controls and no statement of what the machine is. Sessions ruling on
security had nothing to place a finding on, so they rebuilt controls the
harness, GitHub or the host already hold, and brought the owner paths that start
and end on the owner's own computer. The pact's review procedure now has a guide
that places each finding on a boundary first, and this file is what it reads.

## What was placed where

- **In:** private notes reaching the public build (the public site, held by
  invariant 2 and G2); crafted import files and provider bytes (outside input);
  the Worker, with visitors' questions going to Workers AI (off the machine, held
  by storing and logging nothing, and approved by ADR-0127).
- **The machine's:** the vault at rest, and a vault value that escapes its path.
  A hostile vault was already not defended.
- **Out as a class:** data loss in a vault. Its gates stay, and `AGENTS.md` says
  that loosening them is a spec change.

## What was refused

- **Moving provenance into a log.** The owner's words: "We already have ADRs and
  logs. I don't think we need to keep provenance at all." The history of each risk
  stays where it is, in the ADRs and logs that already hold it.
- **Naming a control with no read.** The GitHub controls were read live and
  posted on the pull request. The host's rule and gateway are named only
  under Open issues, as declared in `infra/` and not applied, and never under
  Controls, because the Worker is not deployed and there is nothing to read back
  yet.

## Consequences

- A host control named here that turns out not to be applied is a finding for the
  owner, not a thing this change fixes.
- `SECURITY.md`'s table of platform settings is gone. The GitHub ones that were
  readable are named under their boundary; Dependabot malware alerts and grouped
  security updates have no read and are not named.
