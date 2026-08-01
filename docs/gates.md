# Gates

**The scoreboard.** One row per rule that must never break, mapped to the named
spec that goes red when it does.

Update it in the **same commit** as the gate it describes — the same discipline
[`progress.md`](./progress.md) follows, and for the same reason.

---

## Why this file exists

Every rule below was already written down, in [`CLAUDE.md`](../CLAUDE.md) or the
Decision Log. A pre-publication review in July 2026 found that six of them had
quietly stopped being true, and nothing went red:

| Documented claim | Reality when checked |
| --- | --- |
| Decision Log: "only the basename of a `cover:` value is ever used … Tested" | true in `publish.ts`, false in `enrich.ts` |
| progress.md: audiobook covers carry their true aspect | true under `--public`, false under `pnpm dev` |
| `gate:public` certifies the build carries nothing private | greps text *contents*; never looks at filenames |
| CLAUDE.md: "Unset means the default order" | unreachable after one `stacks order --renumber` |
| Working rules: a Decision Log entry in the same commit | ~8 decisions unlogged across 18 commits |
| progress.md: "Ten commits of work" | 18, two of them credited from before the tag |

A rule nothing can fail on is a comment. The point of a row here is that it can
go **red**, and that it has been *observed* going red at least once — the same
standard the Phase 0 gate hardening set: *"A gate never observed failing is not
yet a gate."*

## Status key

| | |
| --- | --- |
| ✅ | gated, and proven red-capable |
| 🔴 | gate written, currently failing on a real defect |
| ⬜ | no gate yet |

## Invariants → gates

| Row | Rule | Source | Gate | Status |
| --- | --- | --- | --- | --- |
| **G1** | All vault access goes through the adapter | invariant 4 | glob every `.ts` outside `adapters/`, assert no `node:fs`; reverse-assert each allowlist entry still resolves | ⬜ |
| **G2** | Note bodies are private; a public build is coherent | invariant 2 | four assertions — see below | ⬜ |
| **G3** | Never crash on a bad note | invariant 3 | garbage corpus: empty, binary, no frontmatter, unterminated YAML, duplicate keys | ⬜ |
| **G4** | Hand-edited notes are first-class | invariant 5 | byte-for-byte round-trip through `updateBook`: comments, key order, body | ⬜ |
| **G5** | The vault is the source of truth | invariant 1 | `library.json` untracked and gitignored | ⬜ |

## Contract seams → gates

A seam is a correspondence between two artifacts that nothing verifies. Red
means the two have drifted.

| Row | Seam | Failure mode | Gate | Status |
| --- | --- | --- | --- | --- |
| **G6** | site → `@stacks/core` | a *value* import drags `node:fs` and sharp into the browser bundle and **the shelf silently never boots** | any value import outside `@stacks/core/shelf-order` fails | ⬜ |
| **G7** | logic in `.astro` | `.astro` files are not typechecked (`astro check` cannot run under TS 7), so nothing else can catch this | `<script>` blocks are imports plus one call | ⬜ |
| **G8** | frontmatter contract ↔ parser ↔ CLAUDE.md | a key the parser accepts but the contract never documents | `gates/frontmatter-contract.test.ts` | ✅ |
| **G9** | `.env.example` ↔ `process.env` | a variable the code needs and no one knows to set | `gates/env-contract.test.ts` | ✅ |

**G8 observed red** on `shelf_order`, which the parser read and the prose
described but the documented enumeration never listed. **G9 observed red** on
`PORT`, read by `scripts/dev-watch.ts` and documented nowhere. Both fixed in the
commit that added them.

## Defect gates

Three rows that exist because a specific defect got through. Each was written to
fail first.

| Row | Rule | Defect it pins | Status |
| --- | --- | --- | --- |
| **G10** | one cover-path rule, one implementation | `enrich.ts` shadowed `node:path`'s `basename` with a `/`-only split, so `..\..\x.png` traversed on Windows — the platform this project runs on | ⬜ |
| **G11** | `coverAspect` on both build paths | stamped only by `publish()`, so `pnpm dev` fell back to 0.65 and squashed square audiobook art. Both existing gates run `--public`, so neither covered the path the owner actually looks at | ⬜ |
| **G12** | `shelf_order` semantics survive `--renumber` | `--renumber` numbered *every* shelved book, making the documented default order unreachable and sorting the next book you read last | ⬜ |

## G2 in full — the public build gate

The existing `gate:public` is a good gate that cannot see three things. It greps
the *contents* of *text* files for three known-bad patterns. So a private value
in a permitted field passes by construction, and a filename is never read at all.

1. **No note bodies.** The existing canary, plus a second one planted as a
   frontmatter *value*. The gate fails if either canary is missing from the
   fixture vault, so it still cannot pass vacuously.
2. **Provenance — no orphan covers.** Every file in `<assets>/covers/` must be
   referenced by a book in the `library.json` shipped beside it. `copyCovers`
   never prunes, so a real-vault build followed by a fixture-vault gate run
   leaves real covers behind, each filename a slug of a real title, while the
   gate reports green. This assertion is also what makes cover filenames safe in
   general: a cover named after a book already in the index reveals nothing. It
   only leaked because it was an orphan.
3. **Only books you own.** Wishlist books are filtered at render but serialised
   into `library.json`. The page says you own them; the data disagrees.
4. **Same-origin covers.** A `cover:` value may currently be protocol-relative
   or absolute `http`, so a hand-edited or imported note can make a visitor's
   browser hit a third-party host.

## Where cover art may go

| Surface | Rule |
| --- | --- |
| The repo | **Never.** `fixtures/` is wholly invented; see `fixtures/README.md`. |
| A public build | Open Library art, re-hosted, with a courtesy link back. |

Copyright is the lesser constraint here; the providers' own terms are stricter
and are what this follows. Open Library's docs contemplate download and
public-facing display, ask that you not crawl, and appreciate a link back.
Google's API terms bar permanent copies and public display of API content and
require "powered by Google" plus a prominent link per result. Apple conditions
all promotional content on placement beside a store badge linking to a purchase
page — and book covers are not among the content types its terms enumerate at
all. So Google and Apple stay as metadata and lookup fallbacks; their art is
hotlinked or omitted from a public build rather than re-hosted.

This needs cover **provenance** to be recorded at fetch time, which it is not
today — `cache-cover.ts` writes `<slug>.<ext>` and forgets where the bytes came
from. That is a prerequisite of G2, not an extra.

## Not gated, deliberately

| | Why |
| --- | --- |
| Coverage percentage | Coverage measures execution, not detection. An AI asked to raise it produces exactly the gap it is asked to close. No ticket should ever exist to raise it. |
| Changed-lines floor (diff-cover) | One contributor; it would be noise. |
| Mutation testing (Stryker) | Genuinely cheap here — 133 tests in ~2s — and the real measure of whether these gates have teeth. Parked only because it is second-order to having CI at all. Revisit once the rows above are green. |
| Article XI-style residency rules | No infrastructure; nothing to pin. |
