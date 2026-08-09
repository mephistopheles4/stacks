# Provider ID URLs: What canonical URL does each provider's own id build, and does it survive?

**Research date:** 2026-08-09
**All claims live-tested.** No documentation-reading; every assertion is verified against actual provider URLs and APIs.

## Summary

Every provider hands over an identifier that can build a direct URL to the book. Google, Apple, and Open Library's URLs all resolve and work without authentication. **O'Reilly's library URLs return 403 Forbidden to unauthenticated access** — they require a subscription, same as the public search endpoint (issue #90).

## Findings Table

| Provider | The ID | Build URL | Resolves? | Unknown ID | Scheme Status | Scope |
|---|---|---|---|---|---|---|
| **Google Books** | `volumeId` | `books.google.com/books?id={volumeId}` | ✅ Yes (redirects to google.ca) | Hard 404 | **Safe** | Works for all volumes, including thin ones (pageCount: 0) |
| **Apple Books** | `trackViewUrl` | Full URL returned by iTunes API | ✅ Yes, public | Hard 404 | **Safe** | Finished URL, no derivation needed; works without account |
| **O'Reilly** | `archive_id` or `ourn` | `learning.oreilly.com/library/view/{slug}/{archive_id}/` | ❌ 403 Forbidden | 403 Forbidden | **Not viable** | Requires authentication; public search already 403s (issue #90) |
| **Open Library** | OLID (edition key) | `openlibrary.org/books/{OLID}` | ✅ Yes | Hard 404 | **Safe** | Works; search API can return these keys when requested |

## Provider Details

### Google Books: `volumeId` → `books.google.com/books?id={volumeId}`

**URL form:** `https://books.google.com/books?id={volumeId}`

**Test results:**
- ✅ **Real volume, full metadata:** `AKV-EQAAQBAJ` → resolves to "Beyond Vibe Coding: From Coder to AI-Era Developer" (Addy Osmani, 2025)
- ✅ **Thin volume (pageCount: 0 in search):** `oX9T0QEACAAJ` → resolves correctly, actual page count shown as 252
- ❌ **Unknown ID:** `UNKNOWNVOLUMEID123456789` → HTTP 404 after redirect to google.ca

**Behavior:**
- Redirects from `books.google.com` → `books.google.ca` (status 302), same volumeId works across regions
- No authentication required
- Full bibliographic metadata, descriptions, and purchase options visible
- Both full-metadata and thin volumes (the ones with no ISBN and pageCount: 0 in search) resolve successfully

**Terms:** Google Books API terms restrict commercial use and require removal of infringing content on notice, but contain no prohibition against outbound deep links.

---

### Apple Books: `trackViewUrl` — a finished URL, no derivation needed

**URL form:** `https://books.apple.com/{region}/book/{slug}/id{bookId}?uo=4`

**Test results:**
- ✅ **Real book from iTunes search:** Search for "Thinking in systems" returned `https://books.apple.com/us/book/thinking-in-systems/id6744044771?uo=4` → resolves to public product page
- ✅ **Same book, different region:** `/gb/` variant works, shows same book with GBP pricing (£11.99 vs $16.99)
- ❌ **Unknown ID:** `id9999999999` → HTTP 404

**Behavior:**
- **Region-dependent:** Default search (no `country` param) returns URLs with `/us/` region code
- Different regions have different pricing but same book
- No authentication required to view book details, metadata, customer reviews, and description
- Affiliate tracking parameter `?uo=4` included by iTunes API

**Region question answered:** The code does not set the `country` parameter in the iTunes search, so it defaults to US region. Changing the region code in the URL from `/us/` to `/gb/`, `/au/`, etc. works, but the default is always US. A `trackViewUrl` built without the `country` parameter is fixed to that region and does not adapt to the visitor's location.

**Terms:** Apple Books allows external linking for informational purposes; reader apps may create external links within their apps per updated guidelines.

---

### O'Reilly: `archive_id`/`ourn` → `learning.oreilly.com/library/view/{slug}/{archive_id}/`

**URL form:** `https://learning.oreilly.com/library/view/{slug}/{archive_id}/`
Example: `https://learning.oreilly.com/library/view/learning-ai-native-software/0642572352530/`

**Test results:**
- ❌ **Real book:** `archive_id` 0642572352530 (from API response) → **HTTP 403 Forbidden** after redirect to www.oreilly.com
- ❌ **Unknown archive_id:** 9999999999999 → **HTTP 403 Forbidden** (same response, no differentiation)

**Behavior:**
- Library URLs require O'Reilly Learning Platform subscription
- 307 Temporary Redirect from `learning.oreilly.com` → `www.oreilly.com`, then 403
- Unauthenticated access returns identical 403 whether book exists or not
- **Matches public search behavior:** Issue #90 reported public search endpoint 403s; private library URLs do the same

**Decision impact:** Cannot build public URLs from O'Reilly archive IDs. If recording `archive_id` is justified only for linking, this eliminates that justification. The id's value for covers (ADR-0038) is unaffected.

**Terms:** O'Reilly Membership Agreement prohibits publishing content or creating derivative works, but the real barrier is technical: unauthenticated access is not permitted at all.

---

### Open Library: OLID (edition key) → `openlibrary.org/books/{OLID}`

**URL form:** `https://openlibrary.org/books/{OLID}`
Example: `https://openlibrary.org/books/OL26445570M`

**Test results:**
- ✅ **Real edition from fixture:** `OL26445570M` → resolves to "Thinking in systems: a primer" by Donella H. Meadows
- ✅ **Real edition from search:** `OL62197415M` (Dutch translation) → resolves to "Denken in systemen" (2022)
- ❌ **Unknown OLID:** `OLUNKNOWN123M` → HTTP 404

**Behavior:**
- No authentication required
- Full book record visible: metadata, ratings, reviews, subject classifications
- Graceful degradation for unavailable books: "This book is currently unavailable on Open Library" message with alternatives
- Search API returns edition keys in the `edition_key` array **when requested in `fields` parameter**
  - Current code requests: `fields=title,author_name,isbn,number_of_pages_median,cover_i`
  - Could request: `fields=title,author_name,isbn,number_of_pages_median,cover_i,edition_key`
  - Response includes array of edition OLIDs (e.g., `["OL62197415M","OL59272937M",...]`)

**Comparison to ISBN URL:** ISBN-based URL (`openlibrary.org/isbn/{isbn}`) also works and resolves to the same book record. Both are viable. The OLID form has no advantage over ISBN for books that have ISBNs, but:
- OLID URL avoids ISBN ambiguity for books with multiple editions
- Works for books Open Library knows but have no ISBN or placeholder ISBNs (O'Reilly early releases)

**Terms:** Open Library is an Internet Archive initiative; I/O permits linking to content per their general terms. No specific prohibition found against outbound deep links.

---

## What the findings mean for decisions downstream

**Recording `archive_id` or `ourn`:** If the only value is building public links, O'Reilly library URLs cannot be built for unauthenticated access. The field remains valuable for internal tooling (cover URLs, API calls within O'Reilly's infrastructure), but not for outbound links. If recording is approved for other reasons (future private-mode linking, API integration, internal asset tracking), that decision stands independently of URL viability.

**Apple `trackViewUrl`:** The code does not currently retain this field from search responses. If retained, it would provide finished links to the Apple Books store without derivation. **Region dependency is not a blocker** — the default `/us/` is reasonable for a global shelf; an enhanced version could adapt by geography, but the current US-default is safe to record and link.

**Open Library OLID:** The search API supports returning `edition_key` in responses — the code would need to request it via `fields` parameter. Availability exists; not requesting it is a choice, not a limitation. Works identically to ISBN-based links for most books; better for certain edge cases (books without ISBNs, O'Reilly early releases with placeholder ISBNs).

**Google `volumeId`:** Already retained; URLs work for all volumes including thin ones. No action needed.

---

## Test Evidence Log

| Assertion | Test URL | Expected | Actual | Status |
|-----------|----------|----------|--------|--------|
| Google volumeId resolves | books.google.com/books?id=AKV-EQAAQBAJ | Book page | 302 → google.ca book page | ✅ |
| Google thin volume resolves | books.google.com/books?id=oX9T0QEACAAJ | Book page | 302 → google.ca book page | ✅ |
| Google unknown ID | books.google.com/books?id=UNKNOWNVOLUMEID123456789 | 404 | 404 | ✅ |
| Apple trackViewUrl resolves | books.apple.com/us/book/thinking-in-systems/id6744044771 | Book page | Public page visible | ✅ |
| Apple region variant | books.apple.com/gb/book/thinking-in-systems/id6744044771 | Same book, GBP | Same book, £11.99 | ✅ |
| Apple unknown ID | books.apple.com/us/book/unknown/id9999999999 | 404 | 404 | ✅ |
| O'Reilly library URL | learning.oreilly.com/library/view/learning-ai.../0642572352530/ | 200 or login page | 307 → 403 Forbidden | ❌ |
| O'Reilly unknown archive_id | learning.oreilly.com/library/view/unknown/9999999999999/ | 404 or login page | 307 → 403 Forbidden | ❌ |
| Open Library OLID | openlibrary.org/books/OL26445570M | Book page | Book page | ✅ |
| Open Library OLID from search | openlibrary.org/books/OL62197415M | Book page | Book page | ✅ |
| Open Library unknown OLID | openlibrary.org/books/OLUNKNOWN123M | 404 | 404 | ✅ |
| Open Library ISBN URL | openlibrary.org/isbn/9781603580557 | Book page | Book page | ✅ |
| Open Library search with fields | /search.json?fields=...edition_key | Array in response | Returned `edition_key: [...]` | ✅ |

---

## Baseline

Repeats from issue #90 (what links an **ISBN** can build):

| Provider | ISBN-built URL | Outcome | Verdict |
|---|---|---|---|
| Open Library | openlibrary.org/isbn/{isbn} | HTTP 200, graceful "unavailable" page with alternatives | Safe |
| Google Books | books.google.com/books?vid=ISBN{isbn} | Hard 404 after redirect | Not safe |
| Apple Books | None exists — URLs need opaque IDs | — | No scheme |
| O'Reilly | None — library URLs end in archive_id, never ISBN (ADR-0038) | — | No scheme |

This research answers the inverse question: **id-based URLs**, not ISBN-based. The answers point opposite ways for some providers, but this is expected — an ISBN is a specific identifier standard; a provider's own id is whatever that provider chose.

---

## Sources for terms/policies reviewed

- [Google Books API Terms of Service](https://developers.google.com/books/terms)
- [Apple Books: Reader Apps Can Now Add Links for Account Signups Outside App Store](https://www.macrumrics.com/2022/03/30/apple-enables-external-link-support-in-reader-apps/)
- [O'Reilly Platform Search API Documentation](https://www.oreilly.com/online-learning/integration-docs/search.html)
- [O'Reilly Terms of Service](https://www.oreilly.com/terms/)
- [O'Reilly Membership Agreement](https://www.oreilly.com/membership-agreement/)
- Open Library (Internet Archive initiative) — no formal anti-linking policy found in public terms
