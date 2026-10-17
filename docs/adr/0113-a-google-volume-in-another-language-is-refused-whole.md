# ADR-0113 — A Google volume in another language is refused whole

**Date:** 2026-10-17
**Status:** accepted, built in [#396](https://github.com/mephistopheles4/stacks/issues/396)
**Issue:** [#396](https://github.com/mephistopheles4/stacks/issues/396)
**Supersedes:** [ADR-0094](0094-a-title-search-takes-one-edition-in-the-reading-language.md)'s
"Google's ISBN is dropped, not the volume" entry, and its consequence that a
foreign Google volume can still be a contributor on the no-ISBN path

## Decision

`googleBooks.searchByTitle` drops a volume whose `language` differs from the
reading language. It is no longer a primary or a `fillGaps` contributor, so it
supplies nothing: no ISBN, pages, cover, author, `volumeId`, publisher, date,
subjects or description. A volume that reports no language still counts as in
the reading language.

## Evidence

Measured on 2026-10-17, by one live by-id request per `google_volume_id` in the
owner's vault ([measurement](https://github.com/mephistopheles4/stacks/issues/396#issuecomment-6240001555)):
46 of 54 notes record a Google volume, and 2 of those volumes are in another
language (one `it`, one `es`) with the reading language `en`. Each carries
pages, author, publisher, date, subjects and description, and one a cover.
Dropping only the ISBN let all of those through.

## Why this, and not the alternatives

- **Refuse the volume, not field by field.** Every field a translation carries
  describes the translation, and a description lands under `## About` in the
  wrong language. There is no field worth keeping.
- **Still not `langRestrict`.** It would move every Google search URL, and with
  it every cached response and every G26 key — the reason ADR-0094 gave, which
  still holds.
- **G26 is unchanged.** Every `language` in `fixtures/api/lookup-recall.json`
  is `en`, so no recorded volume is refused.

## Consequences

- **A book whose only Google answer is a translation loses Google** and falls
  to O'Reilly, or to nothing.
- **It fixes new lookups, not notes already written.** `enrich` is absent-only,
  so a field a translation already filled stays until the owner edits it.
- **The by-ISBN path is unfiltered.** `lookupByIsbn` answers for the ISBN a
  note already carries; a foreign volume there means the note's ISBN is
  foreign, which is ADR-0094's audit and not this decision.
