import { describe, expect, it } from 'vitest';
import { isReadingLanguage, openLibraryLanguage, READING_LANGUAGES } from './language.ts';

/**
 * The 639-1 → 639-2/B table, and the refusal that makes it safe to interpolate.
 *
 * The mapped value goes into a Solr query, so the lookup must be own-property
 * only: a plain object answers `constructor` with a function. See ADR-0094.
 */
describe('openLibraryLanguage', () => {
  it.each([
    ['en', 'eng'],
    ['tr', 'tur'],
    ['pl', 'pol'],
    // The bibliographic (/B) forms, which Open Library was measured to use —
    // not 639-2/T's fra, deu, zho, nld.
    ['fr', 'fre'],
    ['de', 'ger'],
    ['zh', 'chi'],
    ['nl', 'dut'],
  ])('maps %s to %s', (code, expected) => {
    expect(openLibraryLanguage(code)).toBe(expected);
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'eng', 'EN', '', 'xx'])(
    'refuses %j rather than passing anything through',
    (code) => {
      expect(() => openLibraryLanguage(code)).toThrow(/unknown reading language/);
    },
  );

  it('names the value it refused', () => {
    expect(() => openLibraryLanguage('en # English')).toThrow('"en # English"');
  });

  it('agrees with isReadingLanguage about every code, and about the traps', () => {
    for (const code of READING_LANGUAGES) {
      expect(isReadingLanguage(code)).toBe(true);
      expect(() => openLibraryLanguage(code)).not.toThrow();
    }
    expect(isReadingLanguage('constructor')).toBe(false);
    expect(isReadingLanguage('__proto__')).toBe(false);
  });

  it('maps only to three lowercase letters', () => {
    // The shape the query clause is written for. A table entry that broke it
    // would be interpolated verbatim.
    for (const code of READING_LANGUAGES) {
      expect(code).toMatch(/^[a-z]{2}$/);
      expect(openLibraryLanguage(code)).toMatch(/^[a-z]{3}$/);
    }
  });
});
