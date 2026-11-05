import { describe, expect, it } from 'vitest';
import type { CatalogueBook } from './library.ts';
import { search } from './search.ts';

const b = (id: string, title: string, extra: Partial<CatalogueBook> = {}): CatalogueBook => ({
  id,
  title,
  status: 'read',
  thoughts: false,
  ...extra,
});

const CAT = [
  b('money', 'Money Unlocked', { subjects: 'Business & Economics', author: 'Jo Smith' }),
  b('spend', 'The Art Of Spending Money', { subjects: 'Self-Help' }),
  b('ai', 'Co-Intelligence', { author: 'Ethan Mollick', subjects: 'Computers' }),
  b('wave', 'The Coming Wave', { subjects: 'Computers; Technology' }),
];

describe('search (S6)', () => {
  it('matches whole words, case-insensitively, in title, author and subjects', () => {
    expect(search(CAT, 'MONEY').map((x) => x.id)).toEqual(['money', 'spend']);
    expect(search(CAT, 'mollick').map((x) => x.id)).toEqual(['ai']);
    expect(search(CAT, 'technology').map((x) => x.id)).toEqual(['wave']);
  });

  it('does not match inside a word', () => {
    expect(search(CAT, 'wav')).toEqual([]);
    expect(search(CAT, 'financ')).toEqual([]);
  });

  it('misses a finance question for a book filed only under Business & Economics', () => {
    expect(search(CAT, 'what have you read about finance?')).toEqual([]);
  });

  it('ignores common words and returns nothing for only common words', () => {
    expect(search(CAT, 'what did you read about the books')).toEqual([]);
  });

  it('ranks by words matched, then by shelf order', () => {
    const out = search(CAT, 'money spending art');
    expect(out[0]!.id).toBe('spend');
    expect(out[1]!.id).toBe('money');
  });

  it('returns at most 6 books', () => {
    const many = Array.from({ length: 10 }, (_, i) => b(`x${String(i)}`, `Money ${String(i)}`));
    expect(search(many, 'money')).toHaveLength(6);
    expect(search(many, 'money')[0]!.id).toBe('x0');
  });
});
