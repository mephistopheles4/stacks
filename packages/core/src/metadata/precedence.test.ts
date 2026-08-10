import { describe, expect, it } from 'vitest';
import { mergeFields, type Contributors } from './precedence.ts';
import type { BookMetadata } from './types.ts';

/**
 * The merge table, exercised where two providers disagree.
 *
 * Every case here is a *disagreement*, because that is the only situation the
 * table decides anything in — a field one provider holds alone lands whatever
 * the order says, and a test built on those would pass against no table at all.
 */

function record(source: BookMetadata['source'], fields: Partial<BookMetadata> = {}): BookMetadata {
  return { title: 'A Book', source, ...fields };
}

function contributorsOf(...records: BookMetadata[]): Contributors {
  return new Map(records.map((entry) => [entry.source, entry]));
}

describe('who wins each field', () => {
  it('takes the full date over Open Library’s bare year', () => {
    const merged = mergeFields(
      record('open-library'),
      contributorsOf(
        record('open-library', { published: '2008' }),
        record('google-books', { published: '2008-12-05' }),
      ),
    );

    expect(merged.published).toBe('2008-12-05');
  });

  it('takes curated categories over Open Library’s raw subject headings', () => {
    const merged = mergeFields(
      record('open-library'),
      contributorsOf(
        record('open-library', { subjects: ['critical thinking', 'systems thinking'] }),
        record('google-books', { subjects: ['Business & Economics'] }),
      ),
    );

    expect(merged.subjects).toEqual(['Business & Economics']);
  });

  it("takes O'Reilly's own copy of its own book's description", () => {
    const merged = mergeFields(
      record('oreilly'),
      contributorsOf(
        record('google-books', { description: 'Google says' }),
        record('oreilly', { description: "O'Reilly says" }),
      ),
    );

    expect(merged.description).toBe("O'Reilly says");
  });

  it('falls through to the next provider when the winner has nothing', () => {
    const merged = mergeFields(
      record('open-library'),
      contributorsOf(
        record('open-library', { published: '2008' }),
        record('google-books', {}),
      ),
    );

    // Open Library is *last* for `published` and still wins here, because
    // precedence ranks only among providers that actually hold the field.
    expect(merged.published).toBe('2008');
  });

  it('uses the default order for publisher', () => {
    const merged = mergeFields(
      record('open-library'),
      contributorsOf(
        record('open-library', { publisher: 'Chelsea' }),
        record('google-books', { publisher: 'Chelsea Green Publishing' }),
      ),
    );

    expect(merged.publisher).toBe('Chelsea');
  });
});

describe('absent-only, at the merge as everywhere else', () => {
  it('never replaces a value the primary already carries', () => {
    const merged = mergeFields(
      record('open-library', { publisher: 'already here', description: 'already here' }),
      contributorsOf(
        record('google-books', { publisher: 'from Google', description: 'from Google' }),
        record('oreilly', { description: "from O'Reilly" }),
      ),
    );

    expect(merged.publisher).toBe('already here');
    expect(merged.description).toBe('already here');
  });
});

describe('the contributor ids', () => {
  it('takes each id from the one provider that can supply it', () => {
    const merged = mergeFields(
      record('open-library', { openLibraryOlid: 'OL26445570M' }),
      contributorsOf(
        record('open-library', { openLibraryOlid: 'OL26445570M' }),
        record('google-books', { volumeId: 'CpbLAgAAQBAJ' }),
        record('apple-books', { appleTrackId: '1384286945' }),
        record('oreilly', { oreillyOurn: 'urn:orm:book:0642572352530' }),
      ),
    );

    expect(merged.volumeId).toBe('CpbLAgAAQBAJ');
    expect(merged.appleTrackId).toBe('1384286945');
    expect(merged.openLibraryOlid).toBe('OL26445570M');
    expect(merged.oreillyOurn).toBe('urn:orm:book:0642572352530');
  });

  it('leaves an id absent when its provider did not match, and takes it from nobody else', () => {
    // The permanent gap: no other provider can supply Apple's id, so a book
    // Apple has never heard of is re-asked on every run forever rather than
    // having the gap closed by a sentinel. See docs/spec/metadata-merge.md §6.
    const merged = mergeFields(
      record('open-library'),
      contributorsOf(
        record('open-library', { openLibraryOlid: 'OL26445570M' }),
        record('google-books', { volumeId: 'CpbLAgAAQBAJ' }),
      ),
    );

    expect(merged.appleTrackId).toBeUndefined();
    expect(merged.oreillyOurn).toBeUndefined();
  });
});
