import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from './obsidian-adapter.ts';

/**
 * The adapter's sixth method — and the riskiest write this project owns.
 *
 * Every other write touches frontmatter, where a line is a key and a key is
 * replaceable. This one edits the **body** of a file the owner writes in by
 * hand, which is the same reason `updateBook` rewrites lines rather than
 * re-serialising: a tool that reformats your notes is a tool you stop pointing
 * at your vault.
 *
 * Two rules make it safe, both inherited rather than invented: it writes only
 * when the heading is **absent**, which is absent-only applied to a section and
 * is also what makes a re-run idempotent; and it never touches anything above
 * or after what it inserts. See docs/spec/metadata-merge.md §4.
 */
describe('insertBodySection', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  const note = async (name: string, contents: string): Promise<void> => {
    await mkdir(join(dir, 'Library'), { recursive: true });
    await writeFile(join(dir, 'Library', name), contents, 'utf8');
  };

  const read = async (name: string): Promise<string> =>
    readFile(join(dir, 'Library', name), 'utf8');

  const NOTE = ['---', 'type: book', 'title: A Book', '---', '', '![[cover.png]]', '', '## Notes', '', 'My own thoughts.', ''].join('\n');

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-body-'));
    vault = new ObsidianAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('inserts the section above the owner’s own notes', async () => {
    await note('a.md', NOTE);

    await vault.insertBodySection('Library/a.md', '## About', 'A blurb.');
    const after = await read('a.md');

    expect(after).toContain('## About\n\nA blurb.');
    // Above `## Notes`, so what the owner wrote stays where they left it and
    // the provider's prose does not sit underneath their own.
    expect(after.indexOf('## About')).toBeLessThan(after.indexOf('## Notes'));
    expect(after).toContain('My own thoughts.');
  });

  it('leaves the frontmatter byte for byte alone', async () => {
    await note('a.md', NOTE);

    await vault.insertBodySection('Library/a.md', '## About', 'A blurb.');
    const after = await read('a.md');

    expect(after.startsWith('---\ntype: book\ntitle: A Book\n---\n')).toBe(true);
  });

  it('writes nothing at all when the heading is already there', async () => {
    const withSection = NOTE.replace('## Notes', '## About\n\nThe blurb it already had.\n\n## Notes');
    await note('a.md', withSection);

    await vault.insertBodySection('Library/a.md', '## About', 'A different blurb.');

    // Idempotence is this rule, not a separate mechanism: run the whole pass
    // twice and the second run has nothing to do.
    expect(await read('a.md')).toBe(withSection);
  });

  it('appends when there is no ## Notes to sit above', async () => {
    await note('a.md', '---\ntype: book\ntitle: A Book\n---\n');

    await vault.insertBodySection('Library/a.md', '## About', 'A blurb.');

    expect(await read('a.md')).toBe('---\ntype: book\ntitle: A Book\n---\n\n## About\n\nA blurb.\n');
  });

  it('keeps CRLF files on CRLF', async () => {
    // The same care `updateBook` takes: a note written on Windows must not come
    // back with mixed line endings, which would show up as a whole-file diff.
    await note('a.md', NOTE.split('\n').join('\r\n'));

    await vault.insertBodySection('Library/a.md', '## About', 'A blurb.');
    const after = await read('a.md');

    expect(after).toContain('\r\n## About\r\n\r\nA blurb.');
    expect(/[^\r]\n/.test(after)).toBe(false);
  });

  it('refuses a note with no frontmatter rather than writing into a stranger', async () => {
    await note('plain.md', 'Just a note.\n');

    await expect(vault.insertBodySection('Library/plain.md', '## About', 'x')).rejects.toThrow(
      /frontmatter/,
    );
  });

  it('writes nothing when there is nothing to say', async () => {
    await note('a.md', NOTE);

    await vault.insertBodySection('Library/a.md', '## About', '   ');

    expect(await read('a.md')).toBe(NOTE);
  });
});
