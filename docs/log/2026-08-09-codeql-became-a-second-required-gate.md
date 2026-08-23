# 2026-08-09 — CodeQL became a second required gate, and one of its twelve was real

Two commits: `3ee922d` closed the first batch of findings, `6cbb380` made the
scanner block a merge. The order matters — `SECURITY.md` had said, in the commit
that enabled CodeQL, that requiring it was _"worth doing once its findings here
have been triaged rather than before"_, and this is that condition being met
rather than quietly expiring.

**Twelve alerts, all rated high, one real bug.** That ratio is the finding worth
keeping, because it is what the next batch will look like too. Most of CodeQL's
JavaScript rules assume a server handling untrusted input; this is a local CLI
and a static site, so the severities are calibrated for somebody else's threat
model. Zero open now — ten fixed, two dismissed with the reasoning written on
the alert itself, where the next reader meets it rather than here.

**The real one was a polynomial ReDoS in `safeFilename`**, whose trailing strip
was `/\.+$/`, anchored — so on a title of many dots that does not end in one, the
engine backtracks from every start position:

| dots | old   |
| ---- | ----- |
| 10k  | 28ms  |
| 50k  | 715ms |
| 100k | 3.1s  |
| 200k | 11.7s |
| 400k | 47s   |

Capping the input to 120 characters _before_ the strip makes it 0.2ms.

**The reorder that fixes it also fixed a bug nobody had noticed.** The cap used
to run after the trailing-dot strip, so a long title with a dot at position 120
came back as a filename ending in `.` — exactly what the strip exists to prevent,
and a name Windows will not store faithfully. A space landing on the boundary did
the same. Both are stripped together after the cut now.

**The ReDoS test was green on its first draft, at 60k dots.** The cost is
quadratic, 60k lands near a second, and the assertion passed under its own
two-second threshold _while testing the very defect it was written for_. Measured
and raised to 200k, where the old code takes 12.2s. A test that cannot reproduce
its defect is not a test — the oldest failure in [`gates.md`](../gates.md),
committed again by someone reading that file.

**Nine test-only hits were worth fixing for a reason that was not security.**
`url.includes('googleapis.com')` in `metadata.test.ts` does not assert what the
test claims: `evil.com/?x=googleapis.com` satisfies it. They compare hostnames
exactly now, and a wrong constant was checked to go red rather than pass through
the `.toBe(false)` assertions vacuously.

**Two dismissals, and the tempting half-fix is the worst outcome available.**
`js/insufficient-password-hash` fired on the SHA-256 that names a cache file
after a URL, in a project with no account, no database and no authentication.
`js/bad-tag-filter` fired on the `.astro` script extractor, whose miss is already
gated harder than a parser would give it, by the `expectFound` at
`gates/astro-no-logic.test.ts:135`. Tweaking that regex until the alert clears
while it stays just as approximate buys the appearance of a fix. The triage
procedure is written down in [`gates.md`](../gates.md) under _"Triaging a CodeQL
finding"_ so the next batch does not re-litigate it.

**It is a ruleset rule, not a required status check, and
[ADR-0023](../adr/0023-ci-shape.md) is why** — _"a required check that never
reports blocks the pull request forever."_ `CodeQL` is posted by the
github-advanced-security app, not by this repo's workflow, and it appears on pull
requests but not on pushes to `main`. The ruleset's `code_scanning` rule is the
mechanism built for it: `security_alerts_threshold: high_or_higher`,
`alerts_threshold: errors` — errors, not warnings, at that signal-to-noise ratio,
because a check people learn to route around looks like protection while being
none. [ADR-0043](../adr/0043-codeql-is-a-second-required-gate.md) has the
argument; ADR-0023 keeps its title and is not edited.

**Enabling it falsified five documented claims at once** — `SECURITY.md` twice
(the table row, and a paragraph asserting the exact opposite), `CONTRIBUTING.md`,
`docs/progress.md` and `docs/agents/issue-tracker.md`. None is gateable: the
ruleset lives outside the tree, and a test that asked GitHub would need the
network, which G21 (`no-live-network`) forbids for the whole suite. They are
listed in [`gates.md`](../gates.md) under _"Not gated, deliberately"_.

The pull request that made the change **touched no `.ts` at all** — five docs and
one ADR — so it was an unplanned live test of whether the new rule blocks a
docs-only change, which is the failure mode ADR-0023 warns about. It did not.

**A footnote that git caught by luck.** This branch and the packer's both added
`docs/adr/0042`; #85 landed first, so this one became 0043. The conflict was in
`docs/adr/README.md`, because both sides appended a row in the same place — two
ADRs with _different filenames_ and the same number collide in nothing git looks
at, and had those rows been further apart the merge would have been clean with
two `0042` files in the directory. [`gates.md`](../gates.md) already records the
identical race for scoreboard rows, _"what number a row will carry is not
knowable until it lands"_. Unlike gate rows, nothing asserts ADR numbers are
unique. Not fixed.
