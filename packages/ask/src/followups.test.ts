import { describe, expect, it } from 'vitest';
import { acceptable, splitFollowUps } from './followups.ts';

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
