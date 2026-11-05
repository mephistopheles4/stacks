import { describe, expect, it } from 'vitest';
import type { CatalogueBook } from './library.ts';
import { pickLikelyBooks } from './select.ts';

const b = (id: string, title: string, extra: Partial<CatalogueBook> = {}): CatalogueBook => ({
  id,
  title,
  status: 'read',
  thoughts: false,
  ...extra,
});

const CAT = [
  b('t1', 'Alpha', { thoughts: true, rating: 3 }),
  b('t2', 'Co-Intelligence: Living and Working with AI', { thoughts: true, rating: 5 }),
  b('plain', 'Money Unlocked', { subjects: 'Business' }),
  b('t3', 'Money Matters', { thoughts: true, rating: 4 }),
  b('t4', 'Delta', { thoughts: true }),
  b('t5', 'Echo', { thoughts: true, rating: 5 }),
];

describe('pickLikelyBooks (S4, C3)', () => {
  it('puts a book named in the question first, by full title or the part before the colon', () => {
    expect(pickLikelyBooks(CAT, 'What did you think of Co-Intelligence?')[0]!.id).toBe('t2');
    expect(
      pickLikelyBooks(CAT, 'what about co-intelligence: living and working with ai')[0]!.id,
    ).toBe('t2');
  });

  it('then takes search matches with Thoughts, skipping those without', () => {
    expect(pickLikelyBooks(CAT, 'money').map((x) => x.id)).toEqual(['t3']);
  });

  it('falls back to the highest rated with Thoughts, then shelf order, at most 3', () => {
    expect(pickLikelyBooks(CAT, 'what kind of books have you read?').map((x) => x.id)).toEqual([
      't2',
      't5',
      't3',
    ]);
  });

  it('never returns more than 3', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      b(`k${String(i)}`, `Money ${String(i)}`, { thoughts: true }),
    );
    expect(pickLikelyBooks(many, 'money')).toHaveLength(3);
  });

  it('returns the same books for the same question every time', () => {
    const q = 'what would you recommend?';
    expect(pickLikelyBooks(CAT, q)).toEqual(pickLikelyBooks(CAT, q));
  });

  it('returns nothing when no book has Thoughts', () => {
    expect(pickLikelyBooks([b('x', 'X')], 'anything')).toEqual([]);
  });
});
