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
  Refused,
  daysToRead,
  checkoutIsLinked,
  queryBody,
  runDays,
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
  const linked = checkoutIsLinked(git);
  if (linked === undefined) fail('git could not say which checkout this is');
  if (linked) {
    fail(
      'this is a linked worktree, and its .trend/ goes with it. Run --record from the main checkout.',
    );
  }
}

/**
 * The telemetry query needs an observability read, which `wrangler login`'s OAuth scopes do
 * not include: measured 2026-11-06, every query answered 403 with the login's token. So an API
 * token with Account > Workers > Metadata Read-only, as `ASK_STATUS_TOKEN` in `.env`, comes
 * first (measured the same day: every query 200); the login is the fallback.
 */
const TOKEN = /^[A-Za-z0-9_.-]{20,}$/;

function bearerToken(): string | undefined {
  const own = process.env['ASK_STATUS_TOKEN'];
  if (own !== undefined && own !== '') {
    // The login's token is held to this shape below, and this one is too: a stray character
    // would make fetch refuse the header with a message that quotes it.
    if (!TOKEN.test(own)) fail('ASK_STATUS_TOKEN is not an API token (letters, digits, _ . -)');
    return own;
  }
  // wrangler's usage telemetry stays off, and .env's other keys stay out of the child (ADR-0116).
  const token = spawnSync('pnpm exec wrangler auth token', {
    cwd: REPO_ROOT,
    shell: true,
    encoding: 'utf8',
    env: uploadEnv(process.env, loaded),
  });
  return token.status === 0 ? /[A-Za-z0-9_.-]{20,}/.exec(token.stdout)?.[0] : undefined;
}
const bearer = bearerToken();
if (bearer === undefined) fail('no token: set ASK_STATUS_TOKEN in .env, or wrangler login');
const usingLogin = (process.env['ASK_STATUS_TOKEN'] ?? '') === '';

async function ask(name: QueryName, dayStart: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account ?? ''}/workers/observability/telemetry/query`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer ?? ''}` },
        body: JSON.stringify(queryBody(name, dayStart)),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    // A fetch error can carry the URL or a header in its message: fixed words only.
    throw new Refused(name, 'unreachable');
  }
  // The status only: a reply body is never printed (spec S3).
  if (!response.ok) throw new Refused(name, response.status);
  try {
    return (await response.json()) as unknown;
  } catch {
    // A JSON parse error quotes the start of the body.
    throw new Refused(name, 'not JSON');
  }
}

const days = daysToRead(Date.now());
console.log(
  `Ask the library, ${String(days.length)} completed UTC day(s) still whole in Workers Logs${record ? ', recording' : ''}`,
);
const refused = await runDays({
  days,
  record,
  reply: ask,
  onDisk: (file) => existsSync(join(store, file)),
  write: (file, text) => {
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, file), text, 'utf8');
  },
  render: renderAskDay,
  print: (line) => {
    console.log(line);
  },
});
if (refused > 0) {
  console.log(
    '\nA refused day is read again by the next run while its logs are kept. In the dashboard:',
  );
  console.log('  Workers & Pages > stacks-ask > Logs > Query Builder, group by outcome');
  if (usingLogin) {
    console.log('');
    console.log(
      'The wrangler login has no Workers Observability scope, and a 403 is what that looks like.',
    );
    console.log(
      'Set ASK_STATUS_TOKEN in .env to an API token with Account > Workers > Metadata Read-only.',
    );
  }
  process.exit(1);
}
if (record) console.log('\nRun pnpm trend:sync to load the records into the store.');
