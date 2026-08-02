<!--
Most changes here are written by agents. This template is the handover note:
what changed, what protects it, and what you decided along the way.

Delete any section that genuinely does not apply — an empty heading is worse
than no heading. Do not delete the two questions.
-->

## What changed, and why

<!-- The why matters more than the what; the diff already says the what. -->

## Which invariant does this touch?

<!--
Name it from CLAUDE.md — the numbered invariants, the frontmatter contract, the
vault adapter contract, or a tech decision. "None" is a fine answer for docs and
tooling; say so rather than leaving this blank.
-->

## Which gate would catch this breaking again?

<!--
Name the row from docs/gates.md, or the spec file. If the answer is "nothing
would", say that plainly — it is useful information and sometimes the correct
outcome. It is never a reason to skip the question.

If you added or changed a gate: how did you observe it failing? A gate never
observed failing is not yet a gate.
-->

## Decisions

<!--
Did you decide anything the brief left open — a library, an API quirk, a
workaround, a trade-off? If it is hard to reverse, surprising without context,
and a real trade-off, it earns a record in docs/adr/ — in this PR, with the
reasoning. If it is about a gate, docs/gates.md is the right home. Tick or
explain.
-->

- [ ] No decisions to record, or they are in `docs/adr/` in this PR

## Checks

- [ ] `pnpm test && pnpm build && pnpm gate:public && pnpm smoke:render` green locally
- [ ] No third-party copyrighted material added — no real covers, blurbs or note text
- [ ] Any allowlist entry I added in `gates/` is justified in a comment beside it

<!--
If a visual change: attach the screenshot from artifacts/shelf.png. The shelf is
reviewed by eye and no gate can do that part.
-->
