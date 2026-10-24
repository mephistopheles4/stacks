/**
 * Lists the survivors present on every one of the last N survivor records, per
 * scope: the candidates for an equivalent mutant (#472). Read by a person before
 * a scope's floor is armed; nothing runs it on a schedule and nothing gates on it.
 *
 *   git fetch origin survivors
 *   pnpm exec tsx scripts/persistent-survivors.ts 7 [--ref origin/survivors]
 *
 * Every decision is `persistentSurvivors` in `./lib/survivor-record.ts`, which is
 * pure and tested; this file only asks `git` for the records, newest first.
 */

import { spawnSync } from 'node:child_process';
import { gitOutput } from './lib/git.ts';
import { persistentSurvivors } from './lib/survivor-record.ts';

const ROOT = process.cwd();
const RECORD = /^survivors\/(\d+)-[0-9a-z]+\.jsonl$/;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function show(ref: string, path: string): string {
  // Not `gitOutput`, whose default buffer is smaller than one record.
  const shown = spawnSync('git', ['show', `${ref}:${path}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return shown.status === 0 ? shown.stdout : '';
}

const args = process.argv.slice(2);
const refAt = args.indexOf('--ref');
const ref = refAt === -1 ? 'origin/survivors' : args[refAt + 1];
const n = Number(
  args.find((arg, index) => (refAt === -1 || index !== refAt + 1) && !arg.startsWith('--')),
);
if (ref === undefined || !Number.isInteger(n) || n < 1) {
  fail('usage: persistent-survivors.ts <N> [--ref origin/survivors]');
}

const listing = gitOutput(['ls-tree', '--name-only', ref, 'survivors/'], ROOT);
if (listing === undefined) fail(`git cannot read ${ref}; run \`git fetch origin survivors\` first`);
const paths = listing
  .split('\n')
  .flatMap((path) => {
    const match = RECORD.exec(path);
    return match === null ? [] : [{ path, timestamp: Number(match[1]) }];
  })
  .sort((a, b) => b.timestamp - a.timestamp)
  .slice(0, n)
  .map(({ path }) => path);

const result = persistentSurvivors(
  paths.map((path) => show(ref, path)),
  n,
);

if (result.stop !== undefined) {
  const at = paths[result.stop.index] ?? 'the end of the branch';
  fail(
    `Only ${String(result.compared)} comparable record(s) of the ${String(n)} asked for: ` +
      `the run ended at ${at} — ${result.stop.reason}. Nothing listed.`,
  );
}

console.log(
  `${String(result.survivors.length)} survivor key(s) on every one of the last ${String(n)} records, ` +
    `${paths.at(-1) ?? ''} to ${paths[0] ?? ''}:`,
);
let scope: string | undefined;
for (const survivor of [...result.survivors].sort((a, b) =>
  a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0,
)) {
  if (survivor.scope !== scope) {
    scope = survivor.scope;
    console.log(`\n## ${scope}`);
  }
  const times = survivor.count > 1 ? ` ×${String(survivor.count)}` : '';
  console.log(
    `${survivor.file}  ${survivor.mutator ?? '?'}  ${JSON.stringify(survivor.original)} → ` +
      `${JSON.stringify(survivor.replacement)}${times}`,
  );
}
