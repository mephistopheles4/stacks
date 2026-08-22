/**
 * The inventory spec: what ESLint's `complexity` rule counts, pinned construct
 * by construct.
 *
 * **This is the counter's only defence against a silent re-numbering.** The four
 * series are read as trends, so an ESLint upgrade that counts one more
 * construct moves every one of them at once, in the same direction, at a commit
 * that changed no code — which is indistinguishable from the repository
 * genuinely getting more complex, and would breach every cap in
 * `stryker.floors.json` on the same day. Holding the rule to a total inventory
 * turns that into a red build here instead.
 *
 * ⚠️ **Total, not sampled.** Every counted construct and every function-shaped
 * node appears in `fixtures/complexity/inventory.ts` at least once. A sampled
 * fixture leaves the un-sampled construct as exactly the silent change this
 * exists to catch.
 *
 * The real-tree assertions at the bottom sweep two whole populations through
 * ESLint, so they run **once** in a `beforeAll` rather than per assertion —
 * this spec is inside the `scripts` mutation scope and is re-run for every
 * mutant in `complexity.ts`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  complexityOf,
  counterInputs,
  countsFrom,
  INVENTORY,
  MCCABE_CUT,
  populationOf,
  type PerFunction,
} from './complexity.ts';
import { readDeclarations, type Scope } from './mutation-score.ts';
import { sourceFiles } from './scope-check.ts';

/** A synthetic function, for the arithmetic that should not need a tree. */
function fn(complexity: number, file = 'a.ts'): PerFunction {
  return { file, line: 1, column: 1, label: 'Function', kind: 'function', complexity };
}

function scopeNamed(name: string): Scope {
  const found = readDeclarations().scopes.find((scope) => scope.name === name);
  if (found === undefined) throw new Error(`no declared scope called ${name}`);
  return found;
}

describe('the inventory fixture', () => {
  let counted: PerFunction[];

  beforeAll(async () => {
    counted = await complexityOf([INVENTORY.file]);
  });

  it('scores every construct and every function-shaped node exactly as declared', () => {
    const key = (entry: { label: string; complexity: number }): string =>
      `${entry.label} = ${entry.complexity}`;

    expect(counted.map((entry) => key(entry)).sort()).toEqual(
      INVENTORY.functions.map((entry) => key(entry)).sort(),
    );
  });

  it('assigns every function-shaped node the kind the roll-up expects', () => {
    const key = (entry: { label: string; kind: string }): string => `${entry.label} → ${entry.kind}`;

    expect(counted.map((entry) => key(entry)).sort()).toEqual(
      INVENTORY.functions.map((entry) => key(entry)).sort(),
    );
  });

  it('rolls the fixture up to the declared counts', () => {
    expect(countsFrom(counted)).toEqual(INVENTORY.counts);
  });

  it('counts the two implicit functions ESLint invents, and no more', () => {
    // Class field initialisers and static blocks are not function nodes; ESLint
    // scores them as functions anyway, so they are in the denominator. The
    // fixture holds one of each and a third field with no initialiser, which
    // must produce nothing.
    const implicit = counted.filter(
      (entry) => entry.kind === 'class-field-initialiser' || entry.kind === 'static-block',
    );
    expect(implicit).toHaveLength(2);
  });

  it('reads a decorated label as its undecorated kind', () => {
    // ⚠️ The hazard the kind lookup is ordered for. `Async arrow function`
    // contains both `arrow function` and `function`, so a lookup testing
    // `function` first would call it a plain function — and a prefix match would
    // call all four of these `unknown`.
    const kindOf = (label: string): string | undefined =>
      counted.find((entry) => entry.label === label)?.kind;

    expect(kindOf('Async arrow function')).toBe('arrow');
    expect(kindOf("Async function 'asyncDeclaration'")).toBe('function');
    expect(kindOf("Generator function 'generatorDeclaration'")).toBe('function');
    expect(kindOf("Static method 'make'")).toBe('method');
  });

  it('reports a position for every function, with an end', () => {
    // Not the values — a comment above the fixture would move every line. The
    // contract is that the fields are there and usable, which is what the
    // pre-commit print joins against an Istanbul `fnMap` on.
    for (const entry of counted) {
      expect(entry.line).toBeGreaterThan(0);
      expect(entry.column).toBeGreaterThan(0);
      expect(entry.endLine).toBeDefined();
      expect(entry.endColumn).toBeDefined();
    }
  });

  it('names the functions ESLint names, and leaves the anonymous ones unnamed', () => {
    expect(counted.find((entry) => entry.label === "Function 'declaration'")?.name).toBe(
      'declaration',
    );
    expect(counted.filter((entry) => entry.kind === 'arrow').every((e) => e.name === undefined)).toBe(
      true,
    );
  });
});

describe('the counter refuses to under-count', () => {
  it('raises on a file ESLint would ignore, rather than counting it as functionless', async () => {
    // ⚠️ The failure this guards is invisible by construction: an ignored file
    // returns no complexity messages, which is byte for byte a file with no
    // functions. `node_modules` is ESLint's own default ignore and stands in
    // for an `ignores` entry someone adds later — the population would shrink
    // and a series would move with no diff to point at.
    await expect(complexityOf(['node_modules/pretend/thing.ts'])).rejects.toThrow(/ignore/);
  });

  it('counts nothing for an empty file list without calling ESLint', async () => {
    await expect(complexityOf([])).resolves.toEqual([]);
  });
});

describe('the roll-up', () => {
  it('returns no facts for an empty population, rather than zeros', () => {
    // ⚠️ Not `{ functions: 0, mass: 0, massOver10: 0, max: 0 }`. `0` is a legal
    // value for `complexity-max` in a scope of trivial functions, so a zeroed
    // record cannot be told from a real one.
    expect(countsFrom([])).toBeNull();
  });

  it('sums mass over every function', () => {
    expect(countsFrom([fn(3), fn(4)])?.mass).toBe(7);
  });

  it('counts functions as the denominator, not files', () => {
    expect(countsFrom([fn(1, 'a.ts'), fn(1, 'a.ts'), fn(1, 'b.ts')])?.functions).toBe(3);
  });

  it("puts McCabe's cut above 10 and not at it", () => {
    // A function of exactly 10 is inside the bound the 1976 paper proposes, so
    // it contributes nothing to the erosion figure. Off by one here would move
    // `complexity-mass-over-10` on every scope at once.
    expect(countsFrom([fn(MCCABE_CUT)])?.massOver10).toBe(0);
    expect(countsFrom([fn(MCCABE_CUT + 1)])?.massOver10).toBe(11);
  });

  it('sums whole complexities into mass-over-10, not the excess above the cut', () => {
    expect(countsFrom([fn(12), fn(3)])?.massOver10).toBe(12);
  });

  it('takes max over every function, whatever the order', () => {
    expect(countsFrom([fn(9), fn(21), fn(4)])?.max).toBe(21);
    expect(countsFrom([fn(21), fn(9), fn(4)])?.max).toBe(21);
  });
});

describe('the population rule', () => {
  const files = sourceFiles();

  it('drops *.test.ts, and nothing else', () => {
    const scope: Scope = { name: 's', glob: 'scripts/**/*.ts', exclusions: [] };
    expect(
      populationOf(scope, ['scripts/a.ts', 'scripts/a.test.ts', 'scripts/lib/b.ts']),
    ).toEqual(['scripts/a.ts', 'scripts/lib/b.ts']);
  });

  it('is idempotent about test files, so it does not matter who walked the tree', () => {
    const scope: Scope = { name: 's', glob: 'scripts/**/*.ts', exclusions: [] };
    expect(populationOf(scope, ['scripts/a.ts'])).toEqual(['scripts/a.ts']);
  });

  it('does NOT apply the scope exclusions', () => {
    // ⚠️ The load-bearing assertion of this file. Every exclusion mechanism in
    // stryker.scopes.json is about oracle reach, which says nothing about a
    // static measure — and applying them would let a scope shed nine tenths of
    // its complexity by gaining a browser-only file.
    const shelf = scopeNamed('packages/site/src/shelf');
    const population = populationOf(shelf, files);

    expect(shelf.exclusions.length).toBeGreaterThan(0);
    for (const exclusion of shelf.exclusions) {
      expect(population).toContain(exclusion.path);
    }
  });

  it('walks a declared scope that sits under an excluded directory', () => {
    // `packages/site/src` is an excluded directory AND `shelf/` beneath it is a
    // declared scope. `excludedDirectories` is not read at all, so there is no
    // precedence to define: the glob decides.
    const excluded = readDeclarations().excludedDirectories.map((entry) => entry.path);
    expect(excluded).toContain('packages/site/src');
    expect(populationOf(scopeNamed('packages/site/src/shelf'), files).length).toBeGreaterThan(0);
  });

  it('leaves the top of an excluded directory out, because no glob reaches it', () => {
    const claimed = readDeclarations()
      .scopes.flatMap((scope) => populationOf(scope, files))
      .filter((file) => file.startsWith('packages/site/src/') && !file.includes('/shelf/'));
    expect(claimed).toEqual([]);
  });
});

// ⚠️ The assertions about this repository's own source live in
// `complexity-tree.test.ts`, not here. Inside Stryker's sandbox every mutated
// file is rewritten into `stryMutAct(...)` conditionals, so ESLint reads a far
// more complex file than the repository holds — `parseNote` measured 104 there
// against 12 here, and it killed the dry run. Everything in *this* file either
// is pure or reads only the fixture, which no `mutate` glob matches.

describe('the counter inputs the cap hashes', () => {
  it('reads the rule options back off the config ESLint resolved', async () => {
    // Never a second literal in TypeScript: that is the one input a fixture
    // hash could not see moving.
    const inputs = await counterInputs();
    expect(inputs.ruleOptions).toEqual([{ max: 0, variant: 'classic' }]);
  });

  it('drops severity, which cannot move a count', async () => {
    // At max: 0 every function reports under `warn` and under `error` alike, so
    // hashing severity would refuse records whose numbers were identical.
    // `configHashOf`'s SCORE_NEUTRAL_OPTIONS, applied to a different config.
    expect(JSON.stringify((await counterInputs()).ruleOptions)).not.toContain('warn');
    expect((await counterInputs()).ruleOptions).toHaveLength(1);
  });

  it('reports the versions as installed, not as declared', async () => {
    const inputs = await counterInputs();
    expect(inputs.eslintVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(inputs.parserVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('carries the fixture expectations, so the hash covers the counting rule', async () => {
    expect((await counterInputs()).inventory.counts).toEqual(INVENTORY.counts);
  });
});
