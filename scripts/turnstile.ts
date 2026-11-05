/**
 * Creating the Ask the library Turnstile widget and rotating its secret
 * (issue #537; `docs/commands.md`, "`pnpm turnstile`").
 *
 * Owner-run, at a terminal: it needs the owner's API token, typed at a prompt,
 * and the owner's `wrangler login`. Agents never run it. Every decision lives in
 * `./lib/turnstile.ts`, which takes its effects as parameters; this file only
 * supplies the real ones, which is why nothing here is tested and nothing here
 * decides anything.
 *
 *   pnpm turnstile --create             once, after deploy:ask: make the widget and set its secret
 *   pnpm turnstile                      rotate the secret and set the new one
 *   pnpm turnstile --sync               set the widget's current secret, rotating nothing
 *   pnpm turnstile --dry-run [mode]     print the calls; prompt, send and run nothing
 *
 * It loads no `.env` file: no key from one reaches this process, and wrangler is
 * told to load an empty file in place of `.env` (ADR-0135).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mainCheckout } from '../packages/cli/src/env.ts';
import { gitOutput } from './lib/git.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { shellCommand } from './lib/run.ts';
import {
  EMPTY_ENV_FILE,
  envFileIsEmpty,
  envFilePaths,
  isInteractive,
  parseTurnstileArgs,
  runTurnstile,
  unexpectedLine,
  type Deps,
  type EnvFile,
  type Local,
} from './lib/turnstile.ts';
import { INSTALLED_MANIFEST, pinIn, pinMismatch, versionIn } from './lib/upload.ts';

const REQUEST_TIMEOUT_MS = 30_000;

const readIfThere = (file: string): string | undefined =>
  existsSync(file) ? readFileSync(file, 'utf8') : undefined;

/** Reads the token with nothing echoed, from Node's own raw-mode stdin: no dependency, no child process. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolvePrompt) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let typed = '';
    const finish = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
    };
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish();
          resolvePrompt(typed);
          return;
        }
        if (char === '\u0003') {
          finish();
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') typed = typed.slice(0, -1);
        else typed += char;
      }
    };
    stdin.on('data', onData);
  });
}

function localFacts(shell: NodeJS.ProcessEnv): Local {
  const head = gitOutput(['rev-parse', 'HEAD'], REPO_ROOT);
  const origin = gitOutput(['rev-parse', 'refs/remotes/origin/main'], REPO_ROOT);
  const status = gitOutput(['status', '--porcelain'], REPO_ROOT);
  const main = mainCheckout();
  const files: EnvFile[] = envFilePaths(REPO_ROOT, main).flatMap(({ label, path }) => {
    const text = readIfThere(path);
    return text === undefined ? [] : [{ label, text }];
  });
  return {
    shell,
    envFiles: files,
    branch: gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], REPO_ROOT),
    clean: status === undefined ? undefined : status === '',
    headAtOriginMain: head === undefined || origin === undefined ? undefined : head === origin,
    wranglerRefusal: pinMismatch(
      versionIn(readIfThere(join(REPO_ROOT, ...INSTALLED_MANIFEST))),
      pinIn(readIfThere(join(REPO_ROOT, 'package.json'))),
    ),
    emptyEnvFileIsEmpty: envFileIsEmpty(readIfThere(join(REPO_ROOT, EMPTY_ENV_FILE))),
  };
}

const deps: Deps = {
  isTty: isInteractive(process.stdin.isTTY, process.stdout.isTTY),
  http: async (req) => {
    const res = await fetch(req.url, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${req.token}`,
        ...(req.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: req.body,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { status: res.status, text: await res.text() };
  },
  run: (args, options) => {
    // `pnpm` is a .cmd shim on Windows, so it needs a shell (ADR-0030); every
    // argument is a literal from `./lib/turnstile.ts`. The secret goes on stdin.
    const result = spawnSync(shellCommand('pnpm', args), {
      cwd: REPO_ROOT,
      shell: true,
      encoding: 'utf8',
      input: options.input,
      env: options.env,
      timeout: options.timeoutMs,
    });
    const timedOut =
      result.error !== undefined && 'code' in result.error && result.error.code === 'ETIMEDOUT';
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut,
    };
  },
  prompt: promptHidden,
  now: () => Date.now(),
  print: (line) => {
    console.log(line);
  },
};

// Anything uncaught prints its class and nothing else: a library's message can
// quote a fragment of a response, and a response can hold the secret.
for (const event of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(event, (error) => {
    console.error(unexpectedLine(error));
    process.exit(1);
  });
}

const parsed = parseTurnstileArgs(process.argv.slice(2), process.env);
if ('refusal' in parsed) {
  console.error(`\nREFUSED: ${parsed.refusal}`);
  process.exit(1);
}
process.exit(await runTurnstile(parsed, localFacts(process.env), deps));
