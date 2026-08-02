# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

This repo is **single-context**. It has three packages — `core`, `cli`, `site` —
but they are layers of one domain sharing one vocabulary (a *book*, a *note*, a
*vault*, a *shelf*, a *public build*), not separate bounded contexts. There is no
`CONTEXT-MAP.md` and there should not be one unless a package grows a genuinely
independent language.

## Before exploring, read these

In this repo, in this order:

- **[`CLAUDE.md`](../../CLAUDE.md)** — the invariants, the contracts, and the
  rules that must not be broken. This is the authority. Read it first.
- **[`docs/progress.md`](../progress.md)** — where the project actually is.
- **[`docs/gates.md`](../gates.md)** — which rule each gate protects, and which
  rules are protected by nothing.
- **[`docs/decisions.md`](../decisions.md)** — the Decision Log: every choice
  made, dated, with the reasoning. Read before proposing anything that
  contradicts an existing decision.
- **`CONTEXT.md`** at the repo root, and **`docs/adr/`** — the skills' own
  glossary and ADR conventions. Neither exists yet.

If any of these don't exist, **proceed silently**. Don't flag their absence and
don't suggest creating them upfront. `/domain-modeling` creates them lazily when
terms or decisions actually get resolved.

## This repo already has a decision record, and it is not ADRs

[`docs/decisions.md`](../decisions.md) holds 130-odd dated entries, written as a
running narrative rather than one-decision-per-file. That is deliberate: several
of them are only legible in sequence — the shadow-map investigation is a chain
of six entries ending in *"the ranking that predicted otherwise was wrong"*, and
splitting it into six ADRs would destroy the reasoning it records.

So: **append to `docs/decisions.md` for anything that continues an existing
thread.** Reach for `docs/adr/` only for a genuinely new, standalone
architectural choice — one a reader could evaluate without the log above it. If
you write an ADR, add a one-line pointer to it from the Decision Log so there is
still one place that lists every decision in order.

## Use the project's vocabulary

When your output names a domain concept — an issue title, a test name, a
proposal — use the term the project already uses. `CLAUDE.md`'s Frontmatter
contract is the closest thing to a glossary this repo has, and it is enforced in
both directions by `gates/frontmatter-contract.test.ts`.

If the concept you need isn't there yet, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap
(note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts an existing decision, surface it explicitly rather
than silently overriding:

> _Contradicts the 2026-08-01 entry on re-hosting cover art — but worth
> reopening because…_

The Decision Log's own header rule applies: entries are **append-only**. A
decision that turned out wrong gets a new entry saying so, not an edit to the
old one.
