import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '@stacks/core';
import { leftPageBlocks, rightPageBlocks } from './held-page.ts';

const book = (patch: Partial<LibraryBook> = {}): LibraryBook => ({
  id: 'a-1',
  title: 'The Quiet Orchard',
  author: 'Ines Marlow',
  status: 'read',
  tags: [],
  ...patch,
});

describe('the left-hand page', () => {
  it('carries the title and the author, as prototyped (#371)', () => {
    expect(leftPageBlocks(book())).toEqual(['title', 'author']);
  });

  it('drops the author line for a book with none', () => {
    expect(leftPageBlocks(book({ author: undefined }))).toEqual(['title']);
  });
});

describe('the right-hand page', () => {
  it("is the card's lines alone for a book with no Thoughts (#369's C)", () => {
    expect(rightPageBlocks(book(), { narrow: false, thoughts: false })).toEqual([
      'reading',
      'links',
      'put-back',
    ]);
  });

  it("puts the Thoughts first, then a rule, then the card's lines, so the links stay reachable", () => {
    expect(rightPageBlocks(book(), { narrow: false, thoughts: true })).toEqual([
      'thoughts',
      'rule',
      'reading',
      'links',
      'put-back',
    ]);
  });

  it('leads with the title and author on a phone, which frames this page alone', () => {
    expect(rightPageBlocks(book(), { narrow: true, thoughts: true })).toEqual([
      'title',
      'author',
      'thoughts',
      'rule',
      'reading',
      'links',
      'put-back',
    ]);
  });

  it('carries every optional line the card would, in the card order, and the cover control', () => {
    const full = book({
      tags: ['autumn'],
      publisher: 'Fieldfare Press',
      subjects: 'Fiction; Gardens',
      cover: 'covers/a.jpg',
    });

    expect(rightPageBlocks(full, { narrow: false, thoughts: false })).toEqual([
      'reading',
      'tags',
      'object',
      'subjects',
      'links',
      'cover',
      'put-back',
    ]);
  });
});
