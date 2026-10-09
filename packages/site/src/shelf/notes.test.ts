import { describe, expect, it, vi } from 'vitest';
import { loadThoughts, notesPath, parseNotes } from './notes.ts';

describe('parseNotes', () => {
  it('reads the one shape the publisher writes', () => {
    expect(parseNotes({ paragraphs: ['One.', 'Two,\nwith a kept break.'] })).toEqual([
      'One.',
      'Two,\nwith a kept break.',
    ]);
  });

  it.each([
    ['not an object', 'One.'],
    ['null', null],
    ['an array', ['One.']],
    ['no paragraphs', {}],
    ['paragraphs not a list', { paragraphs: 'One.' }],
    ['an empty list', { paragraphs: [] }],
    ['an empty paragraph', { paragraphs: ['One.', ''] }],
    ['a paragraph that is not text', { paragraphs: ['One.', 2] }],
    ['a second key', { paragraphs: ['One.'], title: 'x' }],
  ])('refuses %s', (_name, value) => {
    expect(parseNotes(value)).toBeUndefined();
  });
});

describe('notesPath', () => {
  it('names the file after the book id, from the site root', () => {
    expect(notesPath('the-quiet-orchard-1k2j3h')).toBe('/notes/the-quiet-orchard-1k2j3h.json');
  });

  it.each(['../library', 'a/b', 'A-b', '', 'x.json', 'a--b', '-a'])(
    'refuses an id that is not slug-and-hash: %j',
    (id) => {
      expect(notesPath(id)).toBeUndefined();
    },
  );
});

describe('loadThoughts', () => {
  const book = { id: 'the-quiet-orchard-1k2j3h', thoughts: true as const };

  it('fetches nothing for a book with no Thoughts', async () => {
    const fetch = vi.fn();
    expect(await loadThoughts({ id: book.id }, fetch)).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the paragraphs of a good response', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ paragraphs: ['One.'] }), { status: 200 })),
    );
    expect(await loadThoughts(book, fetch)).toEqual(['One.']);
    expect(fetch).toHaveBeenCalledWith('/notes/the-quiet-orchard-1k2j3h.json');
  });

  it.each([
    ['a 404', () => Promise.resolve(new Response('', { status: 404 }))],
    ['a failed request', () => Promise.reject(new TypeError('offline'))],
    ['a body that is not JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    [
      'a body of the wrong shape',
      () => Promise.resolve(new Response('{"paragraphs":[]}', { status: 200 })),
    ],
  ])('leaves the card lines alone on %s', async (_name, response) => {
    expect(await loadThoughts(book, vi.fn(response))).toBeUndefined();
  });
});
