# What outranks `shelf_order`, and what `updateBook` will not touch

A book you are reading sorts ahead of everything, numbered or not; `shelf_order` arranges the rest. `updateBook` rewrites individual frontmatter lines and leaves any key whose value is a list alone — in either YAML spelling.

Both rules exist because the obvious version was wrong in a way nothing noticed: `order --renumber` numbers every shelved book, so "unset means reading first" described an unreachable state; and an inline `author: [A, B]` parses as *authorless*, which is exactly what sends `enrich` to overwrite it.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **A book you are reading outranks `shelf_order`.** Owner's call, resolving a collision between two documented rules. `shelf_order` used to win over everything, on the reasoning that someone who numbered a shelf meant it — but `order --renumber` numbers *every* shelved book, so after one run no unnumbered book existed, "unset means reading first" described an unreachable state, and the next book picked up sorted behind all thirty-one. Pinning a favourite should not cost you sight of what you are reading. The shelf is generated, not curated (brief, goal 3): `shelf_order` arranges the generated part rather than overriding the one rule that tracks what you are doing now.

- **2026-07-31** — **`updateBook` leaves a flow collection alone, not just a block list.** The "scalars only" rule checked for `tags:` followed by an indented `- ` list, so `author: [Marisol Vane, Tomas Ek]` on one line was replaced wholesale. Reachable rather than theoretical: `asString` returns undefined for an array, so a two-author note parses as *authorless*, which is exactly what sends `stacks enrich` to look an author up and write it over the list. Found by `gates/hand-edited-notes.test.ts`, which was red on arrival. A list is a list whichever way YAML writes it.
