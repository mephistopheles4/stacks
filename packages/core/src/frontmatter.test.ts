import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNote } from './frontmatter.ts';
import { FIXTURE_VAULT } from './test-support.ts';

const note = (name: string): string =>
  readFileSync(join(FIXTURE_VAULT, 'Library', name), 'utf8');

describe('parseNote — the three outcomes', () => {
  it('parses a well-formed book', () => {
    const result = parseNote(note('The Tidal Engine.md'), 'Library/The Tidal Engine.md');

    expect(result.kind).toBe('book');
    if (result.kind !== 'book') return;
    expect(result.record).toMatchObject({
      title: 'The Tidal Engine',
      author: 'Marisol Vane',
      isbn: '9781000000016',
      status: 'read',
      finished: '2024-03-12',
      rating: 5,
      pages: 328,
      cover: 'covers/the-tidal-engine.png',
    });
    expect(result.record.tags).toEqual(['engineering', 'nonfiction']);
  });

  it('flags unparseable YAML as invalid rather than throwing', () => {
    const result = parseNote(
      note('The Undelivered Manuscript.md'),
      'Library/The Undelivered Manuscript.md',
    );

    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toMatch(/unparseable frontmatter/);
  });

  it('flags a book with no title as invalid', () => {
    const result = parseNote(note('Untitled Import.md'), 'Library/Untitled Import.md');

    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('missing required key: title');
  });

  it('treats a non-book note as not-a-book, NOT as invalid', () => {
    // The distinction is the whole point: `not-a-book` is silent, `invalid`
    // warns. Getting this wrong makes every ordinary note in a vault shout.
    expect(parseNote(note('On Reading Slowly.md'), 'x').kind).toBe('not-a-book');
    expect(parseNote('no frontmatter here at all', 'x').kind).toBe('not-a-book');
  });
});

describe('parseNote — hand-edited notes are first-class', () => {
  it('tolerates reordered keys and extra keys outside the contract', () => {
    const result = parseNote(note('Lantern Work.md'), 'Library/Lantern Work.md');

    expect(result.kind).toBe('book');
    if (result.kind !== 'book') return;
    // `type` is the fourth key in this file and `title` the second.
    expect(result.record.title).toBe('Lantern Work: Notes on Craft');
    expect(result.record.status).toBe('reading');
    expect(result.record.finished).toBeUndefined();
  });

  it('keeps a book whose only identifier is an out-of-contract asin', () => {
    const result = parseNote(
      note('Nine Ways of Seeing a Warehouse.md'),
      'Library/Nine Ways of Seeing a Warehouse.md',
    );

    expect(result.kind).toBe('book');
    if (result.kind !== 'book') return;
    expect(result.record.isbn).toBeUndefined();
    expect(result.record.author).toContain('Ada Whitlock');
  });

  it('defaults a missing status to read, and falls back on an unknown one', () => {
    const base = '---\ntype: book\ntitle: X\n';
    expect(pick(parseNote(`${base}---\n`, 'x')).status).toBe('read');
    expect(pick(parseNote(`${base}status: half-read\n---\n`, 'x')).status).toBe('read');
    expect(pick(parseNote(`${base}status: READING\n---\n`, 'x')).status).toBe('reading');
  });

  it('accepts an unquoted numeric isbn, which YAML reads as a number', () => {
    const result = parseNote('---\ntype: book\ntitle: X\nisbn: 9781000000016\n---\n', 'x');
    expect(pick(result).isbn).toBe('9781000000016');
  });

  it('discards a rating outside 1–5 instead of rejecting the book', () => {
    expect(pick(parseNote('---\ntype: book\ntitle: X\nrating: 9\n---\n', 'x')).rating).toBeUndefined();
    expect(pick(parseNote('---\ntype: book\ntitle: X\nrating: 4\n---\n', 'x')).rating).toBe(4);
  });
});

describe('parseNote — note bodies never escape (invariant 2)', () => {
  it('has no field carrying body text, whatever the body contains', () => {
    const source = note('The Tidal Engine.md');
    expect(source).toContain('NOTE_BODY_CANARY_do_not_ship');

    const result = parseNote(source, 'Library/The Tidal Engine.md');
    expect(JSON.stringify(result)).not.toContain('NOTE_BODY_CANARY_do_not_ship');
    expect(JSON.stringify(result)).not.toContain('estuary turbines');
  });

  it('does not treat a --- inside the body as a second frontmatter block', () => {
    const source = '---\ntype: book\ntitle: X\n---\n\nbody\n\n---\n\nsecret: leaked\n';
    const result = parseNote(source, 'x');
    expect(JSON.stringify(result)).not.toContain('leaked');
  });
});

function pick(result: ReturnType<typeof parseNote>) {
  if (result.kind !== 'book') throw new Error(`expected a book, got ${result.kind}`);
  return result.record;
}
