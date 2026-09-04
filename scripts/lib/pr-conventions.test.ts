/**
 * The judgement half of G55 (`pr-conventions`).
 *
 * An ordinary unit test and **not** a `gates/` spec, which is the split
 * `vitest.config.ts` documents: `gates/` holds rules about the shape of the tree
 * and every file in it takes a `docs/gates.md` row, while a module's behaviour
 * is tested where the module lives. `gates/pr-conventions.test.ts` asserts what
 * the disk says — that the lists match `AGENTS.md`, that the job runs, that no
 * `run:` step interpolates user text. This asserts what the matcher decides.
 *
 * The same split `scripts/lib/floors.test.ts` and `gates/ignored-mutants.test.ts`
 * already make, for the reason recorded on G43's row.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BODY_EXEMPT_AUTHORS,
  SCOPES,
  TYPES,
  bodyFaults,
  protectedQuestions,
  pullRequestFaults,
  titleFault,
} from './pr-conventions.ts';

const TEMPLATE = readFileSync('.github/pull_request_template.md', 'utf8');

/** A body that answers both questions, used wherever the title is what is under test. */
const GOOD_BODY = [
  '## What changed, and why',
  '',
  'A paragraph.',
  '',
  '## Which invariant does this touch?',
  '',
  'None.',
  '',
  '## Which gate would catch this breaking again?',
  '',
  'G55.',
  '',
].join('\n');

describe('titleFault — the shape', () => {
  it('passes a conforming title', () => {
    expect(titleFault('feat(site): a thing')).toBeUndefined();
  });

  it('passes a title with no scope, which is optional', () => {
    expect(titleFault('fix: a thing')).toBeUndefined();
  });

  it("passes Conventional Commits' breaking-change marker, with and without a scope", () => {
    // AGENTS.md cites the spec, so a construct the spec defines cannot be a
    // fault this repository invented.
    expect(titleFault('feat!: a thing')).toBeUndefined();
    expect(titleFault('feat(core)!: a thing')).toBeUndefined();
  });

  it('fails a title with no type at all, as a shape fault', () => {
    expect(titleFault('a thing')?.kind).toBe('shape');
  });

  it('fails a type with no subject', () => {
    expect(titleFault('feat(site): ')?.kind).toBe('shape');
    expect(titleFault('feat(site):')?.kind).toBe('shape');
  });

  it('fails a missing space after the colon', () => {
    expect(titleFault('feat(site):a thing')?.kind).toBe('shape');
  });
});

describe('titleFault — the type slot', () => {
  it('names the type as the fault when the type is capitalised', () => {
    // The whole reason the shape is parsed loosely: `Feat` is a wrong *word*,
    // and telling the author "does not match the shape" would hide that.
    const fault = titleFault('Feat(site): a thing');

    expect(fault?.kind).toBe('type');
    expect(fault?.message).toContain('Feat');
  });

  it('fails an invented type', () => {
    expect(titleFault('wip: a thing')?.kind).toBe('type');
  });

  it('fails each of the four branch prefixes that are not commit types', () => {
    // `docs/` is a branch prefix *and* a commit type, so only three of the four
    // are refused — AGENTS.md names all four deliberately, and this is the
    // reverse of that care: a prefix must not become a type by analogy.
    for (const prefix of ['research', 'prototype', 'experiment']) {
      expect(titleFault(`${prefix}: a thing`)?.kind, `\`${prefix}:\` must not be a type`).toBe(
        'type',
      );
    }

    expect(titleFault('docs: a thing'), '`docs` is a type as well as a prefix').toBeUndefined();
  });

  it('admits every declared type', () => {
    for (const type of TYPES) {
      expect(titleFault(`${type}: a thing`), `\`${type}\` is a declared type`).toBeUndefined();
    }
  });
});

describe('titleFault — the scope slot', () => {
  it('fails an undeclared scope rather than passing it silently', () => {
    const fault = titleFault('feat(shelf): a thing');

    expect(fault?.kind).toBe('scope');
    expect(fault?.message).toContain('shelf');
  });

  it('fails an empty scope', () => {
    expect(titleFault('feat(): a thing')?.kind).toBe('scope');
  });

  it('admits every declared scope', () => {
    for (const scope of SCOPES) {
      expect(titleFault(`feat(${scope}): a thing`), `\`${scope}\` is declared`).toBeUndefined();
    }
  });

  it('reads the two slots separately and never compares them', () => {
    // `docs` and `ci` are each a type and a scope. The owner ruled on this: all
    // three of these pass, and a rule objecting to the pair would be inventing
    // a constraint neither list states.
    for (const title of ['docs: x', 'docs(docs): x', 'feat(docs): x', 'ci(ci): x']) {
      expect(titleFault(title), `\`${title}\` must pass`).toBeUndefined();
    }
  });
});

describe('protectedQuestions — derived from the template, never copied', () => {
  it('finds exactly the two questions the template says may not be deleted', () => {
    expect(protectedQuestions(TEMPLATE)).toEqual([
      'Which invariant does this touch?',
      'Which gate would catch this breaking again?',
    ]);
  });

  it('does not mine the template comments for question marks', () => {
    // The template's prose discusses its own sections at length, and one of
    // those sentences ends in a question mark. Stripping comments first is what
    // keeps the derivation honest.
    expect(protectedQuestions('<!-- Is this a heading? -->\n\n## A section\n')).toEqual([]);
  });
});

describe('bodyFaults — headings and the presence of text', () => {
  const questions = protectedQuestions(TEMPLATE);

  it('passes a body that answers both', () => {
    expect(bodyFaults(GOOD_BODY, questions)).toEqual([]);
  });

  it('passes a body with an unrelated section deleted', () => {
    // The template tells an author to delete a section that does not apply, so
    // a rule demanding every heading would contradict the file it enforces.
    // GOOD_BODY carries neither `## Decisions` nor `## Checks`.
    expect(GOOD_BODY).not.toContain('## Checks');
    expect(bodyFaults(GOOD_BODY, questions)).toEqual([]);
  });

  it('fails a body missing either question, and names which', () => {
    for (const question of questions) {
      const without = GOOD_BODY.replace(`## ${question}`, '## Something else');
      const faults = bodyFaults(without, questions);

      expect(faults.length, `dropping \`${question}\` must be one fault`).toBe(1);
      expect(faults[0]?.message).toContain(question);
    }
  });

  it('fails a heading whose only content is the template comment', () => {
    const unanswered = GOOD_BODY.replace('None.', '<!-- Name it from AGENTS.md -->');
    const faults = bodyFaults(unanswered, questions);

    expect(faults.length).toBe(1);
    expect(faults[0]?.message).toContain('empty');
  });

  it('fails an empty body with one fault per question', () => {
    expect(bodyFaults('', questions).length).toBe(questions.length);
  });

  it('reads a body that arrives with CRLF line endings', () => {
    // The GitHub API hands back `\r\n`. A `$` anchor that never matched a
    // heading line would fail every pull request on the platform it runs on.
    expect(bodyFaults(GOOD_BODY.replace(/\n/g, '\r\n'), questions)).toEqual([]);
  });

  it('reads the answer under a heading written at another level', () => {
    expect(bodyFaults(GOOD_BODY.replace(/^## /gm, '### '), questions)).toEqual([]);
  });
});

describe('pullRequestFaults — the two rules together', () => {
  const pull = {
    title: 'feat(site): a thing',
    body: GOOD_BODY,
    author: 'someone',
    template: TEMPLATE,
  };

  it('passes a conforming pull request', () => {
    expect(pullRequestFaults(pull)).toEqual([]);
  });

  it('reports the title fault first', () => {
    const faults = pullRequestFaults({ ...pull, title: 'wip: a thing', body: '' });

    expect(faults[0]?.kind).toBe('type');
    expect(faults.length).toBe(3);
  });

  it('treats a null body as an empty one', () => {
    expect(pullRequestFaults({ ...pull, body: null }).length).toBe(2);
  });

  it('exempts a Dependabot body and still checks its title', () => {
    const bot = {
      ...pull,
      author: BODY_EXEMPT_AUTHORS[0],
      body: 'Bumps astro from 7.2.3 to 7.2.7.',
    };

    expect(pullRequestFaults({ ...bot, title: 'ci: bump astro from 7.2.3 to 7.2.7' })).toEqual([]);
    expect(pullRequestFaults({ ...bot, title: 'Bump astro' })[0]?.kind).toBe('shape');
  });

  it('does not exempt anybody else', () => {
    expect(pullRequestFaults({ ...pull, body: '' }).length).toBe(2);
  });
});
