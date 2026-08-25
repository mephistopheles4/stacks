/**
 * The duplication counts, for a person, at the machine they are sitting at.
 *
 *     pnpm duplication:report
 *
 * **The same counter CI emits, printed instead of recorded** — one counter, one
 * set of thresholds, two callers, which is `complexity.ts`'s *one counter, one
 * config, two callers* applied to the second tool. A second implementation of
 * the population rule is the drift this repository has three logged rows about.
 *
 * **Nothing here is a gate and nothing here goes red on a number.** A trend's
 * failure is a movement a person reads. It exits non-zero only when the counter
 * could not run at all, which is a question about the pipe.
 *
 * ⚠️ **The permalinks are generated here and stored nowhere.** A pinned link
 * stays valid while it stops describing a block that moved, and a stale link
 * that still resolves reads as current. The commit is read from git at print
 * time; with no commit to read, the path and line range are printed bare rather
 * than a link to nothing.
 */

import { populationOf } from './lib/complexity.ts';
import {
  TREE_POPULATION,
  countAllPopulations,
  permalinkFor,
  sweepIgnoreBlocks,
  treePopulationOf,
} from './lib/duplication.ts';
import { gitOutput } from './lib/git.ts';
import { readScopes } from './lib/mutation-score.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { sourceFiles } from './lib/scope-check.ts';

const files = sourceFiles();
const counted = countAllPopulations(readScopes(), (scope) => populationOf(scope, files));

const rows = [
  ...[...counted.scopes].map(([population, counts]) => ({ population, counts })),
  { population: TREE_POPULATION, counts: counted.tree },
].flatMap(({ population, counts }) => (counts === null ? [] : [{ population, ...counts }]));

const width = Math.max(...rows.map((row) => row.population.length));
const pad = (text: string, to: number): string => text.padStart(to);

console.log(
  `${'population'.padEnd(width)}  ${pad('clones', 7)}  ${pad('dup', 6)}  ${pad('total', 7)}  ${pad('ignored', 8)}  share`,
);
for (const row of rows) {
  // The share is derived here and never recorded, which is the rule the counts
  // themselves follow: a ratio falls when the tree grows and nothing else
  // happens, so the record carries counts and the reader derives the fraction.
  const share = row.totalLines === 0 ? 0 : (row.duplicatedLines / row.totalLines) * 100;
  console.log(
    `${row.population.padEnd(width)}  ${pad(String(row.clones), 7)}  ` +
      `${pad(String(row.duplicatedLines), 6)}  ${pad(String(row.totalLines), 7)}  ` +
      `${pad(String(row.ignoredLines), 8)}  ${share.toFixed(2)}%`,
  );
}

// ⚠️ The eight scope rows do not sum to the tree row, and that is deliberate: a
// clone spanning two scopes is counted by both, because a clone is a relation
// and a relation does not partition. See ADR-0072.
console.log(
  '\nThe eight scope rows do not sum to a repository total — a cross-scope clone is counted\n' +
    'by both scopes it touches. The whole-tree row is the one nothing can shrink.',
);

const blocks = sweepIgnoreBlocks(treePopulationOf());
if (blocks.length === 0) {
  console.log('\nNo suppression block anywhere in the tree.');
} else {
  const commit = gitOutput(['rev-parse', 'HEAD'], REPO_ROOT);
  console.log(`\n${String(blocks.length)} suppression block(s):`);
  for (const block of blocks) {
    console.log(
      commit === undefined
        ? `  ${block.path}:${String(block.start)}-${String(block.end)}`
        : `  ${permalinkFor(block, commit)}`,
    );
  }
  console.log(
    '\n⚠️ A block is what the source declares, not what jscpd removed. jscpd honours one\n' +
      'only when no code follows it; in the middle of a file it does nothing, silently.',
  );
}
