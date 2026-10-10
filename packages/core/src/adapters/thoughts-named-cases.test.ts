import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_CODE_POINTS,
  MAX_SECTION_CODE_POINTS,
  extractThoughts as extract,
} from './thoughts-section.ts';

/**
 * Spec §3.1.4's named cases, one test or one table row per id.
 *
 * - **Each asserts the result's kind, and a withhold its exact reason**, so the
 *   rule meant to catch a shape is the one proven (round 3's integrity F9).
 * - **The canary sits where a misread would leak it**, and no result may carry
 *   it, whatever its kind.
 * - **Inputs are string literals**, never fixture files: `.gitattributes`
 *   normalises line endings on checkout, which would erase the line-ending
 *   cases' CRs.
 *
 * N17, N58 and N66 go through `insertBodySection`, so they live in
 * `read-public-section.test.ts`; N59 in `thoughts-section.test.ts`; N60 under
 * G20; N65 and N67 beside the load check and the closure list.
 *
 * All text is invented for this file (ADR-0004).
 */

const CANARY = 'PRIVATE_REMAINDER_canary';

// Invisible characters, built from code points so each one is visible here.
const CR = String.fromCodePoint(0x0d);
const LS = String.fromCodePoint(0x2028);
const PS = String.fromCodePoint(0x2029);
const NBSP = String.fromCodePoint(0x00a0);
const ZWSP = String.fromCodePoint(0x200b);
const BOM = String.fromCodePoint(0xfeff);
const SOH = String.fromCodePoint(0x01);
const TAG_CHARS = [0xe0068, 0xe0069].map((cp) => String.fromCodePoint(cp)).join('');

/** A note: frontmatter, then the body lines given, each ended by LF. */
function note(...body: string[]): string {
  return ['---', 'type: book', 'title: A Book', '---', '', ...body, ''].join('\n');
}

/** The note's paragraphs; fails naming what came back otherwise. */
function ships(source: string): readonly string[] {
  const result = extract(source);
  expect(JSON.stringify(result)).not.toContain(CANARY);
  if (result.kind !== 'shipped')
    throw new Error(`expected paragraphs, got ${JSON.stringify(result)}`);
  return result.paragraphs;
}

function expectWithheld(source: string, reason: string): void {
  const result = extract(source);
  expect(result).toEqual({ kind: 'withheld', reason });
  expect(JSON.stringify(result)).not.toContain(CANARY);
}

function expectAbsent(source: string): void {
  expect(extract(source)).toEqual({ kind: 'absent' });
}

// The reasons, written out: a reason that changes moves its test.
const R = {
  lineEnding: 'the note holds a line ending other than a newline',
  bodyCap: `the note body is over ${String(MAX_BODY_CODE_POINTS)} characters, so it was not read`,
  twoHeadings: 'the note has two `Thoughts` headings, one of them perhaps underlined with `---`',
  commentInSection: 'it holds an HTML comment marker, perhaps in a link address or title',
  setextEnd: 'a setext heading ends the section',
  htmlAbove: 'HTML sits above the section',
  comment: 'a `%%` comment marker sits in or above the section',
  fenceRun: 'a run of three backticks or tildes sits in or above the section',
  mathBlock: 'a `$$` sits in or above the section',
  cap: `it is over ${String(MAX_SECTION_CODE_POINTS)} characters`,
  dollars: 'it holds two dollar signs, which may be math',
  embed: 'it holds `![`, an image or an embed',
  inlineFootnote: 'it holds `^[`, an inline footnote',
  dataview: 'it holds `::`, a Dataview field',
  control: 'it holds a control character',
  tagChars: 'it holds Unicode tag characters',
  nearMiss: 'it holds a line that may read as a heading',
  quote: 'it holds a quote or a callout',
  indentedCode: 'it holds indented code',
  html: 'it holds HTML',
  table: 'it holds a table',
  definition: 'it holds a link definition',
  footnoteDefinition: 'it holds a footnote definition',
  nestedList: 'it holds a nested list',
  listItem: 'a list item holds more than a paragraph',
  code: 'it holds code',
  autolink: 'it holds an autolink',
  characterReference: 'it holds a character reference',
  footnoteCall: 'it holds a footnote call',
  wikilink: 'a wikilink did not flatten',
  url: 'it holds a web address or a file link',
  afterComment: 'after the strip, it holds a comment marker',
  afterTag: 'after the strip, it holds a tag start',
} as const;

describe('the boundary and the start', () => {
  it('N1: ships the section between `## Thoughts` and the next `##`, the canary under `## Notes`', () => {
    expect(ships(note('## Thoughts', '', 'A slow book.', '', '## Notes', '', CANARY))).toEqual([
      'A slow book.',
    ]);
  });

  it('N2: ends at a `#` heading', () => {
    expect(ships(note('## Thoughts', '', 'Kept.', '', '# Private', '', CANARY))).toEqual(['Kept.']);
  });

  it('N3: ships a `###` inside the section as its own paragraph', () => {
    const source = note('## Thoughts', '', '### On rivers', '', 'Wide.', '', '## Notes', CANARY);
    expect(ships(source)).toEqual(['On rivers', 'Wide.']);
  });

  it.each([['## Thoughts \t '], ['## Thoughts ##'], ['  ## Thoughts ##']])(
    'N4: finds the heading written as %j',
    (heading) => {
      expect(ships(note(heading, '', 'Kept.', '', '## Notes', CANARY))).toEqual(['Kept.']);
    },
  );

  it.each([
    ['## thoughts'],
    ['## Thoughts#'],
    ['### Thoughts'],
    ['# Thoughts'],
    ['##Thoughts'],
    ['## Thoughts and more'],
  ])('N5: %j is no start', (heading) => {
    expectAbsent(note(heading, '', CANARY));
  });

  it('N6: withholds two `## Thoughts` headings, neither shipping', () => {
    const source = note('## Thoughts', '', 'First.', '', '## Notes', '', '## Thoughts', '', CANARY);
    expectWithheld(source, R.twoHeadings);
  });

  it('N7: withholds a setext `Thoughts` heading beside an ATX one', () => {
    const source = note(
      '## Thoughts',
      '',
      'First.',
      '',
      '## Notes',
      '',
      'Thoughts',
      '---',
      '',
      CANARY,
    );
    expectWithheld(source, R.twoHeadings);
  });

  describe('N8: a `## Thoughts` inside a container is not a start', () => {
    it.each([
      ['a fence', ['```', '## Thoughts', CANARY, '```']],
      ['a quote', ['> ## Thoughts', `> ${CANARY}`]],
      ['a list item', ['- ## Thoughts', `  ${CANARY}`]],
    ])('in %s', (_, lines) => {
      expectAbsent(note(...lines));
    });

    it.each([
      ['a quote', ['> ## Thoughts', `> ${CANARY}`]],
      ['a list item', ['- ## Thoughts', `  ${CANARY}`]],
    ])('in %s above the real one, which ships alone', (_, lines) => {
      expect(ships(note(...lines, '', '## Thoughts', '', 'Kept.'))).toEqual(['Kept.']);
    });
  });

  it('N9: a `## Thoughts` YAML comment in the frontmatter is no start', () => {
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
    expectAbsent(source);
  });

  it('N10: a file with no frontmatter block has no section', () => {
    expectAbsent(`## Thoughts\n\n${CANARY}\n`);
  });

  it.each([
    ['a lone CR on `## Notes`', note('## Thoughts', '', 'Kept.', `## Notes${CR}${CR}`, CANARY)],
    ['lone CRs between lines', note('## Thoughts', ['Kept.', '## Notes', CANARY].join(CR))],
    ['a lone CR elsewhere in the body', note(`Above${CR}it.`, '', '## Thoughts', '', 'Kept.')],
    [
      'a lone CR in the frontmatter',
      [
        '---',
        'type: book',
        `# a comment${CR}x`,
        'title: A Book',
        '---',
        '',
        '## Thoughts',
        '',
        'Kept.',
      ].join('\n'),
    ],
    ['a U+2028 on `## Notes`', note('## Thoughts', '', 'Kept.', `## Notes${LS}`, CANARY)],
    ['a U+2029 in the section', note('## Thoughts', '', `Kept.${PS}`, '## Notes', CANARY)],
  ])('N11: withholds %s', (_, source) => {
    expectWithheld(source, R.lineEnding);
  });

  it('N12: reads a CRLF note as LF', () => {
    const source = note(
      '## Thoughts',
      '',
      'Kept.',
      'And more.',
      '',
      '## Notes',
      '',
      CANARY,
    ).replace(/\n/g, '\r\n');
    expect(ships(source)).toEqual(['Kept.\nAnd more.']);
  });

  it.each([
    ['`===`', ['Private', '===']],
    ['`---` and trailing spaces', ['Private', '---   ']],
  ])('N13: withholds a setext heading ending the section, with %s', (_, lines) => {
    expectWithheld(note('## Thoughts', '', 'Kept?', '', ...lines, CANARY), R.setextEnd);
  });

  it('N14: ships `===` as the section’s first line, with no paragraph above it', () => {
    expect(ships(note('## Thoughts', '===', '', '## Notes', CANARY))).toEqual(['===']);
  });

  it('N15: ships a thematic break after a blank line, and under a subheading', () => {
    expect(ships(note('## Thoughts', '', 'One.', '', '---', '', 'Two.'))).toEqual([
      'One.',
      '---',
      'Two.',
    ]);
    expect(ships(note('## Thoughts', '', '### Part', '---', 'More.'))).toEqual([
      'Part',
      '---',
      'More.',
    ]);
  });

  it('N16: ships none of an `## About` the merge inserted after the Thoughts', () => {
    const source = note('## Thoughts', '', 'Mine.', '', '## About', '', CANARY, '', '## Notes');
    expect(ships(source)).toEqual(['Mine.']);
  });
});

describe('above the section', () => {
  it('N18: a fence behind a list marker holding an indented copy of the heading', () => {
    const fence = ['- ```', '  ## Thoughts', `  ${CANARY}`, '  ```'];
    expectAbsent(note(...fence, '', CANARY));
    expectWithheld(
      note(...fence, '', '## Thoughts', '', 'Kept.', '', '## Notes', CANARY),
      R.fenceRun,
    );
  });

  it('N19: a two-space fence in a list item, then a margin fence line', () => {
    const source = note('- a', '  ```', '## Thoughts', CANARY, '```');
    expectWithheld(source, R.fenceRun);
  });

  it('N20: a `$$` block holding a copy of the heading', () => {
    expectWithheld(note('$$', '## Thoughts', CANARY, '$$'), R.mathBlock);
  });

  it('N21: a fence never closed', () => {
    expectAbsent(note('```', '', '## Thoughts', '', CANARY));
    expectWithheld(note('## Thoughts', '', 'Kept.', '', '```', '## Notes', CANARY), R.fenceRun);
  });

  it.each([
    ['an info string', '```', '```js'],
    ['text before the run', '```', 'see ```'],
    ['text after the run', '```', '``` and more'],
    ['a shorter run', '````', '```'],
    ['a backtick run in a tilde fence', '~~~', '```'],
    ['a tilde run in a backtick fence', '```', '~~~'],
    ['nothing, in a tilde fence whose info string holds a backtick', '~~~ a`b', 'still fenced'],
  ])('N22: a closer-shaped line with %s closes nothing', (_, opener, closer) => {
    expectAbsent(note('## Notes', '', opener, closer, '## Thoughts', '', CANARY));
  });

  describe('N23: HTML above the section', () => {
    it.each([
      ['an HTML block, then a blank line', ['<div>', 'x', '</div>', '']],
      ['inline HTML', ['Some <b>bold</b> text.', '']],
      ['a closed HTML comment', ['<!-- a -->', '']],
      ['an inline comment left open', ['Seen <!-- never closed', '']],
    ])('withholds %s', (_, above) => {
      expectWithheld(note(...above, '## Thoughts', '', CANARY), R.htmlAbove);
    });

    it('finds no section when an open comment block swallows the heading', () => {
      // An HTML comment block runs until `-->`, so the heading is inside it.
      expectAbsent(note('<!-- a', '', '## Thoughts', '', CANARY));
    });
  });

  it.each([
    ['closed, above', ['%% a %%', '', '## Thoughts', '', CANARY]],
    ['open, above', ['%%', '## Thoughts', '', CANARY, '%%']],
    ['inside a fence above', ['```', '%%', '```', '', '## Thoughts', '', CANARY]],
    ['in the section', ['## Thoughts', '', `Seen %%${CANARY}%% seen.`]],
  ])('N24: withholds `%%` %s', (_, lines) => {
    expectWithheld(note(...lines), R.comment);
  });

  it('N25: ships past a cover embed above the heading', () => {
    expect(
      ships(note('![[cover.jpg]]', '', '## Thoughts', '', 'Kept.', '', '## Notes', CANARY)),
    ).toEqual(['Kept.']);
  });

  it('N26: ships when the only comment is below the section’s end', () => {
    expect(ships(note('## Thoughts', '', 'Kept.', '', '## Notes', '', `%% ${CANARY} %%`))).toEqual([
      'Kept.',
    ]);
  });
});

describe('blocks in the section', () => {
  it.each([
    ['a bare backtick fence', ['```', CANARY, '```']],
    ['a bare tilde fence', ['~~~', CANARY, '~~~']],
    ['a fence tagged text', ['```text', CANARY, '```']],
    ['a fence tagged dataview', ['```dataview', `LIST FROM "${CANARY}"`, '```']],
    ['an unclosed fence', ['```', CANARY]],
  ])('N27: withholds %s', (_, lines) => {
    expectWithheld(note('## Thoughts', '', 'Before.', '', ...lines, '', 'After.'), R.fenceRun);
  });

  it('N28: withholds a fence swallowing `## Notes`, its closer below', () => {
    expectWithheld(note('## Thoughts', '', '```', '', '## Notes', '', CANARY, '```'), R.fenceRun);
  });

  it('N29: withholds indented code', () => {
    expectWithheld(note('## Thoughts', '', 'Kept?', '', `    ${CANARY}`), R.indentedCode);
  });

  it.each([
    ['a quote', [`> ${CANARY}`]],
    ['a callout', ['> [!note] A title', `> ${CANARY}`]],
    ['a folded callout', ['> [!note]- A title', `> ${CANARY}`]],
    ['a heading in a quote', ['> ## Notes', `> ${CANARY}`]],
  ])('N30: withholds %s', (_, lines) => {
    expectWithheld(note('## Thoughts', '', 'Kept?', '', ...lines), R.quote);
  });

  it('N30: withholds a query fence in a callout, by its fence run', () => {
    const source = note('## Thoughts', '', '> [!note]', '> ```dataview', `> ${CANARY}`, '> ```');
    expectWithheld(source, R.fenceRun);
  });

  it.each([
    ['a `##` heading', ['- ## Notes', `  ${CANARY}`]],
    ['a `#` heading', ['- # Private', `  ${CANARY}`]],
    ['a quote', [`- > ${CANARY}`]],
    ['a folded callout with a lazy line', ['- > [!note]- Folded', CANARY]],
  ])('N31: withholds %s behind a bullet', (_, lines) => {
    expectWithheld(note('## Thoughts', '', 'Kept?', '', ...lines), R.listItem);
  });

  it('N32: withholds a nested list', () => {
    expectWithheld(note('## Thoughts', '', '- an item', `  - ${CANARY}`), R.nestedList);
  });

  it('N32: withholds a fence in a list item, by its fence run', () => {
    expectWithheld(
      note('## Thoughts', '', '- an item', '  ```', `  ${CANARY}`, '  ```'),
      R.fenceRun,
    );
  });

  it('N32: withholds a heading indented under a list item (D1)', () => {
    expectWithheld(note('## Thoughts', '', '- an item', `  ### ${CANARY}`), R.listItem);
  });

  it('N33: ships a list continuation as part of its item (D4)', () => {
    expect(ships(note('## Thoughts', '', '- an item', '  continued here', '- another'))).toEqual([
      '- an item\ncontinued here\n- another',
    ]);
  });

  it('N34: ships a `###` indented three spaces, and ends at a `##` indented two (D5)', () => {
    const source = note(
      '## Thoughts',
      '',
      '   ### Indented',
      '',
      'Kept.',
      '',
      '  ## Notes',
      '',
      CANARY,
    );
    expect(ships(source)).toEqual(['Indented', 'Kept.']);
  });

  it.each([
    ['plain', [`[ref]: /vault/path "${CANARY}"`], R.definition],
    ['in a list item', [`- [x]: vault/path "${CANARY}"`], R.definition],
    ['in a quote', [`> [x]: ${CANARY}`], R.quote],
    ['with a label over two lines', ['[a', `b]: ${CANARY}`], R.definition],
    ['for a footnote', [`[^1]: ${CANARY}`], R.footnoteDefinition],
  ])('N35: withholds a definition %s', (_, lines, reason) => {
    expectWithheld(note('## Thoughts', '', 'Kept?', '', ...lines), reason);
  });

  it.each([
    ['two columns with outer pipes', [`| a | ${CANARY} |`, '| --- | --- |']],
    ['two columns without', [`a | ${CANARY}`, '--- | ---']],
    ['one column', [`| ${CANARY} |`, '| - |']],
    ['alignment colons', [`| ${CANARY} |`, '| :-: |']],
  ])('N36: withholds a table: %s', (_, lines) => {
    expectWithheld(note('## Thoughts', '', 'Kept?', '', ...lines), R.table);
  });

  it.each([
    ['a block', ['<div>', CANARY, '</div>']],
    ['an inline tag', [`Seen <span>${CANARY}</span> here.`]],
    ['a tag split across lines', ['<div', `hidden>${CANARY}</div>`]],
    ['`<!x`', [`<!DOCTYPE ${CANARY}>`]],
    ['`<?x`', [`<?x ${CANARY} ?>`]],
  ])('N37: withholds HTML: %s', (_, lines) => {
    expectWithheld(note('## Thoughts', '', 'Seen.', '', ...lines), R.html);
  });

  it('N37: withholds `<![CDATA[`, by the `![` it holds', () => {
    // Step 7 reads raw text before step 8 reads tokens, so `![` answers first.
    expectWithheld(note('## Thoughts', '', 'Seen.', '', `<![CDATA[ ${CANARY} ]]>`), R.embed);
  });

  it('N38: withholds a setext heading inside the section', () => {
    // A setext heading is level 1 or 2, so it ends the section: step 4 is the
    // rule that answers, and step 8's setext rejection is never reached.
    expectWithheld(note('## Thoughts', 'Private heading', '===', CANARY), R.setextEnd);
  });
});

describe('inline in the section', () => {
  it.each([
    ['a code span', `Some \`${CANARY}\` here.`],
    ['an inline query', `Read \`= [[${CANARY}]].rating\` times.`],
  ])('N39: withholds %s', (_, line) => {
    expectWithheld(note('## Thoughts', '', line, '', '## Notes'), R.code);
  });

  it('N40: withholds a backtick run that opens no fence (D3)', () => {
    expectWithheld(note('## Thoughts', '', `\`\`\`a\`b ${CANARY}`), R.fenceRun);
  });

  it('N41: ships a lone backtick as a literal character (D3)', () => {
    expect(ships(note('## Thoughts', '', 'A ` mark alone.'))).toEqual(['A ` mark alone.']);
  });

  it.each([
    ['an inline image', `Look ![${CANARY}](sketch.png) here.`],
    ['a reference-style image', `Look ![${CANARY}][ref] here.`],
    ['`![x]` with no definition', `Look ![${CANARY}] here.`],
    ['an embed', `Look ![[${CANARY}.png]] here.`],
  ])('N42: withholds %s', (_, line) => {
    expectWithheld(note('## Thoughts', '', line, '', '## Notes', '', '[ref]: x.png'), R.embed);
  });

  it('N43: withholds an autolink', () => {
    expectWithheld(note('## Thoughts', '', 'See <https://example.invalid/x> here.'), R.autolink);
  });

  it.each([
    ['a bare address', 'see https://example.invalid/x'],
    ['`file:`', 'open file:C:/Users/someone/x'],
    ['`obsidian:`', 'open obsidian:open?vault=x'],
    ['`mailto:`', 'write to mailto:someone@example.invalid'],
    ['a scheme in any case', 'see HTTPS://EXAMPLE.INVALID'],
  ])('N43: withholds %s', (_, line) => {
    expectWithheld(note('## Thoughts', '', line), R.url);
  });

  it.each([
    ['`&lt;`', 'a &lt; b'],
    ['`&amp;`', 'this &amp; that'],
  ])('N44: withholds a character reference: %s', (_, line) => {
    expectWithheld(note('## Thoughts', '', line), R.characterReference);
  });

  it('N45: withholds a footnote call whose definition sits under `## Notes`', () => {
    const source = note('## Thoughts', '', 'A claim[^1].', '', '## Notes', '', `[^1]: ${CANARY}`);
    expectWithheld(source, R.footnoteCall);
  });

  it('N46: withholds an inline footnote', () => {
    expectWithheld(note('## Thoughts', '', `A claim^[${CANARY}].`), R.inlineFootnote);
  });

  it.each([
    ['bare', `mood:: ${CANARY}`],
    ['in square brackets', `Today [mood:: ${CANARY}] was fine.`],
    ['in round brackets', `Today (mood:: ${CANARY}) was fine.`],
  ])('N47: withholds a Dataview field, %s', (_, line) => {
    expectWithheld(note('## Thoughts', '', line), R.dataview);
  });

  it.each([
    ['inline, with a `%` comment', [`A value $x % ${CANARY}$ here.`], R.dollars],
    ['a `$$` block', ['$$', `% ${CANARY}`, '$$'], R.mathBlock],
    ['a doubled backslash before the first `$`', [`a \\\\$x % ${CANARY}$ b`], R.dollars],
    ['a doubled backslash before the second `$`', [`a $x % ${CANARY}\\\\$ b`], R.dollars],
    ['`$20, or \\$5` (D2)', ['It cost $20, or \\$5.'], R.dollars],
  ])('N48: withholds math: %s', (_, lines, reason) => {
    expectWithheld(note('## Thoughts', '', ...lines), reason);
  });

  it('N49: ships a single dollar sign (D2)', () => {
    expect(ships(note('## Thoughts', '', 'It cost $20.'))).toEqual(['It cost $20.']);
  });

  it.each([
    ['inline', `[the label](vault/${CANARY}.md)`, 'the label'],
    ['with text over two lines', `[two\nlines](vault/${CANARY}.md)`, 'two\nlines'],
    ['with balanced parentheses', `[the label](a(${CANARY})b)`, 'the label'],
    ['with brackets in an angle destination', `[the label](<a[${CANARY}]b>)`, 'the label'],
    ['with a quoted title', `[the label](x "${CANARY}")`, 'the label'],
    ['with a parenthesised title', `[the label](x (${CANARY}))`, 'the label'],
  ])('N50: ships only the label of a link %s', (_, link, label) => {
    expect(ships(note('## Thoughts', '', `See ${link} now.`))).toEqual([`See ${label} now.`]);
  });

  it('N51: ships the label of a reference link whose definition sits under `## Notes`', () => {
    const source = note(
      '## Thoughts',
      '',
      'See [the label][ref].',
      '',
      '## Notes',
      '',
      `[ref]: ${CANARY}`,
    );
    expect(ships(source)).toEqual(['See the label.']);
  });

  it.each([
    ['`\\<div`', 'An escaped \\<div here.', R.afterTag],
    ['`<\\!--`', 'An escaped <\\!-- here.', R.afterComment],
    ['`--\\>`', 'An escaped --\\> here.', R.afterComment],
    // A raw `%%` is in the source, so step 6 answers before the output check.
    ['`\\%%`', 'An escaped \\%% here.', R.comment],
    // The output check's step-7 half: each mark is escaped in the source, so
    // only the re-read after the strip sees it (round 4, integrity F1).
    ['`!\\[`', 'An escaped !\\[x] here.', `after the strip, ${R.embed}`],
    ['`^\\[`', 'An escaped ^\\[x] here.', `after the strip, ${R.inlineFootnote}`],
    ['`:\\:`', 'mood:\\: an escaped field', `after the strip, ${R.dataview}`],
    ['`\\$` twice', 'From \\$1 to \\$2.', R.dollars],
    ['`\\##` at a line start', '\\## An escaped heading', `after the strip, ${R.nearMiss}`],
  ])('N52: withholds an escaped mark the strip restores: %s', (_, line, reason) => {
    expectWithheld(note('## Thoughts', '', line), reason);
  });

  it.each([
    ['U+0001', SOH],
    ['DEL', String.fromCodePoint(0x7f)],
    ['a C1 control, U+0085', String.fromCodePoint(0x85)],
    ['a C1 control, U+009F', String.fromCodePoint(0x9f)],
  ])('N53: withholds a control character: %s', (_, char) => {
    expectWithheld(note('## Thoughts', '', `A${char}B`), R.control);
  });

  it('N53: ships a tab, which is no control', () => {
    expect(ships(note('## Thoughts', '', 'A\tB'))).toEqual(['A\tB']);
  });

  describe('N54: the cap, in code points, across line breaks', () => {
    const half = MAX_SECTION_CODE_POINTS / 2;

    it('ships exactly the cap, a line break counted as one', () => {
      const text = `${'a'.repeat(half - 1)}\n${'b'.repeat(half)}`;
      expect(ships(note('## Thoughts', text))).toEqual([text]);
    });

    it('withholds one over the cap', () => {
      expectWithheld(note('## Thoughts', `${'a'.repeat(half)}\n${'b'.repeat(half)}`), R.cap);
    });

    it('counts a blank line after the heading', () => {
      expectWithheld(note('## Thoughts', '', 'b'.repeat(MAX_SECTION_CODE_POINTS)), R.cap);
    });

    it('excludes trailing whitespace', () => {
      const text = 'b'.repeat(MAX_SECTION_CODE_POINTS);
      expect(ships(note('## Thoughts', text, '', '   ', '', '## Notes', CANARY))).toEqual([text]);
    });

    it('counts code points, not UTF-16 units', () => {
      const text = '\u{1F4DA}'.repeat(MAX_SECTION_CODE_POINTS);
      expect(ships(note('## Thoughts', text))).toEqual([text]);
      expectWithheld(note('## Thoughts', `${text}x`), R.cap);
    });

    it('counts a CRLF break as one, from both sides', () => {
      const text = `${'a'.repeat(half - 1)}\n${'b'.repeat(half)}`;
      expect(ships(note('## Thoughts', text).replace(/\n/g, '\r\n'))).toEqual([text]);
      const over = note('## Thoughts', `${'a'.repeat(half)}\n${'b'.repeat(half)}`);
      expectWithheld(over.replace(/\n/g, '\r\n'), R.cap);
    });
  });
});

describe('N55: wikilinks', () => {
  it.each([
    ['[[target]]', 'target'],
    ['[[target|alias]]', 'alias'],
    ['[[target#heading|alias]]', 'alias'],
    ['[[target\\|alias]]', 'alias'],
    ['[[target|  alias with spaces  ]]', 'alias with spaces'],
    ['[[target#heading]]', 'target'],
    ['[[target#^block]]', 'target'],
  ])('ships %s as %j', (link, text) => {
    expect(ships(note('## Thoughts', '', `See ${link} now.`))).toEqual([`See ${text} now.`]);
  });

  it('withholds a `[[` left over', () => {
    expectWithheld(note('## Thoughts', '', `See [[${CANARY} now.`), R.wikilink);
  });
});

describe('the strip and the controls', () => {
  it('N56: removes emphasis, strong, strike and highlight marks and keeps the words', () => {
    const source = note(
      '## Thoughts',
      '',
      '**Bold words**, __also bold__, *some words*, _a few more_, ~~gone again~~ and ==lit up==.',
    );
    expect(ships(source)).toEqual([
      'Bold words, also bold, some words, a few more, gone again and lit up.',
    ]);
  });

  it('N56: keeps `snake_case`, a tag and list marks; removes a block id; trims trailing spaces', () => {
    const source = note(
      '## Thoughts',
      '',
      'a snake_case_name stays #reread ^a1b2c3',
      '',
      '- one   ',
      '- two',
      '1. three',
      '',
      'trailing   ',
      'spaces',
    );
    expect(ships(source)).toEqual([
      'a snake_case_name stays #reread',
      '- one\n- two',
      '1. three',
      'trailing\nspaces',
    ]);
  });

  it('N57: ships the controls: plain prose, a list and a flattened link', () => {
    const source = note(
      '## Thoughts',
      '',
      'A plain thought.',
      '',
      '- one',
      '- two',
      '',
      'See [the site](https://example.invalid).',
      '',
      '## Notes',
      CANARY,
    );
    expect(ships(source)).toEqual(['A plain thought.', '- one\n- two', 'See the site.']);
  });
});

describe('added by the amendment’s own review', () => {
  it.each([
    ['a no-break space after the hashes', `##${NBSP}Notes`],
    ['a zero-width space before them', `${ZWSP}## Notes`],
    ['a byte-order mark before them', `${BOM}## Notes`],
  ])('N61: withholds a near-miss heading: %s', (_, heading) => {
    expectWithheld(note('## Thoughts', '', 'Kept.', '', heading, '', CANARY), R.nearMiss);
  });

  it('N61: still ships a `#tag` line and a `###`', () => {
    expect(ships(note('## Thoughts', '', '#reread', '', '### Part', '', 'Kept.'))).toEqual([
      '#reread',
      'Part',
      'Kept.',
    ]);
  });

  it('N62: withholds a run of Unicode tag characters', () => {
    expectWithheld(note('## Thoughts', '', `Seen${TAG_CHARS} here.`), R.tagChars);
  });

  it('N63: withholds an incomplete tag above the heading', () => {
    expectWithheld(note('a <b with no end', '', '## Thoughts', '', CANARY), R.htmlAbove);
  });

  describe('N64: the body cap, before the parse', () => {
    /** A note whose body, everything below the frontmatter, is exactly `size` code points. */
    function noteOfBody(size: number): string {
      const head = '\n## Thoughts\n\nKept.\n\n## Notes\n\n';
      const tail = '\n';
      return `---\ntype: book\ntitle: A Book\n---\n${head}${'x'.repeat(size - head.length - tail.length)}${tail}`;
    }

    it('reads a body of exactly the cap', () => {
      expect(ships(noteOfBody(MAX_BODY_CODE_POINTS))).toEqual(['Kept.']);
    });

    it('withholds one over, before it is parsed', () => {
      expectWithheld(noteOfBody(MAX_BODY_CODE_POINTS + 1), R.bodyCap);
    });

    it('is 20,000, the owner’s choice on round 4', () => {
      // Seven times the longest real note body, 2,768 code points, measured on
      // #411. The parse grows with the square of some shapes: 0.9 s here, 3.9 s
      // at twice it, minutes at the 200,000 it was before.
      expect(MAX_BODY_CODE_POINTS).toBe(20_000);
    });
  });
});

describe('added by round 4 of move 4 on #415', () => {
  it.each([
    ['a shortcut-reference definition', ['See [[target]] here.'], '[target]: x.md'],
    ['an aliased one', ['See [[target|alias]] here.'], '[target|alias]: x.md'],
  ])('N68: withholds a wikilink whose label %s matches', (_, lines, definition) => {
    // The parser reads the inner brackets as a reference link, so the flatten
    // never sees `[[`, and the target behind an alias would ship.
    const source = note('## Thoughts', '', ...lines, '', '## Notes', '', definition);
    expectWithheld(source, R.wikilink);
  });

  it.each([
    ['in a link title', `[a](x "<!--") ${CANARY} [b](y "-->")`],
    ['in a link address', `[a](<x<!--y>) ${CANARY} [b](<z-->w>)`],
  ])('N69: withholds an HTML comment marker %s', (_, line) => {
    expectWithheld(note('## Thoughts', '', line), R.commentInSection);
  });

  it.each([
    ['bare hashes behind a no-break space', `${NBSP}##`],
    ['bare hashes behind a zero-width space', `${ZWSP}#`],
    ['a setext underline carrying a no-break space', `---${NBSP}`],
    ['a setext underline behind a zero-width space', `${ZWSP}===`],
  ])('N70: withholds a near-miss heading: %s', (_, line) => {
    expectWithheld(note('## Thoughts', '', 'Kept.', line, '', CANARY), R.nearMiss);
  });

  it('N70: still ships a plain thematic break and dashes inside a line', () => {
    expect(ships(note('## Thoughts', '', 'One --', '', '---', '', 'Two.'))).toEqual([
      'One --',
      '---',
      'Two.',
    ]);
  });

  it('a level-1 setext `Thoughts` is no second heading', () => {
    // Only level 2 counts (round 4, integrity F6).
    const source = note('Thoughts', '===', '', '## Thoughts', '', 'Kept.', '', '## Notes', CANARY);
    expect(ships(source)).toEqual(['Kept.']);
  });

  it('ships a backslash hard break as a line break', () => {
    expect(ships(note('## Thoughts', '', 'line one\\', 'line two'))).toEqual([
      'line one\nline two',
    ]);
  });

  it('keeps a caret word that is not at the end of a line', () => {
    expect(ships(note('## Thoughts', '', 'a ^word here'))).toEqual(['a ^word here']);
  });
});
