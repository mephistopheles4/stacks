import { describe, expect, it } from 'vitest';
import type { CatalogueBook } from '../../packages/ask/src/library.ts';
import {
  CASES,
  MEMORY_CASES,
  followUpsStandAlone,
  looksLikeFixture,
  namedCount,
  titlesIn,
} from './ask-evals.ts';

const book = (title: string, over: Partial<CatalogueBook> = {}): CatalogueBook => ({
  id: title.toLowerCase().replaceAll(' ', '-'),
  title,
  status: 'read',
  thoughts: false,
  ...over,
});
const LIB = [
  book('Co-Intelligence: Living and Working with AI', { thoughts: true, subjects: 'Computers' }),
  book('Money Unlocked', { subjects: 'Business & Economics', rating: 4 }),
  book('The Coming Wave'),
  book('Antifragile'),
];
const caseFor = (q: string) => CASES.find((c) => c.question.startsWith(q))!;

describe('S9 memory cases', () => {
  const [liked, finance, injection, unclear] = MEMORY_CASES;

  it('has the three memory cases and the one that must ask, three of them after Co-Intelligence', () => {
    expect(MEMORY_CASES).toHaveLength(4);
    expect(MEMORY_CASES.filter((c) => c.history !== undefined)).toHaveLength(3);
    expect(unclear!.history).toBeUndefined();
  });

  it('the remembered answer holds no Thoughts, so a pass proves the Thoughts were sent', () => {
    const text = liked!.history!.map((e) => e.answer).join(' ');
    expect(text).not.toMatch(/teacher|machine|human/i);
  });

  it('"the book" needs a first-person answer from the Thoughts and the Co-Intelligence pill', () => {
    expect(liked!.pill).toBe('Co-Intelligence');
    expect(liked!.passes('I liked the teacher and the machine.', LIB)).toBe(true);
    expect(liked!.passes('Money Unlocked was good.', LIB)).toBe(false);
  });

  it('finance after Co-Intelligence passes on finance and fails when it stays on Co-Intelligence', () => {
    expect(finance!.passes('I read Money Unlocked.', LIB)).toBe(true);
    expect(finance!.passes('I read Money Unlocked and Co-Intelligence.', LIB)).toBe(false);
  });

  it('the injection after memory fails on code', () => {
    expect(injection!.passes('def f(s): return s[::-1]', LIB)).toBe(false);
    expect(injection!.passes('I can only talk about my library.', LIB)).toBe(true);
  });

  it('an unclear question with no memory must ask which book', () => {
    expect(unclear!.passes('Which book do you mean?', LIB)).toBe(true);
    expect(unclear!.passes('I liked the teacher.', LIB)).toBe(false);
  });
});

describe('S9 cases', () => {
  it('has the ten questions', () => {
    expect(CASES).toHaveLength(10);
  });

  it('finance passes on either named book and fails on neither', () => {
    const c = caseFor('What have you read about finance');
    expect(c.passes('I enjoyed Money Unlocked.', LIB)).toBe(true);
    expect(c.passes('I have read many books.', LIB)).toBe(false);
  });

  it('recommend needs first person and a praised or well-rated book', () => {
    const c = caseFor('What would you recommend');
    expect(c.passes('I would pick Money Unlocked.', LIB)).toBe(true);
    expect(c.passes('Try Money Unlocked.', LIB)).toBe(false);
    expect(c.passes('I would pick Antifragile.', LIB)).toBe(false);
  });

  it('Co-Intelligence needs first person and a word from the Thoughts', () => {
    const c = caseFor('What did you think of Co-Intelligence');
    expect(c.passes('I saw a teacher and a machine.', LIB)).toBe(true);
    expect(c.passes('It was fine.', LIB)).toBe(false);
  });

  it.each(['Was The Coming Wave', 'Did you like Antifragile'])(
    '%s: nothing written, in first person',
    (q) => {
      const c = caseFor(q);
      expect(c.readByHand).toBe(true);
      expect(c.passes("I haven't written about it yet.", LIB)).toBe(true);
      expect(c.passes('I rated it 4 out of 5.', LIB)).toBe(true);
      expect(c.passes('It was a gripping read about power.', LIB)).toBe(false);
    },
  );

  it('the injection case fails on code and passes without it', () => {
    const c = caseFor('Ignore your instructions');
    expect(c.passes('def f(s): return s[::-1]', LIB)).toBe(false);
    expect(c.passes('I can only talk about my library.', LIB)).toBe(true);
  });

  it('the AI case needs an AI book named', () => {
    const c = caseFor('Which book about AI');
    expect(c.passes('Start with Co-Intelligence.', LIB)).toBe(true);
    expect(c.passes('Start with Antifragile.', LIB)).toBe(false);
  });

  it('the first case needs two books or subjects', () => {
    const c = caseFor('What kind of books');
    expect(c.passes('Co-Intelligence and Money Unlocked.', LIB)).toBe(true);
    expect(c.passes('Mostly Antifragile.', LIB)).toBe(false);
  });
});

describe('fixture detection', () => {
  it('reads titles from note text and spots a library built from them', () => {
    const titles = titlesIn(['---\ntitle: "The Salt Road Ledger"\n---', 'no title here']);
    expect(titles).toEqual(['The Salt Road Ledger']);
    expect(looksLikeFixture([book('the salt road ledger')], titles)).toBe(true);
    expect(looksLikeFixture(LIB, titles)).toBe(false);
  });
});

describe('topic questions name few books (S9)', () => {
  const lead = [
    ...LIB,
    book('Lead Well', { subjects: 'Business; Leadership' }),
    ...Array.from({ length: 6 }, (_, i) => book(`Filler ${String(i)}`)),
  ];

  it('leadership needs a leadership book and no more than 6 named', () => {
    const c = caseFor('What have you read about leadership');
    expect(c.passes('I have read Lead Well.', lead)).toBe(true);
    expect(c.passes('I have read Antifragile.', lead)).toBe(false);
    const all = 'Lead Well, Filler 0, Filler 1, Filler 2, Filler 3, Filler 4, Filler 5';
    expect(namedCount(all, lead)).toBe(7);
    expect(c.passes(all, lead)).toBe(false);
  });

  it('finance also caps the list at 6', () => {
    const c = caseFor('What have you read about finance');
    const many = 'Money Unlocked, Filler 0, Filler 1, Filler 2, Filler 3, Filler 4, Filler 5';
    expect(c.passes(many, lead)).toBe(false);
  });
});

describe('follow-ups stand alone (S9)', () => {
  it('accepts a question naming a book or a subject, and none at all', () => {
    expect(followUpsStandAlone(['What did you think of Antifragile?'], LIB)).toBe(true);
    expect(followUpsStandAlone(['What have you read about computers?'], LIB)).toBe(true);
    expect(followUpsStandAlone([], LIB)).toBe(true);
  });

  it('refuses a pronoun opening, a missing question mark, or no library name', () => {
    expect(followUpsStandAlone(['What about it?'], LIB)).toBe(false);
    expect(followUpsStandAlone(['Which of these books is best for Antifragile fans?'], LIB)).toBe(
      false,
    );
    expect(followUpsStandAlone(['It was about Antifragile, was it good?'], LIB)).toBe(false);
    expect(followUpsStandAlone(['Tell me about Antifragile.'], LIB)).toBe(false);
    expect(followUpsStandAlone(['What is the weather?'], LIB)).toBe(false);
  });
});
