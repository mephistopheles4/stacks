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

  it.each([['## thoughts'], ['## THOUGHTS'], ['### Thoughts'], ['# Thoughts'], ['##Thoughts']])(
    'is case-sensitive and level-exact: %s is not the section',
    (heading) => {
      const source = note(heading, '', CANARY);
      expect(extractThoughts(source)).toEqual({ kind: 'absent' });
    },
  );

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
    const source = ['---', 'type: book', 'title: "## Thoughts"', '---', '', CANARY, ''].join('\n');
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

describe('code fences', () => {
  it('ships a closed fence’s lines without its markers', () => {
    const source = note('## Thoughts', '', '```text', 'a line *as written*', '```', '', 'After.');
    expect(shipped(source)).toEqual(['a line *as written*', 'After.']);
  });

  it('keeps a fenced `###` inside the section', () => {
    const source = note(
      '## Thoughts',
      '',
      '~~~',
      '### not a heading',
      '~~~',
      '',
      '## Notes',
      CANARY,
    );
    expect(shipped(source)).toEqual(['### not a heading']);
  });

  it('withholds a fence that is never closed, with the canary under `## Notes` below it', () => {
    const source = note(
      '## Thoughts',
      '',
      'Before.',
      '',
      '```',
      'code',
      '',
      '## Notes',
      '',
      CANARY,
    );

    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    expectNoCanary(source);
  });

  it('withholds a fence whose closer sits below a `##` it swallowed', () => {
    // Balanced, so an end-of-file check alone would pass it: the fence opened in
    // the section closes inside `## Notes`, and everything between ships as code.
    const source = note('## Thoughts', '', '```', '', '## Notes', '', CANARY, '```');

    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    expectNoCanary(source);
  });

  it.each([['# a comment'], ['## a heading']])(
    'withholds when a fenced line is shaped like a section-ending heading: %s',
    (line) => {
      const source = note('## Thoughts', '', '```sh', line, CANARY, '```', '', 'After.');
      expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
    },
  );

  it('is not closed by a shorter fence or the other character', () => {
    const source = note('## Thoughts', '', '````', '```', '~~~~', '', '## Notes', CANARY);
    expect(extractThoughts(source)).toMatchObject({ kind: 'withheld' });
  });

  it('does not open on a backtick run whose info string holds a backtick', () => {
    // Not a fence under CommonMark, so `## Notes` below is a real heading.
    const source = note('## Thoughts', '', '```a`b', '', '## Notes', '', CANARY);

    expect(extractThoughts(source).kind).toBe('shipped');
    expectNoCanary(source);
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
});

describe('hidden text withholds the whole section', () => {
  it.each([
    ['an inline `%%` comment', 'Seen %%unseen%% seen.'],
    ['an unclosed `%%`', `Seen %% ${CANARY}`],
    ['an HTML comment', `Seen <!-- ${CANARY} --> seen.`],
    ['a stray `-->`', 'Seen --> seen.'],
    ['a stray `--!>`, which closes a comment too', 'Seen --!> seen.'],
  ])('%s', (_, line) => {
    const source = note('## Thoughts', '', line, '', '## Notes');
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
  it('removes emphasis and code marks and keeps the words', () => {
    const source = note(
      '## Thoughts',
      '',
      '**Bold**, __also__, *it*, _it_, `code` and ~~gone~~ ==lit==.',
    );
    expect(shipped(source)).toEqual(['Bold, also, it, it, code and gone lit.']);
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

  it('removes block quote marks, nested ones included', () => {
    expect(shipped(note('## Thoughts', '', '> quoted', '> > deeper'))).toEqual(['quoted\ndeeper']);
  });

  it('ships a callout as reading view shows it', () => {
    const source = note(
      '## Thoughts',
      '',
      '> [!note] A title',
      '> The body.',
      '',
      '> [!tip]- Folded',
    );
    expect(shipped(source)).toEqual(['A title\nThe body.', 'Folded']);
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
    ['marks only', note('## Thoughts', '', '###', '', '> ', '## Notes', CANARY)],
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
});
