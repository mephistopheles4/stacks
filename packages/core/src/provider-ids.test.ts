import { describe, expect, it } from 'vitest';
import { parseNote } from './frontmatter.ts';
import { CONTRIBUTOR_IDS, isWellFormedId } from './provider-ids.ts';
import { formatSubjects, parseSubjects } from './subjects.ts';

/**
 * The contributor ids, at the parse edge.
 *
 * See docs/spec/provider-provenance.md §4. The rule is `cover_source`'s rule
 * applied to an opaque value: **shape-checked and dropped on mismatch**, so a
 * mistyped id becomes a *missing* link rather than a dead one — which matters
 * because all three linkable id URLs hard-404 on a stale id, where the ISBN URL
 * lands on a graceful page.
 */

function note(frontmatter: string): ReturnType<typeof parseNote> {
  return parseNote(`---\ntype: book\ntitle: A Book\n${frontmatter}\n---\n\nbody\n`, 'Library/x.md');
}

function recordOf(frontmatter: string): Record<string, unknown> {
  const parsed = note(frontmatter);
  if (parsed.kind !== 'book') throw new Error(`expected a book, got ${parsed.kind}`);
  return parsed.record as unknown as Record<string, unknown>;
}

describe('the four contributor ids reach the record', () => {
  it('reads each key into the field named for the provider', () => {
    const record = recordOf(
      [
        'google_volume_id: CpbLAgAAQBAJ',
        'apple_track_id: 1384286945',
        'openlibrary_olid: OL26445570M',
        'oreilly_ourn: urn:orm:book:0642572352530',
      ].join('\n'),
    );

    expect(record['googleVolumeId']).toBe('CpbLAgAAQBAJ');
    expect(record['appleTrackId']).toBe('1384286945');
    expect(record['openLibraryOlid']).toBe('OL26445570M');
    expect(record['oreillyOurn']).toBe('urn:orm:book:0642572352530');
  });

  it('reads a bare numeric apple_track_id, which YAML hands over as a number', () => {
    // Hand-edited notes are first-class, and nobody quotes a number.
    expect(recordOf('apple_track_id: 1384286945')['appleTrackId']).toBe('1384286945');
  });
});

describe('a malformed id is dropped, never kept', () => {
  it.each([
    ['openlibrary_olid: OL26445570W', 'openLibraryOlid'],
    ['openlibrary_olid: not-an-olid', 'openLibraryOlid'],
    ['apple_track_id: notanumber', 'appleTrackId'],
    ['oreilly_ourn: 0642572352530', 'oreillyOurn'],
    ['google_volume_id: "has spaces"', 'googleVolumeId'],
  ])('drops %s', (line, field) => {
    expect(recordOf(line)[field]).toBeUndefined();
  });

  it('still shelves the book — a bad id is not a bad note', () => {
    // Invariant 3, applied per key rather than per file.
    const parsed = note('openlibrary_olid: nonsense');
    expect(parsed.kind).toBe('book');
  });

  it('is a typo guard and not a correctness guarantee, and says so by passing this', () => {
    // O'Reilly's `archive_id` wrapped as a URN is exactly as well-formed as the
    // right value, and CLAUDE.md documents that trap. The shape check cannot
    // see it, which is why the *key name* does the work no validator can.
    expect(isWellFormedId('oreilly_ourn', 'urn:orm:book:9999999999999')).toBe(true);
  });
});

describe('every id key names its provider’s own field', () => {
  it('has one entry per provider and no others', () => {
    expect(Object.keys(CONTRIBUTOR_IDS)).toEqual([
      'google_volume_id',
      'apple_track_id',
      'openlibrary_olid',
      'oreilly_ourn',
    ]);
  });
});

describe('subjects are ; -separated, because provider categories contain commas', () => {
  it('joins with a semicolon and space', () => {
    expect(formatSubjects(['systems thinking', 'business & economics'])).toBe(
      'systems thinking; business & economics',
    );
  });

  it('keeps a comma-bearing category whole in both directions', () => {
    // Apple's real genre, sitting in this repo's own G26 corpus. Comma-joined
    // and split back on a comma, this one genre silently becomes two.
    const joined = formatSubjects(['Health, Mind & Body', 'Psychology']);
    expect(joined).toBe('Health, Mind & Body; Psychology');
    expect(parseSubjects(joined ?? '')).toEqual(['Health, Mind & Body', 'Psychology']);
  });

  it('caps at five, in the winning provider’s own order', () => {
    expect(formatSubjects(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('a; b; c; d; e');
  });

  it('drops a subject containing the separator rather than writing it', () => {
    // Fail closed, the same reflex as `private:`: a separator collision must
    // never invent a subject no provider said. A dropped subject is invisible;
    // a phantom one is a wrong fact in the vault.
    expect(formatSubjects(['fine', 'broken; in two', 'also fine'])).toBe('fine; also fine');
  });

  it('yields nothing rather than an empty string when there is nothing to say', () => {
    expect(formatSubjects([])).toBeUndefined();
    expect(formatSubjects(['   '])).toBeUndefined();
  });

  it('trims each part when reading back', () => {
    expect(parseSubjects('a;  b ;c')).toEqual(['a', 'b', 'c']);
  });
});
