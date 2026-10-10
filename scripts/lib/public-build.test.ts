import { describe, expect, it } from 'vitest';
import { notesPresence, THOUGHTS_SHIP_PHRASE } from './public-build.ts';

/**
 * `gate:public`'s presence half, both ways round.
 *
 * The stage-off refusal is the takedown deploy's own gate: before #411's round 3
 * it had only been seen passing, so a version that never refused would have
 * passed every test (integrity F10).
 */
describe('notesPresence', () => {
  const split = {
    name: 'notes/a-book-1a2b3c.json',
    text: `{"paragraphs":["${THOUGHTS_SHIP_PHRASE}"]}`,
  };

  it('passes the stage on, with the ship phrase in a file, and says which', () => {
    expect(notesPresence([split], true)).toEqual({
      observation: 'ship phrase present in notes/a-book-1a2b3c.json',
    });
  });

  it('refuses the stage on, with no file carrying the phrase', () => {
    const other = { name: 'notes/other.json', text: '{"paragraphs":["Other words."]}' };
    for (const files of [[], [other]]) {
      expect(notesPresence(files, true).problem).toMatch(/reached no file under dist\/notes/);
    }
  });

  it('passes the stage off, with no file at all', () => {
    expect(notesPresence([], false)).toEqual({
      observation: 'notes stage switched off: dist/notes/ holds no file',
    });
  });

  it('refuses the stage off, with any file left, the split one included', () => {
    expect(notesPresence([split], false).problem).toBe(
      'the notes stage is switched off, yet 1 file(s) sit under dist/notes',
    );
  });
});
