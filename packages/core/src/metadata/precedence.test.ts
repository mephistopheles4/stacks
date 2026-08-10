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

  /**
   * ⚠️ **The case that made the whole table decorative.**
   *
   * Every case above hands `mergeFields` a bare primary and puts the real values
   * in the contributor map — and passes against an implementation that only ever
   * fills a *gap*. In the wild the primary **is** one of the contributors, Open
   * Library is the primary for almost every book, and it always has
   * `publish_date` and `subjects`. So the named exceptions for those two fields
   * never ran once against the real vault.
   *
   * These two assert the same rules with the losing value on the primary, which
   * is the shape the code actually sees.
   */
  it('overrules the primary’s own value when the table says another provider wins', () => {
    const merged = mergeFields(
      record('open-library', { published: '2004', subjects: ['nyt:paperback_advice=2012-01-14'] }),
      contributorsOf(
        record('open-library', {
          published: '2004',
          subjects: ['nyt:paperback_advice=2012-01-14'],
        }),
        record('google-books', { published: '2004-09-29' }),
        record('apple-books', { subjects: ['Religion & Spirituality', 'Self-Improvement'] }),
      ),
    );

    expect(merged.published).toBe('2004-09-29');
    expect(merged.subjects).toEqual(['Religion & Spirituality', 'Self-Improvement']);
  });

  it('keeps the primary’s value when no provider in the order has one', () => {
    // The other half of the same change: clearing the field to let the ordering
    // decide must not lose a value nobody else can supply.
    const merged = mergeFields(
      record('oreilly', { publisher: "O'Reilly Media, Inc." }),
      contributorsOf(record('oreilly', { publisher: "O'Reilly Media, Inc." })),
    );

    expect(merged.publisher).toBe("O'Reilly Media, Inc.");
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

/**
 * ⚠️ **This block used to assert the opposite, and the opposite was the bug.**
 *
 * It read *"never replaces a value the primary already carries"* — absent-only,
 * applied one layer too low. Absent-only is a rule about **the note**: `enrich`
 * never writes a key a note already has, which is what G32 pins and what makes a
 * merge change safe to run over a whole vault. It is not a rule about which
 * provider wins, and enforcing it here quietly disabled every per-field
 * exception, because the provider that is almost always the primary is also the
 * one those exceptions exist to demote.
 *
 * The two rules compose exactly as they should once they are in the right
 * places: the merge picks the best answer available, and the note keeps the one
 * it already had.
 */
describe('the merge ranks providers; the note is where absent-only lives', () => {
  it('lets the table decide even when the primary has an answer', () => {
    const merged = mergeFields(
      record('open-library', { description: 'from Open Library' }),
      contributorsOf(
        record('open-library', { description: 'from Open Library' }),
        record('google-books', { description: 'from Google' }),
        record('oreilly', { description: "from O'Reilly" }),
      ),
    );

    // O'Reilly leads the description order: it only *has* a record when the book
    // is one of its own, where its copy is authoritative.
    expect(merged.description).toBe("from O'Reilly");
  });

  it('does not invent a value for a field nobody holds', () => {
    const merged = mergeFields(record('open-library'), contributorsOf(record('google-books')));

    expect(merged.publisher).toBeUndefined();
    expect(merged.subjects).toBeUndefined();
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
