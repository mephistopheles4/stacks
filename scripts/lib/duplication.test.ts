/**
 * The duplication counter's judgements, against planted inputs.
 *
 * ⚠️ **The directive spellings are assembled here too, never written out.**
 * `duplication.ts` explains why its own source may not contain them; this file
 * is in the same two populations and inherits the whole of that reason. A
 * literal opener here would be counted by the sweep it is testing *and*
 * honoured by jscpd against the tree run, so a spec asserting the sweep works
 * would be the thing that broke it.
 *
 * ⚠️ **No clone pair is committed anywhere under `fixtures/`, deliberately.**
 * [#237](https://github.com/mephistopheles4/stacks/issues/237) proposed one
 * shaped like the complexity inventory, and the tree population is what rules
 * it out: every committed `.ts` file is in that population, so a fixtured clone
 * would plant a permanent `+1` in the very series it calibrates and a constant
 * offset in `duplication-tree-lines`. The pair is written to a temp directory
 * at test time instead, which buys the same retokenization guard — a jscpd
 * upgrade that stops seeing a known clone goes **red here** — and costs the
 * series nothing.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  THRESHOLDS,
  attributeClones,
  countsOf,
  declarationCorrespondence,
  duplicationInputs,
  ignoreBlocksIn,
  ignoredLinesIn,
  ignoredMismatches,
  parseDeclarations,
  permalinkFor,
  repoRelative,
  runJscpd,
  scopedPopulationOf,
  sweepIgnoredLines,
  treePopulationOf,
  type ReportedClone,
} from './duplication.ts';
import type { Scope } from './mutation-score.ts';

/** The directive words, built from halves — see this file's header. */
const MARKER = 'jscpd:ignore';
const START = `${MARKER}-start`;
const END = `${MARKER}-end`;

/**
 * The forms jscpd honours that this repository refuses, measured one by one.
 *
 * Each removes a *different* span for the same three hidden lines — 9, 5 and 4
 * lines — which is why only the whole-line `//` form is permitted. Detection
 * still has to see all of them, or a refused form would be a silent
 * miscount rather than a red build.
 */
const REFUSED = [
  (word: string): string => `/* ${word} */`,
  (word: string): string => ` * ${word}`,
  (word: string): string => `const z = 1; // ${word}`,
];

let temp: string;

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'stacks-dup-spec-'));
});

afterEach(() => {
  rmSync(temp, { recursive: true, force: true });
});

describe('ignoredLinesIn — what a suppression withholds', () => {
  it('counts the region and both directive lines, which is what jscpd removes', () => {
    // Measured against jscpd 5.0.16: ten live lines plus a three-line block
    // reports ten, so five lines left — the three, and the two directives.
    const source = [
      ...Array.from({ length: 10 }, (_, i) => `export const x${String(i)} = ${String(i)};`),
      `// ${START}`,
      'const p = 1;',
      'const q = 2;',
      'const r = 3;',
      `// ${END}`,
    ].join('\n');

    expect(ignoredLinesIn(source)).toBe(5);
  });

  it('is zero for a file with no directive in it', () => {
    expect(ignoredLinesIn('export const a = 1;\nexport const b = 2;\n')).toBe(0);
  });

  it('accepts the whole-line form with or without a space after the slashes', () => {
    for (const opener of [`// ${START}`, `//${START}`, `  //  ${START}`]) {
      const close = opener.replace('start', 'end');
      const source = ['const live = 1;', opener, 'const hidden = 2;', close].join('\n');
      expect(ignoredLinesIn(source), `opener form: ${opener}`).toBe(3);
    }
  });

  it('sees every form jscpd honours, and refuses the three whose span differs', () => {
    // ⚠️ Detection over-matches on purpose. A form this sweep could not see
    // would still be honoured by jscpd — measured — so the counter would be
    // short and nothing would say so. Refusing is loud; missing is silent.
    for (const write of REFUSED) {
      const source = ['const live = 1;', write(START), 'const hidden = 2;', write(END)].join('\n');
      expect(() => ignoredLinesIn(source, 'a.ts'), `refused form: ${write(START)}`).toThrow(
        /does not permit/,
      );
    }
  });

  it('does not count the bare word without a comment opener before it', () => {
    // The guard that lets this module and its spec describe the directive. A
    // sweep matching the bare words would count both of these files.
    const source = [`const marker = '${MARKER}-start';`, 'const live = 1;'].join('\n');
    expect(ignoredLinesIn(source)).toBe(0);
  });

  it('ignores a directive inside a block comment, which jscpd does not honour', () => {
    // Found by planting, not by reading: a mechanical plant put an `ignore-end`
    // into the middle of a file's header comment. The sweep counted six lines
    // and jscpd removed **none** — its denominator went up by two, not down.
    const source = [
      'const a = 1;',
      '/**',
      ` * ${START}`,
      ` * ${END}`,
      ' */',
      'const b = 2;',
    ].join('\n');

    expect(ignoredLinesIn(source, 'a.ts')).toBe(0);
  });

  it('still sees a directive on the line that opens the comment', () => {
    // The opener is not yet "inside" when it is read, so the refusal for the
    // `/* … */` form still fires rather than the line being skipped.
    const source = ['const a = 1;', `/* ${START} */`, 'const b = 2;', `/* ${END} */`].join('\n');
    expect(() => ignoredLinesIn(source, 'a.ts')).toThrow(/does not permit/);
  });

  it('does not let a line comment open a block comment that never shuts', () => {
    const source = [
      'const a = 1; // see /* the note below',
      `// ${START}`,
      'const b = 2;',
      `// ${END}`,
    ].join('\n');

    expect(ignoredLinesIn(source, 'a.ts')).toBe(3);
  });

  it('resumes counting after a block comment closes', () => {
    const source = [
      '/** a header',
      ` * mentioning ${START} in prose`,
      ' */',
      `// ${START}`,
      'const b = 2;',
      `// ${END}`,
    ].join('\n');

    expect(ignoredLinesIn(source, 'a.ts')).toBe(3);
  });

  it('adds up several blocks in one file', () => {
    const source = [
      'const a = 1;',
      `// ${START}`,
      'const b = 2;',
      `// ${END}`,
      'const c = 3;',
      `// ${START}`,
      'const d = 4;',
      'const e = 5;',
      `// ${END}`,
    ].join('\n');

    expect(ignoredLinesIn(source)).toBe(3 + 4);
  });

  it('throws on an opener that is never closed, because jscpd suppresses nothing at all', () => {
    const source = ['const a = 1;', `// ${START}`, 'const b = 2;'].join('\n');
    expect(() => ignoredLinesIn(source, 'a.ts')).toThrow(/never closed/);
  });

  it('throws on a close with no opener', () => {
    const source = ['const a = 1;', `// ${END}`].join('\n');
    expect(() => ignoredLinesIn(source, 'a.ts')).toThrow(/never opened/);
  });

  it('throws on a nested opener rather than guessing which region is meant', () => {
    const source = ['const a = 1;', `// ${START}`, `// ${START}`, `// ${END}`].join('\n');
    expect(() => ignoredLinesIn(source, 'a.ts')).toThrow(/still open/);
  });

  it('reports the range of each block, which is what a permalink is built from', () => {
    const source = ['const a = 1;', `// ${START}`, 'const b = 2;', `// ${END}`].join('\n');
    expect(ignoreBlocksIn(source, 'a.ts')).toEqual([{ path: 'a.ts', start: 2, end: 4 }]);
  });

  it('spells a permalink from the run’s own commit and never stores one', () => {
    expect(permalinkFor({ path: 'scripts/lib/x.ts', start: 4, end: 9 }, 'abc123')).toBe(
      'https://github.com/mephistopheles4/stacks/blob/abc123/scripts/lib/x.ts#L4-L9',
    );
  });

  it('sweeps a population off the disk and totals it', () => {
    writeFileSync(join(temp, 'a.ts'), ['const a = 1;', `// ${START}`, 'const b = 2;', `// ${END}`].join('\n'));
    writeFileSync(join(temp, 'b.ts'), 'const c = 3;\n');

    expect(sweepIgnoredLines(['a.ts', 'b.ts'], temp)).toBe(3);
  });
});

describe('repoRelative — a report path back to this repo’s spelling', () => {
  /**
   * ⚠️ **Both spellings are asserted on both platforms, deliberately.** The
   * first draft built these paths with `join`, so each ran only in its host's
   * dialect — green on Windows, three failures on both CI runners. This module
   * reads paths a *different program* wrote, so the rule has to be one rule; a
   * spec that asks the host what a path looks like cannot show that it is.
   */
  const windows = 'C:/repo';
  const posix = '/home/runner/work/stacks';

  it('relativises an absolute path in either dialect', () => {
    expect(repoRelative('C:\\repo\\packages\\core\\src\\library.ts', windows)).toBe(
      'packages/core/src/library.ts',
    );
    expect(repoRelative(`${posix}/packages/core/src/library.ts`, posix)).toBe(
      'packages/core/src/library.ts',
    );
  });

  it('sees through Windows’ extended-length prefix', () => {
    expect(repoRelative('\\\\?\\C:\\repo\\scripts\\deploy.ts', windows)).toBe('scripts/deploy.ts');
  });

  it('normalises separators on a path that is already relative', () => {
    expect(repoRelative('scripts\\lib\\floors.ts', windows)).toBe('scripts/lib/floors.ts');
    expect(repoRelative('scripts/lib/floors.ts', posix)).toBe('scripts/lib/floors.ts');
  });

  it('returns a path outside the root whole, rather than as a chain of `..`', () => {
    // A `..` chain matches no scope glob, so it would attribute to nobody with
    // no sign that anything was wrong. Whole, it is at least recognisable.
    expect(repoRelative('D:\\elsewhere\\x.ts', windows)).toBe('D:/elsewhere/x.ts');
  });
});

describe('attributeClones — a clone is a relation, and relations do not partition', () => {
  const scopes: Scope[] = [
    { name: 'alpha', glob: 'alpha/**/*.ts', exclusions: [] },
    { name: 'beta', glob: 'beta/**/*.ts', exclusions: [] },
  ] as unknown as Scope[];

  const clone = (first: string, second: string, span: number): ReportedClone => ({
    firstFile: { name: first, start: 1, end: 1 + span },
    secondFile: { name: second, start: 40, end: 40 + span },
    lines: span + 1,
  });

  it('counts duplicated lines as the first half’s span, which is jscpd’s own figure', () => {
    // Measured on the union run: Σ (end − start) is 133, exactly
    // `statistics.total.duplicatedLines`. Σ clone.lines is 145 and is not it.
    const counted = attributeClones([clone('alpha/a.ts', 'alpha/b.ts', 9)], scopes, '.');
    expect(counted.get('alpha')).toEqual({ clones: 1, duplicatedLines: 9 });
  });

  it('counts a cross-scope clone in both scopes, so the eight do not sum to a total', () => {
    const counted = attributeClones([clone('alpha/a.ts', 'beta/b.ts', 12)], scopes, '.');
    expect(counted.get('alpha')).toEqual({ clones: 1, duplicatedLines: 12 });
    expect(counted.get('beta')).toEqual({ clones: 1, duplicatedLines: 12 });
  });

  it('counts a self-clone once, because it is one relation', () => {
    const counted = attributeClones([clone('alpha/a.ts', 'alpha/a.ts', 8)], scopes, '.');
    expect(counted.get('alpha')).toEqual({ clones: 1, duplicatedLines: 8 });
  });

  it('gives a scope with no clone a zero rather than no entry', () => {
    const counted = attributeClones([clone('alpha/a.ts', 'alpha/b.ts', 5)], scopes, '.');
    expect(counted.get('beta')).toEqual({ clones: 0, duplicatedLines: 0 });
  });

  it('counts a clone in no declared scope for nobody', () => {
    const counted = attributeClones([clone('gamma/a.ts', 'gamma/b.ts', 5)], scopes, '.');
    expect([...counted.values()]).toEqual([
      { clones: 0, duplicatedLines: 0 },
      { clones: 0, duplicatedLines: 0 },
    ]);
  });
});

describe('the populations', () => {
  it('keeps test files and drops declarations, which is the tree rule', () => {
    mkdirSync(join(temp, 'gates'), { recursive: true });
    writeFileSync(join(temp, 'gates', 'a.test.ts'), 'const a = 1;\n');
    writeFileSync(join(temp, 'gates', 'b.ts'), 'const b = 1;\n');
    writeFileSync(join(temp, 'gates', 'c.d.ts'), 'declare const c: number;\n');
    writeFileSync(join(temp, 'gates', 'd.mts'), 'const d = 1;\n');
    writeFileSync(join(temp, 'gates', 'e.md'), '# not typescript\n');

    expect(treePopulationOf(temp)).toEqual([
      'gates/a.test.ts',
      'gates/b.ts',
      'gates/d.mts',
    ]);
  });

  it('deduplicates a file two scopes both claim', () => {
    const scopes = [{ name: 'one' }, { name: 'two' }] as unknown as Scope[];
    const population = scopedPopulationOf(scopes, (scope) =>
      (scope as unknown as { name: string }).name === 'one' ? ['a.ts', 'b.ts'] : ['b.ts', 'c.ts'],
    );
    expect(population).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});

describe('countsOf', () => {
  it('is null for a population jscpd never ran over, never four zeros', () => {
    expect(countsOf(null, 0)).toBeNull();
  });

  it('takes every count from jscpd and the ignored lines from the sweep', () => {
    const report = {
      duplicates: [],
      statistics: { total: { clones: 3, duplicatedLines: 40, lines: 900 } },
    };
    expect(countsOf(report, 7)).toEqual({
      clones: 3,
      duplicatedLines: 40,
      ignoredLines: 7,
      totalLines: 900,
    });
  });
});

describe('duplicationInputs — the counting rule this run counted under', () => {
  it('reads the version as installed and carries all three thresholds', () => {
    const inputs = duplicationInputs();
    expect(inputs.jscpdVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(inputs.minTokens).toBe(THRESHOLDS.minTokens);
    expect(inputs.minLines).toBe(THRESHOLDS.minLines);
    expect(inputs.mode).toBe(THRESHOLDS.mode);
  });
});

describe('parseDeclarations — a malformed declaration file is never a partial one', () => {
  const good = {
    duplicationHash: 'sha256:abc',
    populations: { scripts: { ignoredLines: 0, notes: [] } },
  };

  it('reads the hash and every population', () => {
    const parsed = parseDeclarations(good);
    expect(parsed.duplicationHash).toBe('sha256:abc');
    expect(parsed.populations.get('scripts')).toEqual({ ignoredLines: 0, notes: [] });
  });

  it('throws rather than defaulting a missing hash', () => {
    expect(() => parseDeclarations({ populations: {} })).toThrow(/no duplicationHash/);
  });

  it('throws on a counter that is not a count', () => {
    for (const ignoredLines of [-1, 1.5, '3', null]) {
      expect(() =>
        parseDeclarations({
          duplicationHash: 'sha256:abc',
          populations: { scripts: { ignoredLines, notes: [] } },
        }),
        `ignoredLines: ${String(ignoredLines)}`,
      ).toThrow(/not a count/);
    }
  });

  it('throws on notes that are not a list of lines', () => {
    expect(() =>
      parseDeclarations({
        duplicationHash: 'sha256:abc',
        populations: { scripts: { ignoredLines: 0, notes: 'none' } },
      }),
    ).toThrow(/not a list of lines/);
  });
});

describe('ignoredMismatches — both directions, and neither is redundant', () => {
  const declared = parseDeclarations({
    duplicationHash: 'sha256:abc',
    populations: {
      scripts: { ignoredLines: 0, notes: [] },
      gates: { ignoredLines: 5, notes: ['one block'] },
    },
  });

  it('is silent when every counter is what the tree holds', () => {
    expect(ignoredMismatches(new Map([['scripts', 0], ['gates', 5]]), declared)).toEqual([]);
  });

  it('reports a block that arrived with the counter left alone', () => {
    expect(ignoredMismatches(new Map([['scripts', 6], ['gates', 5]]), declared)).toEqual([
      { population: 'scripts', swept: 6, recorded: 0 },
    ]);
  });

  it('reports a counter raised with no block under it, which stops pre-raising', () => {
    expect(ignoredMismatches(new Map([['scripts', 0], ['gates', 0]]), declared)).toEqual([
      { population: 'gates', swept: 0, recorded: 5 },
    ]);
  });

  it('reports a swept population the file does not name at all', () => {
    expect(
      ignoredMismatches(new Map([['scripts', 0], ['gates', 5], ['packages', 3]]), declared),
    ).toEqual([{ population: 'packages', swept: 3, recorded: 0 }]);
  });

  it('leaves a merely missing entry to the correspondence check', () => {
    expect(
      ignoredMismatches(new Map([['scripts', 0], ['gates', 5], ['packages', 0]]), declared),
    ).toEqual([]);
    expect(declarationCorrespondence(['scripts', 'gates', 'packages'], declared)).toEqual({
      undeclared: ['packages'],
      orphaned: [],
    });
  });

  it('names a declared population that is measured by nothing', () => {
    expect(declarationCorrespondence(['scripts'], declared)).toEqual({
      undeclared: [],
      orphaned: ['gates'],
    });
  });
});

describe('jscpd itself still counts what this repo believes it counts', () => {
  /** Twelve identical lines, which is 56 tokens — comfortably over the 50 pinned. */
  const CLONE = [
    'export interface Widget {',
    '  alpha: string;',
    '  beta: number;',
    '  gamma: boolean;',
    '  delta: string[];',
    '  epsilon: number[];',
    '  zeta: Record<string, string>;',
    '  eta?: string;',
    '  theta?: number;',
    '  iota: Date;',
    '  kappa: bigint;',
    '}',
  ].join('\n');

  it('finds a known clone at the pinned thresholds', () => {
    writeFileSync(join(temp, 'a.ts'), `${CLONE}\n`);
    writeFileSync(join(temp, 'b.ts'), `${CLONE}\n`);

    const report = runJscpd(['a.ts', 'b.ts'], temp);
    expect(report?.statistics.total.clones).toBe(1);
    expect(report?.statistics.total.lines).toBe(24);
  });

  it('still removes an ignored region from the count and the denominator together', () => {
    // The measurement [#237](…/issues/237) turned on, re-run every suite: the
    // clone goes and the denominator shrinks by the same lines, so the
    // percentage does not move and only a declared counter can say it happened.
    writeFileSync(join(temp, 'a.ts'), [`// ${START}`, CLONE, `// ${END}`].join('\n'));
    writeFileSync(join(temp, 'b.ts'), `${CLONE}\n`);

    const report = runJscpd(['a.ts', 'b.ts'], temp);
    expect(report?.statistics.total.clones).toBe(0);
    expect(report?.statistics.total.lines).toBe(12);
  });

  it('has nothing to run over an empty population, and says so with null', () => {
    expect(runJscpd([], temp)).toBeNull();
  });

  /**
   * ⚠️ **jscpd honours a suppression block only when no code follows it**, and
   * these two cases pin that so a fix in a later jscpd goes **red here** rather
   * than moving eight series at once with nothing to point at.
   *
   * It is the finding that corrected this work's own premise. Every earlier
   * measurement of the feature — this repository's and
   * [#237](https://github.com/mephistopheles4/stacks/issues/237)'s alike — put
   * the block at the end of a file, so all of them agreed and all of them were
   * the special case. A block in the middle of a file does nothing, in silence,
   * which is precisely why the counter records what the source **declares**
   * rather than what jscpd removed.
   */
  const live = (n: number, from = 0): string[] =>
    Array.from({ length: n }, (_, i) => `export const v${String(i + from)} = ${String(i + from)};`);
  const block = [`// ${START}`, 'const h1 = 1;', 'const h2 = 2;', 'const h3 = 3;', `// ${END}`];

  it('honours a block that ends the file, taking the block with it', () => {
    writeFileSync(join(temp, 'a.ts'), [...live(14), ...block].join('\n'));
    expect(runJscpd(['a.ts'], temp)?.statistics.total.lines).toBe(14);
  });

  it('does NOT honour a block with one line of code after it', () => {
    const body = [...live(14), ...block, ...live(1, 14)];
    writeFileSync(join(temp, 'a.ts'), body.join('\n'));

    // Twenty raw lines, and jscpd counts every one of them — while the sweep
    // reports the five the author declared. The two disagree on purpose.
    expect(runJscpd(['a.ts'], temp)?.statistics.total.lines).toBe(body.length);
    expect(ignoredLinesIn(body.join('\n'), 'a.ts')).toBe(5);
  });
});
