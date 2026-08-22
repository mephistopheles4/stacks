/**
 * The counter's assertions **about this repository's actual source**, kept apart
 * from the rest because they cannot run inside Stryker's sandbox.
 *
 * ⚠️ **The sandbox is a copy of the tree with every mutant site rewritten into
 * a `stryMutAct(...)` conditional.** ESLint reads text, so an instrumented file
 * is a far more complex file — measured, not predicted: `parseNote` reads
 * **104** in the sandbox against 12 in the repository, and the dry run failed
 * with `expected 104 to be 12`, taking the whole mutation run with it before a
 * single mutant was tested. That is the same class of failure that keeps
 * `gates/` out of the mutation scope and `packages/cli/src/env.test.ts` out of
 * `vitest.stryker.config.ts`, and this file is excluded there for the same
 * reason, with the same consequence named below.
 *
 * **What it costs, stated rather than hidden**: these four assertions are not an
 * oracle for any mutant. What still is: `complexity.test.ts`, whose inventory
 * assertions read only `fixtures/complexity/inventory.ts` — outside every
 * `mutate` glob, so never instrumented — and whose roll-up and population
 * assertions are pure. `scripts/lib/complexity.ts` therefore stays **unexcluded**
 * in `stryker.scopes.json`: it keeps an in-process oracle, and only this half of
 * it moved.
 *
 * ⚠️ **These are the ticket's own verification targets**, so they must keep
 * running somewhere. They run under `pnpm test`, which is where the numbers mean
 * what they say.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { complexityOf, countsFrom, populationOf, type PerFunction } from './complexity.ts';
import { readDeclarations, type Scope } from './mutation-score.ts';
import { sourceFiles } from './scope-check.ts';

function scopeNamed(name: string): Scope {
  const found = readDeclarations().scopes.find((scope) => scope.name === name);
  if (found === undefined) throw new Error(`no declared scope called ${name}`);
  return found;
}

describe('the counter on the real tree', () => {
  let shelf: PerFunction[];
  let cli: PerFunction[];
  let frontmatter: PerFunction[];

  beforeAll(async () => {
    const files = sourceFiles();
    shelf = await complexityOf(populationOf(scopeNamed('packages/site/src/shelf'), files));
    cli = await complexityOf(populationOf(scopeNamed('packages/cli/src'), files));
    frontmatter = await complexityOf(['packages/core/src/frontmatter.ts']);
  });

  it('counts the whole shelf, not the post-exclusion remnant', () => {
    // 113 is what the prototype measured for this scope *after* applying its
    // mutation exclusions. Landing on it means the exclusions leaked in.
    expect(countsFrom(shelf)?.functions).toBeGreaterThan(113);
  });

  it('counts the whole CLI, not the post-exclusion remnant', () => {
    // Three, likewise — `index.ts` and `env.ts` are excluded from mutation and
    // are two of this scope's three files.
    expect(countsFrom(cli)?.functions).toBeGreaterThan(3);
  });

  it("agrees with the spike on frontmatter.ts, which is where the pin's numbers came from", () => {
    // ⚠️ These two are the whole reason the versions are pinned exact. `parseNote`
    // reads 12 and not the prototype's 11 because ESLint counts every `?.` link;
    // `asPrivate` reads 11 either way. A version that moves either has changed
    // what the series mean.
    expect(frontmatter.find((entry) => entry.name === 'parseNote')?.complexity).toBe(12);
    expect(frontmatter.find((entry) => entry.name === 'asPrivate')?.complexity).toBe(11);
  });
});
