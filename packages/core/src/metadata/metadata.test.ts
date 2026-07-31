import { describe, expect, it } from 'vitest';
import { CAPTURED_ISBN, fixtureHttpGet } from '../test-support.ts';
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

  it('survives a reader that fails outright', async () => {
    const broken = async (): Promise<undefined> => undefined;
    expect(await lookupByIsbn(CAPTURED_ISBN, broken)).toBeUndefined();
    expect(await searchByTitle('anything', broken)).toEqual([]);
  });
});
