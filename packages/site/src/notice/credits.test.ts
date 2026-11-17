import { describe, expect, it } from 'vitest';
import {
  buildCredits,
  creditSections,
  headingLevels,
  type CreditInput,
  type CreditNote,
} from './credits.ts';

const input = (over: Partial<CreditInput> = {}): CreditInput => ({
  title: 'Desk',
  author: 'Ada',
  licence: 'CC BY 4.0',
  page: 'https://example.org/desk',
  ...over,
});
const note = (over: Partial<CreditNote> = {}): CreditNote => ({
  name: 'The desk',
  usedFor: 'the desk',
  modified: 'Rescaled.',
  ...over,
});
const DESK = 'https://example.org/desk';

describe('creditSections and headingLevels', () => {
  it('splits the rows into the ones that ask for credit and the courtesy ones', () => {
    const { required, courtesy } = creditSections(
      [input(), input({ page: 'https://example.org/b', licence: 'CC0' })],
      { [DESK]: note({ name: 'Desk' }), 'https://example.org/b': note({ name: 'Other' }) },
    );
    expect(required.map((r) => r.name)).toEqual(['Desk']);
    expect(courtesy.map((r) => r.name)).toEqual(['Other']);
  });

  it('puts the sections one level under the title', () => {
    expect(headingLevels('h1')).toEqual({ title: 'h1', section: 'h2' });
    expect(headingLevels('h2')).toEqual({ title: 'h2', section: 'h3' });
  });
});

describe('buildCredits', () => {
  it('makes one row of the creator, link, licence and note', () => {
    expect(buildCredits([input()], { [DESK]: note() })).toEqual([
      {
        name: 'The desk',
        creators: ['Ada'],
        creatorsText: 'Ada',
        link: DESK,
        licence: 'CC BY 4.0',
        licenceLink: 'https://creativecommons.org/licenses/by/4.0/',
        usedFor: 'the desk',
        modified: 'Rescaled.',
        required: true,
      },
    ]);
  });

  it('folds the files of one asset into one row', () => {
    const rows = buildCredits([input(), input({ title: 'Desk texture' })], { [DESK]: note() });
    expect(rows).toHaveLength(1);
  });

  it("leaves a derived file's author out of the creators", () => {
    const rows = buildCredits([input(), input({ author: 'made here', derive: {} })], {
      [DESK]: note(),
    });
    expect(rows[0]?.creators).toEqual(['Ada']);
  });

  it('puts CC BY rows first, marks only those required, and has no licence link for public domain', () => {
    const rows = buildCredits(
      [
        input({ page: 'https://example.org/a', licence: 'public domain' }),
        input({ page: 'https://example.org/b', licence: 'CC0' }),
        input(),
      ],
      {
        // named against the input order, so the name tie-break is what puts A before B
        'https://example.org/a': note({ name: 'B' }),
        'https://example.org/b': note({ name: 'A' }),
        [DESK]: note({ name: 'Z' }),
      },
    );
    expect(rows.map((r) => [r.name, r.required])).toEqual([
      ['Z', true],
      ['A', false],
      ['B', false],
    ]);
    expect(rows[1]?.licenceLink).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
    expect(rows[2]?.licenceLink).toBeUndefined();
  });

  it('reads null as unmodified', () => {
    expect(
      buildCredits([input()], { [DESK]: note({ modified: null }) })[0]?.modified,
    ).toBeUndefined();
  });

  it('refuses an input with no entry, naming its page', () => {
    expect(() => buildCredits([input()], {})).toThrow(
      /no entry in credits\.json for https:\/\/example\.org\/desk/,
    );
  });

  it('refuses an entry no input names', () => {
    expect(() =>
      buildCredits([input()], { [DESK]: note(), 'https://example.org/gone': note() }),
    ).toThrow(/credits a page no input names: https:\/\/example\.org\/gone/);
  });

  it('refuses an empty modified, a non-https link and mixed licences', () => {
    expect(() => buildCredits([input()], { [DESK]: note({ modified: '' }) })).toThrow(
      /empty `modified`/,
    );
    expect(() =>
      buildCredits([input({ page: 'http://example.org/desk' })], {
        'http://example.org/desk': note(),
      }),
    ).toThrow(/not an https link/);
    expect(() => buildCredits([input(), input({ licence: 'CC0' })], { [DESK]: note() })).toThrow(
      /more than one licence/,
    );
  });
});
