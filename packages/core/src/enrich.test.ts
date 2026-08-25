import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObsidianAdapter } from './adapters/obsidian-adapter.ts';
import { enrichBook, missingFields } from './enrich.ts';
import type { HttpGet } from './metadata/http.ts';

/** Open Library answers with a complete record; nothing else responds. */
const knowsTheBook: HttpGet = async (url) =>
  url.includes('/search.json')
    ? {
        docs: [
          {
            title: 'Thinking in Systems',
            author_name: ['Donella H. Meadows'],
            isbn: ['9781603580557'],
            number_of_pages_median: 240,
          },
        ],
      }
    : undefined;

const knowsNothing: HttpGet = async () => undefined;

/**
 * The ISBN resolves, and the record carries a title and nothing else.
 *
 * The difference between *nobody answered* and *somebody answered with nothing
 * you needed* — two outcomes that used to be one, and the reason a book could be
 * counted in `enrich`'s header and reported in none of its lines.
 */
const knowsTheTitleOnly: HttpGet = async (url) =>
  url.includes('/api/books')
    ? { 'ISBN:9781603580557': { title: 'Thinking in Systems' } }
    : undefined;

/**
 * The cover the stubbed `fetch` serves.
 *
 * `enrichBook` takes an injected `HttpGet`, so no *metadata* lookup here goes
 * near the network — but the injection seam stops short of the bytes:
 * `cacheCover`'s `download` reaches for the global `fetch`. The search response
 * above carries an ISBN and no `cover_i`, so the Open Library adapter guesses
 * `covers.openlibrary.org/b/isbn/<isbn>-L.jpg`, and that URL was being fetched
 * for real — ~1.3s of live network inside one unit test, a quarter of vitest's
 * 5s cap, which a loaded CI runner turned into an intermittent timeout.
 *
 * Stubbed the way `covers/download.test.ts` stubs it. It serves a real JPEG
 * rather than a failure because a failure would keep every assertion below
 * green while quietly dropping the cover and spine-colour path this file
 * already exercises.
 */
async function coverBytes(): Promise<Buffer> {
  return await sharp({
    create: { width: 400, height: 600, channels: 3, background: '#2f6d7a' },
  })
    .jpeg()
    .toBuffer();
}

/**
 * The bytes as a body stream, which is how `fetch` hands them over and what
 * `download` reads. A fresh one per call: a stream is consumed once.
 */
function respondWithCover(bytes: Uint8Array): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    { headers: { 'content-type': 'image/jpeg' } },
  );
}

describe('missingFields', () => {
  it('counts a cover with no spine colour as a gap', () => {
    const base = { sourcePath: 'Library/A.md', title: 'A', status: 'read' as const, tags: [] };
    expect(missingFields({ ...base, cover: 'covers/a.jpg' })).toContain('spine_color');
    expect(missingFields({ ...base, cover: 'covers/a.jpg', spineColor: '#123456' })).not.toContain(
      'spine_color',
    );
  });
});

describe('enrichBook', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-enrich-'));
    vault = new ObsidianAdapter(dir);

    const bytes = await coverBytes();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respondWithCover(bytes)),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });

  it('fills only what is missing and leaves the rest alone', async () => {
    await vault.writeBook({
      title: 'Thinking in Systems',
      author: 'Donella H. Meadows',
      status: 'reading',
      rating: 4,
    });
    const [book] = await vault.listBooks();

    const outcome = await enrichBook(book!, vault, knowsTheBook);
    expect(outcome.kind).toBe('filled');

    const [after] = await vault.listBooks();
    expect(after?.isbn).toBe('9781603580557');
    expect(after?.pages).toBe(240);
    // Status and rating are untouched — this is the whole difference between
    // enrich and delete-and-re-add.
    expect(after?.status).toBe('reading');
    expect(after?.rating).toBe(4);
  });

  it('refuses when the author is written differently enough to be uncertain', async () => {
    // "D. Meadows" against "Donella H. Meadows" does not clear the identity
    // bar. Strict on purpose: this runs unattended over a whole vault, and a
    // wrong ISBN written into a note is far harder to notice than a gap left
    // open. Spell the author out and it fills.
    await vault.writeBook({ title: 'Thinking in Systems', author: 'D. Meadows' });
    const [book] = await vault.listBooks();

    expect((await enrichBook(book!, vault, knowsTheBook)).kind).toBe('mismatch');
  });

  /**
   * Every fillable key, so there is genuinely nothing to do.
   *
   * ⚠️ **This got much longer, and that is the point of it.** `FILLABLE` grew
   * from four keys to eleven, so "a book with no gaps" now means a book that
   * already carries a publisher, a publication date, subjects and all four
   * contributor ids. In the real vault no such note exists, which is why
   * `enrich` is now permanently a whole-vault network pass and `complete` went
   * from rare to nearly unreachable. It is kept anyway: dropping an unreachable
   * case is how the defect G27 exists for was written in the first place.
   */
  const NO_GAPS = {
    title: 'Thinking in Systems',
    author: 'Donella H. Meadows',
    isbn: '9781603580557',
    pages: 240,
    cover: 'covers/x.jpg',
    spineColor: '#2f6d7a',
    publisher: 'Chelsea Green',
    published: '2008',
    subjects: 'systems thinking',
    googleVolumeId: 'CpbLAgAAQBAJ',
    appleTrackId: '1384286945',
    openLibraryOlid: 'OL26445570M',
    oreillyOurn: 'urn:orm:book:0642572352530',
  } as const;

  it('reports complete and writes nothing when there are no gaps', async () => {
    await vault.writeBook(NO_GAPS);
    const [book] = await vault.listBooks();
    const before = await readFile(join(dir, book!.sourcePath), 'utf8');

    expect((await enrichBook(book!, vault, knowsNothing)).kind).toBe('complete');
    expect(await readFile(join(dir, book!.sourcePath), 'utf8')).toBe(before);
  });

  it('says unfilled, not complete, when there was a gap and nothing to put in it', async () => {
    // The distinction the CLI's report is built on: this book has a gap, the
    // provider answers, and the answer carries nothing the note lacks. Calling
    // that "complete" is what let a book vanish from the report entirely — see
    // gates/enrich-report.test.ts.
    const { author: _dropped, ...withoutAuthor } = NO_GAPS;
    await vault.writeBook(withoutAuthor);
    const [book] = await vault.listBooks();
    expect(missingFields(book!), 'only the author is missing').toEqual(['author']);

    // Not `not-found`: a provider did answer. It simply had no author either.
    expect((await enrichBook(book!, vault, knowsTheTitleOnly)).kind).toBe('unfilled');
  });

  it('refuses metadata from a book that merely shares words with this one', async () => {
    // Shares "systems" and "thinking", so the provider's own relevance filter
    // lets it through — the identity check is the only thing standing between
    // this note and another book's ISBN.
    await vault.writeBook({ title: 'Systems Thinking for Gardeners', author: 'Someone Else' });
    const [book] = await vault.listBooks();

    const outcome = await enrichBook(book!, vault, knowsTheBook);
    expect(outcome.kind).toBe('mismatch');

    // Nothing was written — a wrong ISBN is worse than no ISBN.
    const [after] = await vault.listBooks();
    expect(after?.isbn).toBeUndefined();
  });

  it('says not-found when no provider knows the book', async () => {
    await vault.writeBook({ title: 'A Book Nobody Has Written', author: 'Nobody' });
    const [book] = await vault.listBooks();

    expect((await enrichBook(book!, vault, knowsNothing)).kind).toBe('not-found');
  });

  it('writes nothing under dryRun', async () => {
    await vault.writeBook({ title: 'Thinking in Systems', author: 'Donella H. Meadows' });
    const [book] = await vault.listBooks();
    const before = await readFile(join(dir, book!.sourcePath), 'utf8');

    const outcome = await enrichBook(book!, vault, knowsTheBook, { dryRun: true });

    expect(outcome.kind).toBe('filled');
    expect(await readFile(join(dir, book!.sourcePath), 'utf8')).toBe(before);
  });
});
