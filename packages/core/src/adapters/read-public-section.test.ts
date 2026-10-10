import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spyOnWarn, type WarnSpy } from '../test-support.ts';
import { MAX_DESCRIPTION_CODE_POINTS, ObsidianAdapter } from './obsidian-adapter.ts';

/**
 * The adapter's seventh method: the only one that returns text from below the
 * frontmatter.
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

    it('is written at exactly the cap as it lands, counted in code points', async () => {
      const path = await note('N72b', '## Notes', '', 'Private.');
      // The quote's `> ` lands with it (D22).
      const exact = '\u{1F4DA}'.repeat(MAX_DESCRIPTION_CODE_POINTS - 2);

      expect(await vault.insertBodySection(path, '## About', exact)).toBe(true);
      expect(warned()).toBe('');
    });
  });

  describe('N75: a description under the write cap that the disarm carries past the body cap', () => {
    /** The note's body as the extractor counts it: everything after the closing `---` line. */
    const bodyOf = (source: string): string => source.slice(source.indexOf('\n---\n') + 5);
    const privateNotes = 'x'.repeat(13_000);
    const OVER_BODY = 'the note would be over 20000 characters';

    it.each([
      // Each stays under the write cap as it lands, so the body cap answers.
      ['dollar signs', `${CANARY} ${'$'.repeat(1_500)}`],
      ['runs of three backticks', `${CANARY} ${'``` '.repeat(450)}`],
    ])('is not written when it is dense in %s, and the Thoughts keep shipping', async (_, text) => {
      const path = await note('N75', '## Thoughts', '', 'Mine.', '', '## Notes', '', privateNotes);
      const before = await readFile(join(dir, path), 'utf8');

      expect(await vault.insertBodySection(path, '## About', text)).toBe(false);
      expect(await readFile(join(dir, path), 'utf8')).toBe(before);
      expect(warned()).toContain('Library/N75.md');
      expect(warned()).toContain(OVER_BODY);
      expect(warned()).not.toContain(CANARY);
      expect(warned()).not.toContain('$$');
      expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
    });

    it('is written when the body lands at exactly the cap, and refused one code point over', async () => {
      // Long enough that the room left is under the write cap.
      const longNotes = 'x'.repeat(15_000);
      const path = await note('N75b', '## Thoughts', '', 'Mine.', '', '## Notes', '', longNotes);
      const before = await readFile(join(dir, path), 'utf8');
      // `## About`, a blank line, the quote's `> `, the text, its line ending
      // and the blank line the writer leaves above `## Notes`.
      const room = 20_000 - [...bodyOf(before)].length - '## About\n\n> '.length - '\n\n'.length;
      expect(room).toBeLessThan(MAX_DESCRIPTION_CODE_POINTS);

      expect(await vault.insertBodySection(path, '## About', 'a'.repeat(room + 1))).toBe(false);
      expect(warned()).toContain(OVER_BODY);
      expect(await vault.insertBodySection(path, '## About', 'a'.repeat(room))).toBe(true);
      expect([...bodyOf(await readFile(join(dir, path), 'utf8'))].length).toBe(20_000);
      expect(await vault.readPublicSection(path)).toEqual(['Mine.']);
    });

    it('is not written into a note already over the body cap', async () => {
      // Over the cap the body is not parsed, so `## Notes` cannot be found and
      // the text would land under the owner's own; the note as written is over
      // the cap too, so the body cap answers.
      const path = await note('N75c', '## Notes', '', 'x'.repeat(20_000));
      const before = await readFile(join(dir, path), 'utf8');

      expect(await vault.insertBodySection(path, '## About', 'A blurb.')).toBe(false);
      expect(await readFile(join(dir, path), 'utf8')).toBe(before);
      expect(warned()).toContain('Library/N75c.md');
      expect(warned()).toContain(OVER_BODY);
    });
  });

  describe('N80: the write cap counts the text as it lands, disarmed and quoted (D17, D22)', () => {
    const OVER_CAP = 'the text is over 8000 characters as it would be written';

    it('refuses a description the disarm carries past the cap, on a fresh note', async () => {
      // Round 6, adversarial F1: under the cap as sent, it would fill a fresh
      // note to just under 20,000, and the owner's first Thoughts would tip it.
      const path = await note('N80', '## Thoughts', '', '## Notes', '');
      const before = await readFile(join(dir, path), 'utf8');

      expect(await vault.insertBodySection(path, '## About', '$'.repeat(3_990))).toBe(false);
      expect(await readFile(join(dir, path), 'utf8')).toBe(before);
      expect(warned()).toContain('Library/N80.md');
      expect(warned()).toContain(OVER_CAP);
    });

    it('writes exactly the cap as it lands, and refuses one code point more', async () => {
      const path = await note('N80b', '## Thoughts', '', '## Notes', '');

      // Each `$` is written as five characters, and the quote's `> ` as two.
      const exact = `${'$'.repeat(1_599)}aaa`;
      expect(await vault.insertBodySection(path, '## About', `${exact}a`)).toBe(false);
      expect(warned()).toContain(OVER_CAP);
      expect(await vault.insertBodySection(path, '## About', exact)).toBe(true);
    });
  });

  describe('N89: a description of many short lines, counted as it lands (D22)', () => {
    const OVER_CAP = 'the text is over 8000 characters as it would be written';

    it.each([
      ['an LF note', 'N89lf', '\n'],
      ['a CRLF note', 'N89crlf', '\r\n'],
    ])('writes exactly 8,000 on %s, and refuses one more', async (_, name, eol) => {
      await mkdir(join(dir, 'Library'), { recursive: true });
      const contents = ['---', 'type: book', `title: ${name}`, '---', '', '## Notes', ''].join(eol);
      await writeFile(join(dir, 'Library', `${name}.md`), contents, 'utf8');
      const path = `Library/${name}.md`;
      // A thousand lines of `ab` land as `> ab` each, with the note's line
      // ending between them; the last line is topped up to land at 8,000.
      const landed = 1_000 * 4 + 999 * eol.length;
      const text = [...Array<string>(999).fill('ab'), `ab${'c'.repeat(8_000 - landed)}`];

      expect(await vault.insertBodySection(path, '## About', `${text.join('\n')}c`)).toBe(false);
      expect(warned()).toContain(path);
      expect(warned()).toContain(OVER_CAP);
      expect(await readFile(join(dir, path), 'utf8')).toBe(contents);
      expect(await vault.insertBodySection(path, '## About', text.join('\n'))).toBe(true);
      const written = await readFile(join(dir, path), 'utf8');
      const about = written.slice(
        written.indexOf(`> ab`),
        written.lastIndexOf(`${eol}${eol}## Notes`),
      );
      expect([...about].length).toBe(8_000);
    });
  });

  describe('N93: a note holding a line ending other than LF or CRLF (refusal 2)', () => {
    const CR = String.fromCharCode(13);

    it.each([
      [
        'inside its Thoughts',
        ['## Thoughts', '', `Mine.${CR}More.`, '', '## Notes', '', 'Private.'],
      ],
      ['before `## Notes`', ['Intro.', `Owner line.${CR}More.`, '## Notes', '', 'Private.']],
      ['as U+2028', ['## Thoughts', '', `Mine.${String.fromCodePoint(0x2028)}More.`, '## Notes']],
    ])('is not written, the file byte for byte unchanged: %s', async (_, body) => {
      const path = await note('N93', ...body);
      const before = await readFile(join(dir, path), 'utf8');

      expect(await vault.insertBodySection(path, '## About', 'A blurb.')).toBe(false);
      expect(await readFile(join(dir, path), 'utf8')).toBe(before);
      expect(warned()).toContain('Library/N93.md');
      expect(warned()).toContain('the note holds a line ending other than LF or CRLF');
    });

    it('writes into a note whose own Thoughts withhold for another reason (D18’s cost removed)', async () => {
      const path = await note('N93b', '## Thoughts', '', 'From $1 to $2.', '', '## Notes', '');

      expect(await vault.insertBodySection(path, '## About', 'A blurb.')).toBe(true);
      expect(warned()).toBe('');
    });
  });

  it('N94: does not write into a note whose body starts with a byte-order mark', async () => {
    await mkdir(join(dir, 'Library'), { recursive: true });
    const BOM = String.fromCodePoint(0xfeff);
    const contents = `---\ntype: book\ntitle: N94\n---\n${BOM}Intro.\nOwner line.\n## Notes\n\nPrivate.\n`;
    await writeFile(join(dir, 'Library', 'N94.md'), contents, 'utf8');

    expect(await vault.insertBodySection('Library/N94.md', '## About', 'A blurb.')).toBe(false);
    expect(await readFile(join(dir, 'Library', 'N94.md'), 'utf8')).toBe(contents);
    expect(warned()).toContain('Library/N94.md — the parser failed on the note');
  });

  describe('N86 and N87: a description is written as a quote (D20)', () => {
    const description = `A provider blurb.\n\nIts second paragraph. ${CANARY}`;

    it('N86: quotes every line, an empty one as `>`, and the owner’s later Thoughts ship alone', async () => {
      const path = await vault.writeBook({ title: 'N86' });
      await vault.insertBodySection(path, '## About', description);
      const written = await readFile(path, 'utf8');

      expect(written).toContain(
        `## Thoughts\n\n## About\n\n> A provider blurb.\n>\n> Its second paragraph. ${CANARY}\n\n## Notes`,
      );
      expect(await vault.readPublicSection('Library/N86.md')).toBeUndefined();
      await writeFile(path, written.replace('## Thoughts\n', '## Thoughts\n\nMine.\n'), 'utf8');
      expect(await vault.readPublicSection('Library/N86.md')).toEqual(['Mine.']);
      expect(warned()).toBe('');
    });

    it.each([
      ['demoted to `###`', (text: string) => text.replace('## About', '### About')],
      ['deleted', (text: string) => text.replace('## About\n\n', '')],
    ])('N87: withholds as a quote when the heading is %s', async (_, edit) => {
      const path = await vault.writeBook({ title: 'N87' });
      await vault.insertBodySection(path, '## About', description);
      await writeFile(path, edit(await readFile(path, 'utf8')), 'utf8');

      expect(await vault.readPublicSection('Library/N87.md')).toBeUndefined();
      expect(warned()).toContain('Library/N87.md — it holds a quote or a callout');
      expect(warned()).not.toContain(CANARY);
    });
  });

  it('N90: writes an image or an embed with the `[` after `!` as a reference', async () => {
    const path = await note('N90', '## Notes', '', 'Private.');
    await vault.insertBodySection(
      path,
      '## About',
      'See ![x](https://example.invalid/p.png) and ![[file.png]].',
    );
    const written = await readFile(join(dir, path), 'utf8');

    expect(written).toContain(
      '> See !&#91;x](https://example.invalid/p.png) and !&#91;[file.png]].',
    );
    expect(written).not.toContain('![');
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
