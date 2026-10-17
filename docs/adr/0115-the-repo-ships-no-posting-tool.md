# ADR-0115 — The repository ships no posting tool

**Date:** 2026-10-17
**Status:** accepted, built in [#461](https://github.com/mephistopheles4/stacks/issues/461)
**Issue:** [#461](https://github.com/mephistopheles4/stacks/issues/461)
**Supersedes:** [ADR-0078](0078-a-tool-rewrites-prose-before-it-reaches-github.md), whole

## Decision

`scripts/gh-post.ts` is retired, along with the two library modules and the
tests that only it used. `AGENTS.md` names no tool for posting prose to GitHub.
[`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) lists plain `gh`
invocations that read the body from a file, and states the convention in one
line: GitHub prose is written unwrapped, with full URLs.

## Why

Two tools gave opposite instructions. `AGENTS.md` sent every agent to
`gh-post.ts`, while the owner's own sessions run under a separate working
agreement, the pact, which sends them to the pact's own poster, and in practice
the pact won. The poster began as a port of `gh-post.ts` and reads back every
post the same way.

The owner's reason, in their words: *"I think that agent MD shouldn't refer to
the poster at all. The pact is the one directing agents to use the poster. The
pact is closing the gap that I discovered on stacks. So now that it's closed on
the pact, we could remove it from stacks. If someone else has the same gap, they
could install the pact."*

A posting tool is how agents work, not part of the product, so this repository
stops carrying one.

## What is given up

ADR-0078's tool rewrote prose before posting. It joined hard-wrapped paragraphs
onto one line and turned repository-relative links into full URLs. The pact's
poster does neither: it sends the text as written, and is to refuse a body
that breaks the convention once the follow-up below lands. Hard-wrapped bodies
were the problem ADR-0078 existed to solve: fourteen issues went out that way
and all fourteen verified as identical.

- **The rewrite goes, and nothing here replaces it.** The convention in
  `docs/agents/issue-tracker.md` is the only guard in this repository.
- **The pact's side** is a follow-up on the pact's own repository,
  [the-pact#317](https://github.com/mephistopheles4/the-pact/issues/317): the
  poster is to refuse a body that holds a hard-wrapped paragraph or a
  repository-relative link. It refuses rather than rewrites, so what you type is what gets posted,
  which removes the cost ADR-0078 existed to state.
- **The pre-create check of a pull request's title and body** is not lost.
  `scripts/check-pr.ts` runs the same function by hand before `gh pr create`,
  and G55 (`pr-conventions`) still refuses a bad one on the pull request.

## Consequences

- A contributor or agent without the pact posts with `gh` and a body file, and
  owns the read-back. The six hand-rolling traps recorded on
  [#220](https://github.com/mephistopheles4/stacks/issues/220) still apply to
  them.
- The `docs/gates.md` row *Prose posted to GitHub is safe for a GitHub body*
  stays refused, for the same measured reason; only its last sentence, which
  named the tool that stood in its place, changes.
- ADR-0078 and the logs that cite `gh-post.ts` are history and stay as written.
