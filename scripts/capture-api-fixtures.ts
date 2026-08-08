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
import { REPO_ROOT } from './lib/repo-root.ts';

const OUT_DIR = join(REPO_ROOT, 'fixtures', 'api');

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
    url: 'https://openlibrary.org/search.json?q=thinking+in+systems&limit=3&fields=title,author_name,isbn,number_of_pages_median,cover_i',
  },
  {
    name: 'open-library-search-miss.json',
    url: 'https://openlibrary.org/search.json?q=zzzqqqxx+no+such+book+anywhere&limit=3&fields=title,author_name,isbn,number_of_pages_median,cover_i',
  },
  {
    name: 'google-books-isbn-hit.json',
    url: 'https://www.googleapis.com/books/v1/volumes?q=isbn:9781603580557',
  },
  {
    // Two records of one book in one response: the first carries Jordan B.
    // Peterson and 480 pages, the second carries neither. Ranking used to prefer
    // the empty one *because* it was empty. See `rankingScore` in identity.ts.
    name: 'open-library-search-sparse-sibling.json',
    url: 'https://openlibrary.org/search.json?q=12%20Rules%20for%20Life&limit=5&fields=title,author_name,isbn,number_of_pages_median,cover_i',
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
