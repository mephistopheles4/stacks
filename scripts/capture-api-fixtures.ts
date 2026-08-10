/**
 * Captures real Open Library responses as test fixtures.
 *
 * Run once, by hand, when the API's response shape needs re-checking:
 *
 *     pnpm tsx scripts/capture-api-fixtures.ts
 *
 * Why this exists: the Phase 1 tests must not make live calls, so they run
 * against cached JSON. But a cache hand-written from a schema *we* imagined
 * would pass its tests and then fail on the first real `stacks add`. Capturing
 * the genuine shape once is what makes the cached tests worth anything.
 *
 * What is captured is bibliographic fact — titles, authors, identifiers, page
 * counts. No cover binaries, no book text.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../packages/cli/src/env.ts';
import { SEARCH_FIELDS } from '../packages/core/src/metadata/open-library.ts';
import { REPO_ROOT } from './lib/repo-root.ts';

const OUT_DIR = join(REPO_ROOT, 'fixtures', 'api');

/**
 * The same loader the CLI uses, for the same reason `capture-lookup-recall.ts`
 * calls it: without a key Google answers **429 quota exceeded** and a refusal
 * gets written down as an answer. That happened here for two days once.
 */
loadEnv();

const GOOGLE_KEY = process.env['GOOGLE_BOOKS_API_KEY'] ?? '';
if (GOOGLE_KEY === '') {
  console.warn('warning: no GOOGLE_BOOKS_API_KEY — the Google fixture will record a quota error');
}

/**
 * Built from the constant the code asks with, never retyped.
 *
 * The HTTP cache and the fixture map are both keyed by URL, so a capture that
 * asks a slightly different question than `open-library.ts` does records a
 * response no test will ever match — and the failure is a thrown "no fixture
 * mapped", which reads like a missing capture rather than a drifted one.
 */
function openLibrarySearch(query: string, limit: number): string {
  return (
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}` +
    `&limit=${String(limit)}&fields=${SEARCH_FIELDS}`
  );
}

const CAPTURES: readonly { readonly name: string; readonly url: string }[] = [
  {
    name: 'open-library-isbn-hit.json',
    url: 'https://openlibrary.org/api/books?bibkeys=ISBN:9781603580557&format=json&jscmd=data',
  },
  {
    name: 'open-library-isbn-miss.json',
    url: 'https://openlibrary.org/api/books?bibkeys=ISBN:9790000000001&format=json&jscmd=data',
  },
  {
    name: 'open-library-search-hit.json',
    url: openLibrarySearch('thinking in systems', 3),
  },
  {
    name: 'open-library-search-miss.json',
    url: openLibrarySearch('zzzqqqxx no such book anywhere', 3),
  },
  {
    name: 'google-books-isbn-hit.json',
    url: `https://www.googleapis.com/books/v1/volumes?q=isbn:9781603580557&maxResults=1&key=${encodeURIComponent(GOOGLE_KEY)}`,
  },
  {
    // Apple, matched. The record carries a `trackId`, a `releaseDate`, `genres`
    // and a description — all of which this project threw away for the whole of
    // its life in favour of one artwork URL.
    name: 'apple-search-hit.json',
    url: 'https://itunes.apple.com/search?term=Atomic%20Habits%20James%20Clear&entity=ebook&limit=5',
  },
  {
    /**
     * Six results and not one of them is the book — the case the module's own
     * doc comment describes, captured rather than imagined.
     *
     * Apple has no English *Thinking in Systems*. What it offers is two
     * summaries, a study guide, a different Meadows title, and Portuguese and
     * Italian translations. A provider that answers confidently with the wrong
     * book is why `isProbablySameBook` guards every take, and why this fixture
     * is worth as much as the hit: it is the shape of the refusal.
     */
    name: 'apple-search-near-miss.json',
    url: 'https://itunes.apple.com/search?term=Thinking%20in%20Systems%20Donella%20H.%20Meadows&entity=ebook&limit=5',
  },
  {
    // The miss, captured rather than stubbed: Apple is now asked about *every*
    // book, so its empty answer is on more paths than its hit is.
    name: 'apple-search-miss.json',
    url: 'https://itunes.apple.com/search?term=zzzqqqxx%20no%20such%20book%20anywhere&entity=ebook&limit=5',
  },
  {
    // Two records of one book in one response: the first carries Jordan B.
    // Peterson and 480 pages, the second carries neither. Ranking used to prefer
    // the empty one *because* it was empty. See `rankingScore` in identity.ts.
    name: 'open-library-search-sparse-sibling.json',
    url: openLibrarySearch('12 Rules for Life', 5),
  },
  {
    // A book none of the other three providers holds — an O'Reilly early
    // release. Note the response's `isbn` differs from the identifier in the
    // library URL: the latter is O'Reilly's internal archive id.
    name: 'oreilly-search-hit.json',
    url: 'https://learning.oreilly.com/api/v2/search/?query=Learning%20AI-Native%20Software%20Engineering&field=title&formats=book&limit=5',
  },
  {
    // The miss, captured rather than stubbed: O'Reilly is consulted on every
    // path where the first two providers found nothing, so the shape of its
    // empty answer is exercised by more tests than its hit is.
    name: 'oreilly-search-miss.json',
    url: 'https://learning.oreilly.com/api/v2/search/?query=zzzqqqxx%20no%20such%20book%20anywhere&field=title&formats=book&limit=5',
  },
  {
    // The ISBN path, which also goes through search. `field=isbn` is what makes
    // it exact; an `isbn=` parameter is ignored and returns the catalogue.
    name: 'oreilly-isbn-hit.json',
    url: 'https://learning.oreilly.com/api/v2/search/?query=9798341674738&field=isbn&formats=book&limit=1',
  },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const capture of CAPTURES) {
  const response = await fetch(capture.url, {
    headers: { 'User-Agent': 'stacks/0.0 (fixture capture; personal project)' },
  });
  const body: unknown = await response.json();
  writeFileSync(join(OUT_DIR, capture.name), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  console.log(`${capture.name} <- ${response.status}`);
}

console.log(`\n${CAPTURES.length} fixtures written to ${OUT_DIR}`);
