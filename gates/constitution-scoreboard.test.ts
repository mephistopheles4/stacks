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
 * **Every assertion here anchors to the cell that carries the claim**, never to
 * the row and never to the document. The first version of this gate did neither
 * consistently and shipped three holes, each found by review and each recorded
 * in `docs/gates.md`: a citation satisfied by the word "invariant" appearing in
 * any cell, a spec path invisible unless it began with one of three directory
 * names, and a gate counted as scored because its filename appeared in a
 * paragraph. A gate that matches loosely matches anything.
 *
 * See docs/gates.md, row G19.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  expectFound,
  filesUnder,
  markdownSection,
  readRepoFile,
  REPO_ROOT,
  tableCells,
} from './repo.ts';

const CONSTITUTION = 'CLAUDE.md';
const SCOREBOARD = 'docs/gates.md';

/** `1.`, `2.`, … — the article numbers, in the order the constitution lists them. */
function articleNumbers(): number[] {
  const section = markdownSection(readRepoFile(CONSTITUTION), 'Invariants', CONSTITUTION);
  const found = [...section.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  expectFound(found, 'numbered invariants in CLAUDE.md', 3);
  return found;
}

/** Every `| **G7** | … |` row in the scoreboard, whichever table it sits in. */
function scoreboardRows(): { id: string; cells: string[] }[] {
  const rows = readRepoFile(SCOREBOARD)
    .split('\n')
    .filter((line) => /^\|\s*\*\*G\d+\*\*\s*\|/.test(line))
    .map((line) => {
      const cells = tableCells(line);
      return { id: /\*\*(G\d+)\*\*/.exec(cells[0] ?? '')?.[1] ?? '', cells };
    });

  expectFound(rows, 'scoreboard rows in docs/gates.md', 10);
  return rows;
}

/**
 * The **Source** cell of each row in the `Invariants → gates` table — the only
 * place in this repo where "this row protects invariant N" is actually claimed.
 *
 * Scoped this tightly because the looser versions are demonstrably wrong. Over
 * the whole file, G19's own commentary — which cites `invariant 9` as an example
 * of what makes it go red — reads as a claim. Over whole rows, an incidental
 * mention in a Failure-mode cell of an unrelated gate satisfies "invariant 6 is
 * protected". `docs/gates.md` already recorded that lesson once, about G14: a
 * gate that matches prose matches anything.
 */
function invariantSourceCells(): string[] {
  const table = markdownSection(readRepoFile(SCOREBOARD), 'Invariants → gates', SCOREBOARD);
  const sources = table
    .split('\n')
    .filter((line) => /^\|\s*\*\*G\d+\*\*\s*\|/.test(line))
    .map((line) => tableCells(line)[2] ?? '');

  expectFound(sources, 'Source cells in the Invariants → gates table', 5);
  return sources;
}

/**
 * The statuses the scoreboard's own key defines, rather than a list hardcoded
 * here — otherwise adding a fourth symbol to the key would leave this gate
 * asserting against a vocabulary the document no longer uses.
 */
function allowedStatuses(): string[] {
  const key = markdownSection(readRepoFile(SCOREBOARD), 'Status key', SCOREBOARD);
  const symbols = [...key.matchAll(/^\|\s*([^|\s]+)\s*\|\s*[a-z]/gm)].map((m) => m[1] ?? '');
  expectFound(symbols, 'status symbols in the scoreboard key', 2);
  return symbols;
}

/**
 * Every backticked path naming a file, taken from scoreboard **rows** only.
 *
 * Any path with a directory separator and a `.ts` ending counts. An earlier
 * version required the path to start with `gates/`, `packages/` or `scripts/`,
 * which made every other root invisible — and the repo's one real instance of a
 * row naming a file that does not exist, G10's `covers/cover-path.test.ts`, sat
 * in exactly that blind spot. An allowlist of directory names was the wrong
 * shape for "does this resolve": the filesystem already answers that.
 */
function specPathsNamed(): string[] {
  const rows = scoreboardRows()
    .map((row) => row.cells.join(' | '))
    .join('\n');

  const paths = new Set<string>();
  for (const match of rows.matchAll(/`([^`\s*]+\/[^`\s*]+\.ts)`/g)) {
    if (match[1] !== undefined) paths.add(match[1]);
  }

  const found = [...paths].sort();
  expectFound(found, 'spec files named in docs/gates.md rows', 10);
  return found;
}

describe('G19 — every article of the constitution is scored', () => {
  it('cites every numbered invariant in a Source cell', () => {
    const sources = invariantSourceCells().join('\n');
    const uncited = articleNumbers().filter(
      (n) => !new RegExp(`invariant ${n}\\b`, 'i').test(sources),
    );

    expect(
      uncited,
      'invariants in CLAUDE.md that no row of the Invariants → gates table claims to ' +
        `protect. Add a row — ⬜ "no gate yet" is an acceptable answer and the honest ` +
        `one: ${uncited.join(', ')}`,
    ).toEqual([]);
  });

  it('cites no invariant that does not exist', () => {
    // The reverse direction. Deleting invariant 5 while a row still cites it
    // leaves the scoreboard protecting a rule the constitution no longer has.
    const articles = new Set(articleNumbers());
    const cited = [...invariantSourceCells().join('\n').matchAll(/invariant (\d+)/gi)].map((m) =>
      Number(m[1]),
    );
    expectFound(cited, 'invariant citations in the Invariants → gates table', 3);

    const dangling = [...new Set(cited)].filter((n) => !articles.has(n)).sort((a, b) => a - b);

    expect(
      dangling,
      `scoreboard cites invariants that CLAUDE.md does not define: ${dangling.join(', ')}`,
    ).toEqual([]);
  });

  it('numbers the articles uniquely and without gaps', () => {
    // The scoreboard's row numbers are held to this below; the constitution's
    // article numbers were not, which let two rules both be "invariant 2" —
    // and a citation of 2 would then be ambiguous about what it protects.
    const numbers = articleNumbers();
    const expected = numbers.map((_, i) => i + 1);

    expect(
      numbers,
      'CLAUDE.md invariants must be numbered 1..n with no repeats or gaps, because ' +
        'the scoreboard cites them by number',
    ).toEqual(expected);
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

  it('scores every gate in gates/ in a row, not merely in prose', () => {
    // The direction nobody thinks of: writing a gate and never scoring it. This
    // reads rows rather than the file for the same reason the citation check
    // does — a filename that happens to appear in a paragraph is not a row, and
    // counting it as one lets a gate be "scored" by commentary about something
    // else entirely.
    const rows = scoreboardRows()
      .map((row) => row.cells.join(' | '))
      .join('\n');
    const specs = filesUnder('gates', ['.test.ts']);
    expectFound(specs, 'gate specs under gates/', 10);

    const unscored = specs.filter((path) => !rows.includes(path));

    expect(
      unscored,
      `gates that no row in docs/gates.md names: ${unscored.join(', ')}`,
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
    // The scoreboard documents this rule under "Retiring a row"; it is asserted
    // here rather than invented here.
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
