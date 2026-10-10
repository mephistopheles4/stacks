import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spyOnWarn, type WarnSpy } from '../test-support.ts';
import { ObsidianAdapter } from './obsidian-adapter.ts';
import { extractThoughts } from './thoughts-section.ts';

// The disarm switched off, so the writer's own checks are the only thing
// between provider text and the owner's section, and the extractor wrapped so
// a test can make one read throw.
vi.mock('./thoughts-section.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./thoughts-section.ts')>();
  return {
    ...actual,
    disarmBodyText: (text: string) => text,
    extractThoughts: vi.fn(actual.extractThoughts),
  };
});

/**
 * The `## About` writer's own checks, reached with the disarm switched off:
 * N76, a write that changes what the Thoughts ship; N82, a description that
 * would parse to a heading, a definition, HTML or code; N83, a parser error.
 * Round 5 of #411's review found the disarm's gaps one shape at a time, and
 * round 6 found the before-and-after read blind to a shape that lies inert
 * until the owner adds a `## Thoughts` later; these checks need no list.
 *
 * All text is invented for this file (ADR-0004).
 */
describe('the About writer’s own checks, with the disarm switched off', () => {
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

  /** Writes `text` and expects it refused with `reason`, the note untouched and the text unquoted. */
  async function expectRefused(path: string, text: string, reason: string): Promise<void> {
    const before = await readFile(join(dir, path), 'utf8');
    expect(await vault.insertBodySection(path, '## About', text)).toBe(false);
    expect(await readFile(join(dir, path), 'utf8')).toBe(before);
    expect(warned()).toContain(path);
    expect(warned()).toContain(reason);
    expect(warned()).not.toContain(STRANGER);
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-backstop-'));
    vault = new ObsidianAdapter(dir);
    warn = spyOnWarn();
  });

  afterEach(async () => {
    warn.restore();
    await rm(dir, { recursive: true, force: true });
  });

  describe('N76: a write that changes what the Thoughts ship', () => {
    it.each([
      ['a `$$`', `A blurb with $$ in it, ${STRANGER}.`],
      ['a run of three backticks', `A blurb with a \`\`\` run, ${STRANGER}.`],
    ])('refuses a description holding %s above the owner’s section', async (_, text) => {
      // `## Notes` above the Thoughts, so the description lands above them and
      // a raw guard reads it: it parses to no heading, so only this check sees it.
      const path = await note('N76', '## Notes', '', 'Private.', '', '## Thoughts', '', 'Mine.');
      await expectRefused(
        path,
        text,
        "it would change what the note's Thoughts ship, or why they are withheld",
      );
    });

    it('writes a description that changes nothing the Thoughts ship', async () => {
      const path = await note('N76b', '## Thoughts', '', 'Mine.', '', '## Notes', '', 'Private.');

      expect(await vault.insertBodySection(path, '## About', 'A blurb.')).toBe(true);
      expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
    });
  });

  describe('N82: a description that would parse to a heading, a definition, HTML or code', () => {
    const REASON = 'once written it would hold a heading, a definition, HTML or code';

    it.each([
      ['a `## Thoughts` heading', `A blurb.\n\n## Thoughts\n\n${STRANGER}`],
      ['a `Thoughts` underlined by a lone dash', `A blurb.\n\nThoughts\n- \n\n${STRANGER}`],
      ['a link definition', `[target]: ${STRANGER}.md\n\nA blurb.`],
      ['a footnote definition', `A blurb.\n\n[^1]: ${STRANGER}`],
      ['an HTML block', `<div>\n${STRANGER}\n</div>`],
      ['a fence', `\`\`\`\n${STRANGER}\n\`\`\``],
    ])('refuses %s, on a note with no Thoughts yet', async (_, text) => {
      // Before and after both read absent here, so only parsing the
      // description itself sees a shape that goes live once the owner adds a
      // `## Thoughts` (round 6, adversarial F2's later-heading case).
      const path = await note('N82', '## Notes', '', 'Private.');
      await expectRefused(path, text, REASON);
    });
  });

  it('N83: refuses, warning by path and never the error, when a parse throws', async () => {
    // Round 6, unstated F2 and adversarial F3: one bad description costs only
    // its own book, never the rest of an `enrich` pass.
    const path = await note('N83', '## Thoughts', '', 'Mine.', '', '## Notes', '', 'Private.');
    vi.mocked(extractThoughts).mockImplementationOnce(() => {
      throw new Error(`parser broke on ${STRANGER}`);
    });

    await expectRefused(path, 'A blurb.', 'the parser failed on the note');
    expect(warned()).not.toContain('parser broke');
  });
});
