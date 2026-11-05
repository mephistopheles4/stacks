/**
 * The S9 evals (docs/spec/ask-the-library.md): ten questions and the memory cases, each twice,
 * through the Worker's own answer code and a test gateway. Live calls, so
 * outside CI (G21), and about 2,500 to 2,700 Neurons.
 *
 *   pnpm evals:ask --gateway <test-gateway-id> [--site <dir>]
 *
 * Reads the real public build from `--site` (default `packages/site/dist`) and
 * refuses a library built from the fixture vault. Uses the owner's wrangler
 * login, plus `ASK_GATEWAY_TOKEN` if the gateway needs one, and prints neither.
 * `CLOUDFLARE_ACCOUNT_ID` names the account.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { answerQuestion } from '../packages/ask/src/answer.ts';
import type { Env } from '../packages/ask/src/env.ts';
import { createLibrarySource } from '../packages/ask/src/library.ts';
import { NOT_A_TEST_GATEWAY } from './lib/ask-deploy.ts';
import {
  CASES,
  MEMORY_CASES,
  followUpsStandAlone,
  looksLikeFixture,
  titlesIn,
} from './lib/ask-evals.ts';
import { REPO_ROOT } from './lib/repo-root.ts';

const MODEL = '@cf/openai/gpt-oss-20b';
const RUNS = 2;

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}
const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};

const gateway = flag('--gateway');
if (
  gateway === undefined ||
  !/^[a-z0-9][a-z0-9-]{0,63}$/.test(gateway) ||
  NOT_A_TEST_GATEWAY.has(gateway)
) {
  fail('--gateway <id> names a test gateway; the evals never run against default or the real one');
}
const account = process.env['CLOUDFLARE_ACCOUNT_ID'];
if (account === undefined || !/^[0-9a-f]{32}$/.test(account))
  fail('CLOUDFLARE_ACCOUNT_ID is not set');
const site = join(REPO_ROOT, flag('--site') ?? join('packages', 'site', 'dist'));

// The origin is a label: every fetch is answered from the build folder.
const ORIGIN = 'https://evals.invalid';
const fromDisk = (async (input: string | URL | Request) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  try {
    const body = readFileSync(join(site, url.pathname));
    return new Response(body, { headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
}) as typeof fetch;
const source = createLibrarySource(ORIGIN, fromDisk);
const library = await source
  .catalogue()
  .catch(() => fail(`${site} holds no readable library.json`));

const fixtureDir = join(REPO_ROOT, 'fixtures', 'vault', 'Library');
const fixtureTitles = titlesIn(
  readdirSync(fixtureDir).map((name) => readFileSync(join(fixtureDir, name), 'utf8')),
);
if (looksLikeFixture(library, fixtureTitles)) {
  fail(
    'this library was built from the fixture vault; build the real one first (pnpm stacks build --public)',
  );
}

// wrangler's own login, held in memory and never printed.
const token = spawnSync('pnpm exec wrangler auth token', {
  cwd: REPO_ROOT,
  shell: true,
  encoding: 'utf8',
});
const bearer = /[A-Za-z0-9_.-]{20,}/.exec(token.stdout)?.[0];
if (token.status !== 0 || bearer === undefined) fail('wrangler is not logged in (wrangler login)');
const gatewayToken = process.env['ASK_GATEWAY_TOKEN'];

/** The binding's `run`, over the gateway's REST address. */
const env = {
  AI: {
    run: async (_model: string, input: unknown, options?: unknown): Promise<unknown> => {
      const id = (options as { gateway?: { id?: string } } | undefined)?.gateway?.id ?? gateway;
      const response = await fetch(
        `https://gateway.ai.cloudflare.com/v1/${account}/${id}/workers-ai/${MODEL}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${bearer}`,
            'cf-aig-skip-cache': 'true',
            ...(gatewayToken !== undefined && { 'cf-aig-authorization': `Bearer ${gatewayToken}` }),
          },
          body: JSON.stringify(input),
        },
      );
      const body = (await response.json()) as { result?: unknown; errors?: { code?: number }[] };
      if (!response.ok)
        throw new Error(
          `gateway ${String(response.status)} ${String(body.errors?.[0]?.code ?? '')}`,
        );
      return body.result ?? body;
    },
  },
  ASK_GATEWAY_ID: gateway,
  ASK_AI_ENABLED: 'true',
  SITE_ORIGIN: ORIGIN,
} as unknown as Env;

let passed = 0;
let total = 0;
let tokensIn = 0;
let tokensOut = 0;
for (const c of [...CASES, ...MEMORY_CASES]) {
  for (let run = 1; run <= RUNS; run += 1) {
    total += 1;
    const answered = await answerQuestion(env, source, c.question, undefined, c.history);
    const standAlone = followUpsStandAlone(answered.reply.followUps, library);
    const pilled =
      c.pill === undefined || answered.reply.books.some((b) => b.title.startsWith(c.pill ?? ''));
    const ok =
      answered.reply.mode === 'ai' &&
      c.passes(answered.reply.answer, library) &&
      standAlone &&
      pilled;
    if (ok) passed += 1;
    tokensIn += answered.detail.tokensIn ?? 0;
    tokensOut += answered.detail.tokensOut ?? 0;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  [${answered.reply.mode}] run ${String(run)}  ${c.history === undefined ? '' : '(after Co-Intelligence) '}${c.question}` +
        `  (${String(answered.detail.searches ?? '?')} searches, ${String(answered.detail.tokensIn ?? '?')} in, ${String(answered.detail.tokensOut ?? '?')} out)`,
    );
    // A failure, or a pass that needs a person to read it, shows its answer.
    if (!ok || c.readByHand === true) console.log(`      ${answered.reply.answer}`);
    for (const f of answered.reply.followUps)
      console.log(`      follow-up: ${f}${standAlone ? '' : '  (does not stand alone)'}`);
  }
}
console.log(
  `\n${String(passed)} of ${String(total)} passed; ${String(tokensIn)} input and ${String(tokensOut)} output tokens in all`,
);
console.log("Record each failure as the check's fault or the answer's on the issue.");
process.exit(passed === total ? 0 : 1);
