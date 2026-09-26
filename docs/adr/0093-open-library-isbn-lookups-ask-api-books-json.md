# ADR-0093 — Open Library ISBN lookups ask `/api/books.json`

**Date:** 2026-09-26
**Status:** accepted
**Ticket:** [#391](https://github.com/mephistopheles4/stacks/issues/391)

## Decision

`lookupByIsbn` in
[`open-library.ts`](../../packages/core/src/metadata/open-library.ts) asks
`https://openlibrary.org/api/books.json?bibkeys=ISBN:<isbn>&jscmd=data`. The
suffix is the whole change: the response shape, the `{}` miss, and the mapping
into `BookMetadata` — `openLibraryOlid` included — are untouched. The URL is
built by one exported function, `isbnLookupUrl`, which the fixture capture
script also calls, and a test pins it as a literal.

## Evidence

Probed 2026-09-26, through Node `fetch` with the code's own User-Agent, and
through `Invoke-WebRequest` and `curl`:

| URL | Status |
| --- | --- |
| `/api/books?bibkeys=ISBN:9781603580557&format=json&jscmd=data` | 404, empty body |
| `/api/books?bibkeys=ISBN:9780374533557&format=json&jscmd=data` | 404 |
| `/api/books?bibkeys=ISBN:9780374533557&format=json` | 404 |
| `/api/books.json?bibkeys=ISBN:9781603580557&jscmd=data` | 200, 4094 bytes |
| `/api/books.json?bibkeys=ISBN:9790000000001&jscmd=data` | 200, `{}` |
| `/isbn/9780374533557.json` | 200 (control) |
| `/search.json?isbn=9780374533557&limit=1` | 200 (control) |

Re-capturing `open-library-isbn-hit.json` and `open-library-isbn-miss.json`
from the new URL produced files **byte-identical** to the committed ones.

Open Library's own documentation page still shows the bare `/api/books` path,
and calls the endpoint *"legacy"* that *"may be phased out in the future"*.

## Why this, and not the two endpoints the docs point to

- **`/isbn/<isbn>.json`** returns an edition record whose `authors` are
  `{key}` references, so a name needs a second fetch per author; its
  `publishers` and `subjects` are bare strings rather than `{name}`. More
  requests against a volunteer-run service, a new mapping, and a new fixture
  set, for the same facts.
- **`/search.json?isbn=`** is one request, and `toMetadata` could map it, but
  it answers about the *work*: `isbn`, `publisher` and `edition_key` hold every
  edition's values jumbled together, and pages is a median. An exact ISBN
  lookup would come back as a less exact record — possibly carrying a
  different edition's ISBN and OLID.

## Consequences

- **The failure was silent, and the cause of that is not fixed here.**
  `HttpGet` returns `undefined` for a 404 exactly as for a miss, so for as long
  as the bare path 404'd every `stacks add <isbn>` and every `enrich` with an
  ISBN fell through to Google's `q=isbn:`, which fuzzy-matches. Distinguishing
  "endpoint broken" from "book not found" is a separate change to `http.ts`.
- **The test suite could not see it either.** Every fixture reader matches
  Open Library's ISBN path on the substring `/api/books`, which both URLs
  contain. The literal-URL test is what closes that.
- **The endpoint is still the legacy one.** If Open Library retires it, this
  ADR's rejected alternatives are the next move, and `/isbn/` is the one that
  keeps an edition-exact answer.
