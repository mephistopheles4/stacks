import { describe, expect, it } from 'vitest';
import {
  MAX_SECTION_CODE_POINTS,
  atxHeading,
  disarmBodyText,
  extractThoughts,
  fenceOpener,
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

  it('does not count a fenced `## Thoughts` as a heading', () => {
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
    expect(shipped(source)).toEqual(['Kept.']);
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
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason: 'it holds a code fence' });
    expectNoCanary(source);
  });

  it('withholds a fence whose closer sits below a `##` it swallowed', () => {
    const source = note('## Thoughts', '', '```', '', '## Notes', '', CANARY, '```');
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    expectNoCanary(source);
  });

  it.each([
    ['inline code', `Some \`${CANARY}\` here.`],
    ['an inline query', `Read \`= [[${CANARY}]].rating\` times.`],
    ['a backtick run that is no fence', `\`\`\`a\`b ${CANARY}`],
  ])('withholds %s: any backtick', (_, line) => {
    const source = note('## Thoughts', '', line, '', '## Notes');
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason: 'it holds code' });
    expectNoCanary(source);
  });

  it.each([
    ['a quote', ['> ' + CANARY]],
    ['a callout', ['> [!note] A title', `> ${CANARY}`]],
    ['a heading inside a quote', ['> ## Notes', `> ${CANARY}`]],
    ['a query fence inside a callout', ['> [!note]', '> ```dataview', `> ${CANARY}`, '> ```']],
  ])('withholds %s', (_, lines) => {
    const source = note('## Thoughts', '', 'Kept?', '', ...lines);
    expect(extractThoughts(source)).toEqual({
      kind: 'withheld',
      reason: 'it holds a quote or a callout',
    });
    expectNoCanary(source);
  });

  it.each([
    ['a nested list', ['- an item', `  - ${CANARY}`]],
    ['a list continuation', ['- an item', '', `    ${CANARY}`]],
    ['indented code', [`    ${CANARY}`]],
    ['an indented subheading', [`   ### ${CANARY}`]],
  ])('withholds %s: any indented line', (_, lines) => {
    const source = note('## Thoughts', '', 'Kept?', '', ...lines);
    expect(extractThoughts(source)).toEqual({
      kind: 'withheld',
      reason: 'it holds an indented line (a nested list, a continuation or indented code)',
    });
    expectNoCanary(source);
  });

  it('ends the section at a heading indented under a list item, so nothing below it ships', () => {
    // Wider than CommonMark, which keeps the heading inside the item: ending
    // early can only publish less.
    const source = note('## Thoughts', '', '- an item', '  ## Notes', CANARY);
    expect(shipped(source)).toEqual(['- an item']);
    expectNoCanary(source);
  });

  it.each([
    ['in a list item', [`- [x]: vault/path "${CANARY}"`]],
    ['with a label over two lines', ['[a', `b]: ${CANARY}`]],
    ['for a footnote', [`[^1]: ${CANARY}`]],
  ])('withholds a definition %s: `]:` anywhere', (_, lines) => {
    const source = note('## Thoughts', '', 'Kept?', '', ...lines);
    expect(extractThoughts(source)).toEqual({
      kind: 'withheld',
      reason: 'it holds a link reference or footnote definition',
    });
    expectNoCanary(source);
  });

  it('withholds a table', () => {
    const source = note('## Thoughts', '', `| a | ${CANARY} |`, '| --- | --- |', '| 1 | 2 |');
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason: 'it holds a table' });
  });

  it.each([
    ['inline math', [`A value $x % ${CANARY}$ here.`]],
    ['block math', ['$$', `% ${CANARY}`, '$$']],
  ])('withholds %s: two unescaped dollar signs', (_, lines) => {
    const source = note('## Thoughts', '', ...lines);
    expect(extractThoughts(source)).toEqual({ kind: 'withheld', reason: 'it may hold math' });
    expectNoCanary(source);
  });

  it('ships a single dollar sign, and escaped ones', () => {
    expect(shipped(note('## Thoughts', '', 'It cost $20, or \\$5 and \\$6.'))).toEqual([
      'It cost $20, or $5 and $6.',
    ]);
  });

  it('ships one level of list at the margin, with its marks', () => {
    expect(shipped(note('## Thoughts', '', '- one', '* two', '+ three', '1. four'))).toEqual([
      '- one\n* two\n+ three\n1. four',
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
    expect(shipped(source)).toEqual(['Part\n---\nMore.']);
  });

  it('withholds an underline straight under the heading’s first line', () => {
    // No blank line after the heading, so the paragraph the underline belongs to
    // is the section's first line: the look-back must read the line before.
    const source = note('## Thoughts', 'Private heading', '===', CANARY);
    expect(extractThoughts(source)).toEqual({
      kind: 'withheld',
      reason: 'it holds a setext heading',
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
        reason: 'the note holds a line ending other than a newline',
      });
      expectNoCanary(source);
    });

    it('finds no section, and ships nothing, when the heading itself is lost in lone CRs', () => {
      const source = note(['## Thoughts', 'Kept.', '## Notes', CANARY].join(CR));
      expect(extractThoughts(source)).toEqual({ kind: 'absent' });
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

  it('withholds when raw HTML sits directly above the section', () => {
    // An HTML block opened above the heading can swallow it and hide the
    // section in reading view while the scan still reads the heading.
    const source = note('<div hidden>', '## Thoughts', '', CANARY);
    expect(extractThoughts(source)).toEqual({
      kind: 'withheld',
      reason: 'HTML sits above the section',
    });
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

  it('withholds when any comment marker sits above the section, closed or not', () => {
    // Comment state is computed from the start of the body, and a marker inside
    // a fence there is read by Obsidian differently from one outside it. Any
    // marker above the section withholds rather than guess which.
    const source = note('<!-- a -->', '', '## Thoughts', '', 'Kept?');
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    const closer = note('a --!> b', '', '## Thoughts', '', 'Kept?');
    expect(extractThoughts(closer)).toMatchObject({ kind: 'withheld' });
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
      '- one\n- two\n1. three',
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

    expect(disarmed).toEqual([
      'A blurb.',
      '\\## Thoughts',
      '  \\# loud',
      '\\```',
      'fenced',
      '\\~~~~ x',
    ]);
    for (const line of disarmed) {
      expect(atxHeading(line), line).toBeUndefined();
      expect(fenceOpener(line), line).toBeUndefined();
    }
  });

  it('leaves text that is neither alone', () => {
    const text = 'Plain.\n#tag and `code`\n    ## indented code';
    expect(disarmBodyText(text)).toBe(text);
  });

  it('treats every line ending as a newline before it disarms', () => {
    const CR = String.fromCharCode(13);
    const LS = String.fromCharCode(0x2028);
    const description = ['A blurb.', '## Thoughts', '```', 'fenced', '# loud'].join(CR);
    const disarmed = disarmBodyText(`${description}${LS}## Thoughts`).split('\n');

    expect(disarmed).toEqual([
      'A blurb.',
      '\\## Thoughts',
      '\\```',
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
});
