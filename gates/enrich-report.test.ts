/**
 * G27 — a command's report accounts for every book it considered.
 *
 * `stacks enrich` printed a header counting the books with gaps, then a footer
 * counting what it did, and the two did not have to agree. On the real vault
 * they did not: **`6 with gaps` against `would fill 3, 2 left alone`.** Five
 * books out of six. The missing one had a gap, was looked up, was matched
 * correctly, and had nothing to fill — an outcome `enrichBook` folded into
 * `complete` alongside *had no gaps at all*, which the command reasonably
 * treated as nothing to say.
 *
 * The defect is small and the shape of it is not. A report is an instrument, and
 * this one under-reported without saying so — which is how it misled a decision:
 * issue #62 read "7 with gaps, would fill 1, 5 left alone" off this output and
 * concluded a seventh book had fallen through the lookup. Nothing had. That was
 * this.
 *
 * **This gate asserts the claim, not the implementation.** Every book with a gap
 * appears in exactly one line and exactly one total, and no book with a gap is
 * reported as having had none. Both were false before the split, and the second
 * is what goes red if `unfilled` is ever folded back into `complete`.
 *
 * Verified by mutation rather than by reading, per this file's neighbours:
 * reverting `enrich.ts`'s `unfilled` return to `complete` turns two of the five
 * books below into "nothing was missing" and fails the second test.
 *
 * See docs/gates.md, row G27 (enrich-report).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import { enrichBook, missingFields } from '../packages/core/src/enrich.ts';
import type { EnrichOutcome } from '../packages/core/src/enrich.ts';
import type { HttpGet } from '../packages/core/src/metadata/http.ts';
import {
  enrichReport,
  enrichSummary,
  reportEntry,
  type EnrichEntry,
} from '../packages/cli/src/enrich-report.ts';

const KNOWN_ISBN = '9781603580557';

/**
 * Every provider answers from here, and most of them answer nothing.
 *
 * Two routes, chosen so each book below lands in a known outcome without a
 * second of ambiguity: an Open Library title search that answers only for
 * queries mentioning "Systems", and an ISBN lookup that answers with a record
 * carrying **a title and nothing else** — which is the whole point of the fourth
 * book. Everything else is a miss.
 *
 * No fixture files: these responses stand for provider *behaviour* rather than
 * for any real book, and inventing them here keeps the shapes beside the
 * assertions that depend on them. G26 is where captured responses belong.
 */
const providers: HttpGet = async (url) => {
  if (url.includes('/search.json')) {
    return url.includes('Systems')
      ? {
          docs: [
            {
              title: 'Thinking in Systems',
              author_name: ['Donella H. Meadows'],
              number_of_pages_median: 240,
            },
          ],
        }
      : undefined;
  }
  if (url.includes('/api/books')) {
    return { [`ISBN:${KNOWN_ISBN}`]: { title: 'A Book With Nothing To Add' } };
  }
  return undefined;
};

/**
 * Five books, **all of them with a gap** — which is the set the command's header
 * counts, and so the set this gate is about. Between them they reach every
 * outcome `enrichBook` can return for such a book.
 */
const BOOKS = [
  // Filled: the search knows it and offers a page count.
  { title: 'Thinking in Systems', author: 'Donella H. Meadows' },
  // Mismatch: shares enough words to be returned, not enough to be the book.
  { title: 'Systems Thinking for Gardeners', author: 'Someone Else' },
  // Not found: nobody answers at all.
  { title: 'A Book Nobody Has Written', author: 'Nobody' },
  // Unfilled, having asked: the ISBN resolves, and the record carries nothing
  // this note is missing.
  {
    title: 'A Book With Nothing To Add',
    isbn: KNOWN_ISBN,
    pages: 240,
    cover: 'covers/known.jpg',
    spineColor: '#123456',
  },
  // Unfilled, having asked nobody: only `spine_color` is missing, and it is read
  // from a cover that is not on disk. No provider is involved in this one.
  {
    title: 'A Cover That Is Not There',
    author: 'Someone',
    isbn: '9780262046305',
    pages: 100,
    cover: 'covers/nope.jpg',
  },
] as const;

async function reportOnFixtureVault(vault: ObsidianAdapter): Promise<{
  entries: EnrichEntry[];
  report: ReturnType<typeof enrichReport>;
}> {
  const books = await vault.listBooks();
  // The command's own filter, and the population the header counts.
  const candidates = books.filter((book) => missingFields(book).length > 0);
  expect(candidates, 'every fixture book must have a gap').toHaveLength(BOOKS.length);

  const entries: EnrichEntry[] = [];
  for (const book of candidates) {
    const gaps = missingFields(book).join(', ');
    // `dryRun` throughout: this gate is about what gets *said*, and writing
    // would drag in the cover downloader, which is the one path out of the
    // injected `HttpGet` seam.
    entries.push({ outcome: await enrichBook(book, vault, providers, { dryRun: true }), gaps });
  }

  return { entries, report: enrichReport(entries) };
}

describe('G27 — the enrich report accounts for every book', () => {
  let dir: string;
  let vault: ObsidianAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stacks-enrich-report-'));
    vault = new ObsidianAdapter(dir);
    for (const book of BOOKS) await vault.writeBook(book);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('gives every book one line and one total', async () => {
    const { entries, report } = await reportOnFixtureVault(vault);

    expect(
      report.lines,
      'a book counted in "N with gaps" and printed nowhere is the defect this row exists for',
    ).toHaveLength(entries.length);

    const totals = report.filled + report.missed + report.unfilled + report.complete;
    expect(
      totals,
      `the closing line accounts for ${totals} of ${entries.length} books. A header that ` +
        'counts one population and a footer that counts another is a report nobody can read',
    ).toBe(entries.length);

    expect(
      report.lines.filter((line) => line.trim() === ''),
      'an empty line is a book reported in form only',
    ).toEqual([]);
  });

  it('never reports a book that had gaps as having had none', async () => {
    const { report } = await reportOnFixtureVault(vault);

    // Every book above has a gap, so `complete` — *nothing was missing* — can
    // only be reached by an outcome that has folded two situations together
    // again. That fold is the original defect.
    expect(
      report.complete,
      'a book with a gap came back "complete". `enrichBook` must distinguish having ' +
        'nothing to do from having nothing it could do — see EnrichOutcome',
    ).toBe(0);

    // And the case that used to vanish is present and named.
    expect(report.unfilled, 'the fixture vault holds two books with nothing to fill').toBe(2);
  });

  it('names every non-zero total in the closing line', async () => {
    const { report } = await reportOnFixtureVault(vault);
    const summary = enrichSummary(report, true);

    for (const [name, count] of Object.entries({
      filled: report.filled,
      missed: report.missed,
      unfilled: report.unfilled,
      complete: report.complete,
    })) {
      if (count === 0) continue;
      expect(
        summary,
        `the closing line does not mention the ${name} total (${count}): "${summary}"`,
      ).toContain(String(count));
    }
  });

  it('gives every outcome kind a line of its own', () => {
    // The compiler already refuses a switch that misses a kind. This refuses one
    // that handles it by saying nothing, which is what the original `break` did
    // and what no type could have caught.
    const samples: EnrichOutcome[] = [
      { kind: 'filled', title: 'A', fields: ['pages'] },
      { kind: 'complete', title: 'B' },
      { kind: 'unfilled', title: 'C' },
      { kind: 'not-found', title: 'D' },
      { kind: 'mismatch', title: 'E', found: 'Something Else' },
    ];

    const silent = samples
      .filter((outcome) => reportEntry({ outcome, gaps: 'pages' }).line.trim() === '')
      .map(({ kind }) => kind);

    expect(silent, `outcome kinds that print nothing: ${silent.join(', ')}`).toEqual([]);
  });
});
