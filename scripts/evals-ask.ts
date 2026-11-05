/**
 * The S9 evals (docs/spec/ask-the-library.md): ten questions and the memory cases, each twice,
 * through the Worker's own answer code and a test gateway. Live calls, so
 * outside CI (G21), and about 2,500 to 2,700 Neurons.
 *
 *   pnpm evals:ask --gateway <test-gateway-id> [--site <dir>]
 *
 * Writes the full transcript, reasoning included, to `--out` (default: a folder in the system
 * temp directory, never the repo). Reads the real public build from `--site` (default `packages/site/dist`) and
 * refuses a library built from the fixture vault. Uses the owner's wrangler
 * login, plus `ASK_GATEWAY_TOKEN` if the gateway needs one, and prints neither.
 * `CLOUDFLARE_ACCOUNT_ID` names the account.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import { answerQuestion, type TraceEvent } from '../packages/ask/src/answer.ts';
import type { Env } from '../packages/ask/src/env.ts';
import { createLibrarySource } from '../packages/ask/src/library.ts';
import { NOT_A_TEST_GATEWAY } from './lib/ask-deploy.ts';
import {
  CASES,
  MEMORY_CASES,
  claimsSheet,
  followUpsStandAlone,
  looksLikeFixture,
  summariseTrace,
  toolMismatch,
} from './lib/ask-evals.ts';
import { capture, type CallCapture } from './lib/ask-reasoning.ts';
import { REPO_ROOT } from './lib/repo-root.ts';

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

// The fixture vault is read the way the build reads it, through the adapter (invariant 4).
const fixtureTitles = (
  await new ObsidianAdapter(join(REPO_ROOT, 'fixtures', 'vault')).listBooks()
).map((book) => book.title);
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

/** What each model call's response carried besides its answer, in call order (S9). */
const captures: CallCapture[] = [];

/** The binding's `run`, over the gateway's REST address. */
const env = {
  AI: {
    run: async (model: string, input: unknown, options?: unknown): Promise<unknown> => {
      const id = (options as { gateway?: { id?: string } } | undefined)?.gateway?.id ?? gateway;
      const response = await fetch(
        `https://gateway.ai.cloudflare.com/v1/${account}/${id}/workers-ai/${model}`,
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
      const out = body.result ?? body;
      // The reasoning stays here, in the eval's own wrapper: the Worker's code is handed the same
      // response and never reads it (S9).
      captures.push(capture(out));
      return out;
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
let totalNeurons = 0;
let mismatches = 0;
/** Everything each question did, kept whole for reading by hand. */
const transcript: unknown[] = [];
const THOUGHTS_SHOWN = 700;
/** The owner's Thoughts for each book that has them, read once, for the hand check. */
const thoughtsText = new Map<string, string>();
for (const book of library) {
  if (!book.thoughts) continue;
  const paragraphs = await source.thoughts(book);
  if (paragraphs !== undefined) thoughtsText.set(book.id, paragraphs.join(' '));
}

for (const c of [...CASES, ...MEMORY_CASES]) {
  for (let run = 1; run <= RUNS; run += 1) {
    total += 1;
    const events: TraceEvent[] = [];
    const firstCapture = captures.length;
    const answered = await answerQuestion(env, source, c.question, undefined, c.history, (event) =>
      events.push(event),
    );
    const trace = summariseTrace(events);
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
    totalNeurons += trace.neurons;
    // A tool mismatch is something to read, never a failure.
    const mismatch = toolMismatch(c.expects, trace.called);
    if (mismatch !== undefined) mismatches += 1;

    console.log(
      `${ok ? 'PASS' : 'FAIL'}  [${answered.reply.mode}] run ${String(run)}  ${c.history === undefined ? '' : '(after Co-Intelligence) '}${c.question}`,
    );
    console.log(
      `      ${String(trace.modelCalls)} model calls, ${String(trace.called.length)} tool calls` +
        ` (${trace.called.join(' > ') || 'none'}), ${String(trace.toolErrors)} tool errors, ~${trace.neurons.toFixed(1)} Neurons`,
    );
    console.log(
      `      expected tool: ${c.expects}${mismatch === undefined ? '' : `  <-- READ THIS: ${mismatch}`}`,
    );
    for (const line of trace.lines) console.log(`        ${line}`);
    const calls = captures.slice(firstCapture);
    for (const [i, c] of calls.entries()) {
      console.log(
        `        reasoning, call ${String(i + 1)}: ${c.reasoning === undefined ? 'none in the response' : `${String(c.reasoning.length)} characters (in the transcript)`}`,
      );
    }
    console.log(`      answer: ${answered.reply.answer}`);
    for (const f of answered.reply.followUps)
      console.log(`      follow-up: ${f}${standAlone ? '' : '  (does not stand alone)'}`);

    // A hand check, not a grade: each claim, and the Thoughts of every book the answer names.
    const sheet = claimsSheet(answered.reply.answer, library, (book) => thoughtsText.get(book.id));
    console.log('      claims to check against the Thoughts:');
    for (const [i, claim] of sheet.claims.entries())
      console.log(`        ${String(i + 1)}. ${claim}`);
    for (const { title, thoughts } of sheet.books) {
      const shown =
        thoughts === undefined
          ? '(none written)'
          : thoughts.slice(0, THOUGHTS_SHOWN) + (thoughts.length > THOUGHTS_SHOWN ? ' ...' : '');
      console.log(`        Thoughts on "${title}": ${shown}`);
    }
    transcript.push({
      question: c.question,
      afterCoIntelligence: c.history !== undefined,
      run,
      ok,
      mode: answered.reply.mode,
      expectedTool: c.expects,
      toolMismatch: mismatch ?? null,
      neurons: trace.neurons,
      events,
      // Per model call, in order: the reasoning the response carried, and the keys it had.
      calls,
      answer: answered.reply.answer,
      followUps: answered.reply.followUps,
      books: answered.reply.books.map((b) => b.title),
      thoughts: Object.fromEntries(sheet.books.map((b) => [b.title, b.thoughts ?? null])),
    });
  }
}

// Outside the repo: a transcript holds the model's reasoning and visitors' words.
const folder = flag('--out') ?? join(tmpdir(), 'stacks-ask-evals');
mkdirSync(folder, { recursive: true });
const file = join(folder, `ask-evals-${new Date().toISOString().replaceAll(':', '-')}.json`);
writeFileSync(file, JSON.stringify(transcript, null, 2));

console.log(
  `\n${String(passed)} of ${String(total)} passed; ${String(tokensIn)} input and ${String(tokensOut)} output tokens in all, ~${totalNeurons.toFixed(0)} Neurons`,
);
console.log(`${String(mismatches)} questions called a different tool than expected: read them.`);
console.log(`Full transcript, every tool result included: ${file}`);
console.log("Record each failure as the check's fault or the answer's on the issue.");
process.exit(passed === total ? 0 : 1);
