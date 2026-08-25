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

- **[`AGENTS.md`](../../AGENTS.md)** — the invariants, the contracts, and the
  rules that must not be broken. This is the authority. Read it first.
- **[`docs/progress.md`](../progress.md)** — where the project actually is.
- **[`docs/adr/`](../adr/)** — every decision already made, one file each, with
  the original reasoning. Read the records touching the area you are about to
  work in, and read [the index](../adr/README.md) first.
- **[`docs/gates.md`](../gates.md)** — which rule each gate protects, which are
  protected by nothing, and what went wrong while writing them.
- **[`CONTEXT.md`](../../CONTEXT.md)** at the repo root — the glossary. Terms
  this project uses in a narrower sense than English does *and that no gate
  pins down*; a term a gate already holds is linked from there rather than
  restated, for [ADR-0026](../adr/0026-constitution-is-gated-not-duplicated.md)'s
  reason. It states no rules, so it cannot rot into a second constitution.

If any of these don't exist, **proceed silently**. Don't flag their absence and
don't suggest creating them upfront. `/domain-modeling` creates them lazily when
terms or decisions actually get resolved.

## Where a new note belongs

Three files, three genres. Putting something in the wrong one is how this
project's documentation drifted before.

| It is… | It goes to |
| --- | --- |
| a decision — hard to reverse, surprising without context, a real trade-off | a new record in [`docs/adr/`](../adr/) |
| a lesson about a gate — what it caught, how it went red, why it was vacuous | [`docs/gates.md`](../gates.md) |
| where the project is, or a fact about the environment it runs in | [`docs/progress.md`](../progress.md) |
| none of those | a commit message |

**The ADRs here were extracted retroactively.** They came from a 138-entry
chronological Decision Log, which is why record 0001 predates this convention by
months and why several carry a long **How this was decided** section. That is
deliberate — the reasoning is the valuable half — and it is not the shape a
*new* record has to take. A new one can be three sentences.

## Records are append-only

A decision that turned out wrong earns a **new** record saying so, not an edit
to the old one. Several existing records contain their own correction, and in
every case the correction is the more useful half — sizing an allocation
predicted the wrong answer, a ranking put antialiasing first when it was the
shadow map, a gate was strongest exactly where it never ran.

Number a new record one past the highest in the directory.

## Use the project's vocabulary

When your output names a domain concept — an issue title, a test name, a
proposal — use the term the project already uses. Two places hold them, and the
split is deliberate: `AGENTS.md`'s Frontmatter contract carries every term a
gate enforces (in both directions, by `gates/frontmatter-contract.test.ts`), and
[`CONTEXT.md`](../../CONTEXT.md) carries the ones nothing enforces.

If the concept you need isn't there yet, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap
(note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts an existing record, surface it explicitly rather than
silently overriding:

> *Contradicts [ADR-0013](../adr/0013-cover-provenance-and-rehosting.md) on
> re-hosting cover art — but worth reopening because…*
