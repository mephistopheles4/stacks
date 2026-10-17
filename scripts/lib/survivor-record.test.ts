/**
 * The survivor record: a Stryker report in, a sorted JSON Lines file out, and
 * two of those files in, one summary line out. `docs/spec/survivor-record.md`
 * §S5 names the claims, C1–C8; C9 is `scripts/commit-metrics.test.ts`.
 *
 * Reports are small synthetic ones, like `mutation-score.test.ts`, and nothing
 * here reads a file: Stryker's sandbox is not the repository.
 */

import { describe, expect, it } from 'vitest';
import type { MutationReport, ReportedMutant, Scope } from './mutation-score.ts';
import { survivorsOf } from './mutation-score.ts';
import {
  buildRecord,
  diffRecords,
  gateRun,
  parseRecord,
  summaryLine,
  type BuildInput,
} from './survivor-record.ts';

const SCOPES: Scope[] = [
  { name: 'alpha', glob: 'src/*.ts', exclusions: [] },
  { name: 'beta', glob: 'lib/*.ts', exclusions: [] },
];

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function mutant(
  status: string,
  from: [number, number],
  to: [number, number],
  mutatorName = 'StringLiteral',
  replacement = '""',
): ReportedMutant {
  return {
    status,
    mutatorName,
    replacement,
    location: {
      start: { line: from[0], column: from[1] },
      end: { line: to[0], column: to[1] },
    },
  };
}

type Files = Record<string, { source: string; mutants: ReportedMutant[] }>;

function report(files: Files): MutationReport {
  return { files };
}

const SOURCE = ["const a = 'one';", "const b = 'two';", "const c = 'one';"].join('\n');

/** `'one'` on line 1 and `'two'` on line 2, both surviving, plus a killed one. */
function simple(): MutationReport {
  return report({
    'src/a.ts': {
      source: SOURCE,
      mutants: [
        mutant('Survived', [1, 11], [1, 16]),
        mutant('Survived', [2, 11], [2, 16]),
        mutant('Killed', [3, 11], [3, 16]),
      ],
    },
  });
}

function input(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    report: simple(),
    scopes: SCOPES,
    stryker: '9.6.1',
    configHash: 'sha256:cfg',
    commit: SHA_A,
    event: 'schedule',
    runUrl: 'https://github.com/example/repo/actions/runs/1',
    recordedAt: '2026-10-18T02:00:00.000Z',
    ...overrides,
  };
}

function lines(text: string): unknown[] {
  return text
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);
}

function tonight(over: Partial<BuildInput> = {}): string {
  return buildRecord(input(over));
}

describe('C1: what a survivor is', () => {
  it('keeps Survived and NoCoverage and drops every other status', () => {
    const statuses = [
      'Survived',
      'NoCoverage',
      'Killed',
      'Timeout',
      'CompileError',
      'RuntimeError',
    ];
    const files: Files = {
      'src/a.ts': {
        source: SOURCE,
        mutants: [...statuses, 'Ignored'].map((status) => mutant(status, [1, 11], [1, 16])),
      },
    };
    const parsed = parseRecord(tonight({ report: report(files) }));
    expect(parsed.survivors.map((line) => line.status).sort()).toEqual(['NoCoverage', 'Survived']);
  });

  it('counts what survivorsOf counts, per scope', () => {
    const files: Files = {
      'src/a.ts': {
        source: SOURCE,
        mutants: [mutant('Survived', [1, 11], [1, 16]), mutant('NoCoverage', [2, 11], [2, 16])],
      },
      'lib/b.ts': { source: SOURCE, mutants: [mutant('Survived', [3, 11], [3, 16])] },
    };
    const parsed = parseRecord(tonight({ report: report(files) }));
    const expected = survivorsOf(report(files), SCOPES, 100);
    for (const scope of SCOPES) {
      const listed = expected.get(scope.name) ?? [];
      expect(parsed.header.counts[scope.name]).toEqual({
        survived: listed.reduce((sum, file) => sum + file.survived, 0),
        noCoverage: listed.reduce((sum, file) => sum + file.noCoverage, 0),
      });
    }
    expect(parsed.header.counts).toEqual({
      alpha: { survived: 1, noCoverage: 1 },
      beta: { survived: 1, noCoverage: 0 },
    });
  });

  it('keeps a survivor with no location, as original null', () => {
    const files: Files = {
      'src/a.ts': { source: SOURCE, mutants: [{ status: 'Survived', mutatorName: 'X' }] },
    };
    const [only] = parseRecord(tonight({ report: report(files) })).survivors;
    expect(only).toMatchObject({ original: null, replacement: null, start: null, end: null });
  });

  it('leaves out a file no scope claims, and one the scopes exclude', () => {
    const files: Files = {
      'other/c.ts': { source: SOURCE, mutants: [mutant('Survived', [1, 11], [1, 16])] },
      'src/skip.ts': { source: SOURCE, mutants: [mutant('Survived', [1, 11], [1, 16])] },
    };
    const scopes: Scope[] = [
      { name: 'alpha', glob: 'src/*.ts', exclusions: [{ path: 'src/skip.ts', mechanism: 'x' }] },
    ];
    const parsed = parseRecord(tonight({ report: report(files), scopes }));
    expect(parsed.survivors).toEqual([]);
    expect(parsed.header.counts).toEqual({ alpha: { survived: 0, noCoverage: 0 } });
  });

  it('writes the header fields in the documented order, then sorted survivor lines', () => {
    const [header, first] = lines(tonight()) as Record<string, unknown>[];
    expect(Object.keys(header ?? {})).toEqual([
      'record',
      'keySchema',
      'stryker',
      'configHash',
      'commit',
      'event',
      'runUrl',
      'recordedAt',
      'counts',
    ]);
    expect(header).toMatchObject({ record: 'survivors', keySchema: 1, commit: SHA_A });
    expect(Object.keys(first ?? {})).toEqual([
      'file',
      'scope',
      'mutator',
      'status',
      'original',
      'replacement',
      'start',
      'end',
    ]);
  });
});

describe('C2: the record depends on content, not order', () => {
  it('is byte-identical when mutants[] and files are shuffled', () => {
    const files: Files = {
      'src/a.ts': {
        source: SOURCE,
        mutants: [
          mutant('Survived', [1, 11], [1, 16]),
          mutant('Survived', [2, 11], [2, 16]),
          mutant('NoCoverage', [3, 11], [3, 16], 'BooleanLiteral', 'true'),
        ],
      },
      'lib/b.ts': { source: SOURCE, mutants: [mutant('Survived', [3, 11], [3, 16])] },
    };
    const shuffled: Files = {
      'lib/b.ts': files['lib/b.ts'] as Files[string],
      'src/a.ts': {
        source: SOURCE,
        mutants: [...(files['src/a.ts']?.mutants ?? [])].reverse(),
      },
    };
    expect(tonight({ report: report(shuffled) })).toBe(tonight({ report: report(files) }));
  });

  it('sorts by code unit, so a capital comes before a lower-case letter', () => {
    const files: Files = {
      'src/a.ts': {
        source: SOURCE,
        mutants: [
          mutant('Survived', [1, 11], [1, 16], 'apple'),
          mutant('Survived', [1, 11], [1, 16], 'Zebra'),
        ],
      },
    };
    const mutators = parseRecord(tonight({ report: report(files) })).survivors.map(
      (line) => line.mutator,
    );
    expect(mutators).toEqual(['Zebra', 'apple']);
  });
});

describe('C3: collisions are kept', () => {
  const twins = (): MutationReport =>
    report({
      'src/a.ts': {
        source: "const a = 'x';\nconst b = 'x';",
        mutants: [mutant('Survived', [1, 11], [1, 14]), mutant('Survived', [2, 11], [2, 14])],
      },
    });

  it('writes both survivors that share a key', () => {
    expect(parseRecord(tonight({ report: twins() })).survivors).toHaveLength(2);
  });

  it('reads the second twin as new against a record holding one', () => {
    const one = report({
      'src/a.ts': { source: "const a = 'x';", mutants: [mutant('Survived', [1, 11], [1, 14])] },
    });
    const comparison = diffRecords(
      parseRecord(tonight({ report: one })),
      parseRecord(tonight({ report: twins() })),
    );
    expect(comparison).toEqual({ kind: 'diff', added: 1, gone: 0 });
  });
});

describe('C4: content, not position', () => {
  it('reads a file with a line prepended as unchanged', () => {
    const shifted = report({
      'src/a.ts': {
        source: `// a new first line\n${SOURCE}`,
        mutants: [mutant('Survived', [2, 11], [2, 16]), mutant('Survived', [3, 11], [3, 16])],
      },
    });
    const comparison = diffRecords(
      parseRecord(tonight()),
      parseRecord(tonight({ report: shifted, commit: SHA_B })),
    );
    expect(comparison).toEqual({ kind: 'diff', added: 0, gone: 0 });
  });
});

describe('C5: the diff control', () => {
  it('reads a record against itself as no movement', () => {
    const record = parseRecord(tonight());
    expect(diffRecords(record, record)).toEqual({ kind: 'diff', added: 0, gone: 0 });
  });

  it('counts a dropped survivor as gone 1 and an added one as new 1', () => {
    const fewer = report({
      'src/a.ts': { source: SOURCE, mutants: [mutant('Survived', [1, 11], [1, 16])] },
    });
    const full = parseRecord(tonight());
    const less = parseRecord(tonight({ report: fewer }));
    expect(diffRecords(full, less)).toEqual({ kind: 'diff', added: 0, gone: 1 });
    expect(diffRecords(less, full)).toEqual({ kind: 'diff', added: 1, gone: 0 });
  });
});

describe('C6: multi-line originals', () => {
  it('keeps the original verbatim, newlines included, through JSON', () => {
    const source = 'const t = `a\nb`;';
    const files: Files = {
      'src/a.ts': { source, mutants: [mutant('Survived', [1, 11], [2, 3], 'StringLiteral', '``')] },
    };
    const text = tonight({ report: report(files) });
    expect(text.split('\n').filter((line) => line !== '')).toHaveLength(2);
    const [only] = parseRecord(text).survivors;
    expect(only?.original).toBe('`a\nb`');
  });
});

describe('C7: comparability', () => {
  const base = (over: Partial<BuildInput> = {}): ReturnType<typeof parseRecord> =>
    parseRecord(tonight(over));

  it.each([
    ['Stryker version', { stryker: '9.7.0' }],
    ['config hash', { configHash: 'sha256:other' }],
  ])('does not compare across a different %s', (name, over) => {
    const comparison = diffRecords(base(), base(over));
    expect(comparison.kind).toBe('not-compared');
    expect(JSON.stringify(comparison)).toContain(name);
  });

  it('does not compare across a different key schema', () => {
    const older = base();
    older.header.keySchema = 0;
    const comparison = diffRecords(older, base());
    expect(comparison).toEqual({ kind: 'not-compared', changed: ['key schema'] });
  });
});

describe('C8: the summary line, one form per case', () => {
  const previous = (): string => tonight({ commit: SHA_B, recordedAt: '2026-10-17T02:00:00.000Z' });
  const base = { commitStatus: '0' };

  it('renders a diff against the previous record', () => {
    const fewer = report({
      'src/a.ts': { source: SOURCE, mutants: [mutant('Survived', [1, 11], [1, 16])] },
    });
    const line = summaryLine({
      ...base,
      tonight: tonight({ report: fewer }),
      previous: previous(),
    });
    expect(line).toBe(
      'Survivors: 1 tonight — 0 new, 1 gone since bbbbbbb (2026-10-17). ' +
        'On unchanged code, up to two either way is noise ' +
        '([measured](https://github.com/mephistopheles4/stacks/blob/main/docs/log/2026-09-21-the-survivor-set-diffs-cleanly.md)).',
    );
  });

  it('groups thousands in the total', () => {
    const mutants = Array.from({ length: 1200 }, (_, index) =>
      mutant('Survived', [1, 1 + index], [1, 2 + index], 'M', String(index)),
    );
    const big = report({ 'src/a.ts': { source: 'x'.repeat(1300), mutants } });
    const line = summaryLine({ ...base, tonight: tonight({ report: big }), previous: undefined });
    expect(line).toContain('1,200 tonight');
  });

  it('renders the first record when there is no previous one', () => {
    const line = summaryLine({ ...base, tonight: tonight(), previous: undefined });
    expect(line).toBe(
      'Survivors: 2 tonight — the first record, so there is nothing to compare with.',
    );
  });

  it('says not compared when the Stryker version moved', () => {
    const line = summaryLine({
      ...base,
      tonight: tonight({ stryker: '9.7.0' }),
      previous: previous(),
    });
    expect(line).toBe(
      'Survivors: 2 tonight — not compared with bbbbbbb (2026-10-17): the Stryker version changed.',
    );
  });

  it('gives tonight’s total only for a previous record that does not parse', () => {
    const line = summaryLine({ ...base, tonight: tonight(), previous: '{not json\n' });
    expect(line).toBe('Survivors: 2 tonight — the previous record could not be read, so no diff.');
  });

  it('gives tonight’s total only when the previous header lacks a field', () => {
    const header = lines(previous())[0] as Record<string, unknown>;
    delete header.configHash;
    const line = summaryLine({
      ...base,
      tonight: tonight(),
      previous: `${JSON.stringify(header)}\n`,
    });
    expect(line).toContain('could not be read');
  });

  it.each([
    ['a commit that is not 40 hex characters', { commit: '[x](http://evil)' }],
    ['a commit of the wrong length', { commit: 'abc123' }],
    ['a recordedAt that is not ISO 8601 UTC', { recordedAt: '*bold* yesterday' }],
    ['a recordedAt without the UTC marker', { recordedAt: '2026-10-17T02:00:00' }],
  ])('prints neither value of a previous record with %s', (_name, over) => {
    const header = { ...(lines(previous())[0] as Record<string, unknown>), ...over };
    const line = summaryLine({
      ...base,
      tonight: tonight(),
      previous: `${JSON.stringify(header)}\n`,
    });
    expect(line).toBe('Survivors: 2 tonight — the previous record could not be read, so no diff.');
    expect(line).not.toContain('evil');
    expect(line).not.toContain('bold');
  });

  it('names a commit that failed after the diff was computed', () => {
    const line = summaryLine({ tonight: tonight(), previous: previous(), commitStatus: '1' });
    expect(line).toBe(
      'Survivors: not recorded tonight — the record could not be committed to the survivors branch.',
    );
  });

  it('names a commit step that never ran', () => {
    const line = summaryLine({ tonight: tonight(), previous: undefined, commitStatus: '' });
    expect(line).toContain('not recorded tonight');
  });

  it('names a record that is missing though nothing was skipped', () => {
    const line = summaryLine({ tonight: undefined, previous: undefined, commitStatus: '0' });
    expect(line).toBe('Survivors: not recorded tonight — the record was not written.');
  });

  it('names the skip reason ahead of anything else', () => {
    const line = summaryLine({
      skipped: 'the run is not on main',
      tonight: undefined,
      previous: undefined,
      commitStatus: '',
    });
    expect(line).toBe('Survivors: not recorded tonight — the run is not on main.');
  });

  it('is exactly one line in every form', () => {
    const forms = [
      summaryLine({ ...base, tonight: tonight(), previous: previous() }),
      summaryLine({ ...base, tonight: tonight(), previous: undefined }),
      summaryLine({ ...base, tonight: tonight(), previous: 'x' }),
      summaryLine({ skipped: 'why', tonight: undefined, previous: undefined, commitStatus: '' }),
    ];
    for (const form of forms) expect(form).not.toMatch(/[\r\n]/);
  });
});

describe('C8: when a record is written at all', () => {
  const json = JSON.stringify(simple());
  const ok = { mutationStatus: '0', ref: 'refs/heads/main', reportText: json };

  it('lets a clean run on main through, with its report', () => {
    const gate = gateRun(ok);
    expect(gate.ok).toBe(true);
  });

  it('refuses a non-zero mutation status, by number', () => {
    expect(gateRun({ ...ok, mutationStatus: '1' })).toEqual({
      ok: false,
      reason: 'the mutation run exited with status 1',
    });
  });

  it('refuses a mutation step that did not run', () => {
    expect(gateRun({ ...ok, mutationStatus: '' })).toEqual({
      ok: false,
      reason: 'the mutation step did not run',
    });
  });

  it('refuses a status that is not a plain number, without echoing it', () => {
    const gate = gateRun({ ...ok, mutationStatus: '[x](http://evil)' });
    expect(gate).toEqual({
      ok: false,
      reason: 'the mutation run ended with an unrecognised status',
    });
  });

  it('refuses a report that does not parse, or is missing', () => {
    const reason = 'the mutation report could not be read';
    expect(gateRun({ ...ok, reportText: '{"files":' })).toEqual({ ok: false, reason });
    expect(gateRun({ ...ok, reportText: '{"nope":1}' })).toEqual({ ok: false, reason });
    expect(gateRun({ ...ok, reportText: undefined })).toEqual({ ok: false, reason });
  });

  it.each(['refs/heads/feature', 'refs/tags/main', 'main', ''])(
    'refuses the ref %j: only the default branch writes a record',
    (ref) => {
      expect(gateRun({ ...ok, ref })).toEqual({ ok: false, reason: 'the run is not on main' });
    },
  );
});
