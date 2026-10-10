import { parse, postprocess, preprocess } from 'micromark';
import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_CODE_POINTS,
  MAX_SECTION_CODE_POINTS,
  atxHeading,
  disarmBodyText,
  extractThoughts,
  notesHeadingAt,
  oddLineEnding,
  quoteBodyText,
} from './thoughts-section.ts';

/**
 * The Thoughts extractor, case by case.
 *
 * Every boundary and withhold shape from spec §3.1, #367 and #368 has a test
 * here with the canary placed **where it would leak** — below the section, in
 * the hidden part, past the line a wrong boundary would stop at. A test that
 * only checked the happy output could pass over an extractor that also shipped
 * the private remainder.
 *
 * All text is invented for this file (ADR-0004).
 */

const CANARY = 'PRIVATE_REMAINDER_canary';

/** Step 6's reason, which every fence and backtick run now gives (spec §3.1.3). */
const FENCE_RUN = 'a run of three backticks or tildes sits in or above the section';

/** Every token type the parser reads in `text`, at any depth. */
function tokenTypes(text: string): Set<string> {
  const events = postprocess(
    parse()
      .document()
      .write(preprocess()(text, undefined, true)),
  );
  return new Set(events.map(([, token]) => token.type as string));
}

/** A note: frontmatter, then the body lines given. */
function note(...body: string[]): string {
  return ['---', 'type: book', 'title: A Book', '---', '', ...body, ''].join('\n');
}

/** The paragraphs a note ships, or fails the test naming what came back. */
function shipped(source: string): readonly string[] {
  const result = extractThoughts(source);
  if (result.kind !== 'shipped') throw new Error(`expected paragraphs, got ${result.kind}`);
  return result.paragraphs;
}

function expectNoCanary(source: string): void {
  expect(JSON.stringify(extractThoughts(source))).not.toContain(CANARY);
}

describe('the section boundary', () => {
  it('ships the section between `## Thoughts` and the next `##`, and nothing below it', () => {
    const source = note('## Thoughts', '', 'A slow book.', '', '## Notes', '', CANARY);

    expect(shipped(source)).toEqual(['A slow book.']);
    expectNoCanary(source);
  });

  it('ends at a `#` heading', () => {
    const source = note('## Thoughts', '', 'Kept.', '', '# Private', '', CANARY);
    expect(shipped(source)).toEqual(['Kept.']);
  });

  it('runs to the end of the file when nothing follows', () => {
    expect(shipped(note('## Thoughts', '', 'One.', '', 'Two.'))).toEqual(['One.', 'Two.']);
  });

  it('keeps a `###` subheading inside the section, its marks stripped', () => {
    const source = note('## Thoughts', '', '### On rivers', '', 'Wide.', '', '## Notes', CANARY);
    expect(shipped(source)).toEqual(['On rivers', 'Wide.']);
  });

  it('ignores trailing whitespace on the heading', () => {
    expect(shipped(note('## Thoughts \t ', '', 'Kept.'))).toEqual(['Kept.']);
  });

  it.each([
    ['## thoughts'],
    ['## THOUGHTS'],
    ['### Thoughts'],
    ['# Thoughts'],
    ['##Thoughts'],
    ['## Thoughts#'],
    ['## Thoughts and more'],
  ])('is case-sensitive and level-exact: %s is not the section', (heading) => {
    const source = note(heading, '', CANARY);
    expect(extractThoughts(source)).toEqual({ kind: 'absent' });
  });

  it.each([
    ['three spaces of indent', '   ## Notes'],
    ['a tab after the hashes', '##\tNotes'],
    ['closing hashes', '## Notes ##'],
    ['a bare `##`', '##'],
    ['a bare `#`', '#'],
    ['a `#` heading with a tab', '#\tPrivate'],
  ])('recognises a following heading as broadly as ATX allows: %s', (_, heading) => {
    const source = note('## Thoughts', '', 'Kept.', '', heading, '', CANARY);

    expect(shipped(source)).toEqual(['Kept.']);
    expectNoCanary(source);
  });

  it('starts at a heading written with optional ATX decoration', () => {
    expect(shipped(note('  ## Thoughts ##', '', 'Kept.'))).toEqual(['Kept.']);
  });

  it('does not read a `#tag` line as a heading', () => {
    expect(shipped(note('## Thoughts', '', '#reread', '', 'Kept.'))).toEqual(['#reread', 'Kept.']);
  });

  it('withholds a note with two `## Thoughts` headings, shipping neither', () => {
    const source = note('## Thoughts', '', 'First.', '', '## Notes', '', '## Thoughts', '', CANARY);
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
  });

  it('does not count a fenced `## Thoughts` as a heading, and the fence above withholds the real one', () => {
    // Since #411's parser amendment, any fence run above the section withholds
    // it (spec §3.1.1, step 6): Obsidian may draw a block's extent differently.
    const source = note(
      '## Notes',
      '',
      '```',
      '## Thoughts',
      CANARY,
      '```',
      '',
      '## Thoughts',
      '',
      'Kept.',
    );
    expect(extractThoughts(source)).toEqual({
      kind: 'withheld',
      reason: 'a run of three backticks or tildes sits in or above the section',
    });
  });

  it('finds no section when a fence opened above it is never closed', () => {
    const source = note('```', '', '## Thoughts', '', CANARY);
    expect(extractThoughts(source)).toEqual({ kind: 'absent' });
  });

  it('scans only below the frontmatter', () => {
    // A YAML comment line reading `## Thoughts` is heading-shaped, so a scan that
    // started at the top of the file would open a section on it.
    const source = [
      '---',
      'type: book',
      '## Thoughts',
      'title: A Book',
      '---',
      '',
      CANARY,
      '',
    ].join('\n');
    expect(extractThoughts(source)).toEqual({ kind: 'absent' });
  });

  it('finds nothing in a file with no frontmatter block', () => {
    expect(extractThoughts(`## Thoughts\n\n${CANARY}\n`)).toEqual({ kind: 'absent' });
  });

  it('reads CRLF notes the same way', () => {
    const source = note('## Thoughts', '', 'Kept.', '', '## Notes', '', CANARY).replace(
      /\n/g,
      '\r\n',
    );
    expect(shipped(source)).toEqual(['Kept.']);
  });

  it('leaves a cover embed above the section out of it', () => {
    const source = note('![[cover.jpg]]', '', '## Thoughts', '', 'Kept.', '', '## Notes', CANARY);
    expect(shipped(source)).toEqual(['Kept.']);
  });
});

describe('the allowlist: only plain prose ships (ADR-0106)', () => {
  it.each([
    ['a bare backtick fence', ['```', CANARY, '```']],
    ['a bare tilde fence', ['~~~', CANARY, '~~~']],
    ['a fence tagged text', ['```text', CANARY, '```']],
    ['a fence tagged for a renderer', ['```dataview', `LIST FROM "${CANARY}"`, '```']],
    ['a longer tilde fence with an info string', ['~~~~ x', CANARY, '~~~~']],
  ])('withholds %s, closed or not', (_, lines) => {
    const source = note('## Thoughts', '', 'Before.', '', ...lines, '', 'After.');
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason: FENCE_RUN });
    expectNoCanary(source);
  });

  it('withholds a fence whose closer sits below a `##` it swallowed', () => {
    const source = note('## Thoughts', '', '```', '', '## Notes', '', CANARY, '```');
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    expectNoCanary(source);
  });

  it.each([
    ['inline code', `Some \`${CANARY}\` here.`, 'it holds code'],
    ['an inline query', `Read \`= [[${CANARY}]].rating\` times.`, 'it holds code'],
    ['a backtick run that is no fence', `\`\`\`a\`b ${CANARY}`, FENCE_RUN],
  ])('withholds %s', (_, line, reason) => {
    const source = note('## Thoughts', '', line, '', '## Notes');
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason });
    expectNoCanary(source);
  });

  it.each([
    ['a quote', ['> ' + CANARY], 'it holds a quote or a callout'],
    ['a callout', ['> [!note] A title', `> ${CANARY}`], 'it holds a quote or a callout'],
    ['a heading inside a quote', ['> ## Notes', `> ${CANARY}`], 'it holds a quote or a callout'],
    [
      'a query fence inside a callout',
      ['> [!note]', '> ```dataview', `> ${CANARY}`, '> ```'],
      FENCE_RUN,
    ],
  ])('withholds %s', (_, lines, reason) => {
    const source = note('## Thoughts', '', 'Kept?', '', ...lines);
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason });
    expectNoCanary(source);
  });

  it.each([
    ['a nested list', ['- an item', `  - ${CANARY}`], 'it holds a nested list'],
    ['indented code', [`    ${CANARY}`], 'it holds indented code'],
  ])('withholds %s', (_, lines, reason) => {
    const source = note('## Thoughts', '', 'Kept?', '', ...lines);
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason });
    expectNoCanary(source);
  });

  it('ships a list continuation as part of its item, as reading view shows it (D4)', () => {
    const source = note('## Thoughts', '', 'Kept.', '', '- an item', '', '    more of it');
    expect(shipped(source)).toEqual(['Kept.', '- an item\nmore of it']);
  });

  it('ships an indented subheading’s text, as reading view shows it (D5)', () => {
    expect(shipped(note('## Thoughts', '', 'Kept.', '', '   ### Part'))).toEqual(['Kept.', 'Part']);
  });

  it('withholds a heading indented under a list item, since CommonMark keeps it in the item (D1)', () => {
    // The indented `##` line is a near-miss heading to step 7's raw guard,
    // which reads before step 8 would find the heading inside the item.
    const source = note('## Thoughts', '', '- an item', '  ## Notes', CANARY);
    expect(extractThoughts(source)).toEqual({
      kind: 'withheld',
      reason: 'it holds a line that may read as a heading',
    });
    expectNoCanary(source);
  });

  it.each([
    ['in a list item', [`- [x]: vault/path "${CANARY}"`], 'it holds a link definition'],
    ['with a label over two lines', ['[a', `b]: ${CANARY}`], 'it holds a link definition'],
    ['for a footnote', [`[^1]: ${CANARY}`], 'it holds a footnote definition'],
  ])('withholds a definition %s', (_, lines, reason) => {
    const source = note('## Thoughts', '', 'Kept?', '', ...lines);
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason });
    expectNoCanary(source);
  });

  it('withholds a table', () => {
    const source = note('## Thoughts', '', `| a | ${CANARY} |`, '| --- | --- |', '| 1 | 2 |');
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason: 'it holds a table' });
  });

  it.each([
    [
      'inline math',
      [`A value $x % ${CANARY}$ here.`],
      'it holds two dollar signs, which may be math',
    ],
    ['block math', ['$$', `% ${CANARY}`, '$$'], 'a `$$` sits in or above the section'],
  ])('withholds %s', (_, lines, reason) => {
    const source = note('## Thoughts', '', ...lines);
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason });
    expectNoCanary(source);
  });

  it('ships a single dollar sign, and withholds two whatever escapes them (D2)', () => {
    expect(shipped(note('## Thoughts', '', 'It cost $20.'))).toEqual(['It cost $20.']);
    expect(extractThoughts(note('## Thoughts', '', 'It cost $20, or \\$5 and \\$6.'))).toEqual({
      kind: 'withheld',
      reason: 'it holds two dollar signs, which may be math',
    });
  });

  it('ships one level of list at the margin, with its marks, a list per marker', () => {
    // CommonMark starts a new list when the bullet character changes.
    expect(shipped(note('## Thoughts', '', '- one', '* two', '+ three', '1. four'))).toEqual([
      '- one',
      '* two',
      '+ three',
      '1. four',
    ]);
  });
});

describe('fence state above the section', () => {
  it.each([
    ['an info string', '```js'],
    ['text before the run', 'see ```'],
    ['text after the run', '``` and more'],
  ])('a fence is not closed by a closer-shaped line with %s', (_, closer) => {
    // A fence under `## Notes` that this line wrongly closed would let the fenced
    // `## Thoughts` below it open a section and ship the canary.
    const source = note('## Notes', '', '```', closer, '## Thoughts', '', CANARY, '```');
    expect(extractThoughts(source)).toEqual({ kind: 'absent' });
  });

  it.each([
    ['a shorter run', ['````', '```']],
    ['a backtick run inside a tilde fence', ['~~~', '```']],
    ['a tilde run inside a backtick fence', ['```', '~~~']],
  ])('a fence is not closed by %s', (_, [opener, closer]) => {
    const source = note('## Notes', '', opener ?? '', closer ?? '', '## Thoughts', '', CANARY);
    expect(extractThoughts(source)).toEqual({ kind: 'absent' });
  });

  it('opens a tilde fence whose info string holds a backtick', () => {
    // Only a backtick fence refuses a backtick in its info string.
    const source = note('## Notes', '', '~~~ a`b', '## Thoughts', '', CANARY, '~~~');
    expect(extractThoughts(source)).toEqual({ kind: 'absent' });
  });
});

describe('setext headings', () => {
  it.each([['==='], ['---'], ['-'], ['  ===  ']])(
    'withholds a paragraph line underlined with %s',
    (underline) => {
      const source = note('## Thoughts', '', 'Kept?', underline, '', CANARY);
      expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    },
  );

  it('ships a thematic break after a blank line', () => {
    expect(shipped(note('## Thoughts', '', 'One.', '', '---', '', 'Two.'))).toEqual([
      'One.',
      '---',
      'Two.',
    ]);
  });

  it('ships a thematic break under a subheading', () => {
    const source = note('## Thoughts', '', '### Part', '---', 'More.');
    expect(shipped(source)).toEqual(['Part', '---', 'More.']);
  });

  it('withholds an underline straight under the heading’s first line', () => {
    // No blank line after the heading, so the paragraph the underline belongs to
    // is the section's first line. A setext heading is level 1 or 2, so it ends
    // the section, and step 4 withholds.
    const source = note('## Thoughts', 'Private heading', '===', CANARY);
    expect(extractThoughts(source)).toEqual({
      kind: 'withheld',
      reason: 'a setext heading ends the section',
    });
    expectNoCanary(source);
  });

  it('ships a line that only ends in a dash', () => {
    expect(shipped(note('## Thoughts', '', 'One line', 'a dash at the end -'))).toEqual([
      'One line\na dash at the end -',
    ]);
  });
});

describe('hidden text withholds the whole section', () => {
  it.each([
    ['an inline `%%` comment', `Seen %%${CANARY}%% seen.`],
    ['an unclosed `%%`', `Seen %% ${CANARY}`],
    ['an HTML comment', `Seen <!-- ${CANARY} --> seen.`],
    ['a stray `-->`', `Seen ${CANARY} --> seen.`],
    ['a stray `--!>`, which closes a comment too', `Seen ${CANARY} --!> seen.`],
  ])('%s', (_, line) => {
    const source = note('## Thoughts', '', line, '', '## Notes');
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    expectNoCanary(source);
  });

  describe('a line ending other than a newline', () => {
    // Built from code points: a lone CR and U+2028 are invisible in source, and
    // one written raw inside a regex or string literal ends the line there.
    const CR = String.fromCharCode(13);
    const LS = String.fromCharCode(0x2028);
    const PS = String.fromCharCode(0x2029);

    // Each `note()` line already ends in LF, so a CR at a line's end makes CRLF,
    // an ordinary ending; the stray ones here are a CR more than that.
    it.each([
      [
        'lines below the heading separated by lone CRs',
        note('## Thoughts', ['Kept.', '## Notes', CANARY].join(CR)),
      ],
      [
        'a stray CR before the CRLF on `## Notes`',
        note('## Thoughts', '', 'Kept.', `## Notes${CR}${CR}`, CANARY),
      ],
      ['a line separator on `## Notes`', note('## Thoughts', '', 'Kept.', `## Notes${LS}`, CANARY)],
      [
        'a paragraph separator in the section',
        note('## Thoughts', '', `Kept.${PS}`, '## Notes', CANARY),
      ],
      [
        'a setext underline with a stray CR',
        note('## Thoughts', '', 'Kept.', 'Private', `===${CR}${CR}`, CANARY),
      ],
    ])('withholds %s', (_, source) => {
      expect(extractThoughts(source)).toEqual({
        kind: 'withheld',
        reason: 'the note holds a line ending other than LF or CRLF',
      });
      expectNoCanary(source);
    });

    it('withholds, and ships nothing, when the heading itself is lost in lone CRs', () => {
      // Line endings are read before the heading is looked for (spec §3.1.1, step 2).
      const source = note(['## Thoughts', 'Kept.', '## Notes', CANARY].join(CR));
      expect(extractThoughts(source)).toEqual({
        kind: 'withheld',
        reason: 'the note holds a line ending other than LF or CRLF',
      });
    });

    it('still reads CRLF as an ordinary newline', () => {
      const source = note('## Thoughts', '', 'Kept.', '', '## Notes', CANARY).replace(
        /\n/g,
        `${CR}\n`,
      );
      expect(shipped(source)).toEqual(['Kept.']);
    });
  });

  it.each([
    ['a tag whose `>` is on a later line', [`<div`, `hidden>${CANARY}</div>`]],
    ['a declaration', [`<!DOCTYPE ${CANARY}>`]],
    ['a processing instruction', [`<?x ${CANARY} ?>`]],
    ['CDATA', [`<![CDATA[ ${CANARY} ]]>`]],
  ])('withholds raw HTML: %s', (_, lines) => {
    const source = note('## Thoughts', '', 'Seen.', ...lines);
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    expectNoCanary(source);
  });

  it('finds no section when an HTML block directly above swallows the heading', () => {
    // The parser reads the heading as part of the HTML block, as reading view
    // does, so there is no section to withhold.
    const source = note('<div hidden>', '## Thoughts', '', CANARY);
    expect(extractThoughts(source)).toEqual({ kind: 'absent' });
  });

  it.each([
    ['reference-style', `Look ![${CANARY}][ref] here.`],
    ['shortcut', `Look ![${CANARY}] here.`],
  ])('withholds a %s image', (_, line) => {
    const source = note('## Thoughts', '', line, '', '## Notes', '', '[ref]: x.png');
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    expectNoCanary(source);
  });

  it('withholds a `%%` inside a fence too', () => {
    const source = note('## Thoughts', '', '```', '%%', '```', '', 'After.');
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
  });

  it('withholds when a comment is open where `## Thoughts` starts', () => {
    const source = note('%%', '## Thoughts', '', CANARY, '%%', '', '## Notes');

    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    expectNoCanary(source);
  });

  it('withholds when a closed HTML comment sits above the section (D6)', () => {
    const source = note('<!-- a -->', '', '## Thoughts', '', 'Kept?');
    expect(extractThoughts(source)).toEqual({
      kind: 'withheld',
      reason: 'HTML sits above the section',
    });
  });

  it('ships past a comment closer above the section that closes nothing', () => {
    // Step 5 reads HTML tokens and a raw `<` tag start, and an opener of any
    // form is one. A closer with no opener hides nothing in reading view.
    expect(shipped(note('a --!> b', '', '## Thoughts', '', 'Kept.'))).toEqual(['Kept.']);
  });

  it('ships when the only comment is below the section', () => {
    const source = note('## Thoughts', '', 'Kept.', '', '## Notes', '', `%% ${CANARY} %%`);
    expect(shipped(source)).toEqual(['Kept.']);
  });

  it.each([
    ['an embed', `![[sketch.png]] ${CANARY}`],
    ['a Markdown image', `![a sketch](sketch.png) ${CANARY}`],
  ])('%s', (_, line) => {
    const source = note('## Thoughts', '', line);
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    expectNoCanary(source);
  });

  it.each([
    ['a block tag', '<div>hidden</div>'],
    ['a script', '<script>x()</script>'],
    ['a tag with attributes', '<span class="x">seen</span>'],
    ['a closing tag alone', 'seen</b>'],
    ['a void tag', 'line<br/>break'],
    ['an autolink', '<https://example.invalid>'],
  ])('any HTML tag-shaped sequence: %s', (_, line) => {
    expect(extractThoughts(note('## Thoughts', '', line))).toMatchObject({ kind: 'withheld' });
  });

  it('ships an angle bracket that is not a tag', () => {
    expect(shipped(note('## Thoughts', '', 'a < b and c > d'))).toEqual(['a < b and c > d']);
  });

  it.each([
    ['a link reference definition', '[ref]: https://example.invalid'],
    ['a footnote definition', '[^1]: a footnote'],
  ])('%s', (_, line) => {
    const source = note('## Thoughts', '', 'See [it][ref].', '', line);
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
  });

  it.each([
    ['a bare address', 'see https://example.invalid/x'],
    ['mailto', 'write to mailto:someone@example.invalid'],
    ['file', 'open file:C:/Users/someone/x'],
    ['obsidian', 'open obsidian:open?vault=x'],
    ['a scheme in any case', 'see HTTPS://EXAMPLE.INVALID'],
  ])('a URL scheme left after links flatten: %s', (_, line) => {
    expect(extractThoughts(note('## Thoughts', '', line))).toMatchObject({ kind: 'withheld' });
  });

  it(`withholds past ${String(MAX_SECTION_CODE_POINTS)} code points of raw section text`, () => {
    const over = 'a' + '**'.repeat(MAX_SECTION_CODE_POINTS / 2);
    // Counted before stripping: the stripped text here is one letter.
    expect(extractThoughts(note('## Thoughts', over))).toMatchObject({ kind: 'withheld' });
  });

  it('counts code points, not UTF-16 units', () => {
    // 4,001 astral characters are 8,002 UTF-16 units and 4,001 code points.
    const text = '\u{1F4DA}'.repeat(4001);
    expect(shipped(note('## Thoughts', text))).toEqual([text]);
  });

  it('ships a section of exactly the cap', () => {
    // The section's raw text is this line and the line ending the note closes it with.
    const text = 'b'.repeat(MAX_SECTION_CODE_POINTS - 1);
    expect(shipped(note('## Thoughts', text))).toEqual([text]);
  });

  it('never quotes the section in the reason it gives', () => {
    const result = extractThoughts(note('## Thoughts', '', `${CANARY} %% hidden`));
    expect(result).toMatchObject({ kind: 'withheld' });
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });
});

describe('the strip', () => {
  it('removes emphasis marks and keeps the words', () => {
    const source = note(
      '## Thoughts',
      '',
      '**Bold words**, __also bold__, *some words*, _a few more_, ~~gone again~~ and ==lit up==.',
    );
    expect(shipped(source)).toEqual([
      'Bold words, also bold, some words, a few more, gone again and lit up.',
    ]);
  });

  it('ships a line that starts with strikethrough, which is no fence', () => {
    expect(shipped(note('## Thoughts', '', '~~struck~~ then kept'))).toEqual(['struck then kept']);
  });

  it('keeps an underscore inside a word', () => {
    expect(shipped(note('## Thoughts', '', 'a snake_case_name stays'))).toEqual([
      'a snake_case_name stays',
    ]);
  });

  it('keeps list marks as visible characters', () => {
    expect(shipped(note('## Thoughts', '', '- one', '- two', '1. three'))).toEqual([
      '- one\n- two',
      '1. three',
    ]);
  });

  it('keeps a tag and removes a block id', () => {
    expect(shipped(note('## Thoughts', '', 'Worth it #reread ^a1b2c3', '', '^d4e5f6'))).toEqual([
      'Worth it #reread',
    ]);
  });

  it('flattens wikilinks and Markdown links to their text', () => {
    const source = note(
      '## Thoughts',
      '',
      'See [[Systems Thinking]], [[Some Note|this one]], [[Other#Part]] and [the site](https://example.invalid).',
    );
    expect(shipped(source)).toEqual(['See Systems Thinking, this one, Other and the site.']);
  });

  it('removes backslash escapes', () => {
    expect(shipped(note('## Thoughts', '', '2 \\* 3 is \\_not\\_ emphasis'))).toEqual([
      '2 * 3 is _not_ emphasis',
    ]);
  });

  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    const source = note('## Thoughts', '', 'One line,', 'and the next.', '', '   ', 'Second.');
    expect(shipped(source)).toEqual(['One line,\nand the next.', 'Second.']);
  });

  it.each([
    ['empty', note('## Thoughts', '', '## Notes', CANARY)],
    ['blank lines only', note('## Thoughts', '', '  ', '', '## Notes', CANARY)],
    ['marks only', note('## Thoughts', '', '###', '', '^a1b2c3', '## Notes', CANARY)],
  ])('treats a section that strips to nothing as no section: %s', (_, source) => {
    expect(extractThoughts(source)).toEqual({ kind: 'absent' });
  });
});

describe('a provider description beside the Thoughts', () => {
  it('ships none of an `## About` the merge inserted after the Thoughts', () => {
    const source = note('## Thoughts', '', 'Mine.', '', '## About', '', CANARY, '', '## Notes');
    expect(shipped(source)).toEqual(['Mine.']);
    expectNoCanary(source);
  });

  it('disarms every heading-shaped line and fence opener in body text it is given', () => {
    const description = ['A blurb.', '## Thoughts', '  # loud', '```', 'fenced', '~~~~ x'].join(
      '\n',
    );
    const disarmed = disarmBodyText(description).split('\n');

    // A fence opener's run becomes character references (D9), so it opens nothing.
    expect(disarmed).toEqual([
      'A blurb.',
      '\\## Thoughts',
      '  \\# loud',
      '&#96;&#96;&#96;',
      'fenced',
      '&#126;&#126;&#126;&#126; x',
    ]);
    for (const line of disarmed) {
      expect(atxHeading(line), line).toBeUndefined();
      expect(line, line).not.toMatch(/^ {0,3}(?:`{3}|~{3})/);
    }
  });

  it('leaves text that is neither alone', () => {
    const text = 'Plain.\n#tag and `code`';
    expect(disarmBodyText(text)).toBe(text);
  });

  it('escapes a heading indented four spaces too, which is code only outside a list (D14)', () => {
    expect(disarmBodyText('    ## indented')).toBe('    \\## indented');
  });

  it('treats every line ending as a newline before it disarms', () => {
    const CR = String.fromCharCode(13);
    const LS = String.fromCharCode(0x2028);
    const description = ['A blurb.', '## Thoughts', '```', 'fenced', '# loud'].join(CR);
    const disarmed = disarmBodyText(`${description}${LS}## Thoughts`).split('\n');

    expect(disarmed).toEqual([
      'A blurb.',
      '\\## Thoughts',
      '&#96;&#96;&#96;',
      'fenced',
      '\\# loud',
      '\\## Thoughts',
    ]);
  });

  it('turns angle brackets and `%%` into entities, so no comment or HTML block lands live', () => {
    const disarmed = disarmBodyText('A <!-- note --> and <script> and %%aside%%.');
    expect(disarmed).toBe('A &lt;!-- note --&gt; and &lt;script&gt; and %&#37;aside%&#37;.');
    // Every angle bracket is gone, so no comment opener or closer of any form survives.
    expect(disarmed).not.toMatch(/[<>]|%%/);
  });

  describe('N59: disarmed text, parsed, holds no heading, code fence or HTML token', () => {
    const description = [
      `A blurb.${String.fromCharCode(13)}## Thoughts`,
      'Thoughts',
      '---',
      '   ===',
      'a mid-line ``` run and ~~~ another',
      '```',
      '~~~~ x',
      '<!-- hidden --> <div>',
      'It cost $20, or $$5.',
      'A call [^x] and a definition:',
      '[^x]: a note',
    ].join('\n');
    const disarmed = disarmBodyText(description);

    it('reads as no heading, fence, HTML or math-shaped text', () => {
      const types = tokenTypes(disarmed);
      for (const type of ['atxHeading', 'setextHeading', 'codeFenced', 'htmlFlow', 'htmlText']) {
        expect(types.has(type), type).toBe(false);
      }
      expect(disarmed).not.toMatch(/`{3}|~{3}|\$|\[\^|[<>]|\r/);
    });

    it('escapes a setext underline, indented or not, and every heading line', () => {
      expect(disarmed.split('\n')).toEqual(
        expect.arrayContaining(['A blurb.', '\\## Thoughts', 'Thoughts', '\\---', '   \\===']),
      );
    });

    it('turns runs of three, `$` and `[^` into character references', () => {
      expect(disarmBodyText('a ``` b ~~~ c $ d [^e]')).toBe(
        'a &#96;&#96;&#96; b &#126;&#126;&#126; c &#36; d &#91;^e]',
      );
    });

    it('leaves a run of two, and a lone backtick, alone', () => {
      expect(disarmBodyText('a `` b ~~ c ` d')).toBe('a `` b ~~ c ` d');
    });

    it('escapes a bare hash line, and leaves prose that merely ends in dashes or equals', () => {
      // Round 4, integrity F9 and F10: both edges of the two line predicates.
      expect(disarmBodyText(['##', '#', 'a line --', 'x = y ==', '=== z'].join('\n'))).toBe(
        ['\\##', '\\#', 'a line --', 'x = y ==', '=== z'].join('\n'),
      );
    });

    it('N74: escapes a heading behind list markers, so none parses even inside an item', () => {
      const disarmed = disarmBodyText(
        ['- ## Thoughts', '1. # Notes', '* - ### deep', '10. ## Thoughts'].join('\n'),
      );
      expect(disarmed.split('\n')).toEqual([
        '- \\## Thoughts',
        '1. \\# Notes',
        '* - \\### deep',
        '10. \\## Thoughts',
      ]);
      expect(tokenTypes(disarmed).has('atxHeading')).toBe(false);
    });

    it('escapes an underline with trailing whitespace', () => {
      // Round 5, integrity F7: the trailing half of the underline's shape.
      expect(disarmBodyText(['Thoughts', '--- ', 'Notes', '===\t'].join('\n'))).toBe(
        ['Thoughts', '\\--- ', 'Notes', '\\===\t'].join('\n'),
      );
    });

    it('N84: escapes a lone dash with trailing whitespace, which reads as an underline', () => {
      // Round 6, adversarial F2: read as a list marker, the dash skipped the
      // underline check, and an empty item cannot interrupt a paragraph.
      expect(tokenTypes('Thoughts\n- ').has('setextHeading')).toBe(true);
      const disarmed = disarmBodyText('Thoughts\n- ');
      expect(disarmed).toBe('Thoughts\n\\- ');
      expect(tokenTypes(disarmed).has('setextHeading')).toBe(false);
    });

    it('N77: disarms a list item’s continuation lines, indented four spaces or a tab', () => {
      // Round 5, behaviour F2: in a list item, a line indented four spaces is
      // the item's own paragraph, not code, so it can hold a definition or a
      // heading. Every indent is disarmed, whatever block it would sit in.
      const disarmed = disarmBodyText(
        ['- An item.', '', '    [x]: y', '', '\t## Thoughts', '', '    Thoughts', '\t---'].join(
          '\n',
        ),
      );
      expect(disarmed.split('\n')).toEqual([
        '- An item.',
        '',
        '    &#91;x]: y',
        '',
        '\t\\## Thoughts',
        '',
        '    Thoughts',
        '\t\\---',
      ]);
      const types = tokenTypes(disarmed);
      for (const type of ['definition', 'atxHeading', 'setextHeading']) {
        expect(types.has(type), type).toBe(false);
      }
    });

    it('N73: encodes a `[` that opens a line, behind list markers too, so no definition lands', () => {
      const disarmed = disarmBodyText(
        ['[target]: x.md', '   [b]: y', '- [c]: z', 'mid [d] line'].join('\n'),
      );
      expect(disarmed.split('\n')).toEqual([
        '&#91;target]: x.md',
        '   &#91;b]: y',
        '- &#91;c]: z',
        'mid [d] line',
      ]);
      expect(tokenTypes(disarmed).has('definition')).toBe(false);
    });
  });
});

describe('N58: the `## Notes` the `## About` writer lands above', () => {
  it.each([
    [
      'the first root-level `## Notes`',
      ['## Thoughts', '', 'Mine.', '', '## Notes', '', 'Private.'],
      4,
    ],
    ['one indented up to three spaces', ['Intro.', '', '   ## Notes', 'Private.'], 2],
    ['with closing hashes', ['Intro.', '', '## Notes ##'], 2],
  ])('finds %s', (_, lines, line) => {
    const body = lines.join('\n');
    const at = notesHeadingAt(body);
    expect(at).toBe(body.split('\n').slice(0, line).join('\n').length + 1);
  });

  it('finds it in a CRLF body, at the start of its line', () => {
    const body = ['Intro.', '', '## Notes', 'Private.'].join('\r\n');
    expect(notesHeadingAt(body)).toBe(body.indexOf('## Notes'));
  });

  it.each([
    ['a fenced one', ['```', '## Notes', '```']],
    ['a `###`', ['## Thoughts', '', '### Notes']],
    ['one in a list item', ['- ## Notes']],
    ['one in a quote', ['> ## Notes']],
    ['a setext one', ['Notes', '---']],
    ['`## Notes and more`', ['## Notes and more']],
    ['a near-miss with a no-break space', [`##${String.fromCodePoint(0xa0)}Notes`]],
  ])('never chooses %s', (_, lines) => {
    expect(notesHeadingAt(lines.join('\n'))).toBeUndefined();
  });

  it('finds none in a body over the cap, which is never parsed', () => {
    // Round 4, integrity F5. The writer never acts on this answer: the note
    // it would write is over the cap too, so it refuses the write (N75).
    const body = `## Notes\n\n${'x'.repeat(MAX_BODY_CODE_POINTS)}`;
    expect(notesHeadingAt(body)).toBeUndefined();
    expect(notesHeadingAt(body.slice(0, MAX_BODY_CODE_POINTS))).toBe(0);
  });

  it('skips a fenced one that comes first, and finds the real one', () => {
    const body = ['```', '## Notes', '```', '', '## Notes', 'Private.'].join('\n');
    expect(notesHeadingAt(body)).toBe(body.lastIndexOf('## Notes'));
  });

  it('N94: throws, quoting nothing, when the parse and the text disagree on where it is', () => {
    // A leading byte-order mark is dropped by the parser, so every offset
    // runs one short, and the section would land a line too early, under the
    // owner's last line (#424, adversarial F3 on revision 3).
    const body = `${String.fromCodePoint(0xfeff)}Intro.\n${CANARY}\n## Notes\n\nPrivate.`;
    expect(() => notesHeadingAt(body)).toThrow(
      new Error('the parse and the text disagree on where `## Notes` is'),
    );
  });
});

describe('the `## About` writer’s other helpers', () => {
  it('quotes every line, an empty one as a bare `>`', () => {
    expect(quoteBodyText('One.\n\nTwo.\n  indented')).toBe('> One.\n>\n> Two.\n>   indented');
  });

  it('N86: quotes a disarmed description into one block quote holding no heading', () => {
    const quoted = quoteBodyText(disarmBodyText('A blurb.\n\n## Thoughts\n\nThoughts\n---\nMore.'));
    const events = postprocess(
      parse()
        .document()
        .write(preprocess()(quoted, undefined, true)),
    );
    const quotes = events.filter(
      ([kind, token]) => kind === 'enter' && token.type === 'blockQuote',
    );
    expect(quotes).toHaveLength(1);
    expect(tokenTypes(quoted).has('atxHeading')).toBe(false);
    expect(tokenTypes(quoted).has('setextHeading')).toBe(false);
  });

  it.each([
    ['a lone CR', `a${String.fromCharCode(13)}b`, true],
    ['U+2028', `a${String.fromCodePoint(0x2028)}b`, true],
    ['U+2029', `a${String.fromCodePoint(0x2029)}b`, true],
    ['CRLF', 'a\r\nb', false],
    ['LF', 'a\nb', false],
  ])('reads %s as an odd line ending: %s', (_, source, odd) => {
    expect(oddLineEnding(source)).toBe(odd);
  });

  it('N90: turns the `[` after a `!` into a character reference, so nothing embeds', () => {
    const disarmed = disarmBodyText('See ![x](https://example.invalid/p.png) and ![[file.png]].');
    expect(disarmed).toBe('See !&#91;x](https://example.invalid/p.png) and !&#91;[file.png]].');
    expect(tokenTypes(disarmed).has('image')).toBe(false);
  });
});
