/**
 * G58 — `docs/adr/`'s record files ↔ `docs/adr/README.md`'s index table.
 *
 * The index is a second copy of the directory listing with nothing holding it to
 * the first, the shape G14, G19, G41 and G45 each close for their own pair of
 * documents. This closes it for the decision records: **every record file has
 * exactly one row, and no number means two records** — among the files, and
 * separately among the rows.
 *
 * ## Why two uniqueness clauses and not one
 *
 * Two files at 0075 with a single row between them fails *files are unique* and
 * passes *rows are unique*. Two rows at 0075 over one file fails the other way.
 * **A check stating only one of them passes half the failure**, so both are
 * written, and every clause counts rather than asks — G41's recorded lesson,
 * where *"each row has an entry"* was satisfied by a file carrying two.
 *
 * The number is read from the index's **number column**, and held equal to the
 * number of the file that row links to. A check comparing filenames alone
 * cannot see a duplicate number at all, and `[0075](./0076-….md)` is a row that
 * means one record to a reader and another to the link resolver.
 *
 * ## Uniqueness, never contiguity — and 0071 is why
 *
 * ⚠️ **There is no gapless clause here, and adding one would be red on `main`.**
 * On 2026-08-23 four sessions each committed a `0071-*.md`, and every one of
 * them moved off it: the tree has held records up to 0085 with **0071 missing**
 * ever since. That hole is correct and stays. Gate rows in `docs/gates.md` are
 * gapless because retiring one means marking it; an ADR number abandoned on a
 * dead branch has no row to mark, and filling it later lets a reference written
 * on that branch name a different decision — so a gap here is not merely
 * legitimate but sometimes unavoidable, with only `main` able to say so.
 * **The two errors are not equally costly**: a gap is free, and a duplicate is
 * silent. This gate makes the duplicate loud and leaves the gap alone.
 *
 * ## What it does not do, and must not be sold as doing
 *
 * ⚠️ **It would have prevented none of the four 0071 and 0075 collisions** that
 * produced it (#263). Every duplicate lived on an unmerged branch, and a
 * merge-time check sees only the second branch to merge. What it buys is the
 * conversion of a **silent landed collision** into a **late red**, at the one
 * moment renaming a file on your own branch is cheapest — instead of a human
 * noticing a directory listing months later. **It is not coordination between
 * sessions**, and nothing in it reads another branch.
 *
 * The row-to-file direction — a row whose link names no file — is G29's
 * (`doc-links`), which resolves every local Markdown link. It is not rebuilt.
 *
 * ## The floors
 *
 * 80 files and 80 rows, below the 84 records present on landing. **Safe only
 * because the corpus is append-never-edit**: `docs/adr/README.md` tells a writer
 * to add a record rather than delete one, so the population does not fall in
 * normal operation. A floor exists because a record pattern that stops matching
 * would leave both directions passing over nothing.
 *
 * See docs/gates.md, row G58 (adr-index).
 */

import { describe, expect, it } from 'vitest';
import { expectFound, filesUnder, readRepoFile, tableCells } from './repo.ts';

const DIRECTORY = 'docs/adr';
const INDEX = `${DIRECTORY}/README.md`;

/** The one filename a record may take: four digits, a kebab slug, `.md`. */
const RECORD_FILE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/**
 * The one row shape the index may take: `| [0079](./0079-slug.md) | Decision |`.
 * Written once and used twice, by the sweep that reads rows and by the
 * near-miss check that refuses everything else — G41's reason, where two
 * patterns were two definitions of "an entry" and the gap between them the hole.
 */
const ROW_CELL = /^\[(\d{4})\]\(\.\/([^)]+)\)$/;

interface Row {
  readonly number: string;
  readonly target: string;
}

/**
 * Every index row, as a list and never a map: a map keyed on the number would
 * silently collapse a duplicate row, which is one of the failures this is for.
 */
function rowsOf(index: string): { rows: Row[]; strays: string[] } {
  const rows: Row[] = [];
  const strays: string[] = [];

  for (const line of index.split('\n')) {
    if (!line.startsWith('|')) continue;
    const first = tableCells(line)[0] ?? '';
    if (first === '#' || /^-+$/.test(first)) continue;

    const match = ROW_CELL.exec(first);
    if (match) rows.push({ number: match[1] ?? '', target: match[2] ?? '' });
    else strays.push(line);
  }
  return { rows, strays };
}

/** How many times each value occurs — counted, because membership was G41's hole. */
function countsOf(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** The numbers that occur more than once, each named with how many times. */
function duplicated(numbers: readonly string[]): string[] {
  return [...countsOf(numbers)]
    .filter(([, count]) => count > 1)
    .map(([number, count]) => `${number} × ${count}`);
}

/**
 * Every disagreement between a directory listing and an index, by clause.
 *
 * Pure over its two inputs so the planted failures below are asserted forever
 * rather than observed once and reverted.
 */
function problems(names: readonly string[], index: string) {
  const records = names.filter((name) => name !== 'README.md');
  const files = records.filter((name) => RECORD_FILE.test(name));
  const { rows, strays } = rowsOf(index);

  const rowCounts = countsOf(rows.map(({ target }) => target));

  return {
    files,
    rows,
    strayFiles: records.filter((name) => !RECORD_FILE.test(name)),
    strayRows: strays,
    duplicateFileNumbers: duplicated(files.map((name) => RECORD_FILE.exec(name)?.[1] ?? '')),
    duplicateRowNumbers: duplicated(rows.map(({ number }) => number)),
    filesWithoutOneRow: files
      .map((name) => ({ name, count: rowCounts.get(name) ?? 0 }))
      .filter(({ count }) => count !== 1)
      .map(({ name, count }) => `${name} has ${count} rows`),
    mislabelledRows: rows
      .filter(({ number, target }) => RECORD_FILE.exec(target)?.[1] !== number)
      .map(({ number, target }) => `[${number}] links ${target}`),
  };
}

const HEADER = '| # | Decision |\n| --- | --- |\n';
const row = (number: string, file: string): string => `| [${number}](./${file}) | A decision |\n`;

describe('G58 — the clauses, against planted failures', () => {
  it('is clean on a gap: no contiguity clause exists', () => {
    const found = problems(
      ['README.md', '0070-a.md', '0072-b.md'],
      HEADER + row('0070', '0070-a.md') + row('0072', '0072-b.md'),
    );

    expect(found).toMatchObject({
      strayFiles: [],
      strayRows: [],
      duplicateFileNumbers: [],
      duplicateRowNumbers: [],
      filesWithoutOneRow: [],
      mislabelledRows: [],
    });
  });

  it('refuses two files numbered the same, both indexed', () => {
    const found = problems(
      ['0075-a.md', '0075-b.md'],
      HEADER + row('0075', '0075-a.md') + row('0075', '0075-b.md'),
    );

    expect(found.duplicateFileNumbers).toEqual(['0075 × 2']);
    expect(found.duplicateRowNumbers).toEqual(['0075 × 2']);
  });

  it('refuses two files numbered the same under a single row', () => {
    const found = problems(['0075-a.md', '0075-b.md'], HEADER + row('0075', '0075-a.md'));

    expect(found.duplicateFileNumbers).toEqual(['0075 × 2']);
    expect(found.duplicateRowNumbers).toEqual([]);
    expect(found.filesWithoutOneRow).toEqual(['0075-b.md has 0 rows']);
  });

  it('refuses a record with no row', () => {
    const found = problems(['0001-a.md', '0002-b.md'], HEADER + row('0001', '0001-a.md'));

    expect(found.filesWithoutOneRow).toEqual(['0002-b.md has 0 rows']);
  });

  it('refuses two rows for one number over one file', () => {
    const found = problems(
      ['0075-a.md'],
      HEADER + row('0075', '0075-a.md') + row('0075', '0075-a.md'),
    );

    expect(found.duplicateRowNumbers).toEqual(['0075 × 2']);
    expect(found.filesWithoutOneRow).toEqual(['0075-a.md has 2 rows']);
  });

  it('refuses a row whose number is not its link’s', () => {
    const found = problems(['0076-a.md'], HEADER + row('0075', '0076-a.md'));

    expect(found.mislabelledRows).toEqual(['[0075] links 0076-a.md']);
  });

  it('refuses a record filename and an index row this sweep cannot read', () => {
    const found = problems(
      ['86-a.md', '0086_b.md', '0086.md'],
      `${HEADER}| 0086 | Unlinked |\n| [86](./86-a.md) | Short |\n`,
    );

    expect(found.strayFiles).toEqual(['86-a.md', '0086_b.md', '0086.md']);
    expect(found.strayRows).toHaveLength(2);
    expect(found.files).toEqual([]);
  });
});

describe('G58 — the tree', () => {
  const names = filesUnder(DIRECTORY, ['.md']).map((path) => path.slice(DIRECTORY.length + 1));
  const found = problems(names, readRepoFile(INDEX));

  it('reads the records and the rows', () => {
    expectFound(found.files, `record files in ${DIRECTORY}`, 80);
    expectFound(found.rows, `index rows in ${INDEX}`, 80);
  });

  it('has no record file or index row in a form this gate cannot see', () => {
    expect(
      [...found.strayFiles, ...found.strayRows],
      `files in ${DIRECTORY} not named \`NNNN-kebab-slug.md\`, or table rows in ${INDEX} ` +
        'not shaped `| [NNNN](./NNNN-slug.md) | … |`. Each is a record a human sees and ' +
        'this sweep does not',
    ).toEqual([]);
  });

  it('numbers no two record files the same', () => {
    expect(
      found.duplicateFileNumbers,
      `ADR numbers carried by more than one file in ${DIRECTORY}. Records cite each ` +
        'other by number, so this number now means two decisions. Rename the record on ' +
        'your branch to a free number — a gap is fine — and update its inbound references',
    ).toEqual([]);
  });

  it('numbers no two index rows the same', () => {
    expect(
      found.duplicateRowNumbers,
      `ADR numbers carried by more than one row of ${INDEX}`,
    ).toEqual([]);
  });

  it('gives every record file exactly one row', () => {
    expect(
      found.filesWithoutOneRow,
      `record files without exactly one row in ${INDEX}. A record with no row is ` +
        'invisible to a reader of the index; one with two is a duplicate',
    ).toEqual([]);
  });

  it('labels every row with the number of the file it links', () => {
    expect(
      found.mislabelledRows,
      `rows of ${INDEX} whose number column disagrees with their link`,
    ).toEqual([]);
  });
});
