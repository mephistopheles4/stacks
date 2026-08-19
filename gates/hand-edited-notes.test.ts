/**
 * G4 — hand-edited notes are first-class (invariant 5, and the `updateBook`
 * contract in AGENTS.md).
 *
 * "Sets frontmatter keys on an existing note by rewriting individual lines —
 * key order, quoting, comments and the note body all survive byte for byte."
 * That sentence is the reason the vault can be the database: a tool that
 * reformats your notes on every write is a tool you stop pointing at your
 * vault, and the moment that happens the whole local-first premise is gone.
 *
 * The existing unit test in `adapters/update-book.test.ts` asserts with
 * `toContain`, which proves the survivors are *present*. This gate compares the
 * **entire file** against the original with exactly one substitution applied,
 * which is a different and stricter claim: nothing moved, nothing was requoted,
 * no line ending flipped, and the fiddly splice around the closing fence put
 * the body back where it found it. `toContain` cannot see any of that.
 *
 * Every hostile property of a hand-edited note is in one fixture on purpose —
 * reordered keys, a comment between them, a key outside the contract, quoting
 * chosen by a human, and a body containing a `---` horizontal rule that looks
 * exactly like a fence.
 *
 * This gate uses `node:fs/promises` directly, which invariant 4 forbids in
 * `packages/` and `scripts/`. G1 deliberately does not scan `gates/`: testing a
 * thing that writes to disk requires a disk.
 *
 * See docs/gates.md, row G4 (hand-edited-notes).
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';

/**
 * Everything a hand-edited note does that a naive rewriter destroys:
 *
 *   - `title` before `type`, because a person types the title first;
 *   - a comment line the owner left for themselves;
 *   - `narrator`, outside the frontmatter contract entirely (invariant 5);
 *   - `"quoted"` where quoting is unnecessary, and bare where it is optional;
 *   - a body with a wikilink, an embed and a `---` rule that is not a fence.
 */
const HAND_EDITED = [
  '---',
  'title: "The Tidal Engine"',
  'type: book',
  '# picked this up after the Vane essay — reread the middle third',
  "author: 'Marisol Vane'",
  'status: read',
  'rating: 4',
  'narrator: A Reader Who Is Not In The Contract',
  'finished: 2026-04-11',
  '---',
  '',
  '![[the-tidal-engine.png]]',
  '',
  '## Notes',
  '',
  'Opens slowly. See also [[Thinking in Systems]].',
  '',
  '---',
  '',
  'A second section, below a horizontal rule that is not a fence.',
  '',
].join('\n');

describe('G4 — hand-edited notes are first-class', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  const write = async (name: string, contents: string): Promise<void> => {
    await mkdir(join(dir, 'Library'), { recursive: true });
    await writeFile(join(dir, 'Library', name), contents, 'utf8');
  };

  const read = async (name: string): Promise<string> =>
    readFile(join(dir, 'Library', name), 'utf8');

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-gate-g4-'));
    vault = new ObsidianAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('changes one existing scalar line and nothing else, byte for byte', async () => {
    await write('Tidal.md', HAND_EDITED);

    await vault.updateBook('Library/Tidal.md', { rating: 5 });

    // The whole claim in one expression: the file the owner gets back is the
    // file they wrote, with one line different. Field-by-field checks pass even
    // when the comment moved or the body lost its trailing newline.
    expect(await read('Tidal.md')).toBe(HAND_EDITED.replace('rating: 4', 'rating: 5'));
  });

  it('appends a key it has never seen without disturbing the rest', async () => {
    await write('Tidal.md', HAND_EDITED);

    await vault.updateBook('Library/Tidal.md', { shelf_order: 20 });

    // Appending is the other half of the splice, and it is where a stray
    // newline round the closing fence would show up.
    expect(await read('Tidal.md')).toBe(
      HAND_EDITED.replace('finished: 2026-04-11\n---', 'finished: 2026-04-11\nshelf_order: 20\n---'),
    );
  });

  it('leaves a key alone when its value is a block list', async () => {
    // Rewriting the `tags:` line would orphan the two `- ` lines under it and
    // leave the file unparseable — the documented "scalars only" rule.
    const withBlockList = [
      '---',
      'type: book',
      'title: A Tagged Book',
      'tags:',
      '  - engineering',
      '  - nonfiction',
      '---',
      '',
      '## Notes',
      '',
    ].join('\n');
    await write('Tagged.md', withBlockList);

    await vault.updateBook('Library/Tagged.md', { tags: 'clobbered' });

    expect(await read('Tagged.md')).toBe(withBlockList);
  });

  it('leaves a key alone when its value is an inline list', async () => {
    // The same documented rule — AGENTS.md says "a key whose value is a list is
    // left alone", not "a block list". `tags: [a, b]` and `author: [X, Y]` are
    // ordinary YAML flow sequences and entirely normal in a note typed by hand.
    //
    // This was red, and the path to it is worse than "someone might hand-edit
    // one". `asString` returns undefined for an array, so a two-author note
    // parses to `record.author === undefined`; `enrich` reads that as a missing
    // author, goes and looks one up, and calls `updateBook({ author })`. The
    // parser reporting the note as authorless is precisely what routed it into
    // the overwrite that then dropped the second author.
    const withInlineList = [
      '---',
      'type: book',
      'title: A Book With Two Authors',
      'author: [Marisol Vane, Tomas Ek]',
      'tags: [engineering, nonfiction]',
      '---',
      '',
      '## Notes',
      '',
    ].join('\n');
    await write('Inline.md', withInlineList);

    await vault.updateBook('Library/Inline.md', { author: 'Someone Else', tags: 'clobbered' });

    expect(await read('Inline.md')).toBe(withInlineList);
  });

  it('still parses the note it just rewrote', async () => {
    // A byte-perfect file that no longer loads would satisfy every assertion
    // above. This is the end-to-end check that the round trip is real.
    await write('Tidal.md', HAND_EDITED);
    await vault.updateBook('Library/Tidal.md', { rating: 5 });

    const books = await vault.listBooks();
    expect(books).toHaveLength(1);
    expect(books[0]?.title).toBe('The Tidal Engine');
    expect(books[0]?.rating).toBe(5);
  });
});
