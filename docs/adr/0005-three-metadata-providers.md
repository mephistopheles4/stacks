# Three metadata providers, in a fixed order

**Status:** accepted, and **extended by
[ADR-0038](0038-oreilly-is-a-fourth-provider.md) — there are four now.** The
title records what was decided on 2026-07-31 and is left standing; O'Reilly was
added last, after Open Library and Google and only when neither has actually
found the book, so the order below is unchanged and only lengthened.

Open Library first, Google Books as the fallback, and Apple Books consulted *only* for cover art because its artwork is ~800x1200 against Google's ~128px. Every response is cached under `.cache/`.

Both fallbacks are bonuses rather than dependencies: Google Books without a personal key shares one permanently exhausted anonymous quota. Tests inject an `HttpGet` backed by captured fixtures that throws on an unmapped URL, so no test can quietly reach the network.

## How this was decided

*Carried verbatim from the Decision Log this repository kept from July 2026, newest last.*

- **2026-07-31** — **Open Library returns `{}` with HTTP 200 for an ISBN miss, not a 404.** Captured for real in `fixtures/api/open-library-isbn-miss.json`. Any code keying off status would read a miss as a success. This is exactly the class of thing a hand-invented cache fixture would have got wrong.

- **2026-07-31** — **Answers the brief's open question on Google Books.** An unauthenticated request 429s with "Quota exceeded … Queries per day" against a *shared anonymous consumer project* — the quota is not ours and may already be spent. So: quota errors are treated as ordinary misses, never exceptions, and Google Books is a bonus rather than a dependable fallback. Making it reliable requires a personal API key. Captured in `fixtures/api/google-books-quota-exceeded.json`.

- **2026-07-31** — Tests inject an `HttpGet` backed by captured fixtures, and that reader **throws on an unmapped URL**. A test that accidentally reaches the network fails loudly instead of quietly passing down the not-found path. `scripts/capture-api-fixtures.ts` re-captures the real responses when a shape needs re-checking.
