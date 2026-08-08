import { describe, expect, it } from 'vitest';
import {
  isProbablySameBook,
  isValidIsbn,
  looksDerivative,
  normaliseIsbn,
  normaliseTitleAuthor,
  rankingScore,
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

  it('sees past a LONG subtitle, not just a short one', () => {
    // Regression, found against a real Audible export. The scored rule only
    // handled short subtitles: these share half their tokens, so the weaker
    // direction scored 0.5 and the pair was missed — which would have imported
    // a second copy of two books already on the shelf.
    expect(
      isProbablySameBook(
        'Staff Engineer: Leadership Beyond the Management Track Will Larson',
        'Staff Engineer Will Larson',
      ),
    ).toBe(true);
    expect(
      isProbablySameBook(
        'The Charisma Myth: How Anyone Can Master the Art and Science of Personal Magnetism Olivia Fox Cabane',
        'The charisma myth Olivia Fox Cabane',
      ),
    ).toBe(true);
  });

  it('does NOT match a summary or study guide of the same book', () => {
    // Real failure: Apple's top hit for "Staff Engineer Will Larson" is
    // "Summary of Will Larson's Staff Engineer", and containment matched it —
    // every word of the real title is in there. The knock-off's cover was
    // downloaded and written onto the real book.
    expect(
      isProbablySameBook(
        "Summary of Will Larson's Staff Engineer",
        'Staff Engineer Will Larson',
      ),
    ).toBe(false);
    expect(
      isProbablySameBook('Workbook for Atomic Habits James Clear', 'Atomic Habits James Clear'),
    ).toBe(false);
  });

  it('still matches when the extra words are a subtitle, not a prefix', () => {
    // The distinction that separates the two: a subtitle follows the title, a
    // qualifier precedes it.
    expect(
      isProbablySameBook(
        'Staff Engineer: Leadership Beyond the Management Track Will Larson',
        'Staff Engineer Will Larson',
      ),
    ).toBe(true);
  });

  it('does not let a one-word title match everything it appears inside', () => {
    expect(isProbablySameBook('Nexus', 'Nexus: A Brief History of Information Networks')).toBe(false);
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

describe('companion volumes', () => {
  it('refuses a journal sold beside the book', () => {
    // Both real, both Eckhart Tolle, and not the same book. This one is in the
    // vault, so `stacks add "The Power of Now Journal"` was refused as a
    // duplicate of the book it sits next to on a shelf.
    expect(
      isProbablySameBook('The Power of Now Eckhart Tolle', 'The Power of Now Journal Eckhart Tolle'),
    ).toBe(false);
  });

  it('still matches a book to its own subtitle', () => {
    // The case a threshold cannot be tuned to spare: 0.971/0.857 here against
    // 0.967/0.833 above. Four thousandths, opposite answers.
    expect(
      isProbablySameBook(
        'Thinking in Systems Donella H. Meadows',
        'Thinking in Systems: A Primer Donella H. Meadows',
      ),
    ).toBe(true);
  });

  it('still finds a journal when a journal is what was asked for', () => {
    // The marker is symmetric — it refuses a *mismatch*, not the word itself.
    // Both providers filter derivatives out of search results unless the query
    // carries one too, so searching for the journal must still reach it.
    expect(
      isProbablySameBook(
        'The Power of Now Journal Eckhart Tolle',
        'The Power of Now Journal Eckhart Tolle',
      ),
    ).toBe(true);
    expect(looksDerivative('The Power of Now Journal')).toBe(true);
    expect(looksDerivative('Thinking in Systems: A Primer')).toBe(false);
  });
});

describe('rankingScore', () => {
  it('does not reward a record for having no author', () => {
    // The bug this function exists for: measuring brevity over title+author made
    // an empty record beat its own richer twin, because the author's tokens read
    // as padding against a title-only query.
    const authored = rankingScore('12 Rules for Life', '12 Rules for Life', 'Jordan B. Peterson');
    const empty = rankingScore('12 Rules for Life', '12 Rules for Life');
    expect(authored).toBeGreaterThanOrEqual(empty);

    // The old scoring, kept here as the thing that must not come back.
    const authoredOld = titleMatchScore('12 Rules for Life', '12 Rules for Life Jordan B. Peterson');
    const emptyOld = titleMatchScore('12 Rules for Life', '12 Rules for Life ');
    expect(emptyOld).toBeGreaterThan(authoredOld);
  });

  it('still favours the named author when the query names one', () => {
    const right = rankingScore('Staff Engineer Will Larson', 'Staff Engineer', 'Will Larson');
    const wrong = rankingScore('Staff Engineer Will Larson', 'Staff Engineer', 'Someone Else');
    expect(right).toBeGreaterThan(wrong);
  });

  it('still penalises a title padded with unrelated words', () => {
    const exact = rankingScore('salt road ledger', 'The Salt Road Ledger', 'A N Other');
    const padded = rankingScore(
      'salt road ledger',
      'The Salt Road Ledger and Other Long Stories',
      'A N Other',
    );
    expect(exact).toBeGreaterThan(padded);
  });

  it('scores an unrelated title at zero', () => {
    expect(rankingScore('salt road ledger', 'Compilers for the Impatient')).toBe(0);
  });
});
