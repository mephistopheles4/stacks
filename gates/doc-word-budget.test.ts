/**
 * G71 — the agent-facing docs stay inside a word budget.
 *
 * An agent reads these files whole at the start of a session, so every word is
 * paid for on every run. A doc that tells how a rule came to be, rather than
 * what to do now, grows without bound and nothing goes red; history belongs in
 * `docs/adr/` and the dated logs in `docs/log/`, which this gate does not read.
 *
 * Each file below has a ceiling set just above its size when it was cut down to
 * what holds now. **A ceiling raised whenever it fails is a comment**: to add
 * words to a file at its ceiling, move the history out of it first, and raise a
 * ceiling only for a rule that is new.
 *
 * Two guards against a vacuous pass: the budget table must name files that
 * exist and are tracked, and the measuring function is shown to fail on a
 * document over its budget.
 *
 * See docs/gates.md, row G71 (doc-word-budget).
 */

import { describe, expect, it } from 'vitest';
import { expectFound, readRepoFile, trackedFiles } from './repo.ts';

/** File → the most words it may hold. Words are whitespace-separated runs. */
const BUDGETS: Readonly<Record<string, number>> = {
  'AGENTS.md': 6_150,
  'CONTEXT.md': 3_950,
  'CONTRIBUTING.md': 1_750,
  'docs/agents/issue-tracker.md': 2_400,
  'docs/commands.md': 15_300,
  'docs/gates.md': 31_800,
  'docs/notes-on-the-shelf.md': 1_350,
  'docs/progress.md': 3_500,
  'docs/shelf-inspectors.md': 2_500,
  'docs/spec/README.md': 4_900,
};

/** Whitespace-separated words, the count the budgets are written in. */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/** The files whose text holds more words than their budget allows, with both counts. */
function overBudget(
  budgets: Readonly<Record<string, number>>,
  read: (path: string) => string,
): string[] {
  return Object.entries(budgets)
    .map(([path, limit]) => ({ path, limit, words: wordCount(read(path)) }))
    .filter(({ words, limit }) => words > limit)
    .map(({ path, limit, words }) => `${path}: ${words} words, budget ${limit}`);
}

describe('G71 — the agent-facing docs stay inside a word budget', () => {
  it('holds every budgeted file to its ceiling', () => {
    const over = overBudget(BUDGETS, readRepoFile);

    expect(
      over,
      'files over their word budget. Move how-it-came-to-be text to docs/adr/ or ' +
        `docs/log/ rather than raising the ceiling:\n  ${over.join('\n  ')}`,
    ).toEqual([]);
  });

  it('budgets files that exist, are tracked, and are not trivially small', () => {
    const tracked = new Set(trackedFiles());
    const names = Object.keys(BUDGETS);

    expectFound(names, 'budgeted agent-facing docs', 10);
    expect(
      names.filter((path) => !tracked.has(path)),
      'budgeted files that are not tracked: a renamed or deleted doc must leave this table',
    ).toEqual([]);
    expect(
      names.filter((path) => wordCount(readRepoFile(path)) < 300),
      'a budgeted file this short is a moved file the budget no longer measures',
    ).toEqual([]);
  });

  it('is red on a document over its budget, and green on one inside it', () => {
    // The planted red: the same function the real check runs, on text that must fail.
    const texts: Record<string, string> = {
      'long.md': 'one two three four',
      'short.md': 'one two',
    };
    const read = (path: string): string => texts[path] ?? '';

    expect(overBudget({ 'long.md': 3, 'short.md': 3 }, read)).toEqual([
      'long.md: 4 words, budget 3',
    ]);
    expect(overBudget({ 'long.md': 4 }, read)).toEqual([]);
    expect(wordCount('  a\nb\t c  ')).toBe(3);
  });
});
