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
