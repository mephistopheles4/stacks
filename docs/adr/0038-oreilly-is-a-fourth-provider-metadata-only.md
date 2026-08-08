# ADR-0038: O'Reilly is a fourth provider, consulted last, and supplies no covers

**Status:** accepted
**Context:** the vault holds O'Reilly early releases the other three providers
have never heard of

## What was decided

`learning.oreilly.com/api/v2/search/` joins the lookup asked **last** — after
Open Library and Google, and only when neither of them has actually found the
book. It answers both lookups: a title search, and an ISBN as
`query=<isbn>&field=isbn`. It returns title, author, ISBN and a page count.
**It never returns a cover.**

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

A library URL ends in O'Reilly's internal `archive_id` — `0642572352530` for
this book. It passes an ISBN-13 check digit while beginning `064`, a prefix no
Bookland range assigns, so it looks exactly like an ISBN and is not one. The
real ISBN is a separate field: `9798341674738`.

`isbn` is therefore taken from the response body and the archive id is used for
nothing. Reading the identifier out of the URL — the obvious thing, and what a
reader would assume — writes a plausible non-ISBN into a note that nothing
downstream could tell from the real thing.

## No covers, and that is the part to revisit

The art is the best available: `/covers/<archive-id>/1600w/` serves 1600x2100,
against Apple's ~800x1200 and Google's ~128px. It is served unauthenticated. It
is also keyed on the archive id, not the ISBN.

It is not taken, because `cover_source` is a closed enum whose entire purpose is
recording **which terms apply to the bytes**, and
[`covers/cover-source.ts`](../../packages/core/src/covers/cover-source.ts)
carries a prose summary of each provider's licence — Open Library's
public-display allowance, Google's bar on permanent copies, Apple's store-badge
condition. Adding a fourth host there means reading O'Reilly's terms and writing
that paragraph. That is a decision about republishing someone else's artwork on
a public URL, and it is not one to infer from the fact that the endpoint
answers.

Until then an O'Reilly-sourced book still gets a cover from Apple or Google if
either holds one, through the machinery that already exists.

The shape a future decision would most likely take: fetch the cover, record its
provenance, and have the **public build exclude it** — the same fail-closed
posture as `private:`, where a book stays on your own shelf and off the
internet. That keeps the good art locally without asserting a right to re-host
it.

## Consequences

- **`MetadataSource` gains `oreilly`**, and `CoverSource` does not. The two were
  already different questions — which provider answered, against where the bytes
  came from — and this is the first source where they cannot coincide.
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
