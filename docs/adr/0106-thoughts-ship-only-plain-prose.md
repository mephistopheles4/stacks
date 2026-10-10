# ADR-0106 — Thoughts ship only plain prose; any other shape withholds the section

**Date:** 2026-10-10
**Status:** accepted, built in [#411](https://github.com/mephistopheles4/stacks/issues/411)
**Issue:** [#411](https://github.com/mephistopheles4/stacks/issues/411)
**Amends:** [ADR-0101](0101-thoughts-ship-as-plain-text-and-withhold-whole.md)

## Decision

The `## Thoughts` extractor ships a section only when every line of it is
**plain prose**:

- paragraphs, with single line breaks kept;
- one level of list at the margin (`-`, `*`, `+`, `1.`), its marks kept;
- `###` and deeper subheadings, their hashes stripped;
- the inline marks `stripLine` knows: emphasis, strikethrough, highlight,
  wikilinks and Markdown links flattened to their text, tags, block ids and
  escapes.

**Any other shape withholds the whole section**, with a warning that names the
note and never quotes it:

- a quote or a callout (a line starting `>`);
- any indented line — a nested list, a list continuation, indented code;
- a code fence, or any backtick at all, which takes inline code and inline
  queries with it;
- `]:` anywhere, the mark of a link reference or footnote definition, whatever
  container it sits in and however many lines its label spans;
- a table, and two unescaped `$`, which may be math;

alongside every rule ADR-0101 and spec §3.1 already set: comment markers, HTML,
images, URL schemes, line endings other than LF and CRLF, setext headings, two
`## Thoughts` headings, and the 8,000-code-point cap.

**This replaces two of #368's rules.** Rule 2 removed `>` and shipped the quote;
rule 6 shipped a callout as reading view shows it. Both now withhold.

## Why an allowlist

The extractor reads one line at a time, and CommonMark builds structure inside
containers — quotes, callouts, list items — that a line scan cannot see. While
its rules were a list of shapes to refuse, each round of #411's review found a
shape the list did not name:

- round 1, a lone carriage return hiding `## Notes`, so the private remainder
  shipped (reproduced through a public build);
- round 2, a link definition inside a quote or list item, which reading view
  hides and the extractor shipped (reproduced through a public build), and a
  query block inside a callout, which reading view renders and whose source
  shipped.

A denylist of hidden shapes does not close; an allowlist of shown shapes does.
It is invariant 2's own principle — *an allowlist and never a denylist, for the
same reason `private:` fails closed* — applied one level down, to the shapes
inside the one section that ships.

## Cost

Thoughts written with a quote, a callout, a nested list, code or math do not
publish; the owner sees the warning and can rewrite the section. #368 counted
none of those shapes in the real vault, so nothing is lost today.

**Cheap to reverse**: a shape can join the allowlist later, one at a time, each
with an extractor test that plants the canary where a misread would leak it.
Widening is the direction that publishes more, so each step needs its own case.

## Alternatives rejected

- **Keep patching shapes.** Each round of review found another; nothing
  suggested the next would be the last.
- **Parse with a real CommonMark library and compare what is shown with what
  ships.** It would track Obsidian more closely, at the cost of a dependency
  ADR-0101 chose to avoid, and Obsidian is not CommonMark exactly (callouts,
  `%%`, embeds, plugins), so the comparison would still need hand rules.
- **Strip container markers and re-run each check per line.** Closer to what
  ships today, but still a denylist, with the nesting rules of CommonMark to
  reproduce by hand.

## Consequences

- `packages/core/src/adapters/thoughts-section.ts` checks every section line
  against `lineShapeProblem` and the raw section against `HIDDEN`, matched
  anywhere and never at a line start only.
- The inspector's `notes-shape` backstop refuses any tag start beside the
  comment markers, and a file that is not byte for byte what the writer emits.
- ADR-0101's decision stands — plain paragraphs, stripped by hand, withheld
  whole — with its list of shapes narrowed as above.
