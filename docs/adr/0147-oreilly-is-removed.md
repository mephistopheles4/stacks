# ADR-0147 — O'Reilly is removed as a metadata provider

**Date:** 2026-11-08
**Status:** accepted, built in [#450](https://github.com/mephistopheles4/stacks/issues/450)
**Issue:** [#450](https://github.com/mephistopheles4/stacks/issues/450)
**Supersedes:** [ADR-0038](0038-oreilly-is-a-fourth-provider.md), whole
**Spec:** [revision 4](https://github.com/mephistopheles4/stacks/issues/450#issuecomment-6728372984)

## Decision

The O'Reilly provider is deleted: `packages/core/src/metadata/oreilly.ts`, its
three captured fixtures, its entries in `scripts/capture-api-fixtures.ts`, and
the one recording of it in G26's corpus. Lookups go Open Library, then Google
Books, with Apple Books asked for covers only. The owner's words, relayed in the
decision that rescoped #450: *"I might drop O'Reilly completely"*, then *"drop
O'Reilly"*.

## Why

`api/v2/search`, the only route the provider used, has answered `401` to every
unauthenticated request since June ([#394](https://github.com/mephistopheles4/stacks/issues/394)).
Since then `oreilly.ts` has cost one refused request on each lookup that reached
it, and returned nothing.

## The four routes that were refused

| Route | Why it was refused |
| --- | --- |
| The v1 search (`/api/v1/search/?q=`) | It still answers anonymously and returns everything, but it is undocumented and could close without notice. The owner declined to build on it. |
| The v2 search with a token | One header would do it and nothing would be lost, but the token needs an organisation's Admin Console. |
| The Content API | It has a description field, but its tokens are made by account managers on an integrations page, and it is rate-limited for bulk sync (2 calls a second). |
| The MCP search with a personal token | It needs a credential tied to the owner's account, stored in plain text, and two review rounds still left high findings on it. The owner chose removal over carrying that. |

**Re-adding O'Reilly starts from #450's spec revision 2**, which designed the MCP
route and carries its measurements and the findings of both rounds.

## What is lost

- O'Reilly early releases, which no other provider holds.
- The 1200px cover borrowed for a book Open Library holds only as a placeholder.
- `oreilly_ourn` on new notes.

Compared with today, nothing is lost: the provider already returned nothing. A
book only O'Reilly held is an ordinary miss, and the owner fills in the note by
hand.

## What stays, and why

- **The frontmatter contract is unchanged.** `oreilly_ourn` and
  `cover_source: oreilly` go on parsing, shipping and linking for notes written
  before this change. No provider writes either key now.
- **Inert entries stay in the metadata layer:** `MetadataSource`'s `'oreilly'`,
  the `precedence.ts` orders and the `oreillyOurn` id row, `enrich.ts`'s
  `oreillyOurn` fill, and `http.ts`'s `learning.oreilly.com` refusal label. None
  of them makes a request. G31 (`merge-precedence`) and the `absent-only` gate
  pass unchanged.
- **The tag stripper's test stays,** pointed at `toPlainText` directly. It is the
  only test of the stripper that Google and Apple descriptions still pass
  through on their way into `## About`, and it carries CodeQL's `<scr<x>ipt>`
  case.
- `attribution.astro` keeps crediting O'Reilly, because its covers still ship on
  older books.

## The trade-offs

- **Inert entries kept, against stripped.** Kept, because the cheaper side to
  reverse is the one that does not touch G31's table, the `absent-only` gate's
  unfillable key, `precedence.test.ts` and `enrich.ts` for no change in
  behaviour. The cost is a handful of lines no provider exercises, and this
  record is what says they are not live.
- **A hand-added cover's provenance is written by hand.** `stacks covers
  --backfill` infers an absent `cover_source` from the image, and anything 700px
  or wider is guessed as `apple-books`, so an O'Reilly cover saved by hand at
  1200px would be recorded as Apple's. The owner writes `cover_source: unknown`
  for a cover added by hand, and `AGENTS.md` now says so. A guard in the
  backfill was considered and not built.
