# ADR-0112 — G26 pins the ranking rule, and its corpus is refreshed by splicing

**Date:** 2026-10-17
**Status:** accepted, built in [#395](https://github.com/mephistopheles4/stacks/issues/395)
**Issue:** [#395](https://github.com/mephistopheles4/stacks/issues/395)

## Decision

G26 (`lookup-recall`) pins the ranking rule, not the providers' answers on one
day. `fixtures/api/lookup-recall.json` is frozen as the corpus the rule is
judged against. When a change moves a provider's URLs, the corpus is refreshed
by splicing: `scripts/capture-lookup-recall.ts --only <url-prefix>` re-captures
the URLs under that prefix and replays every other entry from the committed
file. A bare run, which re-asks every provider, is no longer the way to refresh
it.

## Why

While building #393, a full re-run changed 12 Google, Apple and O'Reilly
entries, and with them G26 went red on *From Zero to Profit with AI*: Google
now ranks a different book first. No code had changed. #393 kept the committed
file and spliced in its five Open Library entries by hand. The owner decided
that the gate is about the rule, so a provider's drift should not turn it red,
and the splice should be the documented method rather than an exception.

## The trade-off

A frozen corpus stops telling us when the providers change. G26 can stay green
while today's Google would defeat the rule on a real book. That is accepted:
the gate exists to catch a ranking change in this code, and a red caused by a
provider would teach the next session to re-decide expectations against
whatever the providers said that day. It also makes this hard to undo quietly.
Once spliced entries come from different days, no single capture reproduces the
file, so returning to "the corpus is one capture" means re-deciding every
expectation against a fresh one.

## Consequences

- `--only` refuses an unselected URL that the committed file does not hold,
  and never fetches it. A refresh that reaches a new URL outside its prefix
  fails loudly; widen the prefix to take it.
- `fixtures/api/open-library-search-sparse-sibling.json` is already kept the
  same way, for ADR-0037's regression.
