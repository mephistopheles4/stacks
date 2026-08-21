/**
 * THROWAWAY SPIKE FILE — branch experiment/coverage-include-orphan only.
 *
 * Deliberately never imported by any source file or test. Its only purpose
 * is to answer one empirical question for
 * docs/research/coverage-include-orphan-spike.md: with `coverage.include` set
 * to the stryker.scopes.json globs, does a file nothing imports show up in
 * the coverage-v8 JSON report at 0%, or is it missing entirely?
 *
 * Not wired into any real code path. Not exported from index.ts. Not part
 * of the frontmatter contract, the vault adapter, or anything else this repo
 * actually ships. Two functions, each with a few branches, so a per-function
 * statementMap/fnMap intersection has something to chew on.
 */

/** Never called by anything. Three branches. */
export function orphanClassify(n: number): string {
  if (n < 0) {
    return 'negative';
  } else if (n === 0) {
    return 'zero';
  } else if (n % 2 === 0) {
    return 'even';
  }
  return 'odd';
}

/** Never called by anything. A loop plus a conditional accumulator. */
export function orphanSum(values: number[], onlyPositive: boolean): number {
  let total = 0;
  for (const v of values) {
    if (onlyPositive && v < 0) {
      continue;
    }
    total += v;
  }
  return total;
}
