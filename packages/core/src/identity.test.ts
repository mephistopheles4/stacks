import { describe, expect, it } from 'vitest';
import {
  isProbablySameBook,
  isValidIsbn,
  normaliseIsbn,
  normaliseTitleAuthor,
  titleMatchScore,
} from './identity.ts';

describe('normaliseIsbn / isValidIsbn', () => {
  it('strips punctuation', () => {
    expect(normaliseIsbn('978-1-60358-055-7')).toBe('9781603580557');
    expect(normaliseIsbn(' 0-306-40615-x ')).toBe('030640615X');
  });

  it('checks the check digit', () => {
    expect(isValidIsbn('9781603580557')).toBe(true);
    expect(isValidIsbn('0306406152')).toBe(true);
    expect(isValidIsbn('9781603580556')).toBe(false); // last digit wrong
    expect(isValidIsbn('12345')).toBe(false);
  });

  it('accepts every ISBN used in the fixture vault', () => {
    // If any of these were wrong, a fixture would fail validation for a reason
    // that has nothing to do with what it was written to test.
    for (const isbn of [
      '9781000000016',
      '9781000000023',
      '9781000000030',
      '9781000000047',
      '9781000000054',
      '9781000000061',
    ]) {
      expect(isValidIsbn(isbn), isbn).toBe(true);
    }
  });
});

describe('normaliseTitleAuthor', () => {
  it('collapses the things that differ between sources for one book', () => {
    expect(normaliseTitleAuthor('The Salt Road Ledger')).toBe('salt road ledger');
    expect(normaliseTitleAuthor('Signal & Sediment!!')).toBe('signal sediment');
    expect(normaliseTitleAuthor('Iglesias, Tomás')).toBe('iglesias tomas');
  });

  it('does not reorder words — that is isProbablySameBook’s job', () => {
    // "Iglesias, Tomás" and "Tomas Iglesias" produce the same *tokens* in a
    // different order. Normalisation deliberately stays a string transform;
    // order-insensitivity lives in the token-set comparison instead.
    expect(normaliseTitleAuthor('Iglesias, Tomás')).not.toBe(normaliseTitleAuthor('Tomas Iglesias'));
    expect(normaliseTitleAuthor('Iglesias, Tomás').split(' ').sort()).toEqual(
      normaliseTitleAuthor('Tomas Iglesias').split(' ').sort(),
    );
  });
});

describe('isProbablySameBook', () => {
  it('sees past a missing subtitle', () => {
    // Regression: `stacks add "thinking in systems"` created a second note
    // beside "Thinking in systems : a primer", because exact equality of the
    // normal form cannot match a title that carries the subtitle against one
    // that does not.
    expect(
      isProbablySameBook(
        'Thinking in systems Donella H. Meadows',
        'Thinking in systems : a primer Donella H. Meadows, Diana Wright',
      ),
    ).toBe(true);
  });

  it('matches the print and audiobook editions in the fixture vault', () => {
    expect(
      isProbablySameBook('The Salt Road Ledger Beatrix Okonkwo', 'Salt Road Ledger, The Okonkwo, Beatrix'),
    ).toBe(true);
  });

  it('does NOT collapse two different books by the same author', () => {
    // The author tokens match on both sides; only the title tokens keep these
    // apart, which is exactly the false positive a looser rule would produce.
    expect(isProbablySameBook('The Tidal Engine Marisol Vane', 'The Quiet Protocol Marisol Vane')).toBe(
      false,
    );
    expect(isProbablySameBook('Compilers for the Impatient Roy', 'Lantern Work Roy')).toBe(false);
  });

  it('refuses to match on an empty string', () => {
    expect(isProbablySameBook('', 'anything at all')).toBe(false);
    expect(isProbablySameBook('   ', '!!!')).toBe(false);
  });
});

describe('titleMatchScore', () => {
  it('ranks an exact title above one merely containing it', () => {
    const exact = titleMatchScore('salt road ledger', 'The Salt Road Ledger');
    const padded = titleMatchScore('salt road ledger', 'The Salt Road Ledger and Other Long Stories');
    expect(exact).toBeGreaterThan(padded);
  });

  it('scores an unrelated title at zero', () => {
    expect(titleMatchScore('salt road ledger', 'Compilers for the Impatient')).toBe(0);
  });
});
