# ADR-0134 — Mutation scoring has a dated exception for code not yet measured

**Date:** 2026-11-05
**Status:** accepted. The owner chose "a dated exception" for the review's finding that
`stryker.scopes.json` excludes two directories with no mechanism
(`docs/spec/ask-the-library.md`, conventions-lens F2). Nothing is measured yet.

## Decision

`stryker.scopes.json` allowed a source directory two states: declared as a scope, or excluded
with a named mechanism that puts it out of reach. It now names **one third state, dated**: a
**dated exception**, for a directory the code could measure, kept out only because a recorded
decision says a scope needs a first full run to set its floor and no run has been made.

Two entries use it, both starting `DATED EXCEPTION 2026-11-05`:

- `packages/ask/src`, the Worker, whose specs run in-process.
- `packages/site/src/ask`, the drawer: `drawer.ts` and `start.ts` stay a real mechanism (DOM
  glue only a browser reaches), and the six files with specs (`client.ts`, `close.ts`,
  `bridge.ts`, `turnstile.ts`, `memory.ts`, `motion.ts`) are the exception. The earlier text
  said four; `memory.ts` and `motion.ts` were added since.

Each ends when a full run exists and the directory becomes a declared scope.

## Why

The Ask spec (S8) chose "no mutation scope now", because a floor needs a first full run, which
costs minutes and was barred for agents. That is a real reason, and it was written as a
mechanism it is not: the rule said "no third", and the entries said the code "could be measured".
Editing the rule in the open, with a date and an end, is better than leaving an entry that
contradicts it.

## Consequences

- **G38 (`mutation-scope`) is unchanged.** It reads that every directory is declared or excluded
  with a non-blank mechanism, and these two are. The rule's text is what changed.
- **`configHash` does not move.** `stryker.config.mjs` reads `scopes` only, not
  `excludedDirectories` or the header, so G56 owes no floors edit; `pnpm mutation:stamp --check`
  confirms it.
- **The exception is not a precedent.** A second one needs its own record. An entry that admits
  the code could be measured and carries no date is still refused by the rule as written.
- **What stands in for a score meanwhile:** the plants recorded in the spec's S12 (each break shown
  red), and the owner or a scheduled run producing the first full report.

## What was rejected

- **Declaring the scopes now with a guessed floor.** A floor with no measurement is the
  lowering-by-default the file's rules exist to prevent.
- **Leaving the entries as they were.** The rule and the entries disagreed.
