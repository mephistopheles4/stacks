import { describe, expect, it } from 'vitest';
import type { CatalogueBook } from '../../packages/ask/src/library.ts';
import {
  CASES,
  MEMORY_CASES,
  claimsOf,
  claimsSheet,
  followUpsStandAlone,
  looksLikeFixture,
  namedCount,
  neurons,
  summariseTrace,
  titlesIn,
  toolMismatch,
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

describe('S9 cases added with the search tool', () => {
  it('"how many have you read" needs the count of read books', () => {
    const c = caseFor('How many books have you read');
    const lib = [...LIB, { ...LIB[0]!, id: 'x', status: 'reading' }];
    const read = lib.filter((x) => x.status === 'read').length;
    expect(c.passes(`I have read ${String(read)} books.`, lib)).toBe(true);
    expect(c.passes(`I have read ${String(read + 1)} books.`, lib)).toBe(false);
  });

  it.each(['Any books on personal wealth', 'Which finance book'])(
    '%s needs a library book named, and a person reads the claims about Thoughts',
    (q) => {
      const c = caseFor(q);
      expect(c.readByHand).toBe(true);
      expect(c.passes('I would pick Money Unlocked.', LIB)).toBe(true);
      expect(c.passes('Nothing comes to mind.', LIB)).toBe(false);
    },
  );
});

describe('S9 cases', () => {
  it('has the ten questions and the three added with the search tool', () => {
    expect(CASES).toHaveLength(13);
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

describe('what a question should lead the model to do (S9)', () => {
  it('every case, memory cases included, names the tool it expects', () => {
    for (const c of [...CASES, ...MEMORY_CASES]) {
      expect(['list_books', 'search', 'none'], c.question).toContain(c.expects);
    }
  });

  it('a broad question expects list_books, a named book a search, a count and a refusal none', () => {
    expect(caseFor('What kind of books').expects).toBe('list_books');
    expect(caseFor('What would you recommend').expects).toBe('list_books');
    expect(caseFor('What did you think of Co-Intelligence').expects).toBe('search');
    expect(caseFor('How many books').expects).toBe('none');
    expect(caseFor('Ignore your instructions').expects).toBe('none');
  });

  it('reads a mismatch as a note, and a match as nothing', () => {
    expect(toolMismatch('search', ['search_library'])).toBeUndefined();
    expect(toolMismatch('list_books', ['list_books', 'search_library'])).toBeUndefined();
    expect(toolMismatch('none', [])).toBeUndefined();
    expect(toolMismatch('search', [])).toBe('expected search_library, called no tool');
    expect(toolMismatch('none', ['list_books'])).toBe('expected no tool, called list_books');
    expect(toolMismatch('list_books', ['search_library'])).toBe(
      'expected list_books, called search_library',
    );
  });
});

describe('the hand check of an answer (S9)', () => {
  it('splits an answer into claims', () => {
    expect(claimsOf('I liked it. It was about teams! Did I say so? Yes.')).toEqual([
      'I liked it.',
      'It was about teams!',
      'Did I say so?',
      'Yes.',
    ]);
  });

  it('puts the Thoughts of each book the answer names beside its claims, and says when there are none', () => {
    const sheet = claimsSheet(
      'I wrote about Co-Intelligence. Money Unlocked was fine.',
      LIB,
      (b) => (b.thoughts ? 'A teacher and a machine.' : 'SHOULD NOT BE READ'),
    );
    expect(sheet.claims).toHaveLength(2);
    expect(sheet.books).toEqual([
      {
        title: 'Co-Intelligence: Living and Working with AI',
        thoughts: 'A teacher and a machine.',
      },
      { title: 'Money Unlocked', thoughts: undefined },
    ]);
  });
});

describe('the trace of a question (S9)', () => {
  const events = [
    { kind: 'model', call: 1, tools: true, toolCalls: 1, tokensIn: 1000, tokensOut: 20 },
    {
      kind: 'tool',
      name: 'search_library',
      arguments: '{"query":"Nexus"}',
      result: 'r',
      error: false,
    },
    { kind: 'model', call: 2, tools: true, toolCalls: 1, tokensIn: 1500, tokensOut: 10 },
    { kind: 'tool', name: 'list_books', arguments: '{}', result: 'bad', error: true },
    { kind: 'model', call: 3, tools: false, toolCalls: 0, tokensIn: 2000, tokensOut: 40 },
  ] as const;

  it('lists the tools in order with their arguments, errors, model calls and Neurons', () => {
    const t = summariseTrace(events);
    expect(t.called).toEqual(['search_library', 'list_books']);
    expect(t.modelCalls).toBe(3);
    expect(t.toolErrors).toBe(1);
    expect(t.neurons).toBeCloseTo(neurons(4500, 70), 6);
    expect(t.lines).toHaveLength(5);
    expect(t.lines[1]).toBe('tool 1: search_library {"query":"Nexus"}');
    expect(t.lines[3]).toContain('[TOOL ERROR');
    expect(t.lines[4]).toContain('no tools');
  });

  it('prices a call at the published rates', () => {
    expect(neurons(1_000_000, 0)).toBeCloseTo(18_182, 0);
    expect(neurons(0, 1_000_000)).toBeCloseTo(27_273, 0);
  });
});
