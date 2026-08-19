/**
 * The arithmetic that produces every number this rollout reads.
 *
 * ⚠️ **This file exists because the trend layer caught its own author.** #169
 * extracted this module out of `scripts/mutation-scopes.ts` and justified
 * keeping it inside the mutation denominator with a comment claiming
 * *"`gates/trend-layer.test.ts` imports this module in-process, so it is
 * reachable now"*. **That was false.** The gate imports `scripts/lib/metrics.ts`;
 * the two `mutation-score` strings in it are the *trend name*, not an import. The
 * only importers were `emit-metrics.ts` and `mutation-scopes.ts`, both excluded
 * and both run by `tsx` rather than as a Vitest spec — so every mutant here was
 * `NoCoverage`.
 *
 * Nothing in a diff shows that. **The first nightly did**: `scripts` fell from
 * 60.19% to 53.74% at a commit whose only change to that scope was this file
 * arriving with no oracle. A gate cannot see an untested file; a number can.
 *
 * **It is not a gate and takes no row in `docs/gates.md`** — an ordinary unit
 * test, which is why it lives beside the code rather than in `gates/`.
 *
 * ⚠️ **Nothing here touches the filesystem, deliberately.** `readScopes` and
 * `readReport` are the only two functions in the module that do, and they are
 * left alone: `readScopes` resolves through `REPO_ROOT`, and
 * `vitest.stryker.config.ts` already records that **Stryker's sandbox is not the
 * repository**. A spec that read a real file would pass here and fail inside the
 * sandbox — the same trap that keeps `gates/` out of the mutation scope. Scopes
 * and reports are passed in as data, which `scoreRun` already accepts.
 */

import { describe, expect, it } from 'vitest';
import {
  empty,
  detected,
  fraction,
  globToRegExp,
  scoreRun,
  total,
  totalOf,
  type MutationReport,
  type Scope,
} from './mutation-score.ts';

/** A scope with no exclusions, which is what five of the eight real ones are. */
function scope(name: string, glob: string, exclusions: Scope['exclusions'] = []): Scope {
  return { name, glob, exclusions };
}

function report(files: Record<string, string[]>): MutationReport {
  return {
    files: Object.fromEntries(
      Object.entries(files).map(([path, statuses]) => [
        path,
        { mutants: statuses.map((status) => ({ status })) },
      ]),
    ),
  };
}

describe('globToRegExp — the two shapes, and nothing else', () => {
  it('matches a non-recursive scope to its own directory only', () => {
    // The trap `docs/spec/mutation-scoring.md` §4 spends a warning on:
    // `packages/core/src` is the files *directly* in that directory, and
    // writing `**` there silently declares the union of five scopes.
    const match = globToRegExp('packages/core/src/*.ts');

    expect(match.test('packages/core/src/frontmatter.ts')).toBe(true);
    expect(match.test('packages/core/src/covers/measure.ts')).toBe(false);
  });

  it('matches a recursive scope at any depth, including zero', () => {
    const match = globToRegExp('packages/core/src/covers/**/*.ts');

    expect(match.test('packages/core/src/covers/measure.ts')).toBe(true);
    expect(match.test('packages/core/src/covers/deep/nested/file.ts')).toBe(true);
    expect(match.test('packages/core/src/frontmatter.ts')).toBe(false);
  });

  it('anchors both ends', () => {
    // Unanchored, `packages/cli/src/**/*.ts` would claim
    // `vendor/packages/cli/src/x.ts` — a file from another tree folding into a
    // declared scope's denominator.
    const match = globToRegExp('packages/cli/src/**/*.ts');

    expect(match.test('vendor/packages/cli/src/index.ts')).toBe(false);
    expect(match.test('packages/cli/src/index.ts.bak')).toBe(false);
  });

  it('throws on any third shape rather than accepting it', () => {
    // Deliberately not a glob library: a dependency that silently accepted a
    // third shape would hide the next mistake instead of rejecting it.
    expect(() => globToRegExp('packages/**')).toThrow(/unsupported glob/);
    expect(() => globToRegExp('packages/core/src/*.js')).toThrow(/unsupported glob/);
    expect(() => globToRegExp('packages/*/src/*.ts')).toThrow(/unsupported glob/);
  });
});

describe('the tally is Stryker total score, not covered score', () => {
  it('counts a timeout as detected', () => {
    // A timeout is *detected*, which is Stryker's own arithmetic. #165 found
    // four mutants in `head-cap.ts` being scored as kills for straddling a 15s
    // budget — the reason `timeoutMS` is part of what a score means.
    const tally = { ...empty(), killed: 1, timeout: 1, survived: 2 };

    expect(detected(tally)).toBe(2);
    expect(total(tally)).toBe(4);
    expect(fraction(tally)).toBe(0.5);
  });

  it('keeps NoCoverage in the denominator', () => {
    // The *covered* variant drops it, which would make deleting an untested
    // file raise the number — the shape this whole effort exists to refuse.
    const tally = { ...empty(), killed: 1, noCoverage: 3 };

    expect(total(tally)).toBe(4);
    expect(fraction(tally)).toBe(0.25);
  });

  it('keeps Ignored, CompileError and Pending out of the denominator', () => {
    // Excluding a mutant is not the same as counting it as killed.
    const tally = { ...empty(), killed: 1, survived: 1, ignored: 5, errors: 5, pending: 5 };

    expect(total(tally)).toBe(2);
    expect(fraction(tally)).toBe(0.5);
  });

  it('scores an empty scope as null rather than as 1', () => {
    // ⚠️ The decision the residual check downstream depends on. An empty
    // denominator produces 100% arithmetically, which is indistinguishable from
    // a scope that is genuinely perfect — and a declared scope matching no
    // mutants is a broken declaration, not a perfect one.
    expect(fraction(empty())).toBeNull();
  });
});

describe('scoreRun — a report against the declared scopes', () => {
  const scopes = [
    scope('packages/core/src', 'packages/core/src/*.ts'),
    scope('packages/core/src/covers', 'packages/core/src/covers/**/*.ts'),
    scope('scripts', 'scripts/**/*.ts', [
      { path: 'scripts/deploy.ts', mechanism: 'driven as a child process' },
    ]),
  ];

  it('files each mutant into the scope whose glob claims it', () => {
    const run = scoreRun(
      report({
        'packages/core/src/frontmatter.ts': ['Killed', 'Killed', 'Survived'],
        'packages/core/src/covers/measure.ts': ['Killed', 'Survived'],
      }),
      scopes,
    );

    expect(fraction(run.perScope.get('packages/core/src') ?? empty())).toBeCloseTo(2 / 3);
    expect(fraction(run.perScope.get('packages/core/src/covers') ?? empty())).toBe(0.5);
    expect(fraction(run.perScope.get('scripts') ?? empty())).toBeNull();
  });

  it('gives the first matching scope the file, so a non-recursive scope wins', () => {
    // Declaration order is the tie-break, and the non-recursive scope is
    // declared first in the real file for exactly this reason.
    const run = scoreRun(report({ 'packages/core/src/frontmatter.ts': ['Killed'] }), scopes);

    expect(total(run.perScope.get('packages/core/src') ?? empty())).toBe(1);
    expect(total(run.perScope.get('packages/core/src/covers') ?? empty())).toBe(0);
  });

  it('sets an excluded file aside instead of folding it into a denominator', () => {
    // Empty by construction against a report `pnpm mutation:run` produced, and
    // the guard that matters for a report some *other* `mutate` produced.
    const run = scoreRun(report({ 'scripts/deploy.ts': ['Survived', 'Survived'] }), scopes);

    expect(run.live.get('scripts/deploy.ts')).toBe(2);
    expect(total(run.perScope.get('scripts') ?? empty())).toBe(0);
  });

  it('reports a file no scope claims rather than dropping it', () => {
    const run = scoreRun(report({ 'fixtures/whatever.ts': ['Killed'] }), scopes);

    expect(run.unclaimed.get('fixtures/whatever.ts')).toBe(1);
  });

  it('counts declared exclusion entries, not unique paths', () => {
    // The two agree while every declared path is distinct, which is why this is
    // asserted rather than left to coincide. `stacks_run_declared_exclusions`
    // publishes it as the denominator `live-exclusions` is read against.
    const twice = [
      scope('a', 'packages/core/src/*.ts', [
        { path: 'packages/core/src/x.ts', mechanism: 'one' },
      ]),
      scope('b', 'packages/cli/src/**/*.ts', [
        { path: 'packages/core/src/x.ts', mechanism: 'two' },
      ]),
    ];

    expect(scoreRun(report({}), twice).declaredExclusions).toBe(2);
  });

  it('treats an unknown status as an error rather than as a kill', () => {
    // `status` arrives from a JSON file this code does not produce, so a status
    // a future Stryker adds lands outside the denominator until somebody looks
    // at it — never silently inside it.
    const run = scoreRun(report({ 'packages/core/src/a.ts': ['Killed', 'SomethingNew'] }), scopes);
    const tally = run.perScope.get('packages/core/src') ?? empty();

    expect(tally.errors).toBe(1);
    expect(total(tally)).toBe(1);
    expect(fraction(tally)).toBe(1);
  });
});

describe('totalOf — the all-declared row', () => {
  it('sums every scope and nothing else', () => {
    const scopes = [
      scope('packages/core/src', 'packages/core/src/*.ts'),
      scope('scripts', 'scripts/**/*.ts', [
        { path: 'scripts/deploy.ts', mechanism: 'driven as a child process' },
      ]),
    ];
    const run = scoreRun(
      report({
        'packages/core/src/a.ts': ['Killed', 'Survived'],
        'scripts/lib/walk.ts': ['Killed', 'Killed'],
        // Excluded and unclaimed files must not reach the total.
        'scripts/deploy.ts': ['Survived', 'Survived', 'Survived'],
        'fixtures/x.ts': ['Survived'],
      }),
      scopes,
    );

    const all = totalOf(run);
    expect(total(all)).toBe(4);
    expect(detected(all)).toBe(3);
    expect(fraction(all)).toBe(0.75);
  });
});
