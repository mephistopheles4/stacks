import { describe, expect, it } from 'vitest';
import { buildLibrary, type LibraryBook } from '../packages/core/src/library.ts';
import type { BookRecord } from '../packages/core/src/types.ts';

/**
 * G30 — a `BookRecord` field reaches `library.json`, or is named as excluded.
 *
 * **Nothing held this seam.** G8 (`frontmatter-contract`) runs frontmatter ↔
 * parser ↔ AGENTS.md and *stops at the parser*; `gates/build-modes.test.ts`
 * pins the two per-build differences it already knows about (`sourcePath`
 * stripped, `coverAspect` stamped) but cannot notice a **new** `BookRecord`
 * field nobody gave a `keyIfPresent` line. `toLibraryBook` enumerates its
 * fields, which is what makes publishing structurally opt-in — and it is
 * exactly what makes a forgotten field silent: the merge takes the field into
 * the vault, the shelf never sees it, and every test still passes.
 *
 * Seven new fields crossed this seam in one effort, which is what finally made
 * it worth a row.
 *
 * **The named exclusion set is the whole point.** A field deliberately kept out
 * of the artifact has to be *named* here, which is what stops "we meant to" and
 * "we forgot" from looking identical — the same reason the contributor-id shape
 * checks are written down as typo guards rather than left implicit.
 *
 * A runtime fixture, no source parsing, in G8's idiom: build a fully-populated
 * record and look at what comes out the other side.
 *
 * See docs/gates.md, row G30 (library-seam).
 */

/**
 * Every field a `BookRecord` can carry, all present at once.
 *
 * Deliberately not a realistic book: a record with a gap in it proves nothing
 * about the key that was missing, and this gate's whole job is to notice a key
 * nobody wired up.
 */
const FULL: BookRecord = {
  sourcePath: 'Library/a-book.md',
  title: 'A Book',
  author: 'An Author',
  isbn: '9781603580557',
  status: 'read',
  started: '2026-01-02',
  finished: '2026-03-04',
  rating: 4,
  cover: 'covers/a-book.png',
  coverSource: 'open-library',
  spineColor: '#2f6d7a',
  pages: 321,
  binding: 'paperback',
  private: true,
  faceOut: true,
  shelfOrder: 20,
  tags: ['a-tag'],
  publisher: 'A Press',
  published: '2019-03-05T07:00:00Z',
  subjects: 'systems thinking; science',
  googleVolumeId: 'CpbLAgAAQBAJ',
  appleTrackId: '1384286945',
  openLibraryOlid: 'OL26445570M',
  oreillyOurn: 'urn:orm:book:0642572352530',
};

/**
 * Record fields that deliberately do **not** ship in a public build.
 *
 * `sourcePath` is the only one, and it is the reason the per-build tier exists
 * at all: a public build must expose no vault paths. Everything else is one
 * list, publicly and locally alike — which is a decision rather than an
 * accident, so anything added here needs a sentence saying why.
 */
const NOT_PUBLIC: readonly (keyof BookRecord)[] = ['sourcePath'];

/**
 * `LibraryBook` keys that come from somewhere other than a record field.
 *
 * `id` is derived from title and ISBN so the shelf can keep a book selected
 * across rebuilds; `coverAspect` is measured from the cover file at build time,
 * because books are not one shape and a square audiobook cover forced onto a
 * print face is squashed.
 *
 * ⚠️ **`scripts/lib/public-build.ts` holds the same two names, deliberately.**
 * Its `unknown-key` rule runs this trace over the bytes in `dist/`, and the
 * duplication is what makes the dangerous edit expensive: adding a key that
 * should never ship is a one-line diff that reads like documentation, and with
 * one shared list it would clear this gate and the deploy pre-flight together.
 * Drift between the copies fails loudly and in the safe direction — this goes
 * red, or the deploy refuses — so move one and move the other.
 *
 * Typed against `LibraryBook` rather than left as bare strings, because that is
 * the half of the drift a reader cannot see: a renamed field leaves a stale
 * name here that still *looks* like an exclusion.
 */
const DERIVED = ['id', 'coverAspect'] as const satisfies readonly (keyof LibraryBook)[];

function keysOf(book: LibraryBook): readonly string[] {
  return Object.keys(book);
}

describe('G30 — the BookRecord → library.json seam, both directions', () => {
  it('carries every record field into a local build', () => {
    const [book] = buildLibrary([FULL]).books;
    const shipped = new Set(keysOf(book!));

    const missing = (Object.keys(FULL) as (keyof BookRecord)[]).filter(
      (field) => !shipped.has(field),
    );

    expect(
      missing,
      'these BookRecord fields reach no build. A field the merge writes into the vault and ' +
        'nobody gave a `keyIfPresent` line is invisible: the note has it, the shelf never ' +
        'sees it, and every other test still passes. Add the line, or name the field in ' +
        'NOT_PUBLIC above and say why',
    ).toEqual([]);
  });

  it('strips exactly the named exclusions from a public build, and nothing else', () => {
    const [local] = buildLibrary([FULL]).books;
    const [shared] = buildLibrary([FULL], { isPublic: true }).books;

    const dropped = keysOf(local!).filter((key) => !keysOf(shared!).includes(key));

    expect(
      [...dropped].sort(),
      'a public build drops a different set of fields than the one named here',
    ).toEqual([...NOT_PUBLIC].sort());
  });

  it('traces every shipped key back to a record field or a named derived one', () => {
    const [book] = buildLibrary([FULL]).books;
    const fields = new Set<string>(Object.keys(FULL));

    const derived: readonly string[] = DERIVED;
    const unexplained = keysOf(book!).filter((key) => !fields.has(key) && !derived.includes(key));

    expect(
      unexplained,
      'library.json carries a key that is neither a BookRecord field nor a named derived ' +
        'one. Either it is derived — say so in DERIVED — or the artifact is inventing data',
    ).toEqual([]);
  });

  it('is checking something at all', () => {
    // The vacuity guard the other rows in this file learned to carry: an empty
    // record would satisfy every assertion above by construction.
    expect(Object.keys(FULL).length).toBeGreaterThanOrEqual(24);
  });
});
