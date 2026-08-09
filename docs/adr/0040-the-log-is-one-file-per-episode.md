# `progress.md` is a spine; the log is one file per episode

`docs/progress.md` keeps current state, the gate log, environment findings, the
hand-off notes, and an index. Every investigation moved to `docs/log/`, one file
per episode, dated and slugged. The file went **1551 lines to 191**.

Nothing was rewritten. The 17 episodes moved byte for byte; the only edit to any
of them is the `##` that became a `#` and the relative links that gained a `../`
because the files sit one directory deeper. Verified rather than asserted: every
non-blank line of the original was checked to still exist after the split, and
the only 17 that did not were the 17 headings whose level changed.

## Why

The file had already stopped being what its own second paragraph said it was:

> This is an **index, not a narrative**. One line per event, newest phase last.

It was 1551 lines and 24 narrative sections, of which **116 lines were table**.
One episode — the mobile crash — was 460 lines, 30% of the file on its own. That
is not a size complaint. It is the same defect class this repo gates against
everywhere else: a documented claim that quietly stopped being true, with
nothing able to go red on it.

[ADR-0024](0024-decision-record-is-adrs.md) had already made this exact move
once, for the same reason, and it states the rule that decided which file could
be touched: *"Nothing parses the log, which is why it could move at all."* Two
gates throw on a missing `CLAUDE.md` heading, so those stay put permanently.
Nothing parses `progress.md` — so it could move, and `gates.md` (which G19 does
parse) was left alone.

## The unit is the episode, and that was measured

ADR-0024 asserted its entries were "only legible in sequence", then **reversed
on the same day** after measuring 11% back-references. Making the same shape of
claim again without measuring would repeat exactly that.

Searching all 1551 lines for explicit reference markers — *see above*,
*superseded*, *as noted*, *the same bug* — returns **two hits, and both are
inside the mobile-crash episode**. Cross-episode references measure zero.

That result decides the unit in both directions: episodes are separable, *and*
the 460-line mobile crash stays one file. Splitting it into its ten subsections
is the only move here that would actually have broken a reference.

## The gate came first, and it earned its place immediately

`gates/doc-links.test.ts` (G29) was written, run green against the un-split
tree, and observed red — **before** anything moved. That ordering is the whole
reason this change is reviewable: run it after the split and a red result cannot
distinguish "you broke this" from "this has been broken for months".

It caught **15 broken links the split created**, all the same fault — an episode
moving from `docs/` to `docs/log/` leaves `./gates.md` and `./adr/…` one
directory short. Nothing else in the repo would have noticed, and the failure
mode is a document that reads as a route and is a dead end.

There is a trade recorded in `docs/gates.md`: prose references that name a
section *in words* rather than linking to it are invisible to any link checker,
and four of them existed. They were fixed by hand. A gate asserting that a named
section still exists somewhere is possible and was rejected as over-engineering
for four sentences.

## What keeps it from happening again

The split alone is a one-time cleanup. `.claude/skills/phase-gate/SKILL.md` is
what makes it durable: it now says a new investigation goes to
`docs/log/<date>-<slug>.md` with one index line, rather than being appended to
`progress.md`. Without that edit the next phase-gate run puts another 400-line
narrative back into the spine and this decision is undone in a month.

`CLAUDE.md` carries the same rule, since a contributor with none of the optional
skills installed must still get it right.

That makes **`## The log` a fourth heading the skill depends on by name**,
alongside `Current state`, `Gate log` and `Environment findings`. None of the
four is parsed — a rename degrades an agent instruction rather than reddening a
build — but they are the reason the spine's headings are not free to move, and
they are recorded here so the next person renaming one knows what reads it.

## What was not done

**`gates.md` was not split**, though it is 1112 lines of which only 65 are
table. Its spine is *parsed* — G19 reads 28 rows, `## Status key` and
`## Invariants → gates`, and `markdownSection` throws on a renamed heading. A
probe replaying G19's own helpers against four hypothetical versions confirmed
the prose tail can be moved with zero test changes, and also found the trap: a
parsed section must be followed by another `## ` heading or the regex returns
nothing. The gain is real, the risk is concentrated in the one file a gate
reads, and splitting `progress.md` captured most of the benefit. Deferred
deliberately, not forgotten — the evidence is in
[`docs/research/splitting-the-long-docs.md`](../research/splitting-the-long-docs.md).

**Gate rows kept their numbers.** `G19` is opaque and a name would read better,
but the number is the retirement mechanism: `docs/gates.md`'s "Retiring a row"
requires unique, gapless numbering so a rule that stops applying leaves a
visible hole, and a name cannot encode absence. The answer, if taken, is the ADR
convention already used in this directory — number *and* slug, `G19 —
constitution-scoreboard` — which is additive and belongs in its own commit.
