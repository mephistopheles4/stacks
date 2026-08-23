# Phase A — invariant scoreboard

Every rule in CLAUDE.md now has a named gate that can go red. The scoreboard is
[`gates.md`](../gates.md); it records which rows were red on arrival and what each
caught. `pnpm test` went 133 → 211.

Six defects, all of them documented rules that had quietly stopped being true:

|                                                                                                                                                                      | Found by |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `updateBook` overwrote an inline list — `author: [A, B]` — losing an author. Reachable: an array parses as _authorless_, which is what sends `enrich` to look one up | G4       |
| `enrich` re-implemented the cover-path rule and got it wrong on Windows, under a comment saying it could not                                                         | G10      |
| a third copy of that rule in the wikilink embed, resolving to nothing for a backslash path                                                                           | G10      |
| the public staging folder was additive: real covers survived a fixture-vault gate run, filenames slugged from real titles, gate green                                | G2       |
| wishlist books shipped in `library.json` though nothing displayed them                                                                                               | G2       |
| `shelf_order` collided with "reading first" — one `--renumber` and the next book you picked up sorted last                                                           | G12      |

Plus `shelf_order` missing from the documented key list (G8) and `PORT` from
`.env.example` (G9).

**Still open**

- **Cover provenance backfill.** `cover_source` is recorded going forward, but
  every cover already in the vault has none, so the provider policy (re-host
  Open Library only) cannot be enforced without emptying the shelf. Decide the
  backfill before enforcing.
- **Unterminated frontmatter is dropped silently** — a note opening `---` with
  `type: book` and no closing fence returns `not-a-book`, so no warning names
  it. Invariant 3 arguably wants `invalid`. G3 pins current behaviour with the
  competing reading in a comment.
- **`applyChange` mis-handles a YAML block scalar** (`description: |` plus
  indented lines). Unreachable from any current call site; flagged, not fixed.
- ~~**No `.gitattributes`.**~~ Added — `* text=auto eol=lf`, with the fixture
  binaries marked so they are never diffed.
