# CodeQL is a second required gate, as a ruleset rule rather than a check name

`main` now requires two things: the `gates` check, and CodeQL finding no **new**
security alert at high or above. [ADR-0023](0023-ci-shape.md) said "one required
check named `gates`"; that was true for a year and is now one short, which is
what this record is for.

## Why now, and not earlier

`SECURITY.md` said, in the commit that enabled CodeQL:

> **CodeQL is not a required check**, and that is deliberate for now… worth
> doing once its findings here have been triaged rather than before.

That condition was met — the first batch went to zero open, ten fixed and two
dismissed with reasoning — so the paragraph was rewritten rather than left to
quietly become a thing nobody had revisited. A check that blocks merges on
alerts nobody has read is how a gate becomes something you click through, which
is the failure `docs/gates.md` opens by listing six instances of.

## Not a required status context

The obvious implementation is to add `CodeQL` beside `gates` in the ruleset's
`required_status_checks`. It was rejected, and ADR-0023 already contains the
reason:

> a required check that never reports blocks the pull request forever — which is
> also why a skipped workflow is unacceptable.

`CodeQL` is a check posted by the **github-advanced-security** app, not by this
repository's workflow, and it appears on pull requests but not on pushes to
`main`. Requiring a context this repo does not control, and which does not
always appear, is precisely the shape ADR-0023 refused.

The ruleset's own `code_scanning` rule is the mechanism built for this. GitHub
evaluates it against the analysis directly, and it states its thresholds in the
ruleset where they can be read, rather than hiding them behind a check name
whose behaviour you have to know.

**This does not eliminate the risk, it reshapes it.** If CodeQL genuinely never
analyses a pull request, that rule still blocks — it simply fails with a
specific message instead of sitting pending forever. The mitigation is the same
one ADR-0023 relies on: the analysis must not be path-filtered.

## The thresholds, and why they are not the strictest available

- `security_alerts_threshold: high_or_higher` — block on a **new** high or
  critical security alert. Merge protection compares against the base branch, so
  pre-existing findings are not the question.
- `alerts_threshold: errors` — errors only, not warnings.

The second is the judgement call. CodeQL rated **all twelve** of its first
findings on this repository _high_, and exactly one was a real bug: a polynomial
ReDoS in `safeFilename`. One was a plain false positive — a password-hashing
rule firing on the SHA-256 that names a cache file, in a project with no
account, no database and no authentication. The other ten were in test files.

Most of CodeQL's JavaScript rules assume a server handling untrusted input.
This is a local CLI and a static site, so the severities are calibrated for
somebody else's threat model. Blocking on warnings at that signal-to-noise ratio
produces a check people learn to route around rather than read, and a gate
nobody trusts is worse than one that is not there — it looks like protection.
`docs/gates.md` records the triage under _"Triaging a CodeQL finding"_.

## What this cost elsewhere

Enabling it falsified five documented claims in the same breath, all fixed in
the commit that made the change: `SECURITY.md` twice (the table row, and a
paragraph asserting the exact opposite), `CONTRIBUTING.md`, `docs/progress.md`,
and `docs/agents/issue-tracker.md`. None of them is gateable — the ruleset lives
outside the tree, and a test that asked GitHub would need the network, which G21
(`no-live-network`) forbids for the whole suite. They are listed in
`docs/gates.md` under _"Not gated, deliberately"_ for that reason.
