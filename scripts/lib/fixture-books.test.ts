import { describe, expect, it } from 'vitest';
import {
  FIRST,
  isFixtureTitle,
  LONG_BOOK_PARAGRAPHS,
  LONG_BOOK_TITLE,
  longBookParagraphs,
  SECOND,
  SUBTITLE,
} from './fixture-books.ts';

describe('the long-Thoughts book', () => {
  const paragraphs = longBookParagraphs();

  it('has the paragraphs it declares, none empty and none repeated', () => {
    expect(paragraphs).toHaveLength(LONG_BOOK_PARAGRAPHS);
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
    for (const paragraph of paragraphs) expect(paragraph.length).toBeGreaterThan(100);
  });

  it('is plain prose: no markup, list or heading character the extractor would withhold it for', () => {
    for (const paragraph of paragraphs) {
      expect(paragraph).not.toMatch(/[<>*_[\]#`~|$%\\!]|^\s*[-+\d>]|\n/);
    }
  });

  it('is far taller than a page: at about 48 characters a line, over 400 px more than a 700 px page', () => {
    const lines = paragraphs.reduce((sum, paragraph) => sum + Math.ceil(paragraph.length / 48), 0);
    const tall = lines * 17 * 1.55 + paragraphs.length * 14;
    expect(tall).toBeGreaterThan(700 + 400);
  });

  it('stays under the extractor’s 20,000 code points with room for the rest of the note', () => {
    expect(paragraphs.join('\n\n').length).toBeLessThan(15_000);
  });
});

describe('isFixtureTitle', () => {
  it('accepts every title the generator can write, and the long book', () => {
    expect(isFixtureTitle(`${FIRST[0]} ${SECOND[0]}`)).toBe(true);
    expect(isFixtureTitle(`${FIRST[3]} ${SECOND[5]}: ${SUBTITLE[2]}`)).toBe(true);
    expect(isFixtureTitle(LONG_BOOK_TITLE)).toBe(true);
  });

  it('refuses a title from anywhere else', () => {
    expect(isFixtureTitle('Dune')).toBe(false);
    expect(isFixtureTitle(`${FIRST[0]} ${SECOND[0]}: Not A Subtitle`)).toBe(false);
    expect(isFixtureTitle(`${FIRST[0]} Dune`)).toBe(false);
    expect(isFixtureTitle(`Dune ${SECOND[0]}`)).toBe(false);
    expect(isFixtureTitle(`${FIRST[0]} ${SECOND[0]} extra`)).toBe(false);
    expect(isFixtureTitle(`${FIRST[0]} ${SECOND[0]}: ${SUBTITLE[0]}: ${SUBTITLE[1]}`)).toBe(false);
    expect(isFixtureTitle('')).toBe(false);
  });
});
