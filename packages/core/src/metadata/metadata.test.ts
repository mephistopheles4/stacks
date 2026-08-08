import { describe, expect, it } from 'vitest';
import { CAPTURED_ISBN, fixtureHttpGet, readApiFixture } from '../test-support.ts';
import type { HttpGet } from './http.ts';
import { lookup, lookupByIsbn, searchByTitle } from './index.ts';

/**
 * Every response here is a **real** captured one (`fixtures/api/`, refreshed by
 * `scripts/capture-api-fixtures.ts`). No test makes a live call — the fixture
 * reader throws on an unmapped URL, so a stray network reach fails loudly
 * rather than quietly passing down the not-found path.
 */

const openLibraryHit = fixtureHttpGet({
  '/api/books': 'open-library-isbn-hit.json',
  '/search.json': 'open-library-search-hit.json',
});

const openLibraryMiss = fixtureHttpGet({
  '/api/books': 'open-library-isbn-miss.json',
  '/search.json': 'open-library-search-miss.json',
  'googleapis.com': 'google-books-quota-exceeded.json',
});

describe('ISBN hit', () => {
  it('resolves a real ISBN through Open Library', async () => {
    const result = await lookupByIsbn(CAPTURED_ISBN, openLibraryHit);

    expect(result).toBeDefined();
    expect(result?.title).toBe('Thinking in systems : a primer');
    expect(result?.author).toBe('Donella H. Meadows, Diana Wright');
    expect(result?.isbn).toBe(CAPTURED_ISBN);
    expect(result?.pages).toBe(240);
    expect(result?.coverUrl).toMatch(/^https:\/\/covers\.openlibrary\.org\//);
    expect(result?.source).toBe('open-library');
  });

  it('accepts a hyphenated ISBN', async () => {
    const result = await lookupByIsbn('978-1-60358-055-7', openLibraryHit);
    expect(result?.isbn).toBe(CAPTURED_ISBN);
  });
});

describe('fuzzy title search', () => {
  it('finds a book from a partial title and ranks the best match first', async () => {
    const results = await searchByTitle('thinking in systems', openLibraryHit);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.title.toLowerCase()).toContain('thinking in systems');
    expect(results[0]?.author).toBe('Donella H. Meadows');
  });

  it('prefers a 13-digit ISBN out of the pile of editions search returns', async () => {
    const results = await searchByTitle('thinking in systems', openLibraryHit);
    expect(results[0]?.isbn).toHaveLength(13);
  });

  it('routes a non-ISBN term to search rather than ISBN lookup', async () => {
    // If `lookup` tried the ISBN endpoint here it would throw: no fixture is
    // mapped for /api/books in this reader.
    const searchOnly = fixtureHttpGet({ '/search.json': 'open-library-search-hit.json' });
    const results = await lookup('thinking in systems', searchOnly);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('two records of one book in one response', () => {
  /**
   * Open Library answers "12 Rules for Life" with the authored record *and* an
   * empty twin carrying only a title and a Penguin ISBN. Ranking preferred the
   * empty one — 2.0 against 1.914 — because scoring title and author as one
   * string made the author's tokens read as padding against a title-only query.
   *
   * Google and Apple are mapped so a regression fails on the assertion below
   * rather than on an unmapped URL: the losing path gap-fills, and a thrown
   * "no fixture mapped" would hide *which* record won.
   */
  const sparseSibling = fixtureHttpGet({
    '/search.json': 'open-library-search-sparse-sibling.json',
    'googleapis.com': 'google-books-quota-exceeded.json',
    'itunes.apple.com': '',
  });

  it('does not prefer a record for lacking an author', async () => {
    const [best] = await lookup('12 Rules for Life', sparseSibling);

    expect(best?.author).toBe('Jordan B. Peterson');
    expect(best?.pages).toBe(480);
  });

  it('still keeps the summaries out', async () => {
    // Three of the five captured docs are study guides. Preferring completeness
    // must not become preferring whichever derivative is best documented.
    const results = await lookup('12 Rules for Life', sparseSibling);
    expect(results.every((book) => !/summary/i.test(book.title))).toBe(true);
  });
});

describe('API miss', () => {
  it('treats Open Library’s empty-object miss as not-found, not as a hit', async () => {
    // The captured miss is `{}` with HTTP 200 — anything keying off status
    // would call this a success and return nothing useful.
    const result = await lookupByIsbn('9790000000001', openLibraryMiss);
    expect(result).toBeUndefined();
  });

  it('returns no results for a search that matches nothing', async () => {
    expect(await searchByTitle('zzzqqqxx no such book anywhere', openLibraryMiss)).toEqual([]);
  });

  it('degrades to not-found when the Google Books fallback is out of quota', async () => {
    // Captured for real: an unauthenticated request 429s against a *shared*
    // consumer project. That must read as a miss, never as a crash.
    expect(await lookupByIsbn('9790000000001', openLibraryMiss)).toBeUndefined();
    expect(await lookup('zzzqqqxx no such book anywhere', openLibraryMiss)).toEqual([]);
  });

  it('appends the Google Books key only when there is one', async () => {
    const seen: string[] = [];
    const spy = async (url: string): Promise<undefined> => {
      seen.push(url);
      return undefined;
    };

    await searchByTitle('anything', spy);
    expect(seen.some((url) => url.includes('key='))).toBe(false);

    seen.length = 0;
    await searchByTitle('anything', spy, { googleBooksKey: 'abc 123' });
    const google = seen.find((url) => url.includes('googleapis.com'));
    expect(google).toContain('key=abc%20123');
  });

  it('borrows a cover from the fallback when the primary has none', async () => {
    // Open Library often knows a book and has no art for it. Before this, the
    // chain stopped at the first provider and the book got a blank spine even
    // though Google had the cover.
    const get: HttpGet = async (url) =>
      url.includes('googleapis.com')
        ? {
            items: [
              {
                volumeInfo: {
                  title: 'Thinking in systems',
                  subtitle: 'a primer',
                  authors: ['Donella H. Meadows'],
                  pageCount: 240,
                  imageLinks: { thumbnail: 'http://books.google.com/x?zoom=1&edge=curl' },
                },
              },
            ],
          }
        : { docs: [{ title: 'Thinking in Systems', author_name: ['Donella H. Meadows'] }] };

    const [result] = await lookup('thinking in systems', get);
    expect(result?.source).toBe('open-library');
    expect(result?.title).toBe('Thinking in Systems'); // primary's own fields kept
    expect(result?.coverUrl).toBe('https://books.google.com/x?zoom=1'); // gap filled
    expect(result?.pages).toBe(240);
  });

  it('replaces a guessed cover with a confirmed one', async () => {
    // Open Library search returns no cover id for some books, so the URL is
    // synthesised from the ISBN — and that endpoint answers with a placeholder
    // as readily as with art. Treating it as a real cover made the record look
    // complete, so the fallback was never asked and the book got nothing.
    const get: HttpGet = async (url) =>
      url.includes('googleapis.com')
        ? {
            items: [
              {
                volumeInfo: {
                  title: 'AI Snake Oil',
                  authors: ['Arvind Narayanan'],
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780691249148' }],
                  imageLinks: { thumbnail: 'http://books.google.com/real-cover' },
                },
              },
            ],
          }
        : {
            docs: [
              {
                title: 'AI Snake Oil',
                author_name: ['Arvind Narayanan'],
                isbn: ['9780691249148'],
                number_of_pages_median: 384,
              },
            ],
          };

    const [result] = await lookup('ai snake oil', get);
    expect(result?.coverUrl).toBe('https://books.google.com/real-cover');
    expect(result?.coverIsSpeculative).toBe(false);
  });

  it('keeps the guessed cover when the fallback has nothing better', async () => {
    const get: HttpGet = async (url) =>
      url.includes('googleapis.com')
        ? { items: [] }
        : { docs: [{ title: 'Obscure Book', author_name: ['A N Other'], isbn: ['9781000000016'] }] };

    const [result] = await lookup('obscure book', get);
    expect(result?.coverUrl).toContain('covers.openlibrary.org/b/isbn/');
    expect(result?.coverIsSpeculative).toBe(true);
  });

  it('refuses a cover from a book that is not the same book', async () => {
    // A cover borrowed from the wrong edition is worse than no cover at all.
    const get: HttpGet = async (url) =>
      url.includes('googleapis.com')
        ? {
            items: [
              {
                volumeInfo: {
                  title: 'An Entirely Different Book',
                  authors: ['Someone Else'],
                  imageLinks: { thumbnail: 'http://books.google.com/wrong' },
                },
              },
            ],
          }
        : { docs: [{ title: 'Thinking in Systems', author_name: ['Donella H. Meadows'] }] };

    const [result] = await lookup('thinking in systems', get);
    expect(result?.coverUrl).toBeUndefined();
  });

  it('does not go looking when the primary result is already complete', async () => {
    const seen: string[] = [];
    const get: HttpGet = async (url) => {
      seen.push(url);
      return readApiFixture('open-library-isbn-hit.json');
    };

    await lookup(CAPTURED_ISBN, get);
    expect(seen.some((url) => url.includes('googleapis.com'))).toBe(false);
  });

  it('survives a reader that fails outright', async () => {
    const broken = async (): Promise<undefined> => undefined;
    expect(await lookupByIsbn(CAPTURED_ISBN, broken)).toBeUndefined();
    expect(await searchByTitle('anything', broken)).toEqual([]);
  });
});
