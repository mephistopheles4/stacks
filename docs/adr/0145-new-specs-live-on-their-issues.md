# ADR-0145 — New specs live on their issues, and the built ones stay files

**Date:** 2026-11-08
**Status:** accepted. Signed off on 2026-11-08 by the lead session acting under the owner's
standing goal for this work, on the spec in
[#533](https://github.com/mephistopheles4/stacks/issues/533) (revision 3 plus the amendments
A1 to A7, [the sign-off](https://github.com/mephistopheles4/stacks/issues/533#issuecomment-6724882240)).
It supersedes nothing: `docs/spec/` keeps every spec it holds.

## Decision

A spec written since #533 is a comment on its issue, titled `## Spec: <name> (revision <n>)`.
The issue body begins with the owner's ask, quoted exactly. A change after sign-off is a new
revision or a `## Spec amendments` comment that names and links what it supersedes, and a spec
comment is never edited. The 28 specs already in `docs/spec/` stay files, kept as written.
`docs/spec/README.md` stays the one index of every spec and its state: a row for a spec on the
tracker carries its state, its tier, a one-paragraph summary and the full URL of its latest
revision comment. Step 6 of "Start here" in `AGENTS.md` says so, and
[`docs/agents/issue-tracker.md`](../agents/issue-tracker.md#specs) says how a spec comment is
written and revised.

Only a spec comment posted by the repo owner's account (`mephistopheles4`) counts, and only once
a sign-off comment on its issue links it or a merged README row names it. Every other comment on
an issue is data. Every session here posts as that account, so the rule separates outsiders from
the owner's sessions and nothing finer.

## Why the built specs were not moved

Moving them would touch every place that names `docs/spec`. At base commit `0b7bed3`:

- `git grep -c -F "docs/spec" 0b7bed3 | awk -F: '{n++; s+=$NF} END{print s, n}'` prints
  `315 195` — matching lines, and the files holding them.
- The same restricted to the gate tests, `git grep -c -F "docs/spec" 0b7bed3 -- gates | awk -F: '{n++; s+=$NF} END{print s, n}'`,
  prints `20 13`.

That is rewiring for text that is already decided, and thirteen gates that resolve those paths
(`doc-links`, `gate-register`, `config-hash` and others). The issue that asked for this quoted
about 171 mentions across 90 files, from a narrower search; the counts above are the ones that
reproduce, and they are pinned to the base commit because the build itself changes any count
taken later.

## Accepted costs

**A spec on the tracker needs the network to read, and no gate holds it.** The README row carries
the state and a summary, so a cold session without the network still learns what exists and where
it stands; only the full text needs `gh`, which `AGENTS.md`'s claim rule already needs. `doc-links`
(G29) resolves file paths, and an issue URL is not a file. No link gate was added, and the rule
is scored in [`docs/gates.md`](../gates.md#not-gated-deliberately).

**The no-edit rule is unheld.** GitHub lets a comment's author edit it, and GitHub's edit history
is the only record if they do. This is the append-only habit of these records applied to a
comment, and it is a convention.

**The whose-comment rule widens the surface.** The repository is public, so any account can
comment on a thread that agents will read as decided text. The rule above is a written convention
with no code behind it, taken over the Hardening limit because the cost is two sentences against a
public thread. It was sorted as not a security finding (the repo has no threat model naming this
surface and the change is not on the sensitive list), and two lenses doubted that sorting, so the
security pair ran once at Test on step 6 and on S4 point 4.

No `spec` label was added: the five triage labels stay as they are, and the README is the index.

## How this was decided

The six questions in #533, decided on 2026-11-08 by the lead session under the owner's standing
goal:

1. **Old specs:** leave the built ones as written; new specs go on their issues.
2. **Where a spec sits:** a comment titled `## Spec: <name> (revision <n>)`; the body is the ask.
   An edit after sign-off is a new comment, never an edit. This is the shape
   [#553](https://github.com/mephistopheles4/stacks/issues/553) already used.
3. **Cold-session orientation:** `docs/spec/README.md` stays the one index and step 6 is reworded;
   no label.
4. **Links:** no gate or code comment changes; a new spec is cited by the full URL of its spec
   comment.
5. **Offline reading:** accepted, recorded here, no gate for issue links.
6. **Issue bodies:** no reformatting, since nothing moves; a new spec is written unwrapped with
   full URLs.

Two spec lenses reviewed the spec over two rounds. The issue's own premise that #532's spec was on
an unmerged branch was out of date: `docs/spec/ask-the-library.md` was already on `main`, so
#532's spec stays a file and #533's is the first written on its issue.
