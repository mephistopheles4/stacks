/**
 * `scripts/mutation-scopes.ts --survivors-write`: a skipped night writes no file.
 *
 * `docs/spec/survivor-record.md` §S4.3 and C8. The decision (`shouldRecord`) is
 * tested in-process in `./lib/survivor-record.test.ts`; this is the half no
 * in-process test reaches, that the script **acts** on it — a record written
 * despite a refusal would become the next night's baseline. The script is run as
 * a child process, as `commit-metrics.test.ts` runs its script, and for the same
 * reason is excluded from Stryker's dry run (`vitest.stryker.config.ts`).
 *
 * One test, with its control in the same breath: the clean run on `main` writes
 * exactly one file, so a script that never writes anything cannot pass the three
 * refusals by being broken.
 *
 * It is the third test beyond one per claim, decided by the owner (the Tests added
 * limit is 2 per change): the exhausted-retry test the lens asked for was left out.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('./mutation-scopes.ts', import.meta.url));
const TSX = import.meta.resolve('tsx/esm');
const SHA = 'a'.repeat(40);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stacks-scopes-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(status: string, ref: string, report: string, directory: string) {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      TSX,
      SCRIPT,
      report,
      '--survivors-write',
      directory,
      '--mutation-status',
      status,
      '--ref',
      ref,
      '--commit',
      SHA,
      '--event',
      'schedule',
      '--run-url',
      'https://example.invalid/run',
    ],
    { encoding: 'utf8' },
  );
  return { status: result.status, out: `${result.stdout}\n${result.stderr}` };
}

function files(directory: string): string[] {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

it('writes a record on a clean run on main, and none on a refusal', () => {
  const report = join(root, 'mutation.json');
  const mutant = {
    status: 'Survived',
    mutatorName: 'ArithmeticOperator',
    replacement: '1 - 2',
    location: { start: { line: 1, column: 11 }, end: { line: 1, column: 16 } },
  };
  writeFileSync(
    report,
    JSON.stringify({
      files: { 'scripts/lib/x.ts': { source: 'const a = 1 + 2;', mutants: [mutant] } },
    }),
  );

  const clean = join(root, 'clean');
  expect(write('0', 'refs/heads/main', report, clean).status).toBe(0);
  const [name] = files(clean);
  expect(files(clean)).toHaveLength(1);
  expect(name).toMatch(/^\d+-aaaaaaaaaaaa\.jsonl$/);
  expect(readFileSync(join(clean, name ?? ''), 'utf8')).toContain('"original":"1 + 2"');

  const refusals = [
    { status: '1', ref: 'refs/heads/main', report, reason: 'exited with status 1' },
    { status: '', ref: 'refs/heads/main', report, reason: 'step did not run' },
    { status: '0', ref: 'refs/heads/feature', report, reason: 'not on main' },
    {
      status: '0',
      ref: 'refs/heads/main',
      report: join(root, 'missing.json'),
      reason: 'could not be read',
    },
  ];
  for (const [index, refusal] of refusals.entries()) {
    const directory = join(root, `refused-${String(index)}`);
    const result = write(refusal.status, refusal.ref, refusal.report, directory);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain(`no survivor record: `);
    expect(result.out).toContain(refusal.reason);
    expect(files(directory)).toEqual([]);
  }
});
