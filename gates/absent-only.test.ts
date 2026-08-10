import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import { isHost } from '../packages/core/src/test-support.ts';
import { enrichBook, missingFields } from '../packages/core/src/enrich.ts';
import type { HttpGet } from '../packages/core/src/metadata/index.ts';

/**
 * G32 — a key a note already carries is never rewritten.
 *
 * **The characteristic failure of the merge revision, and it is prevented
 * structurally rather than detected.** A merge change alters *which provider
 * wins* a field; if `enrich` ever overwrote, re-running it after such a change
 * would silently rewrite titles, authors and page counts on books that were
 * already correct — with no error, no warning, and nothing to compare against
 * afterwards, since the vault is the source of truth.
 *
 * It cannot, because every write is `if (book.X === undefined)`. This row
 * asserts **the claim** rather than the branch: hand a note that already carries
 * every fillable key to a provider that disagrees about all of them, and the
 * file must come back **byte-identical**. That is the G27 lesson — a test that
 * checks the condition passes a refactor that moves the condition.
 *
 * The accepted cost is the mirror image and is not a defect: a book already
 * carrying a *wrong* value keeps it, and correcting it stays a hand edit.
 *
 * See docs/gates.md, row G32 (absent-only).
 */

/** A provider that has an answer for everything, and a different one. */
const disagreesAboutEverything: HttpGet = async (url) => {
  if (isHost(url, 'openlibrary.org')) {
    return {
      'ISBN:9781603580557': {
        title: 'A DIFFERENT TITLE',
        authors: [{ name: 'A DIFFERENT AUTHOR' }],
        number_of_pages: 999,
        publishers: [{ name: 'A DIFFERENT PUBLISHER' }],
        publish_date: '1999',
        subjects: [{ name: 'a different subject' }],
        key: '/books/OL99999999M',
        cover: { large: 'https://covers.openlibrary.org/b/id/1-L.jpg' },
      },
    };
  }
  if (isHost(url, 'www.googleapis.com')) {
    return {
      items: [
        {
          id: 'DIFFERENTVOL',
          volumeInfo: {
            title: 'A DIFFERENT TITLE',
            publisher: 'A DIFFERENT PUBLISHER',
            publishedDate: '1999-01-01',
            categories: ['A Different Category'],
            description: 'A different description.',
            pageCount: 999,
          },
        },
      ],
    };
  }
  if (isHost(url, 'itunes.apple.com')) {
    return {
      results: [
        {
          trackName: 'Thinking in Systems',
          artistName: 'Donella H. Meadows',
          trackId: 999999999,
          releaseDate: '1999-01-01T00:00:00Z',
          genres: ['A Different Genre'],
          description: 'A different Apple description.',
          artworkUrl100: 'https://example.invalid/100x100bb.jpg',
        },
      ],
    };
  }
  return undefined;
};

/**
 * Every fillable key **except one**, and the exception is load-bearing.
 *
 * ⚠️ The first version of this gate filled in all eleven, and it passed
 * vacuously: with no gap at all `enrichBook` returns `complete` before it
 * touches the network, so the fill loop never runs and removing the absent-only
 * guard changed nothing. It went green against the exact defect it exists for.
 *
 * So the note is left one key short — `oreilly_ourn`, which the provider below
 * cannot supply — which is enough to send the pass through the lookup and into
 * every fill it must not perform, while leaving nothing it legitimately can.
 */
const COMPLETE = {
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
} as const;

describe('G32 — absent-only, over the whole of FILLABLE', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-absent-only-'));
    vault = new ObsidianAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('leaves a fully-answered note byte-identical, whatever the providers say', async () => {
    await vault.writeBook(COMPLETE);
    const [book] = await vault.listBooks();
    const path = join(dir, book!.sourcePath);
    // The body section counts as answered too, and it is not a `FILLABLE` key —
    // so without this the pass legitimately adds one and the byte-identical
    // assertion below fails for a reason that has nothing to do with
    // absent-only. G33 owns that write; this row owns the frontmatter.
    await vault.insertBodySection(book!.sourcePath, '## About', 'The blurb it already had.');
    const before = await readFile(path, 'utf8');

    await enrichBook(book!, vault, disagreesAboutEverything);

    expect(
      await readFile(path, 'utf8'),
      'a key the note already carried was rewritten. `enrich` fills gaps; it does not ' +
        'correct books, and a merge change must not be able to rewrite one that was right',
    ).toBe(before);
  });

  it('reaches the fill loop at all, with exactly one key legitimately open', () => {
    /**
     * The vacuity guard, and it earned its keep — see the note on `COMPLETE`.
     *
     * Two ways this gate can go quietly useless. With **no** gap, `enrichBook`
     * short-circuits before the network and nothing can be overwritten, so it
     * passes however the guards are written. With **more than one** gap, the
     * pass legitimately writes and the byte-identical assertion above stops
     * being the right question. Exactly one, and one nothing can fill.
     */
    const record = {
      sourcePath: 'x.md',
      status: 'read' as const,
      tags: [],
      ...COMPLETE,
    };

    expect(
      missingFields(record),
      'this fixture no longer leaves exactly one unfillable gap, so the assertion above ' +
        'is either short-circuiting before the network or testing a legitimate write',
    ).toEqual(['oreillyOurn']);
  });
});
