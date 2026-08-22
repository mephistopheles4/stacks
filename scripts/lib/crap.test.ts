/**
 * The pre-commit CRAP print, put to inputs that are broken on purpose.
 *
 * ⚠️ **Nothing here reads the repository or runs Vitest**, for the reason
 * `floors.test.ts` and `scope-check.test.ts` both state: this file runs inside
 * Stryker's sandbox, which is a *copy* of the tree, so a spec asserting on real
 * paths or on the text of a mutated source file passes in `pnpm test` and fails
 * in the run that scores it. Every coverage report below is planted.
 *
 * **Not a gate and it takes no `docs/gates.md` row** — an ordinary unit test,
 * beside the code it covers. The hook it belongs to is opt-in, prints, and
 * never refuses; there is nothing here for CI to hold anyone to.
 *
 * See `docs/spec/complexity-on-the-trend-layer.md` §5.
 */

import { describe, expect, it } from 'vitest';
import type { PerFunction } from './complexity.ts';
import {
  NEVER_CALIBRATED,
  coverageByFunction,
  crapOf,
  fileCoverageOf,
  rank,
  renderReport,
  rowsFor,
  route,
  type CrapRow,
  type IstanbulFile,
} from './crap.ts';
import type { Declarations } from './mutation-score.ts';

/** A `PerFunction` with only the fields a test cares about spelled out. */
function fn(over: Partial<PerFunction> & { line: number; complexity: number }): PerFunction {
  return {
    file: 'packages/core/src/frontmatter.ts',
    column: 1,
    label: `Function 'f${over.line}'`,
    name: `f${over.line}`,
    kind: 'function',
    ...over,
  };
}

/** The single row a one-function case must have produced. */
function only<T>(items: readonly T[]): T {
  const [first, ...rest] = items;
  if (first === undefined || rest.length > 0) {
    throw new Error(`expected exactly one row, got ${items.length}`);
  }
  return first;
}

/** `line:column` → the shape Istanbul's maps carry. */
function at(startLine: number, endLine: number) {
  return { start: { line: startLine, column: 0 }, end: { line: endLine, column: 80 } };
}

describe('crapOf', () => {
  it('is the published formula', () => {
    // CC² × (1 − coverage)³ + CC. Fully covered collapses to CC, because the
    // untestedness term is zero — the property that makes a big well-tested
    // function rank below a small untested one.
    expect(crapOf(12, 1)).toBe(12);
    expect(crapOf(12, 0)).toBe(156);
    expect(crapOf(12, 0.5)).toBe(30);
    expect(crapOf(1, 0)).toBe(2);
  });

  it('refuses a percentage rather than cubing a negative', () => {
    // The one input that turns this formula into nonsense quietly: at
    // `coverage = 100` the cube is −970299 and CRAP comes out enormously
    // negative, which sorts to the bottom of the table and reads as "safe".
    // `docs/spec/complexity-on-the-trend-layer.md` §5 names the fraction twice
    // for this reason.
    expect(() => crapOf(12, 100)).toThrow(/fraction/i);
    expect(() => crapOf(12, -0.1)).toThrow(/fraction/i);
  });
});

describe('coverageByFunction', () => {
  const file: IstanbulFile = {
    statementMap: {
      '0': at(2, 2), // inside outer only
      '1': at(4, 4), // inside outer only, never hit
      '2': at(6, 6), // inside the nested arrow, and so inside outer too
      '3': at(20, 20), // top level, inside no function
    },
    fnMap: {
      '0': { name: 'outer', decl: at(1, 1), loc: at(1, 8) },
      '1': { name: '(anonymous_1)', decl: at(6, 6), loc: at(6, 6) },
      '2': { name: 'empty', decl: at(30, 30), loc: at(30, 31) },
    },
    s: { '0': 3, '1': 0, '2': 7, '3': 1 },
  };

  it('intersects the statement map against each function body', () => {
    const coverage = coverageByFunction(file);

    // Statement 3 is outside every function and belongs to no row.
    expect(coverage.get('0')).toEqual({ hit: 2, total: 3, fraction: 2 / 3 });
  });

  it('counts a nested function’s statements in the nested function too', () => {
    // Plain containment, which is what the #197 spike measured and what
    // `js-crap-score` does: a statement inside an arrow inside `outer` counts
    // for both. Documented rather than corrected — an inner statement really is
    // executed when the outer function runs it.
    expect(coverage(file, '1')).toEqual({ hit: 1, total: 1, fraction: 1 });
  });

  it('reads a null end column as the end of the line, not as column zero', () => {
    // Measured, not imagined: every `loc.end` this repo's own report writes
    // carries `"column": null` — `parseNote` ends `{ line: 160, column: null }`.
    // Reading that as 0 drops every statement on a function's last line, which
    // silently lowers coverage and silently raises CRAP for the longest
    // functions in the table.
    const openEnded: IstanbulFile = {
      statementMap: { '0': { start: { line: 9, column: 4 }, end: { line: 9, column: 20 } } },
      fnMap: {
        '0': {
          name: 'ends',
          decl: at(1, 1),
          loc: { start: { line: 1, column: 0 }, end: { line: 9, column: null } },
        },
      },
      s: { '0': 1 },
    };

    expect(coverageByFunction(openEnded).get('0')).toEqual({ hit: 1, total: 1, fraction: 1 });
  });

  it('gives a function containing no statement a total of zero, not a fraction', () => {
    // Dividing here would produce NaN, which formats as a number and sorts
    // unpredictably. The caller prints no figure instead.
    expect(coverage(file, '2')).toEqual({ hit: 0, total: 0, fraction: 0 });
  });

  function coverage(source: IstanbulFile, id: string) {
    return coverageByFunction(source).get(id);
  }
});

describe('fileCoverageOf', () => {
  const planted: IstanbulFile = { statementMap: {}, fnMap: {}, s: {} };

  it('finds a repo-relative file among absolute report keys', () => {
    const report = { '/repo/packages/core/src/identity.ts': planted };
    expect(fileCoverageOf(report, 'packages/core/src/identity.ts', '/repo')).toBe(planted);
  });

  it('is absent — never zero — for a file the report does not carry', () => {
    // The distinction the whole print rests on. A file `coverage.include` puts
    // in the report at 0% is a real, maximal CRAP. A file *missing* from the
    // report means the plumbing did not reach it, and printing 0% there would
    // invent the worst possible number out of a broken pipe.
    const report = { '/repo/packages/core/src/identity.ts': planted };
    expect(fileCoverageOf(report, 'packages/core/src/frontmatter.ts', '/repo')).toBeUndefined();
  });
});

describe('rowsFor', () => {
  const file: IstanbulFile = {
    statementMap: { '0': at(2, 2), '1': at(12, 12) },
    fnMap: {
      '0': { name: 'covered', decl: at(1, 1), loc: at(1, 3) },
      '1': { name: 'uncovered', decl: at(11, 11), loc: at(11, 13) },
    },
    s: { '0': 4, '1': 0 },
  };

  it('joins ESLint’s report position to Istanbul’s declaration line', () => {
    const row = only(rowsFor([fn({ line: 11, complexity: 12, name: 'uncovered' })], file));

    expect(row.coverage).toEqual({ hit: 0, total: 1, fraction: 0 });
    expect(row.crap).toBe(156);
  });

  it('breaks a same-line tie by column', () => {
    // `const a = () => x, b = () => y` — two arrows, one line. ESLint reports
    // each at its own column; Istanbul declares each at its own column.
    const span = (column: number, endColumn: number) => ({
      start: { line: 5, column },
      end: { line: 5, column: endColumn },
    });
    const sameLine: IstanbulFile = {
      statementMap: { '0': span(12, 20), '1': span(42, 50) },
      fnMap: {
        '0': { name: '(anonymous_0)', decl: span(10, 16), loc: span(10, 30) },
        '1': { name: '(anonymous_1)', decl: span(40, 46), loc: span(35, 60) },
      },
      s: { '0': 0, '1': 2 },
    };

    const rows = rowsFor(
      [
        fn({ line: 5, column: 41, complexity: 2, kind: 'arrow', label: 'Arrow function', name: undefined }),
        fn({ line: 5, column: 11, complexity: 2, kind: 'arrow', label: 'Arrow function', name: undefined }),
      ],
      sameLine,
    );

    // Input order, because `rowsFor` joins and `rank` orders — each arrow kept
    // the coverage of the declaration at its own column rather than its
    // neighbour's, which is the whole assertion.
    expect(rows.map((row) => [row.column, row.coverage?.hit])).toEqual([
      [41, 1],
      [11, 0],
    ]);
  });

  it('prints no coverage grain for the two implicit kinds', () => {
    // ESLint scores a class field initialiser and a static block as functions;
    // Istanbul's `fnMap` has no counterpart for either. Branching on `kind`
    // rather than on a failed join is what keeps a *coincidental* same-line
    // match from attaching another function's coverage to them.
    const rows = rowsFor(
      [
        fn({ line: 1, complexity: 4, kind: 'class-field-initialiser', label: 'Class field initializer', name: undefined }),
        fn({ line: 11, complexity: 2, kind: 'static-block', label: 'Class static block', name: undefined }),
      ],
      file,
    );

    for (const row of rows) {
      expect(row.coverage).toBeUndefined();
      expect(row.crap).toBeUndefined();
      expect(row.note).toMatch(/no counterpart/i);
    }
  });

  it('prints no number for a function the report does not declare', () => {
    const row = only(rowsFor([fn({ line: 99, complexity: 7 })], file));

    expect(row.crap).toBeUndefined();
    expect(row.note).toMatch(/not in the coverage report/i);
  });

  it('prints no number when the whole file is missing from the report', () => {
    const row = only(rowsFor([fn({ line: 1, complexity: 7 })], undefined));

    expect(row.crap).toBeUndefined();
    expect(row.note).toMatch(/not in the coverage report/i);
  });

  it('ranks by CRAP, and puts the rows carrying no number last', () => {
    // `rank` and not `rowsFor`: the hook ranks the union across every file it
    // measured, so a per-file sort would be discarded work.
    const rows = rank(
      rowsFor(
        [
          fn({ line: 1, complexity: 2, name: 'covered' }),
          fn({ line: 99, complexity: 40, name: 'unjoined' }),
          fn({ line: 11, complexity: 12, name: 'uncovered' }),
        ],
        file,
      ),
    );

    expect(rows.map((row) => row.name)).toEqual(['uncovered', 'covered', 'unjoined']);
  });
});

describe('route', () => {
  const declarations: Declarations = {
    excludedDirectories: [],
    scopes: [
      { name: 'packages/core/src', glob: 'packages/core/src/*.ts', exclusions: [] },
      {
        name: 'packages/site/src/shelf',
        glob: 'packages/site/src/shelf/**/*.ts',
        exclusions: [{ path: 'packages/site/src/shelf/scene.ts', mechanism: 'the browser drives it' }],
      },
    ],
  };

  it('measures a file inside a declared scope', () => {
    expect(route(['packages/core/src/identity.ts'], declarations).measured).toEqual([
      'packages/core/src/identity.ts',
    ]);
  });

  it('holds an excluded file out with its mechanism', () => {
    // The one place this rollout applies the exclusions: a CRAP of 420 for
    // `scene.ts` would be a fact about Vitest's reach, not about the code.
    const routed = route(['packages/site/src/shelf/scene.ts'], declarations);

    expect(routed.measured).toEqual([]);
    expect(routed.excluded).toEqual([
      { file: 'packages/site/src/shelf/scene.ts', mechanism: 'the browser drives it' },
    ]);
  });

  it('leaves a file no scope declares outside, silently', () => {
    const routed = route(['docs/plan.md', 'packages/cli/src/index.ts'], declarations);

    expect(routed.measured).toEqual([]);
    expect(routed.outside).toEqual(['docs/plan.md', 'packages/cli/src/index.ts']);
  });

  it('drops a spec, which is in no population', () => {
    expect(route(['packages/core/src/identity.test.ts'], declarations)).toEqual({
      measured: [],
      excluded: [],
      outside: ['packages/core/src/identity.test.ts'],
    });
  });
});

describe('renderReport', () => {
  const row: CrapRow = {
    file: 'packages/core/src/frontmatter.ts',
    line: 11,
    column: 1,
    label: "Function 'parseNote'",
    name: 'parseNote',
    kind: 'function',
    complexity: 12,
    coverage: { hit: 0, total: 4, fraction: 0 },
    crap: 156,
  };
  const rows = [row];

  it('carries the never-calibrated caveat on the line that names CRAP', () => {
    // §5's requirement, and the reason it is a *line* and not a footnote: a
    // reader who sees only the header must not be able to read a number
    // without the caveat that nobody ever calibrated the exponents.
    const header = renderReport(rows, { measured: [], excluded: [], outside: [] })
      .split('\n')
      .find((line) => line.includes('CRAP'));

    expect(header).toContain(NEVER_CALIBRATED);
  });

  it('names an excluded file and prints no number beside it', () => {
    const report = renderReport([], {
      measured: [],
      excluded: [{ file: 'packages/site/src/shelf/scene.ts', mechanism: 'the browser drives it' }],
      outside: [],
    });

    expect(report).toContain('no in-process oracle');
    expect(report).toContain('packages/site/src/shelf/scene.ts');
  });

  it('reports an anonymous function by file:line', () => {
    const report = renderReport(
      [{ ...row, name: undefined, label: 'Arrow function', kind: 'arrow' }],
      { measured: [], excluded: [], outside: [] },
    );

    // Never a positional `anonymous_7`: those ids move when an unrelated arrow
    // is added above, so a name carried across commits would misattribute.
    expect(report).toContain('packages/core/src/frontmatter.ts:11');
    expect(report).not.toContain('anonymous_');
  });
});
