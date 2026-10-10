import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spyOnWarn, type WarnSpy } from '../test-support.ts';
import { ObsidianAdapter } from './obsidian-adapter.ts';
import { notesHeadingAt } from './thoughts-section.ts';

// The disarm switched off, so the quote is the only thing between provider
// text and the owner's section, and `## Notes`'s lookup wrapped so a test can
// make the writer's one parse throw.
vi.mock('./thoughts-section.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./thoughts-section.ts')>();
  return {
    ...actual,
    disarmBodyText: (text: string) => text,
    notesHeadingAt: vi.fn(actual.notesHeadingAt),
  };
});

/**
 * The `## About` writer with the disarm switched off: what the quote alone
 * holds (N76, the accepted worst case of #424's cut of the before-and-after
 * read), and a parse that throws (N83).
 *
 * All text is invented for this file (ADR-0004).
 */
describe('the About writer, with the disarm switched off', () => {
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

  const warned = (): string => warn.lines.join('\n');

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-backstop-'));
    vault = new ObsidianAdapter(dir);
    warn = spyOnWarn();
  });

  afterEach(async () => {
    warn.restore();
    await rm(dir, { recursive: true, force: true });
  });

  describe('N76: what the quote alone holds', () => {
    it('writes a description holding `## Thoughts` inside the quote, where it opens no section', async () => {
      const path = await note('N76', '## Notes', '', 'Private.');

      expect(
        await vault.insertBodySection(path, '## About', `A blurb.\n\n## Thoughts\n\n${STRANGER}`),
      ).toBe(true);
      expect(await readFile(join(dir, path), 'utf8')).toContain('> ## Thoughts');
      expect(await vault.readPublicSection(path)).toBeUndefined();
      expect(warned()).toBe('');
    });

    it.each([
      ['plain prose', `A blurb, ${STRANGER}.`],
      ['a `## Thoughts` heading', `A blurb.\n\n## Thoughts\n\n${STRANGER}`],
      ['a `Thoughts` underlined by a lone dash', `A blurb.\n\nThoughts\n- \n\n${STRANGER}`],
      ['a link definition', `[target]: ${STRANGER}.md\n\nA blurb.`],
      ['a footnote definition', `A blurb.\n\n[^1]: ${STRANGER}`],
      ['an HTML block', `<div>\n${STRANGER}\n</div>`],
      ['a fence', `\`\`\`\n${STRANGER}\n\`\`\``],
    ])(
      'writes %s inside the quote, below the owner’s section, which ships unchanged',
      async (_, text) => {
        // The shapes the cut refusals used to refuse, N82's six among them,
        // now held by the quote alone: below the owner's section it changes
        // nothing they ship, and warns nothing (move 4 on #424, integrity F1
        // and F2).
        const path = await note('N76c', '## Thoughts', '', 'Mine.', '', '## Notes', '', 'Private.');

        expect(await vault.insertBodySection(path, '## About', text)).toBe(true);
        expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
        expect(warned()).toBe('');
      },
    );

    it.each([
      ['a `$$`', `A blurb with $$ in it, ${STRANGER}.`],
      ['a run of three backticks', `A blurb with a \`\`\` run, ${STRANGER}.`],
    ])(
      'writes a description holding %s above the owner’s section, which then withholds',
      async (_, text) => {
        // `## Notes` above the Thoughts, so the description lands above them
        // and a raw guard reads it: the owner's section withholds with a
        // warning, and nothing of the description ships (spec §3.2).
        const path = await note('N76b', '## Notes', '', 'Private.', '', '## Thoughts', '', 'Mine.');

        expect(await vault.insertBodySection(path, '## About', text)).toBe(true);
        expect(await vault.readPublicSection(path)).toBeUndefined();
        expect(warned()).toContain('stacks: withheld the Thoughts in Library/N76b.md');
        expect(warned()).not.toContain(STRANGER);
      },
    );
  });

  it('N83: refuses, warning by path and never the error, when a parse throws', async () => {
    // Round 6, unstated F2 and adversarial F3: one bad description costs only
    // its own book, never the rest of an `enrich` pass.
    const path = await note('N83', '## Thoughts', '', 'Mine.', '', '## Notes', '', 'Private.');
    const before = await readFile(join(dir, path), 'utf8');
    vi.mocked(notesHeadingAt).mockImplementationOnce(() => {
      throw new Error(`parser broke on ${STRANGER}`);
    });

    expect(await vault.insertBodySection(path, '## About', 'A blurb.')).toBe(false);
    expect(vi.mocked(notesHeadingAt)).toHaveBeenCalled();
    expect(await readFile(join(dir, path), 'utf8')).toBe(before);
    expect(warned()).toContain(`${path} — the parser failed on the note`);
    expect(warned()).not.toContain('parser broke');
    expect(warned()).not.toContain(STRANGER);
  });
});
