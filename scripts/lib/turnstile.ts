/**
 * Creating the Ask the library Turnstile widget, and rotating its secret, with
 * the secret going to the Worker and nowhere else (issue #537, the approved
 * revision 5 of its spec).
 *
 * Everything that decides anything lives here and takes its effects as
 * parameters, so a test can drive every path with no network, no process and no
 * terminal: `fetch`, the process runner, the prompt, the clock and the printer
 * are required, with no default, so a test that forgets one is a type error and
 * not a live `secret put` (G21 cannot see a spawned process).
 * `scripts/turnstile.ts` supplies the real ones and runs only for the owner.
 *
 * **What it promises about the secret.** It is held in one variable, goes to
 * wrangler on stdin and nowhere else, and every line this module prints passes
 * a scrub first. Nothing is written to a file. A response body is never quoted:
 * one function parses them all and says only "unreadable response (N bytes)"
 * for what it cannot read. An error this module did not raise prints its class
 * and nothing more, because a library's message can quote a fragment of the
 * body it choked on.
 *
 * **What it promises about wrangler.** Every wrangler call is `pnpm exec
 * wrangler` (G67), told to load one committed empty env file in place of `.env`
 * and `.env.local`, and given an environment built from an allowlist plus a few
 * forced values, never the shell minus a denylist.
 */

import { join, resolve } from 'node:path';
import { latestVersionId } from './ask-live.ts';

/** The one origin every request goes to, read from no environment. */
export const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
export const WIDGET_NAME = 'stacks-ask';
export const WIDGET_DOMAIN = 'stacks.aymandiab.com';
/** The Worker's name in `packages/ask/wrangler.jsonc`; a test holds the two equal. */
export const WORKER_NAME = 'stacks-ask';
export const SECRET_NAME = 'TURNSTILE_SECRET';
export const WRANGLER_CONFIG = 'packages/ask/wrangler.jsonc';
/** The committed, empty file wrangler loads in place of `.env` and `.env.local`. */
export const EMPTY_ENV_FILE = 'scripts/turnstile.empty.env';

const ACCOUNT_ID = /^[0-9a-f]{32}$/i;
const SITE_KEY = /^0x[0-9A-Za-z_-]{16,64}$/;
const HOUR_MS = 3_600_000;
const GRACE_MS = 2 * HOUR_MS;
const READ_TIMEOUT_MS = 60_000;
const PUT_TIMEOUT_MS = 120_000;

export type Mode = 'create' | 'rotate' | 'sync';

export interface TurnstileArgs {
  readonly mode: Mode;
  readonly dryRun: boolean;
  readonly account?: string | undefined;
  readonly sitekey?: string | undefined;
}

/**
 * The command line. No flag clears the branch checks, and none takes the token:
 * an unrecognised argument is refused by its position, never printed back,
 * because someone who passes a token as a flag has just put it in their history.
 */
export function parseTurnstileArgs(
  argv: readonly string[],
  shell: NodeJS.ProcessEnv,
): TurnstileArgs | { readonly refusal: string } {
  let mode: Mode = 'rotate';
  let sawMode = false;
  let dryRun = false;
  let account = shell['CLOUDFLARE_ACCOUNT_ID'];
  let sitekey = shell['PUBLIC_TURNSTILE_SITE_KEY'];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--create' || arg === '--sync') {
      if (sawMode) return { refusal: 'give at most one of --create and --sync' };
      sawMode = true;
      mode = arg === '--create' ? 'create' : 'sync';
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--account' || arg === '--sitekey') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return { refusal: `${arg} needs a value` };
      }
      i++;
      if (arg === '--account') account = value;
      else sitekey = value;
    } else {
      return {
        refusal: `argument ${String(i + 1)} is not recognised (the token is typed at a prompt, never passed)`,
      };
    }
  }
  // The shape check is case-blind and the scrub is an exact match, so a well-formed id is made
  // lower-case once, here, and everything after sees the one spelling. A malformed one is left
  // alone for `localRefusals` to refuse.
  if (account !== undefined && ACCOUNT_ID.test(account)) account = account.toLowerCase();
  return { mode, dryRun, account, sitekey };
}

/* ------------------------------------------------------------------ */
/* What the shell and the env files may not name                      */
/* ------------------------------------------------------------------ */

/** Names that would replace the owner's wrangler login, put a token at rest, or move the API host. */
const REFUSED_NAMES: readonly string[] = [
  'TURNSTILE_API_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CF_API_TOKEN',
  'CLOUDFLARE_API_KEY',
  'CF_API_KEY',
  'CLOUDFLARE_EMAIL',
  'CF_EMAIL',
  'CF_API_BASE_URL',
  'CLOUDFLARE_BASE_URL',
];
const BASE_URL_NAME = 'CLOUDFLARE_API_BASE_URL';

export interface EnvFile {
  readonly label: string;
  readonly text: string;
}

/**
 * The `NAME` and value of each assignment in a dotenv file, read the way
 * dotenv reads one: an `export ` prefix, `NAME: value` as well as `NAME=value`,
 * leading whitespace, a lone CR as a line end, and a leading byte-order mark.
 */
function assignments(text: string): { name: string; value: string }[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const found: { name: string; value: string }[] = [];
  for (const line of lines) {
    const match = /^\s*(?:export\s+)?([\w.-]+)(?:\s*=|:\s)\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined) {
      found.push({
        name: match[1],
        value: (match[2] ?? '').trim().replace(/^(['"`])(.*)\1$/, '$2'),
      });
    }
  }
  return found;
}

/**
 * Why the shell or an env file cannot be allowed: a credential that would
 * replace the owner's login or rest on disk, or a host that is not Cloudflare's.
 * Names only: a value is read to compare a base URL and never reported.
 */
export function envRefusals(shell: NodeJS.ProcessEnv, files: readonly EnvFile[]): string[] {
  const found: string[] = [];
  const check = (label: string, name: string, value: string | undefined): void => {
    const upper = name.toUpperCase();
    if (REFUSED_NAMES.includes(upper)) {
      found.push(
        `${label} names ${upper}, which could replace the owner's wrangler login or move the API host`,
      );
    } else if (upper === BASE_URL_NAME && value !== API_ORIGIN) {
      found.push(`${label} names ${BASE_URL_NAME} with a value other than Cloudflare's own`);
    }
  };
  for (const [name, value] of Object.entries(shell)) {
    if (value !== undefined) check('the shell', name, value);
  }
  for (const file of files) {
    for (const { name, value } of assignments(file.text)) check(file.label, name, value);
  }
  return found;
}

/** Settings that point the script's own fetch at another trust store or proxy, by upper-cased name. */
const TRANSPORT_NAMES: readonly string[] = [
  'NODE_EXTRA_CA_CERTS',
  'NODE_USE_SYSTEM_CA',
  'NODE_USE_ENV_PROXY',
];
const TRANSPORT_FLAGS: readonly string[] = [
  '--tls-keylog',
  '--use-env-proxy',
  '--use-system-ca',
  '--use-openssl-ca',
];

/**
 * What in the shell could turn off certificate checks or send the script's
 * requests through another trust store or proxy. Node reads these for the
 * script's own `fetch` too, so forcing wrangler's environment is not enough.
 * Each refusal names the variable and never prints its value.
 */
function transportRefusals(shell: NodeJS.ProcessEnv): string[] {
  const found: string[] = [];
  for (const [name, value] of Object.entries(shell)) {
    if (value === undefined) continue;
    const upper = name.toUpperCase();
    if (upper === 'NODE_TLS_REJECT_UNAUTHORIZED' && value !== '1') {
      found.push(
        'the shell sets NODE_TLS_REJECT_UNAUTHORIZED to something other than 1, which would turn certificate checks off',
      );
    } else if (TRANSPORT_NAMES.includes(upper)) {
      found.push(
        `the shell sets ${upper}, which would change who the script's requests trust or go through`,
      );
    } else if (
      upper === 'NODE_OPTIONS' &&
      TRANSPORT_FLAGS.some((flag) => value.toLowerCase().replaceAll('_', '-').includes(flag))
    ) {
      found.push(
        "the shell sets NODE_OPTIONS with a trust-store, proxy or key-log flag, which would change who the script's requests trust or go through, or write its TLS keys to a file",
      );
    }
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* wrangler: its arguments and its environment                        */
/* ------------------------------------------------------------------ */

/**
 * The one place wrangler is named. `pnpm exec wrangler` is the lockfile's
 * pinned build (G67), and `--env-file` points at an empty file so wrangler
 * loads no `.env` or `.env.local` of its own.
 */
export function wranglerArgs(sub: readonly string[]): string[] {
  return ['exec', 'wrangler', ...sub, '--env-file', EMPTY_ENV_FILE];
}

/**
 * What the spawn and wrangler's login store need, by upper-cased name: `PATH`
 * to find pnpm and Node, the Windows system names Node and cmd need, and the
 * home and app-data names the login store is found from (`xdgConfig` in the
 * pinned wrangler reads `XDG_CONFIG_HOME`, else `APPDATA` or the home folder).
 * `XDG_CONFIG_HOME` is left out on purpose: if the owner relies on it, wrangler
 * finds no login and the Worker check refuses, which fails closed.
 */
const KEPT_NAMES: ReadonlySet<string> = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'ALLUSERSPROFILE',
]);

/**
 * wrangler's environment: the allowlist above from the shell, then the forced
 * values. A name appears once in any letter case, so what wrangler sees does
 * not depend on how the platform orders duplicate keys.
 */
export function buildWranglerEnv(shell: NodeJS.ProcessEnv, account: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(shell)) {
    const upper = name.toUpperCase();
    if (value === undefined || !KEPT_NAMES.has(upper) || seen.has(upper)) continue;
    seen.add(upper);
    env[name] = value;
  }
  return {
    ...env,
    CLOUDFLARE_ACCOUNT_ID: account,
    CLOUDFLARE_API_BASE_URL: API_ORIGIN,
    NODE_TLS_REJECT_UNAUTHORIZED: '1',
    WRANGLER_SEND_METRICS: 'false',
    WRANGLER_SEND_ERROR_REPORTS: 'false',
    WRANGLER_WRITE_LOGS: 'false',
    WRANGLER_LOG_SANITIZE: 'true',
    WRANGLER_LOG: 'log',
  };
}

/* ------------------------------------------------------------------ */
/* The scrub, the parser and the unexpected error                     */
/* ------------------------------------------------------------------ */

/** Replaces each secret value it was told about, in every line, before the line is printed. */
export class Scrubber {
  private readonly pairs: [string, string][] = [];

  add(value: string, replacement: string): void {
    if (value === '') return;
    this.pairs.push([value, replacement]);
    this.pairs.sort((a, b) => b[0].length - a[0].length);
  }

  apply(text: string): string {
    return this.pairs.reduce(
      (out, [value, replacement]) => out.split(value).join(replacement),
      text,
    );
  }
}

/** An error this module did not raise: its class and nothing else. */
export function unexpectedLine(error: unknown): string {
  const named = error instanceof Error ? error.constructor.name : typeof error;
  const kind = /^\w{1,40}$/.test(named) ? named : 'Error';
  return `FAILED: unexpected error (${kind}). Its details are not printed, because they could quote a secret.`;
}

export type Reply =
  | { readonly kind: 'ok'; readonly result: unknown; readonly total?: number | undefined }
  | { readonly kind: 'failed'; readonly status: number; readonly detail: string }
  | { readonly kind: 'unreadable'; readonly bytes: number }
  | { readonly kind: 'unreachable' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The one place a response body is parsed. It reports a failure by HTTP status,
 * Cloudflare's error code and message, and anything else by its size.
 */
export function readResponse(status: number, text: string, scrub: (text: string) => string): Reply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'unreadable', bytes: Buffer.byteLength(text) };
  }
  if (!isRecord(parsed) || typeof parsed['success'] !== 'boolean') {
    return { kind: 'unreadable', bytes: Buffer.byteLength(text) };
  }
  if (parsed['success'] && status >= 200 && status < 300) {
    const info = parsed['result_info'];
    const total =
      isRecord(info) && typeof info['total_count'] === 'number' ? info['total_count'] : undefined;
    return { kind: 'ok', result: parsed['result'], total };
  }
  const errors = Array.isArray(parsed['errors']) ? (parsed['errors'] as unknown[]).slice(0, 3) : [];
  const parts = errors.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const code = typeof entry['code'] === 'number' ? `code ${String(entry['code'])}` : '';
    const raw =
      typeof entry['message'] === 'string'
        ? Array.from(entry['message'])
            .map((char) => (char.charCodeAt(0) < 32 ? ' ' : char))
            .join('')
        : '';
    // Scrubbed first and cut second: a value that straddles the cut must not print in part.
    const message = scrub(raw).slice(0, 200);
    return [[code, message].filter(Boolean).join(': ')];
  });
  return { kind: 'failed', status, detail: [`HTTP ${String(status)}`, ...parts].join(', ') };
}

function describe(reply: Reply): string {
  switch (reply.kind) {
    case 'ok':
      return 'the answer was not what was expected';
    case 'failed':
      return `Cloudflare answered ${reply.detail}`;
    case 'unreadable':
      return `unreadable response (${String(reply.bytes)} bytes)`;
    case 'unreachable':
      return 'the request did not complete';
  }
}

/* ------------------------------------------------------------------ */
/* Checks on what Cloudflare said                                      */
/* ------------------------------------------------------------------ */

/** Why a token's verify answer is not a short-lived, active token, or `undefined`. */
export function tokenProblem(result: unknown, now: number): string | undefined {
  if (!isRecord(result)) return 'the verify answer was not readable';
  if (result['status'] !== 'active') return 'the token is not active';
  const expires =
    typeof result['expires_on'] === 'string' ? Date.parse(result['expires_on']) : Number.NaN;
  if (Number.isNaN(expires))
    return 'the token has no expiry; make one that expires within 24 hours';
  if (expires <= now) return 'the token has already expired';
  if (expires - now > 24 * HOUR_MS)
    return 'the token expires more than 24 hours from now; make one that expires sooner';
  const notBefore = result['not_before'];
  if (notBefore !== undefined && !(typeof notBefore === 'string' && Date.parse(notBefore) <= now)) {
    return 'the token is not valid yet';
  }
  return undefined;
}

/** Why a widget is not the Ask widget (name, exact domains, and the site key asked for), or `undefined`. */
export function widgetProblem(widget: unknown, sitekey?: string): string | undefined {
  if (!isRecord(widget)) return 'the answer was not a widget';
  if (widget['name'] !== WIDGET_NAME) return `the widget is not named ${WIDGET_NAME}`;
  const domains = widget['domains'];
  if (!Array.isArray(domains) || domains.length !== 1 || domains[0] !== WIDGET_DOMAIN) {
    return `the widget's domains are not exactly ${WIDGET_DOMAIN}`;
  }
  if (sitekey !== undefined && widget['sitekey'] !== sitekey)
    return 'the widget has another site key than the one given';
  return undefined;
}

/** The widget's secret if it is one non-empty token with no whitespace, else `undefined`. */
function secretOf(widget: unknown): string | undefined {
  const secret = isRecord(widget) ? widget['secret'] : undefined;
  return typeof secret === 'string' && /^\S+$/.test(secret) ? secret : undefined;
}

/* ------------------------------------------------------------------ */
/* The local facts, and the refusals made from them                    */
/* ------------------------------------------------------------------ */

/** What `scripts/turnstile.ts` found out about this checkout and shell; `undefined` means it could not tell. */
export interface Local {
  readonly shell: NodeJS.ProcessEnv;
  readonly envFiles: readonly EnvFile[];
  readonly branch: string | undefined;
  readonly clean: boolean | undefined;
  readonly headAtOriginMain: boolean | undefined;
  readonly wranglerRefusal: string | undefined;
  readonly emptyEnvFileIsEmpty: boolean;
}

/**
 * Every reason to stop before the prompt. The branch checks stop accidents (a
 * run from an agent's branch, from unsaved edits, or from an unpushed commit);
 * they are skipped only for `--dry-run`, and no flag clears them.
 */
export function localRefusals(args: TurnstileArgs, local: Local): string[] {
  const found: string[] = [];
  if (!args.dryRun) {
    if (local.branch !== 'main') found.push('not on main; merge first');
    if (local.clean !== true) found.push('the working tree is not clean, or git could not say');
    if (local.headAtOriginMain !== true)
      found.push('HEAD is not at origin/main, or git could not say');
  }
  if (args.account === undefined)
    found.push('no account id; set CLOUDFLARE_ACCOUNT_ID or pass --account');
  else if (!ACCOUNT_ID.test(args.account))
    found.push('the account id is not 32 hexadecimal characters');
  if (args.mode !== 'create') {
    if (args.sitekey === undefined)
      found.push('no site key; set PUBLIC_TURNSTILE_SITE_KEY or pass --sitekey');
    else if (!SITE_KEY.test(args.sitekey))
      found.push("the site key does not have a Turnstile site key's shape");
  }
  if (local.wranglerRefusal !== undefined) found.push(local.wranglerRefusal);
  if (!local.emptyEnvFileIsEmpty) found.push(`${EMPTY_ENV_FILE} is missing or not empty`);
  found.push(...transportRefusals(local.shell));
  found.push(...envRefusals(local.shell, local.envFiles));
  return found;
}

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

/** Whether the run is at a terminal: stdin and stdout must both be one, or the prompt cannot be hidden. */
export function isInteractive(
  stdinIsTty: boolean | undefined,
  stdoutIsTty: boolean | undefined,
): boolean {
  return stdinIsTty === true && stdoutIsTty === true;
}

/**
 * The env files whose names step 1 reads: the repo root's `.env` and `.env.local`, and the main
 * checkout's `.env` when that is another folder (a worktree). The entry reads whichever exist.
 */
export function envFilePaths(
  root: string,
  main: string | undefined,
): { label: string; path: string }[] {
  return [
    { label: 'the repo root .env', path: join(root, '.env') },
    { label: 'the repo root .env.local', path: join(root, '.env.local') },
    ...(main !== undefined && resolve(main) !== resolve(root)
      ? [{ label: "the main checkout's .env", path: join(main, '.env') }]
      : []),
  ];
}

/** The committed env file is right only if it exists and holds nothing at all. */
export function envFileIsEmpty(text: string | undefined): boolean {
  return text === '';
}

export interface HttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly token: string;
  readonly body?: string | undefined;
}

export interface RunReply {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** Every effect, required: a test that forgets one does not compile. */
export interface Deps {
  readonly isTty: boolean;
  readonly http: (request: HttpRequest) => Promise<{ status: number; text: string }>;
  readonly run: (
    args: readonly string[],
    options: { input?: string | undefined; env: NodeJS.ProcessEnv; timeoutMs: number },
  ) => RunReply;
  readonly prompt: (question: string) => Promise<string>;
  readonly now: () => number;
  readonly print: (line: string) => void;
}

interface Context {
  readonly args: TurnstileArgs;
  readonly account: string;
  readonly deps: Deps;
  readonly say: (line: string) => void;
  readonly scrub: Scrubber;
  readonly wranglerEnv: NodeJS.ProcessEnv;
  token: string;
}

async function request(
  ctx: Context,
  method: 'GET' | 'POST',
  path: string,
  body?: string,
): Promise<Reply> {
  try {
    const res = await ctx.deps.http({
      method,
      url: `${API_ORIGIN}${path}`,
      token: ctx.token,
      body,
    });
    return readResponse(res.status, res.text, (text) => ctx.scrub.apply(text));
  } catch {
    return { kind: 'unreachable' };
  }
}

/** A wrangler call; `undefined` if it could not even be started. */
function wrangler(
  ctx: Context,
  sub: readonly string[],
  options: { input?: string; timeoutMs: number },
): RunReply | undefined {
  try {
    return ctx.deps.run(wranglerArgs(sub), { ...options, env: ctx.wranglerEnv });
  } catch {
    return undefined;
  }
}

/** Registers a widget's secret with the scrub the moment it is read, before any check or message. */
function noteSecret(ctx: Context, widget: unknown): void {
  const secret = secretOf(widget);
  if (secret !== undefined) ctx.scrub.add(secret, '<secret>');
}

const refuse = (ctx: Context, why: string): number => {
  ctx.say(`REFUSED: ${why}`);
  return 1;
};
const fail = (ctx: Context, why: string): number => {
  ctx.say(`FAILED: ${why}`);
  return 1;
};

function widgetsPath(account: string): string {
  return `/accounts/${account}/challenges/widgets`;
}
function widgetPath(account: string, sitekey: string): string {
  return `${widgetsPath(account)}/${encodeURIComponent(sitekey)}`;
}

function printPlan(ctx: Context): void {
  const { args, account } = ctx;
  const wr = (sub: readonly string[]): string => ['pnpm', ...wranglerArgs(sub)].join(' ');
  const widgets = widgetsPath(account);
  const one = widgetPath(account, args.sitekey ?? '<site key>');
  const lines = [
    `dry run (${args.mode}): nothing is prompted, sent or run.`,
    'prompt for the API token (not echoed), then:',
    'GET /user/tokens/verify  (then /accounts/<account>/tokens/verify if that is refused)',
    wr(['deployments', 'list', '--name', WORKER_NAME, '--json']),
    ...(args.mode === 'create'
      ? [
          `GET ${widgets}?filter=name%3A${WIDGET_NAME}&per_page=100`,
          `POST ${widgets}  {"name":"${WIDGET_NAME}","domains":["${WIDGET_DOMAIN}"],"mode":"managed"}`,
        ]
      : [`GET ${one}`]),
    ...(args.mode === 'rotate'
      ? [`POST ${one}/rotate_secret  {"invalidate_immediately":false}`]
      : []),
    `${wr(['secret', 'put', SECRET_NAME, '--config', WRANGLER_CONFIG])}  (the secret on stdin)`,
    wr(['secret', 'list', '--config', WRANGLER_CONFIG]),
  ];
  for (const line of lines) ctx.say(line);
}

/** The Worker check: read-only, and its output is parsed here and never printed. */
function workerExists(ctx: Context): boolean {
  const reply = wrangler(ctx, ['deployments', 'list', '--name', WORKER_NAME, '--json'], {
    timeoutMs: READ_TIMEOUT_MS,
  });
  if (reply === undefined || reply.timedOut || reply.status !== 0) return false;
  const id = latestVersionId(reply.stdout);
  return id !== undefined && id !== 'none';
}

async function verifyToken(ctx: Context): Promise<string | undefined> {
  let reply = await request(ctx, 'GET', '/user/tokens/verify');
  if (reply.kind !== 'ok')
    reply = await request(ctx, 'GET', `/accounts/${ctx.account}/tokens/verify`);
  if (reply.kind !== 'ok') return `the token could not be verified: ${describe(reply)}`;
  return tokenProblem(reply.result, ctx.deps.now());
}

/** wrangler output lines that are not the one we know, for the "withheld" count. */
function withheld(reply: RunReply): number {
  return `${reply.stdout}\n${reply.stderr}`
    .split(/\r?\n/)
    .filter(
      (line) => line.trim() !== '' && !line.includes(`Success! Uploaded secret ${SECRET_NAME}`),
    ).length;
}

/** What the failure message tells the owner to do when the secret is not on the Worker. */
function syncHint(sitekey: string | undefined): string {
  return `Fix the cause, then run: pnpm turnstile --sync${sitekey === undefined ? '' : ` --sitekey ${sitekey}`}`;
}

async function putAndConfirm(
  ctx: Context,
  secret: string,
  sitekey: string | undefined,
): Promise<number> {
  ctx.scrub.add(secret, '<secret>');
  const stranded = (why: string): number =>
    fail(ctx, `${why}. The widget's secret is not on the Worker. ${syncHint(sitekey)}`);

  const put = wrangler(ctx, ['secret', 'put', SECRET_NAME, '--config', WRANGLER_CONFIG], {
    input: secret,
    timeoutMs: PUT_TIMEOUT_MS,
  });
  if (put === undefined) return stranded('The wrangler call could not be started');
  const text = `${put.stdout}\n${put.stderr}`;
  const lines = withheld(put);
  const note =
    lines > 0
      ? ` (${String(lines)} line${lines === 1 ? '' : 's'} of wrangler output withheld)`
      : '';
  if (put.timedOut) {
    return stranded(
      `secret put timed out, and may still have landed; --sync is safe either way${note}`,
    );
  }
  if (put.status !== 0)
    return stranded(`secret put did not succeed (exit ${String(put.status)})${note}`);
  if (
    text.includes('Using fallback value in non-interactive context') ||
    text.includes('Creating new Worker')
  ) {
    return stranded(`The wrangler call asked a question or made a draft Worker${note}`);
  }
  if (!text.includes(`Success! Uploaded secret ${SECRET_NAME}`)) {
    return stranded(`secret put did not report success${note}`);
  }
  ctx.say(`Success! Uploaded secret ${SECRET_NAME}`);
  if (lines > 0)
    ctx.say(`${String(lines)} line${lines === 1 ? '' : 's'} of wrangler output withheld`);

  const listed = wrangler(ctx, ['secret', 'list', '--config', WRANGLER_CONFIG], {
    timeoutMs: READ_TIMEOUT_MS,
  });
  if (
    listed === undefined ||
    listed.timedOut ||
    listed.status !== 0 ||
    !secretListed(listed.stdout)
  ) {
    return stranded(`${SECRET_NAME} could not be confirmed on the Worker`);
  }
  ctx.say(
    `Confirmed: ${SECRET_NAME} is set on the ${WORKER_NAME} Worker (its value was not read).`,
  );
  return 0;
}

function secretListed(stdout: string): boolean {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return (
      Array.isArray(parsed) &&
      parsed.some((entry) => isRecord(entry) && entry['name'] === SECRET_NAME)
    );
  } catch {
    return false;
  }
}

async function create(ctx: Context): Promise<number> {
  const widgets = widgetsPath(ctx.account);
  const listing = await request(
    ctx,
    'GET',
    `${widgets}?filter=${encodeURIComponent(`name:${WIDGET_NAME}`)}&per_page=100`,
  );
  if (listing.kind !== 'ok' || !Array.isArray(listing.result)) {
    return fail(ctx, `could not list the widgets: ${describe(listing)}`);
  }
  if (listing.total !== undefined && listing.total > listing.result.length) {
    return refuse(
      ctx,
      'more widgets match than one page holds; find the site key in the dashboard and use --sync',
    );
  }
  const entries: unknown[] = listing.result;
  const existing = entries.find((entry) => isRecord(entry) && entry['name'] === WIDGET_NAME);
  if (isRecord(existing)) {
    const key =
      typeof existing['sitekey'] === 'string' && SITE_KEY.test(existing['sitekey'])
        ? existing['sitekey']
        : undefined;
    return refuse(
      ctx,
      `a widget named ${WIDGET_NAME} already exists${key === undefined ? '' : ` (site key ${key})`}. ` +
        `To rotate its secret run: pnpm turnstile. To set its current secret on the Worker run: pnpm turnstile --sync${key === undefined ? '' : ` --sitekey ${key}`}`,
    );
  }

  const created = await request(
    ctx,
    'POST',
    widgets,
    JSON.stringify({ name: WIDGET_NAME, domains: [WIDGET_DOMAIN], mode: 'managed' }),
  );
  if (created.kind === 'ok') noteSecret(ctx, created.result);
  if (created.kind !== 'ok') {
    return fail(
      ctx,
      `${describe(created)}. The widget may or may not exist. Run pnpm turnstile --create again: it lists by name, and if the widget exists it prints its site key for --sync.`,
    );
  }
  const problem = widgetProblem(created.result);
  if (problem !== undefined)
    return fail(ctx, `the widget was created but ${problem}; check the dashboard`);
  const sitekey = isRecord(created.result) ? created.result['sitekey'] : undefined;
  if (typeof sitekey !== 'string' || !SITE_KEY.test(sitekey)) {
    return fail(
      ctx,
      'the widget was created but its site key is not readable; find it in the dashboard, then use --sync',
    );
  }
  ctx.say(`Created widget ${WIDGET_NAME}. Site key (public): ${sitekey}`);
  ctx.say('Set PUBLIC_TURNSTILE_SITE_KEY to it before deploy:site.');
  const secret = secretOf(created.result);
  if (secret === undefined)
    return fail(ctx, `the response had no usable secret. ${syncHint(sitekey)}`);
  return putAndConfirm(ctx, secret, sitekey);
}

async function readWidget(ctx: Context, sitekey: string): Promise<Reply> {
  return request(ctx, 'GET', widgetPath(ctx.account, sitekey));
}

async function rotateOrSync(ctx: Context, sitekey: string): Promise<number> {
  const current = await readWidget(ctx, sitekey);
  if (current.kind !== 'ok') return fail(ctx, `could not read the widget: ${describe(current)}`);
  noteSecret(ctx, current.result);
  const before = widgetProblem(current.result, sitekey);
  if (before !== undefined) return refuse(ctx, `${before}; nothing was changed`);

  let widget = current.result;
  if (ctx.args.mode === 'rotate') {
    const rotated = await request(
      ctx,
      'POST',
      `${widgetPath(ctx.account, sitekey)}/rotate_secret`,
      JSON.stringify({ invalidate_immediately: false }),
    );
    if (rotated.kind === 'ok') noteSecret(ctx, rotated.result);
    // A 4xx is Cloudflare refusing the request. A 5xx, a 2xx that says success:false, or an answer that is not Cloudflare's, says
    // nothing about whether the rotation ran, so it takes the unknown-outcome message below.
    if (rotated.kind === 'failed' && rotated.status >= 400 && rotated.status < 500) {
      return fail(
        ctx,
        `${describe(rotated)}, so nothing changed. If a rotation ran in the last 2 hours, wait for it to end.`,
      );
    }
    if (rotated.kind !== 'ok') {
      return fail(ctx, `${describe(rotated)}. Whether it rotated is unknown. ${syncHint(sitekey)}`);
    }
    const after = widgetProblem(rotated.result, sitekey);
    if (after !== undefined) return fail(ctx, `after the rotate, ${after}. ${syncHint(sitekey)}`);
    widget = rotated.result;
    ctx.say(
      `Rotated. The previous secret stays valid for 2 hours, until ${new Date(ctx.deps.now() + GRACE_MS).toISOString()}.`,
    );
  }
  const secret = secretOf(widget);
  if (secret === undefined)
    return fail(ctx, `the response had no usable secret. ${syncHint(sitekey)}`);
  return putAndConfirm(ctx, secret, sitekey);
}

async function flow(ctx: Context, local: Local): Promise<number> {
  const refusals = localRefusals(ctx.args, local);
  for (const why of refusals) ctx.say(`REFUSED: ${why}`);
  if (refusals.length > 0) return 1;

  if (ctx.args.dryRun) {
    printPlan(ctx);
    return 0;
  }
  if (!ctx.deps.isTty) {
    return refuse(
      ctx,
      'stdin is not a terminal; the API token is typed at a prompt and cannot be piped',
    );
  }

  // Wait for the prompt before typing or pasting: a paste after an empty Enter would reach the shell.
  // So one empty answer is asked again, and a second refuses.
  let typed = (await ctx.deps.prompt('Cloudflare API token (typed, not shown): ')).trim();
  if (typed === '') {
    typed = (
      await ctx.deps.prompt('Nothing was typed. Cloudflare API token (typed, not shown): ')
    ).trim();
  }
  if (typed === '') return refuse(ctx, 'no token was typed');
  ctx.token = typed;
  ctx.scrub.add(typed, '<token>');

  const tokenWhy = await verifyToken(ctx);
  if (tokenWhy !== undefined) return refuse(ctx, tokenWhy);
  if (!workerExists(ctx)) {
    return refuse(
      ctx,
      `the ${WORKER_NAME} Worker could not be confirmed. Deploy it first: pnpm deploy:ask`,
    );
  }

  const code =
    ctx.args.mode === 'create'
      ? await create(ctx)
      : await rotateOrSync(ctx, ctx.args.sitekey ?? '');
  if (code === 0) {
    ctx.say(
      'Done. Delete the API token now: Cloudflare dashboard > My Profile > API Tokens (or Manage Account > Account API Tokens).',
    );
  }
  return code;
}

/** Runs one mode to an exit code. Anything it did not raise itself prints as its class only. */
export async function runTurnstile(args: TurnstileArgs, local: Local, deps: Deps): Promise<number> {
  const scrub = new Scrubber();
  if (args.account !== undefined) scrub.add(args.account, '<account>');
  const say = (line: string): void => {
    deps.print(scrub.apply(line));
  };
  const account = args.account ?? '';
  const ctx: Context = {
    args,
    account,
    deps,
    say,
    scrub,
    wranglerEnv: buildWranglerEnv(local.shell, account),
    token: '',
  };
  try {
    return await flow(ctx, local);
  } catch (error) {
    say(unexpectedLine(error));
    return 1;
  }
}
