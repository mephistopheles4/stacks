import { describe, expect, it } from 'vitest';
import type { CatalogueBook } from './library.ts';
import { fold, mentioned } from './mentioned.ts';

// Invented titles of the shape that went wrong: one title inside a longer one.
const book = (id: string, title: string): CatalogueBook => ({
  id,
  title,
  status: 'read',
  thoughts: false,
});
const SHORT = book('keeper', 'Lantern Keeper');
const LONG = book('keeper-path', "Lantern Keeper's Path");
const OTHER = book('other', 'Salt Harbour: A Field Guide');
const CAT = [SHORT, LONG, OTHER];
const ids = (books: readonly CatalogueBook[]): string[] => books.map((b) => b.id);

const CURLY = String.fromCharCode(0x2019);

describe('mentioned: the pills under an answer', () => {
  it('matches a straight apostrophe in the answer to a straight one in the title', () => {
    expect(ids(mentioned(CAT, "I loved Lantern Keeper's Path a lot."))).toEqual(['keeper-path']);
  });

  it('matches a curly apostrophe in the answer to a straight one in the title', () => {
    const answer = `I loved Lantern Keeper${CURLY}s Path a lot.`;
    // Before: only "Lantern Keeper" matched, the wrong book.
    expect(ids(mentioned(CAT, answer))).toEqual(['keeper-path']);
  });

  it('matches a straight apostrophe in the answer to a curly one in the catalogue', () => {
    const curlyBook = book('c', `Lantern Keeper${CURLY}s Path`);
    expect(ids(mentioned([SHORT, curlyBook], "Lantern Keeper's Path was good."))).toEqual(['c']);
  });

  it('keeps only the longer title when a shorter one sits inside it at the same place', () => {
    expect(ids(mentioned(CAT, "Lantern Keeper's Path was good."))).toEqual(['keeper-path']);
  });

  it('keeps both when the answer also names the shorter book on its own', () => {
    const answer = "Lantern Keeper's Path was good, and so was Lantern Keeper.";
    expect(ids(mentioned(CAT, answer))).toEqual(['keeper', 'keeper-path']);
  });

  it('keeps the shorter book when only it is named', () => {
    expect(ids(mentioned(CAT, 'Lantern Keeper was good.'))).toEqual(['keeper']);
  });

  it('falls back to the books the question names when the answer names none', () => {
    const q = "What did you think of Lantern Keeper's Path?";
    expect(ids(mentioned(CAT, 'I have not written about it yet.', q))).toEqual(['keeper-path']);
  });

  it('applies the same rules to the question, curly apostrophe included', () => {
    const q = `What did you think of Lantern Keeper${CURLY}s Path?`;
    expect(ids(mentioned(CAT, 'Nothing written yet.', q))).toEqual(['keeper-path']);
  });

  it('does not fall back when the answer names a book', () => {
    expect(ids(mentioned(CAT, 'Salt Harbour is good.', 'What about Lantern Keeper?'))).toEqual([
      'other',
    ]);
  });

  it('gives no pill when neither the answer nor the question names a book', () => {
    expect(mentioned(CAT, 'Nothing here.', 'What is the weather?')).toEqual([]);
  });

  it('matches the part of a title before its colon, and not inside a longer word', () => {
    expect(ids(mentioned(CAT, 'Salt Harbour is good.'))).toEqual(['other']);
    expect(mentioned([book('w', 'Keeper Lanterns')], 'The Keeper Lanternsmith.')).toEqual([]);
  });

  it('returns at most 6 books, in catalogue order', () => {
    const many = Array.from({ length: 9 }, (_, i) => book(`b${String(i)}`, `Title ${String(i)}x`));
    const text = many.map((b) => b.title).join(', ');
    expect(ids(mentioned(many, text))).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5']);
  });
});

describe('fold', () => {
  it('lower-cases and unifies apostrophes only', () => {
    expect(fold(`It${CURLY}s`)).toBe("it's");
  });
});
