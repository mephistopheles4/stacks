import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spyOnWarn, type WarnSpy } from '../test-support.ts';
import { ObsidianAdapter } from './obsidian-adapter.ts';

// The disarm switched off, so the writer's own last check is the only thing
// between provider text and the owner's section.
vi.mock('./thoughts-section.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./thoughts-section.ts')>()),
  disarmBodyText: (text: string) => text,
}));

/**
 * N76: `insertBodySection` refuses a write that would change what the note's
 * Thoughts ship, whatever the disarm missed. Round 5 of #411's review found the
 * disarm's gaps one shape at a time; this check reads the note before and after
 * and needs no list of shapes.
 *
 * All text is invented for this file (ADR-0004).
 */
describe('N76: the About writer refuses a write that changes what the Thoughts ship', () => {
  const STRANGER = 'STRANGER_words_canary';

  let dir: string;
  let vault: ObsidianAdapter;
  let warn: WarnSpy;

  const note = async (name: string, ...body: string[]): Promise<string> => {
    await mkdir(join(dir, 'Library'), { recursive: true });
    const contents = ['---', 'type: book', `title: ${name}`, '---', '', ...body, ''].join('\n');
    await writeFile(join(dir, 'Library', `${name}.md`), contents, 'utf8');
    return `Library/${name}.md`;
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-backstop-'));
    vault = new ObsidianAdapter(dir);
    warn = spyOnWarn();
  });

  afterEach(async () => {
    warn.restore();
    await rm(dir, { recursive: true, force: true });
  });

  it.each([
    ['opens a section on a note with none', ['## Notes', '', 'Private.']],
    ['withholds the owner’s section', ['## Notes', '', 'Private.', '', '## Thoughts', '', 'Mine.']],
  ])('refuses a description that %s, and writes nothing', async (_, body) => {
    const path = await note('N76', ...body);
    const before = await readFile(join(dir, path), 'utf8');

    const wrote = await vault.insertBodySection(
      path,
      '## About',
      `A blurb.\n\n## Thoughts\n\n${STRANGER}`,
    );

    expect(wrote).toBe(false);
    expect(await readFile(join(dir, path), 'utf8')).toBe(before);
    expect(warn.lines.join('\n')).toContain('Library/N76.md');
    expect(warn.lines.join('\n')).not.toContain(STRANGER);
  });

  it('writes a description that changes nothing the Thoughts ship', async () => {
    const path = await note('N76b', '## Thoughts', '', 'Mine.', '', '## Notes', '', 'Private.');

    expect(await vault.insertBodySection(path, '## About', 'A blurb.')).toBe(true);
    expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
  });
});
