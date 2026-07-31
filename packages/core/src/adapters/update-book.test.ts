import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from './obsidian-adapter.ts';

/**
 * `updateBook` edits notes the owner also edits by hand, so the test that
 * matters most is what it *doesn't* touch.
 */
describe('updateBook', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  const note = async (name: string, contents: string): Promise<void> => {
    await mkdir(join(dir, 'Library'), { recursive: true });
    await writeFile(join(dir, 'Library', name), contents, 'utf8');
  };

  const read = async (name: string): Promise<string> =>
    readFile(join(dir, 'Library', name), 'utf8');

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-update-'));
    vault = new ObsidianAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('changes one key and leaves every other byte alone', async () => {
    const original = [
      '---',
      'type: book',
      'title: "The Tidal Engine"',
      '# a comment the owner wrote',
      'author: Marisol Vane',
      'status: read',
      'tags:',
      '  - engineering',
      '  - nonfiction',
      '---',
      '',
      '![[the-tidal-engine.png]]',
      '',
      '## Notes',
      '',
      'Thoughts with [[backlinks]] and a --- inside the body.',
      '',
    ].join('\n');
    await note('Tidal.md', original);

    await vault.updateBook('Library/Tidal.md', { shelf_order: 20 });
    const updated = await read('Tidal.md');

    expect(updated).toContain('shelf_order: 20');
    // The comment, the key order, the embed, the body, the stray --- all survive.
    expect(updated).toContain('# a comment the owner wrote');
    expect(updated).toContain('![[the-tidal-engine.png]]');
    expect(updated).toContain('Thoughts with [[backlinks]] and a --- inside the body.');
    expect(updated.indexOf('type: book')).toBeLessThan(updated.indexOf('author: Marisol Vane'));
  });

  it('replaces an existing value rather than adding a second line', async () => {
    await note('A.md', '---\ntype: book\ntitle: A\nshelf_order: 10\n---\n\n## Notes\n');

    await vault.updateBook('Library/A.md', { shelf_order: 30 });
    const updated = await read('A.md');

    expect(updated).toContain('shelf_order: 30');
    expect(updated).not.toContain('shelf_order: 10');
    expect(updated.match(/shelf_order:/g)).toHaveLength(1);
  });

  it('removes a key when given undefined', async () => {
    await note('B.md', '---\ntype: book\ntitle: B\nshelf_order: 10\n---\n\n## Notes\n');

    await vault.updateBook('Library/B.md', { shelf_order: undefined });
    expect(await read('B.md')).not.toContain('shelf_order');
  });

  it('refuses to mangle a key whose value is a list', async () => {
    // Rewriting the `tags:` line would orphan the items under it.
    const original = '---\ntype: book\ntitle: C\ntags:\n  - one\n  - two\n---\n\n## Notes\n';
    await note('C.md', original);

    await vault.updateBook('Library/C.md', { tags: 'three' });
    const updated = await read('C.md');

    expect(updated).toContain('  - one');
    expect(updated).toContain('  - two');
    expect(updated).not.toContain('tags: three');
  });

  it('preserves CRLF line endings', async () => {
    await note('D.md', '---\r\ntype: book\r\ntitle: D\r\n---\r\n\r\n## Notes\r\n');

    await vault.updateBook('Library/D.md', { shelf_order: 10 });
    const updated = await read('D.md');

    expect(updated).toContain('shelf_order: 10');
    expect(updated).not.toMatch(/[^\r]\n/);
  });

  it('round-trips through the parser', async () => {
    await note('E.md', '---\ntype: book\ntitle: E\nstatus: read\n---\n\n## Notes\n');

    await vault.updateBook('Library/E.md', { shelf_order: 40, face_out: true });
    const [book] = await vault.listBooks();

    expect(book?.shelfOrder).toBe(40);
    expect(book?.faceOut).toBe(true);
    expect(book?.title).toBe('E');
  });

  it('throws for a note with no frontmatter, rather than inventing one', async () => {
    await note('F.md', 'just a note, no frontmatter at all\n');
    await expect(vault.updateBook('Library/F.md', { shelf_order: 1 })).rejects.toThrow(
      /no frontmatter/,
    );
  });
});
