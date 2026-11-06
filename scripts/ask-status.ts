/**
 * Daily totals for the Ask the library Worker (docs/spec/ask-observability.md S3): for each
 * completed UTC day still in Workers Logs, the questions, outcomes, Neurons, limit refusals
 * and how many visitor-days reached each question number. Counts only; the Worker logs no
 * question, answer, address or key, so there is nothing else to read.
 *
 *   pnpm ask:status            print each day still whole in the logs
 *   pnpm ask:status --record   also write each one to .trend/local/, for pnpm trend:sync
 *
 * ⚠️ **Pass `--record` only after the first live check has passed (spec C10).** The replies
 * are read against Cloudflare's documented shape, never yet a captured one, and a record is
 * imported once and never corrected. A wrong one is undone by deleting its file and running
 * `pnpm trend:sync --rebuild`, and can be written again only while its logs are kept.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../packages/cli/src/env.ts';
import {
  QUERIES,
  ShapeError,
  dayTotals,
  daysToRead,
  isLinkedWorktree,
  printDay,
  queryBody,
  recordName,
  writeDecision,
  type QueryName,
} from './lib/ask-status.ts';
import { renderAskDay } from './lib/metrics.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { uploadEnv } from './lib/upload.ts';

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--record');
if (unknown.length > 0) fail(`unknown argument ${unknown[0] ?? ''}; the only flag is --record`);
const record = args.includes('--record');

const loaded = loadEnv();
const account = process.env['CLOUDFLARE_ACCOUNT_ID'];
if (account === undefined || !/^[0-9a-f]{32}$/.test(account)) {
  fail('CLOUDFLARE_ACCOUNT_ID is not set in .env (pnpm exec wrangler whoami prints it)');
}

const store = join(REPO_ROOT, '.trend', 'local');
if (record) {
  const git = (flag: string) =>
    spawnSync('git', ['rev-parse', '--path-format=absolute', flag], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).stdout.trim();
  const gitDir = git('--git-dir');
  const commonDir = git('--git-common-dir');
  if (gitDir === '' || commonDir === '') fail('git could not say which checkout this is');
  if (isLinkedWorktree(gitDir, commonDir)) {
    fail(
      'this is a linked worktree, and its .trend/ goes with it. Run --record from the main checkout.',
    );
  }
}

// wrangler's usage telemetry stays off, and .env's other keys stay out of the child (ADR-0116).
const token = spawnSync('pnpm exec wrangler auth token', {
  cwd: REPO_ROOT,
  shell: true,
  encoding: 'utf8',
  env: uploadEnv(process.env, loaded),
});
const bearer = /[A-Za-z0-9_.-]{20,}/.exec(token.stdout)?.[0];
if (token.status !== 0 || bearer === undefined) fail('wrangler is not logged in (wrangler login)');

/** A query the API turned down, named by its status alone. */
class Refused extends Error {}

async function ask(name: QueryName, dayStart: number): Promise<unknown> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account ?? ''}/workers/observability/telemetry/query`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer ?? ''}` },
      body: JSON.stringify(queryBody(name, dayStart)),
    },
  );
  // The status only: a reply body is never printed (spec S3).
  if (!response.ok) throw new Refused(`the ${name} query was refused (${String(response.status)})`);
  return (await response.json()) as unknown;
}

const days = daysToRead(Date.now());
console.log(
  `Ask the library, ${String(days.length)} completed UTC day(s) still whole in Workers Logs${record ? ', recording' : ''}`,
);
let refused = 0;
for (const dayStart of days) {
  const name = recordName(dayStart);
  const date = new Date(dayStart).toISOString().slice(0, 10);
  try {
    const replies = {} as Record<QueryName, unknown>;
    for (const query of Object.keys(QUERIES) as QueryName[]) {
      replies[query] = await ask(query, dayStart);
    }
    const totals = dayTotals(replies);
    console.log(printDay(dayStart, totals).join('\n'));
    const decision = writeDecision({ record, onDisk: existsSync(join(store, name)) });
    if (decision === 'print') continue;
    if (decision === 'on-disk') {
      console.log(`  recorded already: ${name} is never rewritten`);
      continue;
    }
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, name), renderAskDay(totals, dayStart / 1000), 'utf8');
    console.log(`  recorded: .trend/local/${name}`);
  } catch (error) {
    if (!(error instanceof Refused || error instanceof ShapeError)) throw error;
    refused += 1;
    console.log(`${date}: nothing written, ${error.message}`);
  }
}
if (refused > 0) {
  console.log(
    '\nA refused day is read again by the next run while its logs are kept. In the dashboard:',
  );
  console.log('  Workers & Pages > stacks-ask > Logs > Query Builder, group by outcome');
  process.exit(1);
}
if (record) console.log('\nRun pnpm trend:sync to load the records into the store.');
