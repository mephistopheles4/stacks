# The contributor set _is_ the set of id keys, and they are ids rather than URLs

A book's note records four optional scalars — `google_volume_id`,
`apple_track_id`, `openlibrary_olid`, `oreilly_ourn` — and **which of them are
present is the record of which providers matched the book**. There is no
`contributors:` list and no winner key.

## A contributor is a provider whose record was confirmed to be this book

An **identity** claim, not a data-flow one, and that is the point. The
alternative — _a provider whose data reached the note_ — means "supplied the
cover" today and "supplied fields" after the merge revision, so the same key
would mean two different things either side of it and every note written before
would need re-reading.

Under this definition Apple was **already** a contributor and always had been:
`findCover` ran `isProbablySameBook`, established the record _is_ this book, and
then discarded everything but one artwork URL. The fact was never missing.

## Four scalars, and that is forced rather than preferred

`updateBook` leaves a key whose value is a list exactly as it is — flow
collections included — so a list-valued provenance key could never be written by
`stacks enrich` at all. A nested mapping fails the same way. Choosing
per-provider scalars is what let the backfill question be decided on its own
merits instead of by an adapter limitation.

**No winner key**: a single note-level winner is only meaningful while the merge
is record-level, and it is now field-level. Anything finer is per-field
provenance, which nobody asked for — and the precedence table cannot reconstruct
attribution anyway, because a provider only wins a field it happens to have.

## Ids, never URLs

Apple hands back a finished `trackViewUrl`, and the note stores `trackId`.

A provider URL lands in an `href`, and the card's `textContent` rule protects
**text** — it does nothing for an `href`. Hand-edited notes are first-class
(invariant 5), so a stored URL is not guaranteed to have come from Apple at all.
With an opaque id the worst a corrupted value can do is 404.

**Shape-checked at parse and dropped on mismatch**, mirroring `cover_source`.
⚠️ **A typo guard and explicitly not a correctness guarantee** — a well-formed
wrong id passes and always will. It earns its place because every linkable id URL
**hard-404s on a stale id**, where the ISBN URL lands on a graceful page.

**Every key names its provider's own field**, and for O'Reilly that is the guard
rather than a convention: `ourn` is not `archive_id`, which CLAUDE.md already
documents as a trap — a well-formed ISBN-13 for a different book. A key called
`oreilly_id` would invite pasting it, and the shape check would pass it. **The
name does work no validator can.**

## There is no inference route, which is why backfill is a real pass

`cover_source` had the same problem and solved it without touching the
providers — `covers/infer-source.ts` guesses a cover's origin from the file on
disk. That escape hatch does not exist here: **a note records an answer, never
who gave it**. Re-fetching is the only route, which is why `stacks enrich` is
permanently a whole-vault network pass.

⚠️ **The residual is Apple, on every book.** Apple has no ISBN endpoint, so
`apple_track_id` is title-matched on the whole vault. A wrong cover is visible
and gets noticed; a wrong id is invisible until a visitor clicks it.

## How this was decided

Map [#88](https://github.com/mephistopheles4/stacks/issues/88), tickets
[#96](https://github.com/mephistopheles4/stacks/issues/96) (what is recorded),
[#94](https://github.com/mephistopheles4/stacks/issues/94) and
[#100](https://github.com/mephistopheles4/stacks/issues/100) (which ids build a
working URL), [#99](https://github.com/mephistopheles4/stacks/issues/99) (how
existing notes acquire them).
