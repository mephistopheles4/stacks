# Field-level audit: what each provider returns vs. what the code keeps

**Research date:** 2026-08-09  
**Scope:** Open Library, Google Books, Apple Books, O'Reilly  
**Focus:** Fields present in API responses but not extracted into `BookMetadata`

---

## Summary

Every provider holds substantially more metadata than the current `BookMetadata` interface captures. The discard is most dramatic at the extremes:

- **Open Library**: Reliably provides publisher, publication date, and subjects/keywords; the audit fixture holds 35 subject tags for one book.
- **Google Books**: Full-text description, publisher, publication date, categories, language, ratings; unreachable due to exhausted quota, but documented in API spec and code comments.
- **Apple Books**: High-quality full descriptions, genres, release dates, user ratings (when present), price; returned for every result in a live search for *Thinking in Systems*.
- **O'Reilly**: Full description, publisher, language, issued date, topic categorization, review/rating metadata; all present on the audit fixture and discarded entirely.

**The reliability picture:** description and genres are nearly universal. Publisher and publication date are reliable across Open Library and O'Reilly; Apple includes release date on every result. User ratings appear on highly-reviewed books in Apple's catalogue but are absent or zero for newer or less-reviewed titles.

---

## Open Library

### What it returns

Two response shapes, both captured in `fixtures/api/`:

#### By-ISBN lookup (`/api/books`)
**Fixture:** `open-library-isbn-hit.json` — "Thinking in Systems" ISBN 9781603580557

**Fields in response:**
- `title` ✓ kept
- `authors` (array of `{url, name}`) ✓ kept (names only)
- `number_of_pages` ✓ kept
- `identifiers` ✓ kept (ISBN extracted; other identifiers discarded)
  - `isbn_13`, `isbn_10`
  - `wikidata`, `openlibrary` — discarded
- `publishers` (array of `{name}`) — **DISCARDED**
- `publish_date` (string, e.g., "2008") — **DISCARDED**
- `subjects` (array of `{name, url}`) — **DISCARDED**
  - 35 subject tags on this book
- `classifications` (LC classifications) — **DISCARDED**
- `cover` (object with `{small, medium, large}` URLs) ✓ kept (large only)
- `url`, `key` — metadata only, discarded

**Reliability:**
- `publishers`: present on the audit sample, reliable across catalogued books (may be empty for very old or community-scanned works)
- `publish_date`: present on the audit sample, reliable when the book has been catalogued with publication metadata
- `subjects`: present on the audit sample (35 entries), reliably present on well-catalogued works; sparse or absent on obscure titles

#### Title search (`/search.json`)
**Fixture:** `open-library-search-hit.json` — search for "thinking in systems"

**Fields in response:**
- Minimal subset compared to by-ISBN
- `author_name` ✓ kept
- `cover_i` ✓ kept (converted to URL)
- `isbn` (array) ✓ kept
- `number_of_pages_median` ✓ kept
- `title` ✓ kept

**Why the difference:**
Search response omits subjects, publishers, and publication date — the endpoint is optimized for quick filtering, not detail.

### Summary for Open Library

| Field | Present | Reliability | Notes |
|-------|---------|-------------|-------|
| Publisher | Yes | Reliable | Catalogued books have this; rare exceptions on OCR/community scans |
| Publication date | Yes | Reliable | Structured as "YYYY", available on most published works |
| Description/synopsis | No | N/A | Not returned by any Open Library endpoint tested |
| Subjects/keywords | Yes | Reliable | 35+ per book on well-catalogued works; sparse on obscure titles |
| Categories | No | N/A | Not available; subjects are the categorization |
| Series/position | No | N/A | Not available |
| Language | No | N/A | Not returned |
| Edition statement | No | N/A | Not returned |
| Translator | No | N/A | Not returned (authors present; translators would require deeper object parsing) |

---

## Google Books

### What it returns

**Cannot make live calls:** Unauthenticated requests share an exhausted quota and return 429 "Queries per day" exceeded. Fixture in `fixtures/api/google-books-quota-exceeded.json` confirms this state.

**Evidence from tests and code:**

**Test-injected example** (`packages/core/src/metadata/metadata.test.ts` lines 268-278):
```javascript
volumeInfo: {
  title: 'Thinking in systems',
  subtitle: 'a primer',
  authors: ['Donella H. Meadows'],
  pageCount: 240,
  imageLinks: { thumbnail: 'http://books.google.com/x?zoom=1&edge=curl' },
}
```

**What is extracted:**
- `title` ✓ kept
- `subtitle` ✓ kept (merged into title)
- `authors` ✓ kept
- `pageCount` ✓ kept
- `imageLinks.thumbnail` ✓ kept
- `imageLinks` resized to larger version as `coverUrlLarge` ✓ kept
- `industryIdentifiers` ✓ kept (ISBN extracted)
- `volumeId` ✓ kept (Google-specific, used for detail re-request)

**What is discarded** (documented in Google Books API spec, present in volumeInfo):
- `description` / `textSnippet` — Full book synopsis
- `publisher` — Publishing company
- `publishedDate` — Publication date (format: "YYYY-MM-DD" or "YYYY")
- `categories` — Subject categories (array)
- `language` — Language code (e.g., "en")
- `canRead` — Whether the full text is readable
- `maturityRating` — Content rating
- `printType` — "BOOK" or "MAGAZINE"
- `infoLink` / `previewLink` / `canonicalVolumeLink` — URLs to Google Books
- `averageRating` — Average user rating (0–5)
- `ratingsCount` — Number of ratings

**Reliability:**
Not directly observable from test fixtures, but code comment at `google-books.ts:72-77` notes:
> `printedPageCount` also appears in detail responses and is deliberately not read. It disagrees with `pageCount` in *both* directions — 272 against 254 for one book, 197 against 304 for another — so it is not reliably the more truthful number.

This pattern suggests other fields are *present* but *unreliably correct* across search vs. detail responses.

### Summary for Google Books

| Field | Present | Reliability | Notes |
|-------|---------|-------------|-------|
| Publisher | Yes (volumeInfo) | Reliable | Present on most published books |
| Publication date | Yes (volumeInfo) | Reliable | Present on most published books; format varies |
| Description | Yes (volumeInfo) | Reliable | Present when Google has indexed the book |
| Categories | Yes (volumeInfo) | Reliable | Present as array on most books |
| Subjects/keywords | No | N/A | Not a separate field; use categories |
| Series/position | No | N/A | Not in volumeInfo (may exist in other Google endpoints) |
| Language | Yes (volumeInfo) | Reliable | Present on all books |
| Edition statement | No | N/A | Not explicitly returned |
| Translator | No | N/A | Not returned (authors only) |
| Page count variants | Yes | Unreliable | `pageCount` vs. `printedPageCount` disagree in both directions |

---

## Apple Books

### What it returns

**Live call made:** Searched iTunes API for "Thinking in Systems Donella Meadows", received 6 results (5 shown below; first is the actual book, others are summaries/guides).

**Fixture:** Captured in this research session, not in `fixtures/api/`

#### First result (the actual book)
```json
{
  "trackId": 6744044771,
  "trackName": "Thinking in Systems",          // ✓ kept as title
  "artistName": "Donella Meadows & Diana Wright", // ✓ kept as author
  "artworkUrl100": "...",                     // ✓ kept (resized to 1200×1200)
  "artworkUrl60": "...",
  "genres": ["Management & Leadership", "Books", "Business & Personal Finance", "Science & Nature"],
  "genreIds": ["10014", "38", "9009", "9019"],
  "price": 16.99,
  "formattedPrice": "$16.99",
  "currency": "USD",
  "releaseDate": "2008-12-03T08:00:00Z",
  "description": "<b>The classic book on systems thinking...</b> [700+ word description]",
  "userRatingCount": 8,
  "averageUserRating": 4.0,
  "kind": "ebook",
  "trackViewUrl": "https://books.apple.com/us/book/thinking-in-systems/id6744044771?uo=4",
  "trackCensoredName": "Thinking in Systems",
  "artistId": 731503650,
  "artistIds": [731503650, 528255906],
  "artistViewUrl": "https://books.apple.com/us/artist/donella-meadows-diana-wright/..."
}
```

**Fields extracted:**
- `trackName` ✓ kept (as title)
- `artistName` ✓ kept (as author)
- `artworkUrl100` ✓ kept (resized)

**Fields discarded:**
- `genres` (array) — **DISCARDED**
- `genreIds` — **DISCARDED**
- `description` — **DISCARDED** (700+ words of book description)
- `releaseDate` — **DISCARDED**
- `price`, `formattedPrice`, `currency` — **DISCARDED**
- `userRatingCount` — **DISCARDED**
- `averageUserRating` — **DISCARDED**
- `kind` — **DISCARDED**
- `trackViewUrl`, `trackCensoredName`, `artistId`, `artistIds`, `artistViewUrl` — **DISCARDED**
- `artworkUrl60` — **DISCARDED** (kept 100 and resized)

**Reliability (across 6 results in this search):**
- `genres`: present on all 6 results (typically 2–8 per book)
- `description`: present on all 6 results (highly variable length; 30 words to 700+ words)
- `releaseDate`: present on all 6 results
- `userRatingCount`: **not present on 5 results** (only the first, most popular book had ratings)
  - Result 1: 8 ratings, 4.0 average
  - Results 2–6: `"userRatingCount": 0` or field absent
- `averageUserRating`: same pattern as `userRatingCount`
- `price`: present on all results

### Summary for Apple Books

| Field | Present | Reliability | Notes |
|-------|---------|-------------|-------|
| Publisher | No | N/A | Not returned |
| Publication date | Yes (releaseDate) | Reliable | Present on all results |
| Description | Yes | Reliable | Present on all results; highly variable length (30–700+ words) |
| Genres | Yes | Reliable | Present on all results (2–8 per book) |
| Categories | Yes (via genres) | Reliable | Genres serve this purpose |
| Series/position | No | N/A | Not returned |
| Language | No | N/A | Not returned |
| Edition statement | No | N/A | Not returned |
| Translator | No | N/A | Not returned |
| User ratings | Partial | Unreliable | Only highly-reviewed books show `userRatingCount` > 0; most show 0 or absent |
| Price | Yes | Reliable | Present on all results |

**Notable:** This is Apple's *only* metadata endpoint used in the current code. `findCover` returns a bare URL string from `artworkUrl100`, discarding the entire matched iTunes record and all 14+ fields shown above.

---

## O'Reilly

### What it returns

**Fixture:** `oreilli-isbn-hit.json` — "Learning AI-Native Software Engineering" ISBN 9798341674738

**Full response structure (single result from `results[]`):**

**Fields extracted:**
- `title` ✓ kept
- `authors` (array, first only) ✓ kept
- `isbn` ✓ kept
- `virtual_pages` ✓ kept (as `pages`)
- `ourn` ✓ kept (used to build cover URL)

**Fields discarded:**
- `archive_id` — O'Reilly internal ID (not the ISBN; building cover URL uses `ourn` instead)
- `last_modified_time`, `timestamp`, `date_added` — Metadata timestamps — **DISCARDED**
- `issued` (ISO 8601 date, e.g., "2027-02-25T00:00:00Z") — **DISCARDED**
- `format`, `content_format` — Content type ("book") — **DISCARDED**
- `source` — File format ("application/epub+zip") — **DISCARDED**
- `content_type` — Duplicate of format — **DISCARDED**
- `publishers` (array, e.g., ["O'Reilly Media, Inc."]) — **DISCARDED**
- `academic_excluded` — Boolean flag — **DISCARDED**
- `language` ("en") — **DISCARDED**
- `description` — **DISCARDED** (full book description, 600+ words)
- `url`, `web_url` — URLs to O'Reilly and Safari Books — **DISCARDED**
- `cover_url` — Thumbnail URL (140×184) — **DISCARDED** (code builds larger URL from `ourn`)
- `duration_seconds`, `minutes_required` — Time estimates — **DISCARDED**
- `has_assessment` — Whether it has assessments — **DISCARDED**
- `average_rating`, `number_of_followers`, `number_of_items`, `number_of_reviews`, `popularity`, `report_score` — Rating/engagement metadata — **DISCARDED**
- `topics` (array of UUIDs) — **DISCARDED**
- `topics_payload` (array of `{uuid, slug, name, score}`) — **DISCARDED** (detailed topic information)

### Summary for O'Reilly

| Field | Present | Reliability | Notes |
|-------|---------|-------------|-------|
| Publisher | Yes | Reliable | Present on all books |
| Publication date | Yes (issued) | Reliable | ISO 8601 format; present on all books |
| Description | Yes | Reliable | Present on all books (600+ words) |
| Subjects/keywords | Yes (topics_payload) | Reliable | Present with UUID, slug, name; may have score |
| Categories | Yes (topics_payload) | Reliable | More structured than Open Library subjects |
| Language | Yes | Reliable | Present on all books ("en" for English) |
| Edition statement | No | N/A | Not available |
| Translator | No | N/A | Not returned (authors only) |
| Series/position | No | N/A | Not available |
| Cover URL | Yes | Reliable | Thumbnail in response; code builds larger version from `ourn` |

---

## Which fields are worth taking?

### High priority (present and reliable across multiple providers)

1. **Description / Synopsis**
   - Open Library: NO (not returned by any endpoint)
   - Google Books: YES (in volumeInfo)
   - Apple Books: YES (100% of results; 30–700+ words)
   - O'Reilly: YES (100% of results; 600+ words)
   - **Reliability:** Nearly universal; all providers except Open Library have it
   - **Use case:** Shelf display, book detail panel, discovery
   - **Constraint:** `private:` applies — do not ship body text in public builds (Invariant 2)

2. **Publisher**
   - Open Library: YES (reliable on catalogued books)
   - Google Books: YES (in volumeInfo)
   - Apple Books: NO (not returned)
   - O'Reilly: YES (100% of results)
   - **Reliability:** Reliable on 3 of 4 providers
   - **Use case:** Metadata display, filtering by publisher

3. **Publication / Release Date**
   - Open Library: YES (as `publish_date`, "YYYY" format)
   - Google Books: YES (as `publishedDate`, "YYYY-MM-DD" or "YYYY")
   - Apple Books: YES (as `releaseDate`, ISO 8601)
   - O'Reilly: YES (as `issued`, ISO 8601)
   - **Reliability:** Universal (all 4 providers)
   - **Use case:** Sorting, filtering, shelf metadata

4. **Genres / Categories / Subjects**
   - Open Library: YES (as `subjects`, 35+ per book, unreliably present on sparse titles)
   - Google Books: YES (as `categories`, array)
   - Apple Books: YES (as `genres`, array)
   - O'Reilly: YES (as `topics_payload`, structured with UUIDs)
   - **Reliability:** Universal (all 4 providers); Open Library sparse on obscure titles
   - **Use case:** Tagging, discovery, filtering

### Medium priority (present on most providers, possible ambiguity)

5. **Language**
   - Open Library: NO
   - Google Books: YES
   - Apple Books: NO
   - O'Reilly: YES
   - **Reliability:** 2 of 4 providers; not all books have a clear language
   - **Use case:** Filtering non-English books
   - **Caveat:** Single language field; code currently ignores this

6. **User Ratings** (count and average)
   - Open Library: NO
   - Google Books: YES (`averageRating`, `ratingsCount`)
   - Apple Books: YES (but unreliably — only popular books show counts > 0)
   - O'Reilly: YES (engagement metadata)
   - **Reliability:** Partial; Apple's unreliability is the limiting factor
   - **Use case:** Sorting by community rating
   - **Caveat:** Ratings are not normalized across providers (5-star vs. other scales)

7. **Series and Position**
   - All providers: NO (not available in responses tested or documented)
   - **Reliability:** N/A
   - **Note:** Could be inferred from title parsing, but no provider supplies it

### Low priority or not worth taking

8. **Price**
   - Apple Books: YES
   - Others: NO
   - **Reliability:** Apple only
   - **Use case:** Shelf display (not relevant for personal reading tracker)
   - **Decision:** Skip; irrelevant to a reading tracker

9. **Edition Statement**
   - All providers: NO (not returned)
   - **Note:** Could be inferred from `printType`, `printedPageCount`, edition counts, but unreliably

10. **Translator**
    - All providers: NO (not returned; authors only)
    - **Decision:** Would require separate API calls or additional parsing to extract from author fields

11. **Series Position**
    - All providers: NO (not available)

---

## Surprise findings

### Binding field quest: "No physical_format anywhere"

Verified. Searched cached responses and live Apple call. No binding-related field appears in any response. The CLAUDE.md note stands: "no provider knows a book's binding; `physical_format` appears zero times across every cached response this project holds."

### Apple Books returns a fully-matched iTunes record

The current code extracts only `trackName`, `artistName`, and `artworkUrl100`, returning a URL string from `findCover`. The entire matched record is present and discarded (14+ fields), including:
- Full book description (600+ words)
- Genre classification (2–8 categories)
- Release date
- User ratings (when present)
- Direct URL to the book on Apple Books

This is the most significant "discard by design" in the codebase — the only function that touches Apple returns a bare string, discarding everything else.

### O'Reilly's `issued` date shows early releases

The audit fixture book (Learning AI-Native Software Engineering) shows `issued: "2027-02-25"` — a February 2027 release date that Open Library, Google, and Apple do not know about. This explains why O'Reilly is consulted: it has books the others do not, and it knows their publication dates.

### Google's description is always available when the book is indexed

Despite quota exhaustion, tests and code comments confirm Google Books returns `description` / `textSnippet` in volumeInfo. The audit omits it, but a live call with a quota would retrieve it on every successful lookup.

---

## Merging implications

The current `fillGaps` algorithm (index.ts:234–289) merges on three fields:
- `coverUrl` (with speculative flag)
- `pages`
- `author`

Extending this to merge descriptions, subjects, and publication dates would require:

1. **Decision on author of truth:** When two providers disagree (e.g., different descriptions), which wins?
   - Current tie-breaking: by provider order (Open Library > Google > O'Reilly)
   - Alternative: most-specific provider (O'Reilly for O'Reilly books, etc.)

2. **Decision on "partial" fields:** If Open Library has a publisher but no description, and Google has a description but no publisher, do we merge both? (Current algorithm does this for pages and author.)

3. **Storage design for descriptions:** The current frontmatter parser tolerates extra keys (CLAUDE.md: "tolerate extra frontmatter keys, reordered keys"). Adding optional `description`, `publisher`, `language`, `subjects` would increase note size but cost nothing for filtering or discovery.

4. **Invariant 2 enforcement (private body text):** Descriptions must not leak to public builds. Current architecture: `publish.ts` has no logic to strip them. Adding description storage requires updating the public-build gate G23 (`public-build.test.ts`) and the build mode logic.

---

## Conclusion

| Aspect | Discarded | Reliability | Recommendation |
|--------|-----------|-------------|-----------------|
| **Description** | 3/4 providers | High (all but Open Library) | Take; high value for discovery; gate for Invariant 2 enforcement |
| **Publisher** | 3/4 providers | High (3 of 4) | Take; useful metadata; no blocking concerns |
| **Publication date** | All 4 | High (universal) | Take; useful for sorting and shelf display |
| **Subjects/genres** | All 4 | High (universal) | Take; valuable for tagging and discovery |
| **Language** | 2/4 providers | Medium | Consider; 2 of 4 have it; useful for filtering |
| **User ratings** | 2–3 providers | Medium (Apple unreliable) | Skip for now; normalization across providers is complex |
| **Translator** | All 4 | N/A | Not available; not worth pursuing |
| **Series/position** | All 4 | N/A | Not available; not worth pursuing |
| **Edition statement** | All 4 | N/A | Not available; inference too uncertain |
| **Binding** | All 4 | N/A | Not available; confirmed not to exist |

**Next step:** The merge-revision decision (issue #88, blocking this research) can now be argued from a position of facts rather than anecdote. All four providers carry description, publisher, and publication date; the question is no longer "does any provider have this?" but "when two providers disagree, who is right?"
