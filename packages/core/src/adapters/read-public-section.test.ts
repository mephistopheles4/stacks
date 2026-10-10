import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spyOnWarn, type WarnSpy } from '../test-support.ts';
import { MAX_DESCRIPTION_CODE_POINTS, ObsidianAdapter } from './obsidian-adapter.ts';

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

  it('puts `## About` in the body even when the frontmatter holds a `## Notes` comment', async () => {
    await mkdir(join(dir, 'Library'), { recursive: true });
    const path = 'Library/Y.md';
    const contents = [
      '---',
      'type: book',
      '## Notes',
      'title: Y',
      '---',
      '',
      '## Thoughts',
      '',
      'Mine.',
      '',
    ];
    await writeFile(join(dir, path), contents.join('\n'), 'utf8');

    await vault.insertBodySection(path, '## About', 'title: Not Yours');
    const written = await readFile(join(dir, path), 'utf8');

    expect(written.indexOf('## About')).toBeGreaterThan(written.lastIndexOf('---'));
    expect((await vault.listBooks()).map((book) => book.title)).toEqual(['Y']);
    expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
  });

  it('puts `## About` above `## Notes`, never above a `### Notes` inside the Thoughts', async () => {
    const path = await note(
      'Z',
      '## Thoughts',
      '',
      'First.',
      '',
      '### Notes',
      '',
      'Later.',
      '',
      '## Notes',
      '',
      CANARY,
    );
    await vault.insertBodySection(path, '## About', 'A blurb.');

    expect(await vault.readPublicSection(path)).toEqual(['First.', 'Notes', 'Later.']);
  });

  it('puts `## About` above the real `## Notes`, never above a fenced one', async () => {
    const path = await note('F2', '## Notes', '', '```', '## Notes', '```', '', 'Private.');
    await vault.insertBodySection(path, '## About', 'A blurb.');
    const written = await readFile(join(dir, path), 'utf8');

    // Above the first, unfenced `## Notes` — the fenced line further down is code.
    expect(written.indexOf('## About')).toBeLessThan(written.indexOf('## Notes'));
    expect(written.indexOf('## About')).toBeLessThan(written.indexOf('```'));
  });

  it('skips a fenced `## Notes` that comes first, and lands above the real one', async () => {
    const path = await note('F3', '```', '## Notes', '```', '', '## Notes', '', 'Private.');
    await vault.insertBodySection(path, '## About', 'A blurb.');
    const written = await readFile(join(dir, path), 'utf8');

    expect(written.indexOf('## About')).toBeGreaterThan(written.lastIndexOf('```'));
    expect(written.indexOf('## About')).toBeLessThan(written.lastIndexOf('## Notes'));
  });

  it('writes a description split by lone CRs disarmed, so it opens no section', async () => {
    const CR = String.fromCharCode(13);
    const path = await note('H', '## Notes', '', 'Private.');
    await vault.insertBodySection(path, '## About', ['A blurb.', '## Thoughts', CANARY].join(CR));
    const written = await readFile(join(dir, path), 'utf8');

    expect(written).toContain('\\## Thoughts');
    expect(written).not.toContain(CR);
    expect(await vault.readPublicSection(path)).toBeUndefined();
  });

  it('leaves the owner’s Thoughts shipping below a description holding markup', async () => {
    // Notes above Thoughts, the shape an older hand-made note can have, so the
    // description lands above the section.
    const path = await note('M', '## Notes', '', 'Private.', '', '## Thoughts', '', 'Mine.');
    await vault.insertBodySection(path, '## About', 'A <!-- comment and <script> and %%aside%%.');

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
      expect(written).toContain('&#96;&#96;&#96;');
      expect(written).not.toMatch(/^## Thoughts/m);
    });
  });

  describe('N17: a description holding a `## Thoughts` line, a `Thoughts` setext pair and an unclosed fence', () => {
    const description = [
      'A provider blurb.',
      '## Thoughts',
      `${CANARY} in a stranger's words.`,
      '',
      'Thoughts',
      '---',
      `${CANARY} under a setext pair.`,
      '```',
      'and a fence it never closes',
    ].join('\n');

    it('ships none of it on a note with no Thoughts of its own, and opens no section', async () => {
      const path = await note('N17a', '## Notes', '', CANARY);
      await vault.insertBodySection(path, '## About', description);

      expect(await vault.readPublicSection(path)).toBeUndefined();
      // No warning: the disarmed text holds no section to withhold. A section
      // withheld only by luck, as a duplicate, would warn here.
      expect(warned()).toBe('');
    });

    it('leaves the owner’s Thoughts shipping, and none of the description', async () => {
      const path = await note('N17b', '## Thoughts', '', 'Mine.', '', '## Notes', '', CANARY);
      await vault.insertBodySection(path, '## About', description);

      expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
    });
  });

  describe('N72: a description over the write cap', () => {
    it('is not written, and says so naming the note, never quoting it', async () => {
      const path = await note('N72', '## Thoughts', '', 'Mine.', '', '## Notes', '', 'Private.');
      const before = await readFile(join(dir, path), 'utf8');
      const long = `${CANARY} ${'*_'.repeat(MAX_DESCRIPTION_CODE_POINTS / 2)}`;

      expect(await vault.insertBodySection(path, '## About', long)).toBe(false);
      expect(await readFile(join(dir, path), 'utf8')).toBe(before);
      expect(warned()).toContain('Library/N72.md');
      expect(warned()).not.toContain(CANARY);
      expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
    });

    it('is written at exactly the cap, counted in code points', async () => {
      const path = await note('N72b', '## Notes', '', 'Private.');
      const exact = '\u{1F4DA}'.repeat(MAX_DESCRIPTION_CODE_POINTS);

      expect(await vault.insertBodySection(path, '## About', exact)).toBe(true);
      expect(warned()).toBe('');
    });
  });

  describe('N75: a description under the write cap that the disarm carries past the body cap', () => {
    /** The note's body as the extractor counts it: everything after the closing `---` line. */
    const bodyOf = (source: string): string => source.slice(source.indexOf('\n---\n') + 5);
    const privateNotes = 'x'.repeat(2_500);

    it.each([
      ['dollar signs', `${CANARY} ${'$'.repeat(3_600)}`],
      ['runs of three backticks', `${CANARY} ${'``` '.repeat(1_200)}`],
    ])('is not written when it is dense in %s, and the Thoughts keep shipping', async (_, text) => {
      const path = await note('N75', '## Thoughts', '', 'Mine.', '', '## Notes', '', privateNotes);
      const before = await readFile(join(dir, path), 'utf8');
      expect([...text].length).toBeLessThanOrEqual(MAX_DESCRIPTION_CODE_POINTS);

      expect(await vault.insertBodySection(path, '## About', text)).toBe(false);
      expect(await readFile(join(dir, path), 'utf8')).toBe(before);
      expect(warned()).toContain('Library/N75.md');
      expect(warned()).not.toContain(CANARY);
      expect(warned()).not.toContain('$$');
      expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
    });

    it('is written when the body lands at exactly the cap, and refused one code point over', async () => {
      // Long enough that the room left is under the write cap.
      const longNotes = 'x'.repeat(15_000);
      const path = await note('N75b', '## Thoughts', '', 'Mine.', '', '## Notes', '', longNotes);
      const before = await readFile(join(dir, path), 'utf8');
      // `## About`, a blank line, the text, its line ending and the blank line
      // the writer leaves above `## Notes`.
      const room = 20_000 - [...bodyOf(before)].length - '## About\n\n'.length - '\n\n'.length;
      expect(room).toBeLessThan(MAX_DESCRIPTION_CODE_POINTS);

      expect(await vault.insertBodySection(path, '## About', 'a'.repeat(room + 1))).toBe(false);
      expect(await vault.insertBodySection(path, '## About', 'a'.repeat(room))).toBe(true);
      expect([...bodyOf(await readFile(join(dir, path), 'utf8'))].length).toBe(20_000);
      expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
    });

    it('is not written into a note already over the body cap', async () => {
      // Over the cap the body is not parsed, so `## Notes` cannot be found and
      // the text would land under the owner's own.
      const path = await note('N75c', '## Notes', '', 'x'.repeat(20_000));
      const before = await readFile(join(dir, path), 'utf8');

      expect(await vault.insertBodySection(path, '## About', 'A blurb.')).toBe(false);
      expect(await readFile(join(dir, path), 'utf8')).toBe(before);
      expect(warned()).toContain('Library/N75c.md');
    });
  });

  it('N73: a description that opens with a link definition changes nothing the owner ships', async () => {
    const path = await note(
      'N73',
      '## Notes',
      '',
      'Private.',
      '',
      '## Thoughts',
      '',
      'See [[target|alias]] and [label] here.',
    );
    const description = [
      '[target|alias]: https://example.invalid',
      '[label]: x.md',
      'A blurb.',
    ].join('\n');
    await vault.insertBodySection(path, '## About', description);

    expect(await vault.readPublicSection(path)).toEqual(['See alias and [label] here.']);
  });

  it('N66: leaves the owner’s Thoughts shipping below a description that would trip a raw guard', async () => {
    // `## About` lands above `## Notes`, which sits above the Thoughts here, so
    // every raw guard that reads above the section reads the description.
    const description = [
      'A blurb with a mid-line ``` run in it.',
      'It says $$ twice.',
      'Thoughts',
      '   ---',
      'And a [^x] call.',
      '',
      '[^x]: a definition of its own',
    ].join('\n');
    const path = await note('N66', '## Notes', '', 'Private.', '', '## Thoughts', '', 'Mine [^x].');
    await vault.insertBodySection(path, '## About', description);

    expect(await vault.readPublicSection(path)).toEqual(['Mine [^x].']);
    expect(warned()).toBe('');
  });
});
