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

describe('mentioned: case and memory (memory spec)', () => {
  const STAFF = book('staff', 'Staff Engineer');
  const FCK = book('fck', 'The Subtle Art of Not Giving a F*ck');

  it('needs the title capitalisation in an answer', () => {
    expect(mentioned([STAFF], 'A staff engineer feels most alive when solving things.')).toEqual(
      [],
    );
    expect(ids(mentioned([STAFF], 'I read Staff Engineer last year.'))).toEqual(['staff']);
  });

  it('still reads a visitor question case-insensitively', () => {
    const q = 'what did you think of staff engineer?';
    expect(ids(mentioned([STAFF], 'Nothing written about it.', q))).toEqual(['staff']);
  });

  it('keeps an asterisk inside a title in the pill match', () => {
    expect(ids(mentioned([FCK], 'I liked The Subtle Art of Not Giving a F*ck a lot.'))).toEqual([
      'fck',
    ]);
  });

  it('falls back to the books memory names, newest first, when answer and question name none', () => {
    const history = [
      { question: 'Tell me about Lantern Keeper', answer: 'It was good.' },
      { question: 'And the other?', answer: 'Salt Harbour was good too.' },
    ];
    expect(ids(mentioned(CAT, 'I have not written about it.', 'which one?', history))).toEqual([
      'other',
      'keeper',
    ]);
  });

  it('does not use memory when the answer names a book', () => {
    const history = [{ question: 'Lantern Keeper?', answer: 'Good.' }];
    expect(ids(mentioned(CAT, 'Salt Harbour is good.', 'which?', history))).toEqual(['other']);
  });
});

describe('mentioned: small words in a title (S6, C25)', () => {
  const ART = book('art', 'The Art Of Spending Money');
  const STAFF = book('staff', 'Staff Engineer');
  const LORD = book('lord', 'Lord of the Rings in a Nutshell');

  it('matches a title whatever the case of its small words', () => {
    expect(ids(mentioned([ART], 'I read The Art of Spending Money last year.'))).toEqual(['art']);
    expect(ids(mentioned([ART], 'I read the Art Of Spending Money last year.'))).toEqual(['art']);
    expect(ids(mentioned([ART], 'I read The Art Of Spending Money last year.'))).toEqual(['art']);
  });

  it('matches a title whose catalogue spelling uses the other case, and several small words', () => {
    const lower = book('l', 'The Art of Spending Money');
    expect(ids(mentioned([lower], 'I read The Art Of Spending Money.'))).toEqual(['l']);
    expect(ids(mentioned([LORD], 'I read Lord Of The Rings In A Nutshell.'))).toEqual(['lord']);
  });

  it('still requires the main words to have the title capitals', () => {
    expect(mentioned([ART], 'the art of spending money is hard.')).toEqual([]);
    expect(mentioned([ART], 'The art of Spending Money is hard.')).toEqual([]);
    expect(mentioned([STAFF], 'a staff engineer feels most alive when solving things.')).toEqual(
      [],
    );
    expect(ids(mentioned([STAFF], 'I read Staff Engineer last year.'))).toEqual(['staff']);
  });

  it('does not match a small word inside a longer word', () => {
    expect(mentioned([book('t', 'The Tomb')], 'I read Theatomb.')).toEqual([]);
  });
});
