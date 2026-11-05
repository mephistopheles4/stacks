/**
 * Yesterday's outcome counts for the Ask the library Worker (S11): how many
 * requests ended each way, read from Workers Logs. Counts only; the Worker logs
 * no question or address, so there is nothing else to read.
 *
 *   pnpm ask:status
 *
 * ⚠️ **Unverified against the live API.** The query below follows Cloudflare's
 * Workers Observability telemetry endpoint as documented, and nothing here has
 * run against a deployed Worker. If it answers with anything but counts, this
 * prints what came back and names the dashboard route (Workers & Pages, the
 * stacks-ask Worker, Logs, Query Builder, group by `outcome`).
 */
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './lib/repo-root.ts';

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

const account = process.env['CLOUDFLARE_ACCOUNT_ID'];
if (account === undefined || !/^[0-9a-f]{32}$/.test(account))
  fail('CLOUDFLARE_ACCOUNT_ID is not set');

const token = spawnSync('pnpm exec wrangler auth token', {
  cwd: REPO_ROOT,
  shell: true,
  encoding: 'utf8',
});
const bearer = /[A-Za-z0-9_.-]{20,}/.exec(token.stdout)?.[0];
if (token.status !== 0 || bearer === undefined) fail('wrangler is not logged in (wrangler login)');

const midnight = new Date();
midnight.setUTCHours(0, 0, 0, 0);
const to = midnight.getTime();
const from = to - 24 * 60 * 60 * 1000;

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify({
      queryId: 'ask-status',
      timeframe: { from, to },
      view: 'calculations',
      parameters: {
        datasets: ['cloudflare-workers'],
        filters: [
          { key: '$metadata.service', operation: 'eq', type: 'string', value: 'stacks-ask' },
        ],
        calculations: [{ operator: 'count', alias: 'requests' }],
        groupBys: [{ type: 'string', value: 'outcome' }],
      },
    }),
  },
);
const text = await response.text();
console.log(`outcome counts, ${new Date(from).toISOString()} to ${new Date(to).toISOString()}`);
if (!response.ok) {
  console.log(
    `the query was refused (${String(response.status)}). Read it in the dashboard instead:`,
  );
  console.log('  Workers & Pages > stacks-ask > Logs > Query Builder, group by outcome');
  process.exit(1);
}
console.log(text);
