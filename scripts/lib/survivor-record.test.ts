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
  persistentSurvivors,
  recordsNewestFirst,
  shouldRecord,
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

  it('reads a partial or impossible location as original null, never a wrong slice', () => {
    const noColumn: ReportedMutant = {
      status: 'Survived',
      mutatorName: 'A',
      location: { start: { line: 1 }, end: { line: 1, column: 5 } },
    };
    const pastTheEnd = mutant('Survived', [99, 1], [99, 4], 'B');
    const files: Files = {
      'src/a.ts': { source: SOURCE, mutants: [noColumn, pastTheEnd] },
      // A report file that carries no source at all.
      'src/b.ts': {
        source: undefined as unknown as string,
        mutants: [mutant('Survived', [1, 1], [1, 4], 'C')],
      },
    };
    const survivors = parseRecord(tonight({ report: report(files) })).survivors;
    expect(survivors.map((line) => line.original)).toEqual([null, null, null]);
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
    expect(first).toMatchObject({ start: { line: 1, column: 11 }, end: { line: 1, column: 16 } });
    expect(tonight().endsWith('}\n')).toBe(true);
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
          // Collides with the first on file, mutator, original and replacement:
          // only the location tie-break orders the pair.
          mutant('Survived', [3, 11], [3, 16]),
          mutant('NoCoverage', [3, 11], [3, 16], 'BooleanLiteral', 'true'),
          // No mutator name at all, so a null sorts against a string.
          { status: 'Survived', location: mutant('x', [2, 11], [2, 16]).location },
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

    // Same count, different survivor: only the content key can tell, and a diff
    // that compared totals would read this as no movement.
    const other = report({
      'src/a.ts': { source: SOURCE, mutants: [mutant('Survived', [2, 11], [2, 16])] },
    });
    expect(diffRecords(less, parseRecord(tonight({ report: other })))).toEqual({
      kind: 'diff',
      added: 1,
      gone: 1,
    });
  });
});

describe('C6: multi-line originals', () => {
  it('keeps the original verbatim, newlines included, through JSON', () => {
    const source = 'const t = `a\nb`;';
    const files: Files = {
      'src/a.ts': { source, mutants: [mutant('Survived', [1, 11], [2, 3], 'StringLiteral', '``')] },
    };
    const text = tonight({ report: report(files) });
    expect(text.endsWith('\n')).toBe(true);
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

  it('names every cause when more than one moved', () => {
    const line = summaryLine({
      ...base,
      tonight: tonight({ stryker: '9.7.0', configHash: 'sha256:other' }),
      previous: previous(),
    });
    expect(line).toBe(
      'Survivors: 2 tonight — not compared with bbbbbbb (2026-10-17): the Stryker version and config hash changed.',
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

    // No keySchema is unreadable too, and not a "key schema changed".
    const noSchema = lines(previous())[0] as Record<string, unknown>;
    delete noSchema.keySchema;
    const second = summaryLine({
      ...base,
      tonight: tonight(),
      previous: `${JSON.stringify(noSchema)}\n`,
    });
    expect(second).toBe(
      'Survivors: 2 tonight — the previous record could not be read, so no diff.',
    );
  });

  it('gives tonight’s total only when a survivor line of the previous record is malformed', () => {
    const [header] = previous().split('\n');
    for (const bad of ['{"file":1,"status":"Survived"}', '{"file":"a.ts","status":"Killed"}']) {
      const line = summaryLine({ ...base, tonight: tonight(), previous: `${header}\n${bad}\n` });
      expect(line).toBe(
        'Survivors: 2 tonight — the previous record could not be read, so no diff.',
      );
    }
  });

  it.each([
    ['a commit that is not 40 hex characters', { commit: '[x](http://evil)' }],
    ['a commit with junk before 40 hex characters', { commit: `](http://evil)${'a'.repeat(40)}` }],
    ['a commit with junk after 40 hex characters', { commit: `${'a'.repeat(40)}](http://evil)` }],
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

  it('names a commit that failed, ahead of any diff', () => {
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
    // Tonight's own record on disk, but unreadable.
    expect(summaryLine({ tonight: '{', previous: undefined, commitStatus: '0' })).toBe(
      "Survivors: not recorded tonight — tonight's record could not be read back.",
    );
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
    const decision = shouldRecord(ok);
    expect(decision.ok).toBe(true);
  });

  it('refuses a non-zero mutation status, by number', () => {
    expect(shouldRecord({ ...ok, mutationStatus: '1' })).toEqual({
      ok: false,
      reason: 'the mutation run exited with status 1',
    });
  });

  it('refuses a mutation step that did not run', () => {
    expect(shouldRecord({ ...ok, mutationStatus: '' })).toEqual({
      ok: false,
      reason: 'the mutation step did not run',
    });
  });

  it('refuses a status that is not a plain number, without echoing it', () => {
    const reason = 'the mutation run ended with an unrecognised status';
    for (const mutationStatus of ['[x](http://evil)', '1[x](http://evil)', '[x](http://evil)1']) {
      expect(shouldRecord({ ...ok, mutationStatus })).toEqual({ ok: false, reason });
    }
  });

  it('reads a three-digit status as a number', () => {
    expect(shouldRecord({ ...ok, mutationStatus: '137' })).toEqual({
      ok: false,
      reason: 'the mutation run exited with status 137',
    });
  });

  it('refuses a report that does not parse, or is missing', () => {
    const reason = 'the mutation report could not be read';
    expect(shouldRecord({ ...ok, reportText: '{"files":' })).toEqual({ ok: false, reason });
    expect(shouldRecord({ ...ok, reportText: '{"nope":1}' })).toEqual({ ok: false, reason });
    expect(shouldRecord({ ...ok, reportText: undefined })).toEqual({ ok: false, reason });
  });

  it.each(['refs/heads/feature', 'refs/tags/main', 'main', ''])(
    'refuses the ref %j: only the default branch writes a record',
    (ref) => {
      expect(shouldRecord({ ...ok, ref })).toEqual({ ok: false, reason: 'the run is not on main' });
    },
  );
});

describe('#472: survivors present on every one of the last N records', () => {
  /** `[scope, file, mutator, original, replacement]`. */
  type Key = [string, string, string, string, string];

  interface Night {
    stryker?: string;
    configHash?: string;
    keySchema?: number;
    survivors: Key[];
  }

  function night(spec: Night): string {
    const header = {
      record: 'survivors',
      keySchema: spec.keySchema ?? 1,
      stryker: spec.stryker ?? '9.0.0',
      configHash: spec.configHash ?? 'h1',
      commit: SHA_A,
      event: 'schedule',
      runUrl: '',
      recordedAt: '2026-10-01T00:00:00Z',
      counts: {},
    };
    const lines = spec.survivors.map(([scope, file, mutator, original, replacement]) => ({
      file,
      scope,
      mutator,
      status: 'Survived',
      original,
      replacement,
      start: null,
      end: null,
    }));
    return [header, ...lines].map((line) => JSON.stringify(line)).join('\n') + '\n';
  }

  const X: Key = ['alpha', 'src/a.ts', 'StringLiteral', "'one'", '""'];
  const Y: Key = ['beta', 'lib/b.ts', 'BooleanLiteral', 'true', 'false'];

  it('lists a key on every record and drops one missing from any', () => {
    const records = [
      night({ survivors: [X, Y] }),
      night({ survivors: [X] }),
      night({ survivors: [Y, X] }),
    ];
    const result = persistentSurvivors(records, 3);
    expect(result.compared).toBe(3);
    expect(result.stop).toBeUndefined();
    expect(result.survivors).toEqual([
      {
        scope: 'alpha',
        file: 'src/a.ts',
        mutator: 'StringLiteral',
        original: "'one'",
        replacement: '""',
        count: 1,
      },
    ]);
  });

  it('reads only the newest N, so an older night without the key does not drop it', () => {
    const records = [
      night({ survivors: [X, Y] }),
      night({ survivors: [X, Y] }),
      night({ survivors: [X] }),
    ];
    expect(persistentSurvivors(records, 2).survivors.map((s) => s.file)).toEqual([
      'src/a.ts',
      'lib/b.ts',
    ]);
  });

  it('matches as a multiset: the count is the fewest copies on any record', () => {
    const records = [
      night({ survivors: [X, X, X] }),
      night({ survivors: [X, X] }),
      night({ survivors: [X, X, X] }),
    ];
    expect(persistentSurvivors(records, 3).survivors.map((s) => s.count)).toEqual([2]);
  });

  it('stops at a record whose Stryker version differs, and says where', () => {
    const records = [
      night({ survivors: [X] }),
      night({ survivors: [X] }),
      night({ stryker: '8.0.0', survivors: [X] }),
    ];
    const result = persistentSurvivors(records, 3);
    expect(result.compared).toBe(2);
    expect(result.stop).toEqual({ index: 2, reason: 'the Stryker version changed' });
    expect(result.survivors).toEqual([]);
  });

  it('stops at a different config hash or key schema, naming each', () => {
    const records = [
      night({ survivors: [X] }),
      night({ configHash: 'h2', keySchema: 2, survivors: [X] }),
    ];
    expect(persistentSurvivors(records, 2).stop).toEqual({
      index: 1,
      reason: 'the key schema and config hash changed',
    });
  });

  it('stops at a record that does not parse', () => {
    const result = persistentSurvivors([night({ survivors: [X] }), '{not json'], 2);
    expect(result.compared).toBe(1);
    expect(result.stop).toEqual({ index: 1, reason: 'the record could not be read' });
  });

  it('lists nothing and stops at the end when there are fewer than N records', () => {
    const result = persistentSurvivors([night({ survivors: [X] })], 2);
    expect(result.compared).toBe(1);
    expect(result.stop).toEqual({ index: 1, reason: 'there are no older records' });
    expect(result.survivors).toEqual([]);
  });

  it('orders record paths newest first by timestamp, and drops anything else', () => {
    const listing = [
      'survivors/200-abc.jsonl',
      'survivors/1000-abc.jsonl',
      'survivors/README.md',
      'survivors/300-def.jsonl',
    ].join('\n');
    expect(recordsNewestFirst(listing)).toEqual([
      'survivors/1000-abc.jsonl',
      'survivors/300-def.jsonl',
      'survivors/200-abc.jsonl',
    ]);
  });

  it('takes N of 1 as the newest record alone', () => {
    expect(
      persistentSurvivors([night({ survivors: [X] })], 1).survivors.map((s) => s.file),
    ).toEqual(['src/a.ts']);
  });

  it('refuses an N below 1', () => {
    expect(() => persistentSurvivors([night({ survivors: [X] })], 0)).toThrow(/at least 1/);
    expect(() => persistentSurvivors([night({ survivors: [X] })], 1.5)).toThrow(/whole number/);
  });
});
