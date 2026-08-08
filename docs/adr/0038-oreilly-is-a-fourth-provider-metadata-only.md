# ADR-0038: O'Reilly is a fourth provider, consulted last, covers included

**Status:** accepted
**Context:** the vault holds O'Reilly early releases the other three providers
have never heard of

## What was decided

`learning.oreilly.com/api/v2/search/` joins the lookup asked **last** — after
Open Library and Google, and only when neither of them has actually found the
book. It answers both lookups: a title search, and an ISBN as
`query=<isbn>&field=isbn`. It returns title, author, ISBN, a page count **and a
cover** — the last of those reversed within the hour of first writing this, for
the reasons below.

## Why this needed a decision at all

Because the other three genuinely do not have these books, and the failure was
silent. *Learning AI-Native Software Engineering* is dated 2027-02-25; Open
Library, Google and Apple hold nothing for it under its title or its ISBN. So
`stacks add` answered with *AI-Powered Software Engineering* — a different book
by four different authors — and wrote it into the vault without a word. The
guard that now refuses that is a separate change; this one gives the right
answer rather than merely refusing the wrong one.

**Last, on the same terms Google is second.** It costs a request only on the
path that is already failing, and nothing on the path that works. That is what
lets it be added without relaxing the Open Library short-circuit, which was
measured to be orthogonal to the ranking bug and is still unshipped.

**`formats=book`.** The catalogue is videos, courses and live events too, and a
video is not something this shelf can hold.

## Two identifiers, and the URL carries the wrong one

A library URL ends in O'Reilly's internal `archive_id`, never the ISBN. Two
books show it, and the second is the one that matters:

| book | URL `archive_id` | real `isbn` |
| --- | --- | --- |
| *Learning AI-Native Software Engineering* | `0642572352530` | `9798341674738` |
| *Evals for AI Engineers* | `9798341660717` | `9798341660724` |

The first is spottable by eye: `064` is a prefix no Bookland range assigns,
though it does pass an ISBN-13 check digit. **The second is not spottable at
all.** It is a well-formed 979 ISBN-13 that validates perfectly and is still
*seven off* the book's real identifier — so no check-digit test catches it, and
neither does a prefix test. The only reliable rule is the field name.

`isbn` is therefore taken from the response body and the archive id is used for
nothing but building cover URLs. Reading the identifier out of the URL — the
obvious thing, and what a reader would assume — writes a plausible wrong ISBN
into a note that nothing downstream could tell from the real one.

## Covers, taken — reversed within the hour, and the first answer is left standing

**This record originally said no covers**, on the reasoning that `cover_source`
exists to record which terms apply to the bytes, so a fourth host meant reading
O'Reilly's licence first. The proposal was to fetch the art and have the public
build exclude it, fail-closed like `private:`.

That was wrong, and checking rather than reasoning is what showed it:

- **`publish.ts` has never read `cover_source`.** Nothing filters on it. Every
  cover is published whatever its source.
- The shelf already re-hosts **26 covers from Apple**, whose terms this repo's
  own comment says *"book covers are not among the content types its terms
  enumerate at all"* — the least clear of the four.

So the proposed exclusion would have been **stricter than the status quo,
applied to one provider, on no evidence**, while `cover_source` sat there
reading like a policy it had never implemented. The owner's question — *isn't
the worst case a takedown notice?* — is the right frame for a personal shelf of
37 covers, and the honest answer is yes.

Covers are therefore taken like everyone else's, and `cover_source: oreilly` is
recorded for what that key actually buys: if a provider ever asks for its art to
come down, the answer can be *those two* rather than *all of them*. An index for
acting precisely, not a licence check. CLAUDE.md's claim that it "decides what a
public build may re-host" is corrected in the same commit — that sentence is
what talked this record into the wrong answer in the first place.

**Sized at 1200w, not the 2000 on offer.** `MAX_COVER_EDGE` resizes every
published cover to 512 on its long edge, because oversized textures are what
crashed mobile, so pixels above the cap reach no shelf and cost only vault bytes
— about a megabyte a book against 8.9 MB for the whole library. 1200 matches
what Apple is already asked for and leaves headroom over 512.

Built from the response's `ourn` verbatim rather than re-derived from
`archive_id`: the same string wrapped in `urn:orm:book:`, and one place to be
wrong instead of two.

## `fillGaps` falls through to O'Reilly for a cover

The gap the fallback chain could not close on its own. *Evals for AI Engineers*
**is** in Open Library, so the ISBN lookup stops there and never reaches a
fourth provider — and Open Library's cover for it is a 43-byte placeholder,
Google has no art, Apple has never heard of it. The book sat on the shelf as a
blank spine with the picture one request away.

So a cover still missing or still speculative after everything else falls
through to O'Reilly by ISBN. It costs a request on exactly the books that would
otherwise have nothing, and it needs an identifier — a title search here would
be borrowing artwork on a resemblance.

## Consequences

- **`MetadataSource` and `CoverSource` both gain `oreilly`.** They remain
  different questions — which provider answered, against where the bytes came
  from — and here they can differ in one direction that matters: a book Open
  Library answered for can still carry an O'Reilly cover, which is exactly what
  `fillGaps` now produces.
- **`virtual_pages` is not a print page count.** It is O'Reilly's estimate for
  reflowable content, and for a title that has never been printed it is the only
  page number that exists. It is mapped to `pages` because the shelf needs a
  height and this is the publisher's own figure for the edition being read, but
  it is a different kind of fact from the counts G26 pins exactly.
- **One endpoint serves both lookups.** `/api/v2/book/<id>/` returns 404 without
  a session, so the ISBN path goes through search too, as
  `query=<isbn>&field=isbn` — exact, one result. That is load-bearing rather
  than tidy: `enrich` searches by a note's ISBN whenever it has one, so a
  title-search-only provider could supply a book and then never be able to
  enrich it again. `isbn=<n>` as its own parameter is silently ignored and
  returns 54,423 results with the wrong book first, which is the failure mode
  this arrangement avoids.
- **The corpus grew a provider it must now record.** G26 replays every URL the
  lookup asks for, so `oreilly-search-miss.json` is captured as well as the hit:
  O'Reilly is consulted on every path where the first two found nothing, which
  is most of the corpus.
