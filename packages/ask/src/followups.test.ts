import { describe, expect, it } from 'vitest';
import { acceptable, onTheShelf, splitFollowUps } from './followups.ts';

const NL = String.fromCharCode(10);
const lines = (...l: string[]): string => l.join(NL);

describe('splitFollowUps (S6, C4, C15)', () => {
  it('splits a well-formed reply', () => {
    const out = splitFollowUps(
      lines(
        'I read Nexus and rated it highly.',
        'FOLLOW-UPS:',
        '- What did you think of Nexus?',
        '- What have you read about history?',
      ),
    );
    expect(out.answer).toBe('I read Nexus and rated it highly.');
    expect(out.followUps).toEqual([
      'What did you think of Nexus?',
      'What have you read about history?',
    ]);
  });

  it('survives the slips a model makes', () => {
    const variants = [
      lines('A.', '**Follow-ups:**', '1. What did you think of Nexus?'),
      lines('A.', 'Follow-up questions', '* "What did you think of Nexus?"'),
      lines('A.', '', '### Follow ups', '– What did you think of Nexus?'),
      lines('A.', 'follow-ups: What did you think of Nexus?'),
    ];
    for (const text of variants) {
      const out = splitFollowUps(text);
      expect(out.answer).toBe('A.');
      expect(out.followUps).toEqual(['What did you think of Nexus?']);
    }
  });

  it('keeps no follow-ups when there is no marker, and leaves the answer whole', () => {
    expect(splitFollowUps('Just an answer.')).toEqual({ answer: 'Just an answer.', followUps: [] });
  });

  it('treats "none" as none', () => {
    expect(splitFollowUps(lines('Answer.', 'FOLLOW-UPS: none'))).toEqual({
      answer: 'Answer.',
      followUps: [],
    });
    expect(splitFollowUps(lines('Answer.', 'FOLLOW-UPS:', '- None'))).toEqual({
      answer: 'Answer.',
      followUps: [],
    });
  });

  it('keeps at most 2, drops duplicates', () => {
    const q = (n: string): string => `- What did you think of Book ${n}?`;
    const out = splitFollowUps(
      lines('A.', 'FOLLOW-UPS:', q('One'), q('One'), q('Two'), q('Three')),
    );
    expect(out.followUps).toEqual([
      'What did you think of Book One?',
      'What did you think of Book Two?',
    ]);
  });

  it('cuts at the last marker, so a book titled Follow-Ups in the answer does not split it early', () => {
    const out = splitFollowUps(
      lines('I liked Follow-Ups in my notes.', 'FOLLOW-UPS:', '- What did you think of Nexus?'),
    );
    expect(out.answer).toBe('I liked Follow-Ups in my notes.');
    expect(out.followUps).toHaveLength(1);
  });

  it('drops a line that is malformed, a URL, markup, oversized or not a question, without failing the rest', () => {
    const long = `What did you think of ${'X'.repeat(130)}?`;
    const out = splitFollowUps(
      lines(
        'Answer.',
        'FOLLOW-UPS:',
        '- Visit https://evil.example now?',
        '- Is www.evil.example good?',
        '- What about <b>Nexus</b>?',
        '- What about [Nexus](x)?',
        '- Tell me about Nexus.',
        `- ${long}`,
        '- What did you think of Nexus?',
      ),
    );
    expect(out.answer).toBe('Answer.');
    expect(out.followUps).toEqual(['What did you think of Nexus?']);
  });

  it('gives an empty answer when only the block was written', () => {
    expect(splitFollowUps(lines('FOLLOW-UPS:', '- What did you think of Nexus?')).answer).toBe('');
  });
});

describe('splitFollowUps: asterisks (memory spec, C25)', () => {
  it('keeps an asterisk inside a title in a follow-up and drops markup asterisks', () => {
    const out = splitFollowUps(
      lines('A.', 'FOLLOW-UPS:', '- What did you think of **The Art of Not Giving a F*ck**?'),
    );
    expect(out.followUps).toEqual(['What did you think of The Art of Not Giving a F*ck?']);
  });
});

describe('acceptable', () => {
  it.each([
    ['What did you think of Nexus?', true],
    ['Why?', false],
    ['What did you think of Nexus', false],
    ['What is `code`?', false],
    ['x'.repeat(120) + '?', false],
    [`What${String.fromCharCode(7)} about Nexus?`, false],
  ])('%s', (line, ok) => {
    expect(acceptable(line)).toBe(ok);
  });
});

describe('onTheShelf (T9, C31)', () => {
  const cat = [
    {
      id: 'n',
      title: 'Nexus: A Brief History',
      status: 'read',
      thoughts: false,
      subjects: 'History; Business & Personal Finance',
    },
    { id: 's', title: "Staff Engineer's Path", status: 'read', thoughts: false },
  ];
  it.each([
    ['What did you think of Nexus?', true],
    ["Did you like Staff Engineer's Path?", true],
    ['Which finance book would you recommend?', true],
    ['What have you read about history?', true],
    ['Have you written about The Great Gatsby?', false],
    ['Do you like jazz?', false],
  ])('%s -> %s', (line, kept) => {
    expect(onTheShelf(line, cat)).toBe(kept);
  });

  it('does not take a short subject word, a stop word or an unrelated word as a subject', () => {
    expect(onTheShelf('Is it about me?', cat)).toBe(false);
  });
});

describe('splitFollowUps: the marker closing an answer line, or the list on its own line (M3, C36)', () => {
  const nl = String.fromCharCode(10);
  const NEXUS = 'What did you think of Nexus?';
  const CO = 'What did you think of Co-Intelligence?';

  it('cuts at a marker that closes the answer line, and reads the lines under it', () => {
    const out = splitFollowUps(
      [
        'I rated Nexus five out of five, to our advantage. FOLLOW-UPS:',
        `- ${NEXUS}`,
        `- ${CO}`,
      ].join(nl),
    );
    expect(out.answer).toBe('I rated Nexus five out of five, to our advantage.');
    expect(out.followUps).toEqual([NEXUS, CO]);
  });

  it('reads a list written on the marker line, broken at " - " before each question', () => {
    const out = splitFollowUps(`Nexus is my favorite so far. FOLLOW-UPS: - ${NEXUS} - ${CO}`);
    expect(out.answer).toBe('Nexus is my favorite so far.');
    expect(out.followUps).toEqual([NEXUS, CO]);
  });

  it('takes the bold marks round a marker at the end of a line with the marker', () => {
    const out = splitFollowUps(['I liked Nexus. **FOLLOW-UPS:**', `- ${NEXUS}`].join(nl));
    expect(out.answer).toBe('I liked Nexus.');
    expect(out.followUps).toEqual([NEXUS]);
  });

  it('cuts at the last of two qualifying markers in a line', () => {
    const out = splitFollowUps(`A. FOLLOW-UPS: none. FOLLOW-UPS: - ${NEXUS}`);
    expect(out.answer).toBe('A. FOLLOW-UPS: none.');
    expect(out.followUps).toEqual([NEXUS]);
  });

  it('leaves a title holding the word whole when what follows it is not a list', () => {
    const out = splitFollowUps(`I read FOLLOW-UPS: A Memoir. FOLLOW-UPS: - ${NEXUS}`);
    expect(out.answer).toBe('I read FOLLOW-UPS: A Memoir.');
    expect(out.followUps).toEqual([NEXUS]);
  });

  it('cuts in a line on FOLLOW-UPS and a colon followed by nothing, "none" or a list item, and on nothing else', () => {
    expect(splitFollowUps('Done. FOLLOW-UPS: none').answer).toBe('Done.');
    expect(splitFollowUps('Done. FOLLOW-UPS:').answer).toBe('Done.');
    expect(splitFollowUps(`Done. FOLLOW-UPS: 1. ${NEXUS}`).followUps).toEqual([NEXUS]);
    for (const prose of [
      'Notes. FOLLOW-UPS: what I read next, mostly Nexus.',
      'I wrote FOLLOW-UPS - what I read next.',
      'Notes: FOLLOW-UPS: are on the last page.',
    ]) {
      expect(splitFollowUps(prose), prose).toEqual({ answer: prose, followUps: [] });
    }
  });

  it.each([
    'Harari wrote a follow-up: Homo Deus, which I rated 4.',
    'I rated Nexus 5, the follow-up - it sat unread.',
    'I rated Nexus 5, the follow-up—it sat unread.',
    'I kept notes on follow-ups: what I read next.',
    'I kept notes on follow-ups: - what I read next.',
    'A. **Follow-ups:** - What did you think of Nexus?',
  ])('leaves prose and a mixed-case in-line form whole in the answer: %s', (text) => {
    expect(splitFollowUps(text)).toEqual({ answer: text, followUps: [] });
  });

  it('prefers the last line that is a marker on its own over a marker inside a later line', () => {
    const out = splitFollowUps(
      ['Answer.', 'FOLLOW-UPS:', `- ${NEXUS}`, '- Did you read the follow-up: Homo Deus?'].join(nl),
    );
    expect(out.answer).toBe('Answer.');
    expect(out.followUps).toEqual([NEXUS, 'Did you read the follow-up: Homo Deus?']);

    const inside = splitFollowUps(
      ['Answer.', 'FOLLOW-UPS:', `- ${NEXUS}`, `- Is FOLLOW-UPS: - ${CO}`].join(nl),
    );
    expect(inside.answer).toBe('Answer.');
    expect(inside.followUps[0]).toBe(NEXUS);
  });

  it('strips the bold marks and the dash after a marker closed on the same line', () => {
    for (const text of [
      `Answer. **FOLLOW-UPS:** - ${NEXUS} - Why did you like Sapiens?`,
      `**Follow-ups:** - ${NEXUS} - Why did you like Sapiens?`,
    ]) {
      const out = splitFollowUps(text);
      expect(out.followUps, text).toEqual([NEXUS, 'Why did you like Sapiens?']);
    }
    expect(splitFollowUps(`Answer. **FOLLOW-UPS:** - ${NEXUS}`).answer).toBe('Answer.');
  });

  it('keeps a title with " - " inside a question whole, and every acceptance filter still applies', () => {
    const out = splitFollowUps(
      `A. FOLLOW-UPS: - What did you think of Dune - Part Two? - Visit https://evil.example now? - ${NEXUS}`,
    );
    expect(out.followUps).toEqual(['What did you think of Dune - Part Two?', NEXUS]);
  });

  it('leaves the word with no colon or dash after it in the answer, mid-line too (behaviour E3)', () => {
    const text = 'I liked Nexus. Follow up with Nexus, it is great.';
    expect(splitFollowUps(text)).toEqual({ answer: text, followUps: [] });
  });
});

describe('splitFollowUps: a sentence that starts like the marker stays in the answer (behaviour E3)', () => {
  it.each([
    'Follow up with Nexus, it is great.',
    'Followup reading: Nexus is good.',
    'Follow-up questions are welcome, and I liked Nexus.',
    'Follow-ups can wait; I liked Nexus.',
  ])('%s', (line) => {
    const out = splitFollowUps(line);
    expect(out.answer).toBe(line);
    expect(out.followUps).toEqual([]);
  });

  it('keeps the answer above a real marker when a sentence below it opens the same way', () => {
    const out = splitFollowUps(
      [
        'I liked Nexus.',
        'Follow up with Nexus, it is great.',
        'FOLLOW-UPS:',
        '- What did you think of Nexus?',
      ].join(String.fromCharCode(10)),
    );
    expect(out.answer).toBe(
      'I liked Nexus.' + String.fromCharCode(10) + 'Follow up with Nexus, it is great.',
    );
    expect(out.followUps).toEqual(['What did you think of Nexus?']);
  });

  it('still takes the marker forms the spec names, with a dash too', () => {
    for (const marker of [
      'FOLLOW-UPS:',
      '**Follow-ups:**',
      '### Follow ups',
      'Follow-up questions',
      'FOLLOW-UPS.',
      'Follow-ups?',
      'follow-ups - What did you think of Nexus?',
    ]) {
      const out = splitFollowUps(
        ['A.', marker, '- What did you think of Nexus?'].join(String.fromCharCode(10)),
      );
      expect(out.answer, marker).toBe('A.');
    }
  });

  it('reads the questions under a marker that ends in a full stop or a question mark (behaviour N2)', () => {
    for (const marker of ['FOLLOW-UPS.', 'Follow-ups?']) {
      const out = splitFollowUps(
        ['A.', marker, '- What did you think of Nexus?'].join(String.fromCharCode(10)),
      );
      expect(out.followUps, marker).toEqual(['What did you think of Nexus?']);
    }
  });
});
