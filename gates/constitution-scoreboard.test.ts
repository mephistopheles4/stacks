/**
 * G19 — the constitution ↔ the scoreboard.
 *
 * `CLAUDE.md`'s "Invariants — never violate these" is this project's
 * constitution: the short list of rules nothing may break. `docs/gates.md` is
 * the scoreboard that claims each one is either gated in CI or visibly not.
 *
 * That claim was, until this file existed, prose. **Nothing read
 * `docs/gates.md`.** Every gate that mentioned it did so in a comment. The
 * scoreboard tracking which rules are enforced was the only unenforced thing in
 * the repo — which is precisely the failure it opens by describing:
 *
 *   > A rule nothing can fail on is a comment.
 *
 * Every check here was passing on the day it was written. That is the point: the
 * cost of this file is nearly zero today and the whole of it is paid the first
 * time somebody adds an invariant, renames a spec, or writes a gate and forgets
 * to score it. A row that goes stale silently is how the six defects listed at
 * the top of `gates.md` got in.
 *
 * See docs/gates.md, row G19.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expectFound, filesUnder, readRepoFile, REPO_ROOT } from './repo.ts';

const CONSTITUTION = 'CLAUDE.md';
const SCOREBOARD = 'docs/gates.md';

/**
 * The section of `CLAUDE.md` holding the numbered invariants.
 *
 * Throws rather than returning empty, for the same reason `commands.test.ts`
 * does: a renamed heading must fail loudly, not quietly reduce this whole file
 * to assertions over nothing.
 */
function constitutionSection(): string {
  const section = /^## Invariants[^\n]*\n([\s\S]*?)(?=\n## )/m.exec(readRepoFile(CONSTITUTION))?.[1];
  if (section === undefined) {
    throw new Error(`no "## Invariants" section in ${CONSTITUTION} — G19 cannot read the constitution`);
  }
  return section;
}

/** `1.`, `2.`, … — the article numbers, in order. */
function articleNumbers(): number[] {
  const found = [...constitutionSection().matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  expectFound(found, 'numbered invariants in CLAUDE.md', 3);
  return found;
}

/** Every `| **G7** | … |` line in the scoreboard, whichever table it sits in. */
function scoreboardRows(): { id: string; cells: string[] }[] {
  const rows = readRepoFile(SCOREBOARD)
    .split('\n')
    .filter((line) => /^\|\s*\*\*G\d+\*\*\s*\|/.test(line))
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return { id: /\*\*(G\d+)\*\*/.exec(cells[0] ?? '')?.[1] ?? '', cells };
    });

  expectFound(rows, 'scoreboard rows in docs/gates.md', 10);
  return rows;
}

/**
 * The statuses the scoreboard's own key defines, rather than a list hardcoded
 * here — otherwise adding a fourth symbol to the key would leave this gate
 * asserting against a vocabulary the document no longer uses.
 */
function allowedStatuses(): string[] {
  const key = /^## Status key\n([\s\S]*?)(?=\n## )/m.exec(readRepoFile(SCOREBOARD))?.[1];
  if (key === undefined) throw new Error(`no "## Status key" section in ${SCOREBOARD}`);

  const symbols = [...key.matchAll(/^\|\s*([^|\s]+)\s*\|\s*[a-z]/gm)].map((m) => m[1] ?? '');
  expectFound(symbols, 'status symbols in the scoreboard key', 2);
  return symbols;
}

/**
 * The rows only, joined — never the prose around them.
 *
 * The first version of this gate scanned the whole document and immediately
 * failed on its *own* commentary, which mentions `invariant 9` and a
 * `gates/*.test.ts` glob as examples of what makes it go red. That is the
 * correct answer to the wrong question: a row is a claim this file makes, and
 * prose is commentary about the claims. Only the former can be checked, and
 * commentary has to stay free to discuss a path that does not exist.
 */
function rowText(): string {
  return scoreboardRows()
    .map((row) => row.cells.join(' | '))
    .join('\n');
}

/** Repo-relative `.ts` paths named in backticks inside a scoreboard row. */
function specPathsNamed(): string[] {
  const paths = new Set<string>();
  for (const match of rowText().matchAll(/`((?:gates|packages|scripts)\/[^`*]+?\.ts)`/g)) {
    if (match[1] !== undefined) paths.add(match[1]);
  }
  const found = [...paths].sort();
  expectFound(found, 'spec files named in docs/gates.md rows', 10);
  return found;
}

describe('G19 — every article of the constitution is scored', () => {
  it('cites every numbered invariant at least once', () => {
    // Rows, not the whole file — otherwise a passing mention in the commentary
    // would satisfy "this invariant is protected", which is the opposite of
    // what this gate is for.
    const rows = rowText();
    const uncited = articleNumbers().filter(
      (n) => !new RegExp(`invariant ${n}\\b`, 'i').test(rows),
    );

    expect(
      uncited,
      'invariants in CLAUDE.md that no scoreboard row claims to protect. Add a row — ' +
        `⬜ "no gate yet" is an acceptable answer and the honest one: ${uncited.join(', ')}`,
    ).toEqual([]);
  });

  it('cites no invariant that does not exist', () => {
    // The reverse direction. Deleting invariant 5 while a row still cites it
    // leaves the scoreboard protecting a rule the constitution no longer has.
    const articles = new Set(articleNumbers());
    const cited = [...rowText().matchAll(/invariant (\d+)/gi)].map((m) => Number(m[1]));
    expectFound(cited, 'invariant citations in docs/gates.md rows', 3);

    const dangling = [...new Set(cited)].filter((n) => !articles.has(n)).sort((a, b) => a - b);

    expect(
      dangling,
      `scoreboard cites invariants that CLAUDE.md does not define: ${dangling.join(', ')}`,
    ).toEqual([]);
  });
});

describe('G19 — the scoreboard describes files that exist', () => {
  it('names no spec that has been moved or deleted', () => {
    const missing = specPathsNamed().filter((path) => !existsSync(join(REPO_ROOT, path)));

    expect(
      missing,
      'docs/gates.md names spec files that do not exist. A row pointing at a moved ' +
        `file reads as protection and is none: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('scores every gate in gates/, so none goes unrecorded', () => {
    // The direction nobody thinks of: writing a gate and not scoring it. The
    // scoreboard then understates coverage, which is the safe way to be wrong —
    // but it also means the rule it protects is invisible to anyone reading.
    const scoreboard = readRepoFile(SCOREBOARD);
    const specs = filesUnder('gates', ['.test.ts']);
    expectFound(specs, 'gate specs under gates/', 10);

    const unscored = specs.filter((path) => !scoreboard.includes(path));

    expect(
      unscored,
      `gates that no row in docs/gates.md mentions: ${unscored.join(', ')}`,
    ).toEqual([]);
  });
});

describe('G19 — the scoreboard is well formed', () => {
  it('gives every row a status from its own key', () => {
    const allowed = allowedStatuses();
    const wrong = scoreboardRows()
      .filter((row) => {
        const status = row.cells.at(-1) ?? '';
        return !allowed.some((symbol) => status.startsWith(symbol));
      })
      .map((row) => `${row.id} ("${row.cells.at(-1) ?? ''}")`);

    expect(
      wrong,
      `rows whose status is not one of ${allowed.join(' ')} — the key at the top of ` +
        `docs/gates.md defines the vocabulary: ${wrong.join(', ')}`,
    ).toEqual([]);
  });

  it('numbers every row uniquely', () => {
    const ids = scoreboardRows().map((row) => row.id);
    const duplicated = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

    expect(duplicated, `row numbers used twice: ${duplicated.join(', ')}`).toEqual([]);
  });

  it('leaves no gap in the row numbering', () => {
    // A missing G-number means a row was deleted rather than marked ⬜, which
    // loses the fact that the rule was once considered at all.
    const numbers = scoreboardRows()
      .map((row) => Number(row.id.slice(1)))
      .sort((a, b) => a - b);
    const gaps = [];
    for (let n = 1; n < (numbers.at(-1) ?? 0); n += 1) {
      if (!numbers.includes(n)) gaps.push(`G${n}`);
    }

    expect(
      gaps,
      `row numbers missing from docs/gates.md. Retire a row by marking it, not by ` +
        `deleting it: ${gaps.join(', ')}`,
    ).toEqual([]);
  });
});
