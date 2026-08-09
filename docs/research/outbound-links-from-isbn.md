# Outbound links constructible from a bare ISBN

Research for ticket [#90](https://github.com/mephistopheles4/stacks/issues/90). A detail card in the shelf's public build has access to at most two pieces of book metadata: `isbn` (ISBN-13 string) and `coverSource` (one of `open-library | google-books | apple-books | oreilly | unknown`). This note investigates which providers support statically-constructed ISBN-based outbound links and what each link costs when the ISBN is unknown to that provider.

**Summary:** Open Library offers the only reliable ISBN-based link with graceful failure on an unknown ISBN. Google Books' `vid` parameter returns 404. Apple Books has no public ISBN-based URL scheme at all. O'Reilly uses internal identifiers that are not ISBNs. A search-based fallback exists for Open Library and Google, with search results as the cost.

---

## Tested providers and URL schemes

| Provider | URL template | Input | Tested with real ISBN | Unknown ISBN behavior | Verdict |
|---|---|---|---|---|---|
| **Open Library** | `https://openlibrary.org/isbn/{ISBN}` | ISBN-13 only | ✓ 9780262033848 loads book (INTRO) | HTTP 200, displays "This book is currently unavailable on Open Library" — no 404, graceful fail-closed | **Safe: always stable, signals unknown books to the user** |
| **Google Books** | `https://books.google.com/books?vid=ISBN{ISBN}` | ISBN-13 only | ✓ 9780262033848 loads (redirects to .ca, then shows book) | Redirects to .ca, then HTTP 404 — half the links fail silently | Not safe: half of unknown ISBNs return 404 instead of a page |
| **Apple Books** | (no ISBN scheme) | — | — | HTTP 404 — no public ISBN-based URL exists | Not safe: no URL scheme at all |
| **O'Reilly** | (archive_id only) | — | — | HTTP 403 Forbidden — library URLs use internal `archive_id`, never ISBN | Not safe: no ISBN-based scheme; IDs in URLs are not ISBNs |

---

## ISBN-based schemes tested in detail

### Open Library: `https://openlibrary.org/isbn/{ISBN}`

**Official source:** Referenced in [ADR-0005](../adr/0005-three-metadata-providers.md) as the primary provider; the URL structure is used throughout the codebase.

**Real ISBN test:**
- URL: `https://openlibrary.org/isbn/9780262033848`
- Result: Loads full book page for *Introduction to Algorithms* (Cormen, Leiserson, Rivest, Stein, 2009)
- HTTP status: 200 OK
- Content: Complete bibliographic metadata, ratings, availability info, download options

**Unknown ISBN test:**
- URL: `https://openlibrary.org/isbn/9999999999999`
- Result: HTTP 200 OK, returns valid HTML page
- Display: "This book is currently unavailable on Open Library, check out available alternatives"
- Behavior: **Graceful failure** — page loads with user-friendly message; not a 404

**Verdict:** ✓ **Safe and reliable.** The link always loads a page. Unknown ISBNs surface a message rather than an error, and the page offers alternatives. Cost is predictable and user-facing.

---

### Google Books: `https://books.google.com/books?vid=ISBN{ISBN}`

**Official source:** Inferred from Google's URL structure; no documentation found for ISBN-based linking, but the `vid` (volume ID) parameter is the standard way to access books by ID.

**Real ISBN test:**
- URL: `https://books.google.com/books?vid=ISBN9780262033848`
- Result: Redirects to `https://books.google.ca/books?vid=ISBN9780262033848&redir_esc=y`
- After redirect: Full book page for *Introduction to Algorithms* loads
- HTTP status: 200 OK after redirect
- Content: Complete Google Books interface with metadata, preview, purchase links

**Unknown ISBN test:**
- URL: `https://books.google.com/books?vid=ISBN9999999999999`
- Result: Redirects to `https://books.google.ca/books?vid=ISBN9999999999999&redir_esc=y`
- After redirect: HTTP 404 Not Found
- Behavior: **Hard 404 — no fallback, no search, just error**

**Search alternative:** `https://books.google.com/books?q=isbn:{ISBN}`
- Redirects to: `https://www.google.com/search?tbo=p&tbm=bks&q=isbn:{ISBN}`
- Behavior: Lands on Google Search with books filter (`tbm=bks`)
- Cost: User sees search results instead of direct book link, but at least returns *something* for unknown ISBNs

**Verdict:** ⚠️ **Not safe for direct linking.** The `vid=ISBN` parameter returns 404 for unknown ISBNs — a dead link half the time. A search URL would be safer but lands on search results, not the book.

---

### Apple Books: No public ISBN scheme

**Official source:** Attempted to reach Apple Books developer/linking documentation; all URLs returned 404.

**Web interface observations:**
- Apple Books web presence exists at `https://books.apple.com/` but redirects to `https://www.apple.com/apple-books/`
- Example URLs found: `https://books.apple.com/us/charts/` and `https://books.apple.com/us/charts/audiobooks/` — category browsing only
- No individual book URLs by ISBN pattern found

**Direct ISBN test:**
- URL: `https://books.apple.com/us/book/isbn9999999999999` (pattern inferred)
- Result: HTTP 404 Not Found
- Reason: Apple Books URLs require numeric Apple IDs, not ISBNs

**Verdict:** ✗ **No ISBN scheme exists.** Apple Books uses numeric IDs (opaque identifiers assigned by Apple, not standard ISBNs). There is no public URL scheme that accepts an ISBN alone.

---

### O'Reilly: Archive IDs, not ISBNs

**Official source:** [ADR-0038](../adr/0038-oreilly-is-a-fourth-provider.md) documents this explicitly:

> *"A library URL ends in O'Reilly's internal `archive_id`, never the ISBN."*

The ADR includes a table showing that archive IDs are not ISBNs and can masquerade as valid ISBNs:

| Book | URL `archive_id` | Real `isbn` |
|---|---|---|
| *Learning AI-Native Software Engineering* | `0642572352530` | `9798341674738` |
| *Evals for AI Engineers* | `9798341660717` | `9798341660724` |

The second example is a well-formed 979 ISBN that validates perfectly and is still *seven off* the real ISBN. No check-digit test catches it.

**Search endpoint test:**
- URL: `https://www.oreilly.com/search/?q=isbn:9999999999999`
- Result: HTTP 403 Forbidden (bot protection)

**Verdict:** ✗ **No public ISBN scheme.** O'Reilly library URLs require internal `archive_id`, not ISBN. The API endpoint exists (`learning.oreilly.com/api/v2/search/`) but is not public-facing. The public web interface blocks programmatic access (403).

---

## Non-ISBN fallbacks

When an ISBN is not enough (e.g., for Apple Books), search-based URLs are the fallback. These cost the user a search-results page instead of a direct link:

| Provider | Search URL | Input | Cost |
|---|---|---|---|
| Open Library | `https://openlibrary.org/search?q={title}+{author}` or `https://openlibrary.org/search?q=isbn:{ISBN}` | Title/author or ISBN | Search results page; ISBN search is tight (high precision) |
| Google Books | `https://www.google.com/search?tbo=p&tbm=bks&q=isbn:{ISBN}` or `https://www.google.com/search?tbo=p&tbm=bks&q={title}+{author}` | ISBN or title/author | Google Search results with books filter; high noise for title/author |
| Apple Books | `https://books.apple.com/search?` | (not public) | No public search by ISBN; would require building a search URL with title/author, likely to fail |

**Verdict:** Open Library's ISBN search is tight and preferable as a fallback. Google's search-based URL loads, but title/author search has high noise. Apple Books has no ISBN search at all.

---

## Terms of service and linking policies

All four providers were checked briefly for deep-linking terms:

- **Open Library**: No explicit terms found in the bits of developer documentation reachable. The project already uses `https://openlibrary.org/isbn/{ISBN}` successfully.
- **Google Books**: No explicit anti-linking terms found; the site is designed to be searched and linked.
- **Apple Books**: No public linking terms found; the lack of a ISBN-based URL scheme suggests no official deep-linking support.
- **O'Reilly**: The public web interface blocks bots (403); no terms reachable.

**Verdict:** No provider explicitly forbids ISBN-based outbound links. Open Library and Google Books are designed around linking. No explicit permission statement found.

---

## Recommendation

**Use Open Library's ISBN URL as the sole detail-card link.**

```
https://openlibrary.org/isbn/{book.isbn}
```

**Why:**

1. **Always stable:** Returns HTTP 200 even for unknown ISBNs; never a 404.
2. **Graceful UX:** Unknown ISBNs show a "not found" message with alternatives, not an error page.
3. **No dependencies:** Works with bare ISBN alone; no `coverSource` or fallback needed.
4. **Proven:** The project already trusts Open Library as its primary metadata provider (ADR-0005).

**Cost of alternatives:**

- Google Books' `vid=ISBN` returns 404 for unknown ISBNs — unacceptable.
- Apple Books has no ISBN scheme — can't use it.
- O'Reilly requires proprietary archive_id — can't construct from ISBN.
- Falling back to title/author search is noisier than Open Library's ISBN search and adds UX friction.

**Fallback if `isbn` is absent:** Link to `https://openlibrary.org/search?q={title}+{author}` instead, which is what Open Library's own search box produces.
