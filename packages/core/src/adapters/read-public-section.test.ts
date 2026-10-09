import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spyOnWarn, type WarnSpy } from '../test-support.ts';
import { ObsidianAdapter } from './obsidian-adapter.ts';

/**
 * The adapter's seventh method: the only one that reads below the frontmatter.
 *
 * The extractor's rules are `thoughts-section.test.ts`'s. This holds what the
 * method adds around them — the warning that names a note and never quotes it,
 * the path it accepts, and the two writers that put text beside the section:
 * `stacks add`, which writes the heading, and `insertBodySection`, which writes
 * a provider's description and must never be able to open a section.
 *
 * All text is invented for this file (ADR-0004).
 */
describe('readPublicSection', () => {
  const CANARY = 'PRIVATE_REMAINDER_canary';

  let dir: string;
  let vault: ObsidianAdapter;
  let warn: WarnSpy;

  const note = async (name: string, ...body: string[]): Promise<string> => {
    await mkdir(join(dir, 'Library'), { recursive: true });
    const contents = ['---', 'type: book', `title: ${name}`, '---', '', ...body, ''].join('\n');
    await writeFile(join(dir, 'Library', `${name}.md`), contents, 'utf8');
    return `Library/${name}.md`;
  };

  const warned = (): string => warn.lines.join('\n');

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-thoughts-'));
    vault = new ObsidianAdapter(dir);
    warn = spyOnWarn();
  });

  afterEach(async () => {
    warn.restore();
    await rm(dir, { recursive: true, force: true });
  });

  it('returns the section’s paragraphs and nothing of the rest', async () => {
    const path = await note('A', '## Thoughts', '', 'Mine.', '', '## Notes', '', CANARY);

    expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
    expect(warned()).toBe('');
  });

  it('returns nothing, silently, for a note with no section', async () => {
    const path = await note('B', '## Notes', '', CANARY);

    expect(await vault.readPublicSection(path)).toBeUndefined();
    expect(warned()).toBe('');
  });

  it('warns naming the note, and never quoting it, when a section is withheld', async () => {
    const path = await note('C', '## Thoughts', '', `${CANARY} %% an aside %%`);

    expect(await vault.readPublicSection(path)).toBeUndefined();
    expect(warned()).toContain('Library/C.md');
    expect(warned()).not.toContain(CANARY);
    expect(warned()).not.toContain('an aside');
  });

  it('refuses a path that leaves the vault', async () => {
    await expect(vault.readPublicSection('../outside.md')).rejects.toThrow(/outside the vault/);
  });

  it('reads the note `stacks add` writes as having an empty section', async () => {
    // The heading is written for the owner to fill. Empty, it ships nothing and
    // says nothing — every new note would otherwise warn.
    const path = await vault.writeBook({ title: 'Fresh', cover: 'covers/fresh.jpg' });
    const written = await readFile(path, 'utf8');

    expect(written).toMatch(/!\[\[fresh\.jpg\]\]\n\n## Thoughts\n\n## Notes\n/);
    expect(await vault.readPublicSection('Library/Fresh.md')).toBeUndefined();
    expect(warned()).toBe('');
  });

  it('ships none of an `## About` the merge inserted after the Thoughts', async () => {
    const path = await note('D', '## Thoughts', '', 'Mine.', '', '## Notes', '', 'Private.');
    await vault.insertBodySection(path, '## About', `A provider blurb. ${CANARY}`);

    expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
  });

  describe('a description carrying a `## Thoughts` line and an unclosed fence', () => {
    const description = [
      'A provider blurb.',
      '## Thoughts',
      `${CANARY} in a stranger's words.`,
      '```',
      'and a fence it never closes',
    ].join('\n');

    it('ships nothing on a note with no Thoughts of its own', async () => {
      const path = await note('E', '## Notes', '', CANARY);
      await vault.insertBodySection(path, '## About', description);

      expect(await vault.readPublicSection(path)).toBeUndefined();
      expect(warned()).not.toContain(CANARY);
    });

    it('leaves the owner’s own Thoughts shipping, and none of the description', async () => {
      const path = await note('F', '## Thoughts', '', 'Mine.', '', '## Notes', '', CANARY);
      await vault.insertBodySection(path, '## About', description);

      expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
    });

    it('is written disarmed, so it reads as neither a heading nor a fence', async () => {
      const path = await note('G', '## Notes');
      await vault.insertBodySection(path, '## About', description);
      const written = await readFile(join(dir, path), 'utf8');

      expect(written).toContain('\\## Thoughts');
      expect(written).toContain('\\```');
      expect(written).not.toMatch(/^## Thoughts/m);
    });
  });
});
