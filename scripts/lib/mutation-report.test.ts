/**
 * The two surfaces a mutation report is printed on: the terminal table
 * `pnpm mutation:score` prints, and the job summary the nightly writes.
 *
 * An ordinary unit test beside its module, not a gate. Every report here is a
 * small hand-built fixture — never a real run, which would carry the source of
 * every mutated file — and, for `mutation-score.test.ts`'s reason, nothing here
 * reads the filesystem: Stryker's sandbox is not the repository.
 */

import { describe, expect, it } from 'vitest';
import type { MutationReport, ReportedMutant, Scope } from './mutation-score.ts';
import { scoreRun } from './mutation-score.ts';
import {
  parseReport,
  renderSummary,
  terminalTable,
  type ReportState,
  type SummaryInput,
} from './mutation-report.ts';

const SCOPES: Scope[] = [
  { name: 'packages/core/src', glob: 'packages/core/src/*.ts', exclusions: [] },
  {
    name: 'scripts',
    glob: 'scripts/**/*.ts',
    exclusions: [{ path: 'scripts/deploy.ts', mechanism: 'driven as a child process' }],
  },
  { name: 'packages/site/src', glob: 'packages/site/src/**/*.ts', exclusions: [] },
];

function mutant(status: string, line: number, replacement = 'false'): ReportedMutant {
  return {
    status,
    mutatorName: 'BooleanLiteral',
    replacement,
    location: { start: { line, column: 1 } },
  };
}

const FIXTURE: MutationReport = {
  files: {
    'packages/core/src/a.ts': {
      mutants: [mutant('Killed', 1), mutant('Survived', 2), mutant('Timeout', 3)],
    },
    'scripts/lib/b.ts': {
      mutants: [
        mutant('NoCoverage', 4),
        mutant('Killed', 5),
        { ...mutant('Killed', 6), static: true },
      ],
    },
  },
};

function input(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    state: { kind: 'parsed', report: FIXTURE },
    scopes: SCOPES,
    date: '2026-09-14',
    commit: '5971b65aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    mutationStatus: '0',
    artifactUrl: 'https://github.com/o/r/actions/runs/1/artifacts/2',
    ...overrides,
  };
}

function parsed(report: MutationReport): ReportState {
  return { kind: 'parsed', report };
}

describe('the score table is the same on both surfaces', () => {
  it('renders the numbers mutation:score prints, row for row', () => {
    const terminal = terminalTable(scoreRun(FIXTURE, SCOPES)).map((line) =>
      line.trim().split(/\s{2,}/),
    );

    const markdown = renderSummary(input())
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| file'))
      .map((line) => line.slice(2, -2).split(' | '))
      .filter((cells) => !cells.every((cell) => /^-+:?$/.test(cell)));

    expect(markdown.slice(0, terminal.length)).toEqual(terminal);
    expect(terminal.at(-1)?.[0]).toBe('all declared');
  });

  it('prints n/a, never 100%, for a scope with no mutants', () => {
    const summary = renderSummary(input());
    expect(summary).toContain('| packages/site/src | 0 | n/a |');
    expect(summary).not.toContain('100.00%');
  });
});

describe('renderSummary — the job summary', () => {
  it('opens with a heading naming the nightly, the date and the short commit', () => {
    expect(renderSummary(input()).split('\n')[0]).toBe(
      '## Mutation report — nightly, 2026-09-14, `5971b65`',
    );
  });

  it('lists per scope the files with survivors, and says so for a scope with none', () => {
    const summary = renderSummary(input());

    expect(summary).toContain('| packages/core/src/a.ts | 1 | 0 |');
    expect(summary).toContain('| scripts/lib/b.ts | 0 | 1 |');
    expect(summary).toContain('No surviving or uncovered mutants in `packages/site/src`.');
  });

  it('shows each listed file its mutants in a collapsed block', () => {
    const summary = renderSummary(input());

    expect(summary).toContain('<details><summary>packages/core/src/a.ts');
    expect(summary).toContain(
      '<tr><td>2</td><td>Survived</td><td>BooleanLiteral</td><td><code>false</code></td></tr>',
    );
  });

  it('caps a file at 50 mutants, then says how many more there are', () => {
    const many = Array.from({ length: 53 }, (_, index) => mutant('Survived', index + 1));
    const summary = renderSummary(
      input({ state: parsed({ files: { 'scripts/lib/big.ts': { mutants: many } } }) }),
    );

    expect(summary.match(/<tr><td>\d+<\/td>/g)).toHaveLength(50);
    expect(summary).toContain('…and 3 more — see `mutation.html`');
  });

  it('escapes replacement text that is source code', () => {
    const hostile = 'a | b `c` </details><script>x && y</script>';
    const summary = renderSummary(
      input({
        state: parsed({
          files: { 'scripts/lib/x.ts': { mutants: [mutant('Survived', 7, hostile)] } },
        }),
      }),
    );

    const opened = summary.match(/<details>/g)?.length ?? 0;
    expect(summary.match(/<\/details>/g)).toHaveLength(opened);
    expect(summary).not.toContain('<script>');
    expect(summary).toContain(
      '<code>a &#124; b &#96;c&#96; &lt;/details&gt;&lt;script&gt;x &amp;&amp; y&lt;/script&gt;</code>',
    );
  });

  it('keeps a multi-line replacement on one row', () => {
    const summary = renderSummary(
      input({
        state: parsed({
          files: { 'scripts/lib/x.ts': { mutants: [mutant('Survived', 7, '{\n  return;\n}')] } },
        }),
      }),
    );

    expect(summary).toContain('<td><code>{ ⏎ return; ⏎ }</code></td>');
  });

  it('links the uploaded artifact, or says there is none', () => {
    expect(renderSummary(input())).toContain(
      '[Download the full report](https://github.com/o/r/actions/runs/1/artifacts/2)',
    );
    expect(renderSummary(input({ artifactUrl: '' }))).toContain(
      'No report artifact was uploaded for this run.',
    );
  });
});

describe('renderSummary — warnings come first', () => {
  it('says the report is missing, and renders nothing it cannot know', () => {
    const summary = renderSummary(
      input({ state: { kind: 'missing', path: 'artifacts/stryker/current/mutation.json' } }),
    );

    expect(summary).toContain(
      '> ⚠️ No mutation report at `artifacts/stryker/current/mutation.json`',
    );
    expect(summary).not.toContain('| scope |');
  });

  it('puts the missing report ahead of the exit status that explains it', () => {
    const summary = renderSummary(
      input({ state: { kind: 'missing', path: 'm.json' }, mutationStatus: '1' }),
    );

    expect(summary.indexOf('No mutation report')).toBeLessThan(
      summary.indexOf('exited with status 1'),
    );
  });

  it('says the report did not parse, and stops there too', () => {
    const summary = renderSummary(
      input({ state: { kind: 'unparseable', path: 'm.json', reason: 'Unexpected end of JSON' } }),
    );

    expect(summary).toContain('> ⚠️ The mutation report at `m.json` did not parse');
    expect(summary).toContain('Unexpected end of JSON');
    expect(summary).not.toContain('| scope |');
  });

  it('warns when the mutation step exited non-zero or reported nothing', () => {
    expect(renderSummary(input({ mutationStatus: '1' }))).toContain(
      '> ⚠️ The mutation step exited with status 1',
    );
    expect(renderSummary(input({ mutationStatus: '' }))).toContain(
      '> ⚠️ The mutation step reported no exit status',
    );
    expect(renderSummary(input())).not.toContain('⚠️');
  });

  it('warns that a report with pending mutants is partial, above the table', () => {
    const summary = renderSummary(
      input({
        state: parsed({ files: { 'scripts/lib/x.ts': { mutants: [mutant('Pending', 1)] } } }),
      }),
    );

    const warning = summary.indexOf('> ⚠️ 1 mutant(s) still Pending');
    expect(warning).toBeGreaterThan(-1);
    expect(warning).toBeLessThan(summary.indexOf('| scope |'));
  });
});

describe('renderSummary — the size guard', () => {
  const heavy = input({
    state: parsed({
      files: Object.fromEntries(
        ['a', 'b', 'c'].map((name) => [
          `scripts/lib/${name}.ts`,
          {
            mutants: Array.from({ length: 50 }, (_, index) =>
              mutant('Survived', index + 1, 'x'.repeat(150)),
            ),
          },
        ]),
      ),
    }),
  });

  it('leaves a summary under the limit alone', () => {
    expect(renderSummary(heavy)).not.toContain('cut to fit');
  });

  it('cuts the mutant lists, never the score table, and says it did', () => {
    const full = renderSummary(heavy);
    const limit = Math.floor(Buffer.byteLength(full, 'utf8') / 3);

    const cut = renderSummary(heavy, { maxBytes: limit });

    expect(Buffer.byteLength(cut, 'utf8')).toBeLessThanOrEqual(limit);
    expect(cut).toContain('cut to fit');
    for (const line of terminalTable(
      scoreRun(heavy.state.kind === 'parsed' ? heavy.state.report : { files: {} }, SCOPES),
    )) {
      expect(cut).toContain(
        `| ${line
          .trim()
          .split(/\s{2,}/)
          .join(' | ')} |`,
      );
    }
  });

  it('keeps the score table even when nothing else fits', () => {
    const cut = renderSummary(heavy, { maxBytes: 10 });

    expect(cut).toContain('| all declared |');
    expect(cut).not.toContain('<details>');
  });
});

describe('parseReport', () => {
  it('accepts a report carrying a files object', () => {
    expect(parseReport('{"files":{}}')).toEqual({ files: {} });
  });

  it('throws on truncated JSON and on JSON of the wrong shape', () => {
    expect(() => parseReport('{"files":{"a.ts":')).toThrow();
    expect(() => parseReport('[]')).toThrow(/files/);
    expect(() => parseReport('{"files":null}')).toThrow(/files/);
  });

  it('throws on a file entry with no mutants array, which scoring would crash on', () => {
    expect(() => parseReport('{"files":{"a.ts":{}}}')).toThrow(/a\.ts/);
    expect(() => parseReport('{"files":{"a.ts":null}}')).toThrow(/a\.ts/);
    expect(() => parseReport('{"files":{"a.ts":{"mutants":{}}}}')).toThrow(/a\.ts/);
  });
});
