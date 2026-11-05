import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  API_ORIGIN,
  EMPTY_ENV_FILE,
  WORKER_NAME,
  buildWranglerEnv,
  envFileIsEmpty,
  envFilePaths,
  envRefusals,
  isInteractive,
  localRefusals,
  parseTurnstileArgs,
  readResponse,
  runTurnstile,
  tokenProblem,
  unexpectedLine,
  wranglerArgs,
  type Deps,
  type HttpRequest,
  type Local,
  type Mode,
  type RunReply,
  type TurnstileArgs,
} from './turnstile.ts';
import { REPO_ROOT } from './repo-root.ts';

/**
 * Every fixture here is written by hand: a canary secret, a canary token, a
 * fixed fake account id and a made-up site key. Nothing is captured from a
 * live response (spec revision 5, C22).
 */
// SECRET and TOKEN share no 8-character run with ACCOUNT, EMAIL or SITEKEY, because the run check
// also covers the child environment, and that holds the account id.
const SECRET = 'CANARY-SECRET-zq7k9x2m4w8p';
const TOKEN = 'CANARY-TOKEN-hj5v3n6c1r9t';
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const SITEKEY = '0x4AAAAAAAZZZZZZZZZZZZZZZZ';
const EMAIL = 'canary.owner@example.com';
const NOW = Date.parse('2026-11-06T10:00:00Z');
const HOUR = 3_600_000;

/** Every 8-character run of each canary: a cut or partial leak still trips the check. */
const runsOf = (canary: string): string[] =>
  Array.from({ length: canary.length - 7 }, (_, i) => canary.slice(i, i + 8));

interface Recorded {
  readonly http: HttpRequest[];
  readonly runs: { args: readonly string[]; input?: string; env: NodeJS.ProcessEnv }[];
  readonly lines: string[];
  readonly prompts: string[];
}

type Route = { status?: number; body: unknown };
type Routes = Record<string, Route | ((req: HttpRequest) => Route | 'throw')>;

const widget = (extra: Record<string, unknown> = {}) => ({
  sitekey: SITEKEY,
  name: 'stacks-ask',
  domains: ['stacks.aymandiab.com'],
  mode: 'managed',
  secret: SECRET,
  ...extra,
});
const ok = (result: unknown, extra: Record<string, unknown> = {}): Route => ({
  body: { success: true, errors: [], messages: [], result, ...extra },
});
const failure = (status: number, code: number, message: string): Route => ({
  status,
  body: { success: false, errors: [{ code, message }], messages: [], result: null },
});

const WIDGETS = `/accounts/${ACCOUNT}/challenges/widgets`;
const happyRoutes = (): Routes => ({
  'GET /user/tokens/verify': ok({
    id: 'abc',
    status: 'active',
    expires_on: new Date(NOW + 3 * HOUR).toISOString(),
  }),
  [`GET ${WIDGETS}`]: ok([]),
  [`POST ${WIDGETS}`]: ok(widget()),
  [`GET ${WIDGETS}/${SITEKEY}`]: ok(widget()),
  [`POST ${WIDGETS}/${SITEKEY}/rotate_secret`]: ok(widget()),
});

const DEPLOYMENTS = JSON.stringify([
  {
    created_on: '2026-11-05T10:00:00Z',
    author_email: EMAIL,
    versions: [{ version_id: 'v1', percentage: 100 }],
  },
]);

function runReply(args: readonly string[]): RunReply {
  if (args.includes('deployments'))
    return { status: 0, stdout: DEPLOYMENTS, stderr: '', timedOut: false };
  if (args.includes('put')) {
    return {
      status: 0,
      stdout: '✨ Success! Uploaded secret TURNSTILE_SECRET\n',
      stderr: '',
      timedOut: false,
    };
  }
  return {
    status: 0,
    stdout: JSON.stringify([{ name: 'TURNSTILE_SECRET', type: 'secret_text' }]),
    stderr: '',
    timedOut: false,
  };
}

function harness(
  overrides: {
    routes?: Routes;
    run?: (args: readonly string[]) => RunReply | 'throw';
    tty?: boolean;
    token?: string;
    tokens?: string[];
    shell?: NodeJS.ProcessEnv;
  } = {},
): { deps: Deps; rec: Recorded; shell: NodeJS.ProcessEnv } {
  const typed = [...(overrides.tokens ?? [])];
  const rec: Recorded = { http: [], runs: [], lines: [], prompts: [] };
  const routes = { ...happyRoutes(), ...overrides.routes };
  const shell: NodeJS.ProcessEnv = overrides.shell ?? {
    PATH: 'C:\\bin',
    USERPROFILE: 'C:\\Users\\owner',
    APPDATA: 'C:\\Users\\owner\\AppData\\Roaming',
    SystemRoot: 'C:\\Windows',
  };
  const deps: Deps = {
    isTty: overrides.tty ?? true,
    http: (req) => {
      rec.http.push(req);
      const path = req.url.slice(API_ORIGIN.length).split('?')[0] ?? '';
      const hit = routes[`${req.method} ${path}`];
      if (hit === undefined) return Promise.resolve({ status: 404, text: 'no route' });
      const route = typeof hit === 'function' ? hit(req) : hit;
      if (route === 'throw') return Promise.reject(new Error(`network down ${SECRET} ${TOKEN}`));
      const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
      return Promise.resolve({ status: route.status ?? 200, text: body });
    },
    run: (args, options) => {
      rec.runs.push({ args, input: options.input, env: options.env });
      const reply = (overrides.run ?? runReply)(args);
      if (reply === 'throw') throw new Error(`spawn failed ${SECRET}`);
      return reply;
    },
    prompt: (question) => {
      rec.prompts.push(question);
      return Promise.resolve(typed.shift() ?? overrides.token ?? TOKEN);
    },
    now: () => NOW,
    print: (line) => {
      rec.lines.push(line);
    },
  };
  return { deps, rec, shell };
}

const GOOD_LOCAL = (shell: NodeJS.ProcessEnv): Local => ({
  shell,
  envFiles: [],
  branch: 'main',
  clean: true,
  headAtOriginMain: true,
  wranglerRefusal: undefined,
  emptyEnvFileIsEmpty: true,
});

const args = (over: Partial<TurnstileArgs> = {}): TurnstileArgs => ({
  mode: 'create',
  dryRun: false,
  account: ACCOUNT,
  sitekey: SITEKEY,
  ...over,
});

async function go(
  a: TurnstileArgs,
  over: Parameters<typeof harness>[0] = {},
  local?: Partial<Local>,
): Promise<{ code: number; rec: Recorded }> {
  const h = harness(over);
  const code = await runTurnstile(a, { ...GOOD_LOCAL(h.shell), ...local }, h.deps);
  return { code, rec: h.rec };
}

const output = (rec: Recorded): string => rec.lines.join('\n');
const widgetCalls = (rec: Recorded): HttpRequest[] =>
  rec.http.filter((r) => r.url.includes('/challenges/'));

/** C12: no canary, whole or in any 8-character run, in anything the script printed. */
function expectNoLeak(
  rec: Recorded,
  canaries: readonly string[] = [SECRET, TOKEN, ACCOUNT, EMAIL],
) {
  for (const canary of canaries) {
    for (const run of runsOf(canary)) {
      expect(output(rec), `printed output holds ${run}`).not.toContain(run);
    }
  }
  for (const run of rec.runs) {
    for (const canary of [SECRET, TOKEN]) {
      for (const piece of runsOf(canary)) {
        expect(run.args.join(' '), `an argument holds ${piece}`).not.toContain(piece);
        for (const value of Object.values(run.env)) {
          expect(value ?? '', `a child environment holds ${piece}`).not.toContain(piece);
        }
      }
    }
    expect(run.input === undefined || run.input === SECRET).toBe(true);
  }
}

describe('parseTurnstileArgs (modes and inputs)', () => {
  it('reads the three modes and --dry-run', () => {
    expect(parseTurnstileArgs(['--create'], {})).toMatchObject({ mode: 'create', dryRun: false });
    expect(parseTurnstileArgs([], {})).toMatchObject({ mode: 'rotate' });
    expect(parseTurnstileArgs(['--sync', '--dry-run'], {})).toMatchObject({
      mode: 'sync',
      dryRun: true,
    });
  });

  it('takes the account and site key from flags, which win over the environment', () => {
    const env = { CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), PUBLIC_TURNSTILE_SITE_KEY: '0xENV' };
    expect(parseTurnstileArgs(['--account', ACCOUNT, '--sitekey', SITEKEY], env)).toMatchObject({
      account: ACCOUNT,
      sitekey: SITEKEY,
    });
    expect(parseTurnstileArgs([], env)).toMatchObject({
      account: 'b'.repeat(32),
      sitekey: '0xENV',
    });
  });

  it('S3: lower-cases a well-formed account id once, and leaves a malformed one alone', () => {
    const upper = ACCOUNT.toUpperCase();
    expect(upper).not.toBe(ACCOUNT);
    expect(parseTurnstileArgs(['--account', upper], {})).toMatchObject({ account: ACCOUNT });
    expect(parseTurnstileArgs([], { CLOUDFLARE_ACCOUNT_ID: upper })).toMatchObject({
      account: ACCOUNT,
    });
    const bad = 'NOT-HEX-NOT-HEX-NOT-HEX-NOT-HEXX';
    expect(parseTurnstileArgs(['--account', bad], {})).toMatchObject({ account: bad });
  });

  it('refuses what it does not know, with no flag to clear the branch checks (C1)', () => {
    for (const bad of [
      ['--any-branch'],
      ['--token', TOKEN],
      ['--create', '--sync'],
      ['--account'],
    ]) {
      const parsed = parseTurnstileArgs(bad, {});
      expect(parsed).toHaveProperty('refusal');
      expect(JSON.stringify(parsed)).not.toContain(TOKEN);
    }
  });
});

describe('localRefusals (C1, C3, C4, C15, C21)', () => {
  const refusals = (a: TurnstileArgs, local: Partial<Local>) =>
    localRefusals(a, { ...GOOD_LOCAL({}), ...local });

  it('passes a clean main with good inputs', () => {
    expect(refusals(args(), {})).toEqual([]);
  });

  it('C1: refuses off main, an unclean tree and a HEAD not at origin/main, in every mode but --dry-run', () => {
    for (const local of [
      { branch: 'feat/x' },
      { branch: undefined },
      { clean: false },
      { clean: undefined },
      { headAtOriginMain: false },
      { headAtOriginMain: undefined },
    ] as const) {
      for (const mode of ['create', 'rotate', 'sync'] as const) {
        expect(refusals(args({ mode }), local), JSON.stringify(local)).not.toEqual([]);
        expect(refusals(args({ mode, dryRun: true }), local), 'dry run').toEqual([]);
      }
    }
  });

  it('C21: refuses a malformed account id or site key, or a missing one, without echoing it', () => {
    const cases: Partial<TurnstileArgs>[] = [
      { account: 'not-hex-not-hex-not-hex-not-hexx' },
      { account: undefined },
      { mode: 'rotate', sitekey: 'zzz-leaked-value' },
      { mode: 'rotate', sitekey: undefined },
      { mode: 'sync', sitekey: `${SITEKEY}/../x` },
    ];
    for (const over of cases) {
      const found = refusals(args(over), {});
      expect(found, JSON.stringify(over)).not.toEqual([]);
      for (const echoed of ['not-hex', 'zzz-leaked-value', '/../x']) {
        expect(found.join('\n')).not.toContain(echoed);
      }
    }
    // create needs no site key
    expect(refusals(args({ mode: 'create', sitekey: undefined }), {})).toEqual([]);
  });

  it('refuses the wrangler pin mismatch and a missing or non-empty env file (C15)', () => {
    expect(refusals(args(), { wranglerRefusal: 'node_modules holds wrangler 1.0.0' })).not.toEqual(
      [],
    );
    expect(refusals(args(), { emptyEnvFileIsEmpty: false })).not.toEqual([]);
  });

  it('C4: refuses NODE_TLS_REJECT_UNAUTHORIZED in the shell unless unset or 1', () => {
    const shell = (value: string | undefined) => ({
      NODE_TLS_REJECT_UNAUTHORIZED: value,
    });
    expect(refusals(args(), { shell: shell('0') })).not.toEqual([]);
    expect(refusals(args(), { shell: shell('') })).not.toEqual([]);
    expect(refusals(args(), { shell: shell('1') })).toEqual([]);
    expect(refusals(args(), { shell: {} })).toEqual([]);
  });

  it('T5: refuses a lower-case node_tls_reject_unauthorized=0 on its own', () => {
    const found = refusals(args(), { shell: { node_tls_reject_unauthorized: '0' } });
    expect(found).toHaveLength(1);
    expect(found.join(' ')).toContain('NODE_TLS_REJECT_UNAUTHORIZED');
  });

  for (const name of ['NODE_EXTRA_CA_CERTS', 'NODE_USE_SYSTEM_CA', 'NODE_USE_ENV_PROXY']) {
    it(`S4: refuses ${name} in any letter case, naming it and never its value`, () => {
      for (const spelled of [name, name.toLowerCase()]) {
        const found = refusals(args(), { shell: { [spelled]: 'VALUE-THAT-MUST-NOT-PRINT' } });
        expect(found, spelled).toHaveLength(1);
        expect(found.join(' ')).toContain(name);
        expect(found.join(' ')).not.toContain('VALUE-THAT-MUST-NOT-PRINT');
      }
    });
  }

  for (const flag of [
    '--use-env-proxy',
    '--use-system-ca',
    '--use-openssl-ca',
    '--tls-keylog',
    // Node reads a dash and an underscore in an option name as the same name
    '--use_env_proxy',
    '--use_system_ca',
    '--use_openssl_ca',
    '--tls_keylog',
  ]) {
    it(`S4: refuses a NODE_OPTIONS holding ${flag}, naming the variable and not its value`, () => {
      for (const spelled of ['NODE_OPTIONS', 'node_options']) {
        const value = `--max-old-space-size=100 ${flag.toUpperCase()} ZZZ-VALUE`;
        const found = refusals(args(), { shell: { [spelled]: value } });
        expect(found, spelled).toHaveLength(1);
        expect(found.join(' ')).toContain('NODE_OPTIONS');
        expect(found.join(' ')).not.toContain('ZZZ-VALUE');
      }
    });
  }

  it('S4: lets a NODE_OPTIONS without those flags through', () => {
    expect(refusals(args(), { shell: { NODE_OPTIONS: '--max-old-space-size=100' } })).toEqual([]);
  });

  it('C3: folds in the credential and host refusals', () => {
    expect(refusals(args(), { shell: { cloudflare_api_token: 'x' } })).not.toEqual([]);
  });
});

describe('envRefusals (C3: credentials and hosts that could replace the intended ones)', () => {
  const NAMES = [
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

  it('refuses each name in the shell in any letter case, naming it and never its value', () => {
    for (const name of NAMES) {
      for (const spelled of [name, name.toLowerCase(), name[0] + name.slice(1).toLowerCase()]) {
        const found = envRefusals({ [spelled]: 'SECRET-VALUE-XYZ' }, []);
        expect(found.join('\n'), spelled).toContain(name);
        expect(found.join('\n')).toContain('the shell');
        expect(found.join('\n')).not.toContain('SECRET-VALUE-XYZ');
      }
    }
  });

  it('refuses a CLOUDFLARE_API_BASE_URL other than the real one, in the shell and in a file', () => {
    expect(envRefusals({ CLOUDFLARE_API_BASE_URL: 'http://evil.test' }, [])).not.toEqual([]);
    expect(envRefusals({ CLOUDFLARE_API_BASE_URL: API_ORIGIN }, [])).toEqual([]);
    const file = (text: string) => [{ label: 'the repo root .env', text }];
    expect(envRefusals({}, file('CLOUDFLARE_API_BASE_URL=http://evil.test\n'))).not.toEqual([]);
    expect(envRefusals({}, file(`CLOUDFLARE_API_BASE_URL=${API_ORIGIN}\n`))).toEqual([]);
  });

  it('reads dotenv’s line forms: export prefix, colon, leading space, lone CR, BOM', () => {
    const forms = [
      'export CLOUDFLARE_API_TOKEN=abc',
      'CLOUDFLARE_API_TOKEN: abc',
      '   CLOUDFLARE_API_TOKEN=abc',
      'FOO=1\rCLOUDFLARE_API_TOKEN=abc\rBAR=2',
      '\uFEFFCLOUDFLARE_API_TOKEN=abc',
      'FOO=1\r\nTURNSTILE_API_TOKEN="abc"\r\n',
      "export   CF_API_TOKEN = 'abc'",
    ];
    for (const text of forms) {
      const found = envRefusals({}, [{ label: 'the repo root .env.local', text }]);
      expect(found.length, JSON.stringify(text)).toBeGreaterThan(0);
      expect(found.join('\n')).toContain('the repo root .env.local');
      expect(found.join('\n')).not.toContain('abc');
    }
  });

  it('passes comments, unrelated keys and the other Cloudflare values', () => {
    const text = [
      '# CLOUDFLARE_API_TOKEN=commented',
      'CLOUDFLARE_ACCOUNT_ID=0123',
      'PUBLIC_TURNSTILE_SITE_KEY=0x4',
      'STACKS_VAULT=C:\\vault',
    ].join('\n');
    expect(envRefusals({ PATH: 'x' }, [{ label: 'f', text }])).toEqual([]);
  });
});

describe('buildWranglerEnv (C16: an allowlist and the forced keys)', () => {
  const PLANTED = {
    CLOUDFLARE_ENV: 'x',
    DOTENV_KEY: 'x',
    WRANGLER_OUTPUT_FILE_PATH: 'C:\\out',
    WRANGLER_OUTPUT_FILE_DIRECTORY: 'C:\\out',
    TURNSTILE_API_TOKEN: TOKEN,
    WRANGLER_TOKEN_URL: 'https://evil.test/token',
    WRANGLER_AUTH_DOMAIN: 'evil.test',
    XDG_CONFIG_HOME: 'C:\\elsewhere',
    NODE_OPTIONS: '--require x',
    HTTPS_PROXY: 'http://evil.test',
    // mixed case, as PowerShell can leave them
    Turnstile_Api_Token: TOKEN,
    wrangler_token_url: 'https://evil.test/token',
    Cloudflare_Env: 'x',
  };

  it('keeps what the spawn and the login store need, and nothing else from the shell', () => {
    const env = buildWranglerEnv(
      { PATH: 'p', Path: 'dupe', USERPROFILE: 'u', appdata: 'a', ...PLANTED, SOMETHING_ELSE: 'x' },
      ACCOUNT,
    );
    expect(env['PATH']).toBe('p');
    expect(env['USERPROFILE']).toBe('u');
    expect(env['appdata']).toBe('a');
    const names = Object.keys(env).map((n) => n.toUpperCase());
    expect(new Set(names).size, 'no name appears twice in any letter case').toBe(names.length);
    for (const bad of Object.keys(PLANTED).concat('SOMETHING_ELSE')) {
      expect(names).not.toContain(bad.toUpperCase());
    }
    expect(JSON.stringify(env)).not.toContain(TOKEN);
  });

  it('forces the eight values whatever the shell says', () => {
    const env = buildWranglerEnv(
      {
        cloudflare_account_id: 'b'.repeat(32),
        CLOUDFLARE_API_BASE_URL: 'http://evil.test',
        node_tls_reject_unauthorized: '0',
        WRANGLER_SEND_METRICS: 'true',
        wrangler_send_error_reports: 'true',
        WRANGLER_WRITE_LOGS: 'true',
        WRANGLER_LOG_SANITIZE: 'false',
        WRANGLER_LOG: 'debug',
      },
      ACCOUNT,
    );
    expect(env).toMatchObject({
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
      CLOUDFLARE_API_BASE_URL: 'https://api.cloudflare.com/client/v4',
      NODE_TLS_REJECT_UNAUTHORIZED: '1',
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_SEND_ERROR_REPORTS: 'false',
      WRANGLER_WRITE_LOGS: 'false',
      WRANGLER_LOG_SANITIZE: 'true',
      WRANGLER_LOG: 'log',
    });
    const names = Object.keys(env).map((n) => n.toUpperCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('wranglerArgs (C15)', () => {
  it('runs the pinned wrangler through pnpm exec, with the empty env file last', () => {
    const built = wranglerArgs(['secret', 'list']);
    expect(built.slice(0, 2)).toEqual(['exec', 'wrangler']);
    expect(built.slice(-2)).toEqual(['--env-file', EMPTY_ENV_FILE]);
  });

  it('the committed env file exists and is empty; the Worker name matches wrangler.jsonc (C18)', () => {
    expect(readFileSync(join(REPO_ROOT, EMPTY_ENV_FILE), 'utf8')).toBe('');
    const config = readFileSync(join(REPO_ROOT, 'packages/ask/wrangler.jsonc'), 'utf8');
    expect(config).toMatch(new RegExp(`"name":\\s*"${WORKER_NAME}"`));
  });
});

describe('readResponse (one place parses bodies)', () => {
  const keep = (text: string): string => text;

  it('reads a success with its result and total', () => {
    expect(
      readResponse(
        200,
        JSON.stringify({ success: true, result: [1], result_info: { total_count: 7 } }),
        keep,
      ),
    ).toEqual({ kind: 'ok', result: [1], total: 7 });
  });

  it('reports a failure by status, code and message only', () => {
    const reply = readResponse(
      403,
      JSON.stringify({
        success: false,
        errors: [{ code: 9109, message: 'Valid user-level auth required' }],
      }),
      keep,
    );
    expect(reply).toMatchObject({ kind: 'failed', status: 403 });
    expect(JSON.stringify(reply)).toContain('9109');
  });

  it('calls anything it cannot read unreadable, with a size and never the text', () => {
    for (const text of [
      'not json ' + SECRET,
      '{"success":true,"result":{"secret":"' + SECRET.slice(0, 12),
      '[]',
      '',
    ]) {
      const reply = readResponse(200, text, keep);
      expect(reply.kind).toBe('unreadable');
      expect(JSON.stringify(reply)).not.toContain('CANARY');
    }
    expect(readResponse(200, '{"result":{}}', keep).kind).toBe('unreadable');
  });

  it('does not treat success:true on a non-2xx status as success', () => {
    const reply = readResponse(500, JSON.stringify({ success: true, result: {} }), keep);
    expect(reply.kind).not.toBe('ok');
  });
});

describe('unexpectedLine (an error the script did not raise)', () => {
  it('names the class and never the message or stack', () => {
    const line = unexpectedLine(new SyntaxError(`Unexpected token in ${SECRET}`));
    expect(line).toContain('SyntaxError');
    expect(line).not.toContain('CANARY');
    expect(unexpectedLine(`thrown string ${SECRET}`)).not.toContain('CANARY');
    expect(unexpectedLine({ secret: SECRET })).not.toContain('CANARY');
  });
});

describe('runTurnstile: before anything is asked (C1, C2, C3, C20)', () => {
  it('C2: refuses when stdin is not a TTY, with no prompt and no request', async () => {
    const { code, rec } = await go(args(), { tty: false });
    expect(code).toBe(1);
    expect(rec.prompts).toEqual([]);
    expect(rec.http).toEqual([]);
    expect(rec.runs).toEqual([]);
  });

  it('C1/C3/C4: a refusal comes before the prompt', async () => {
    for (const local of [
      { branch: 'x' },
      { shell: { CLOUDFLARE_API_TOKEN: 'v' } },
      { clean: false },
    ] as const) {
      const { code, rec } = await go(args(), {}, local);
      expect(code).toBe(1);
      expect(rec.prompts).toEqual([]);
      expect(rec.http).toEqual([]);
    }
  });

  it('an empty answer twice refuses, with no request', async () => {
    const { code, rec } = await go(args(), { token: '   ' });
    expect(code).toBe(1);
    expect(rec.prompts).toHaveLength(2);
    expect(rec.http).toEqual([]);
  });

  it('S5: one empty Enter asks again rather than exit, so a paste has somewhere to go', async () => {
    const { code, rec } = await go(args(), { tokens: ['', TOKEN] });
    expect(code).toBe(0);
    expect(rec.prompts).toHaveLength(2);
    expect(rec.http.every((r) => r.token === TOKEN)).toBe(true);
  });

  it('S5: a first answer that is a token is never followed by a second question', async () => {
    const { rec } = await go(args());
    expect(rec.prompts).toHaveLength(1);
  });

  it('C20: --dry-run prompts for nothing, sends nothing, spawns nothing, and says <account>', async () => {
    for (const mode of ['create', 'rotate', 'sync'] as const) {
      const { code, rec } = await go(args({ mode, dryRun: true }), { tty: false });
      expect(code).toBe(0);
      expect(rec.prompts).toEqual([]);
      expect(rec.http).toEqual([]);
      expect(rec.runs).toEqual([]);
      expect(output(rec)).toContain('<account>');
      expectNoLeak(rec);
    }
  });

  it('--dry-run still refuses a bad account id', async () => {
    const { code } = await go(args({ dryRun: true, account: 'nope' }));
    expect(code).toBe(1);
  });
});

describe('the token lifetime boundary (T6)', () => {
  const lasting = (ms: number) => ({
    status: 'active',
    expires_on: new Date(NOW + ms).toISOString(),
  });

  it('accepts exactly 24 hours and refuses 24 hours and a second', () => {
    expect(tokenProblem(lasting(24 * HOUR), NOW)).toBeUndefined();
    expect(tokenProblem(lasting(24 * HOUR + 1000), NOW)).toBeDefined();
    expect(tokenProblem(lasting(1000), NOW)).toBeUndefined();
    expect(tokenProblem(lasting(0), NOW)).toBeDefined();
  });
});

describe('the token must be short-lived (C5)', () => {
  const verify = (result: unknown): Routes => ({ 'GET /user/tokens/verify': ok(result) });
  const active = (extra: Record<string, unknown>) => ({ id: 'a', status: 'active', ...extra });
  const soon = new Date(NOW + 2 * HOUR).toISOString();

  it('refuses each unsafe verify answer before any Turnstile request or wrangler call', async () => {
    const cases: [string, Routes][] = [
      ['no expiry', verify(active({}))],
      [
        'more than 24 hours',
        verify(active({ expires_on: new Date(NOW + 25 * HOUR).toISOString() })),
      ],
      ['already expired', verify(active({ expires_on: new Date(NOW - HOUR).toISOString() }))],
      ['unparseable expiry', verify(active({ expires_on: 'soonish' }))],
      ['disabled', verify({ id: 'a', status: 'disabled', expires_on: soon })],
      [
        'not yet valid',
        verify(active({ expires_on: soon, not_before: new Date(NOW + HOUR).toISOString() })),
      ],
      ['unreadable', { 'GET /user/tokens/verify': { body: 'garbage' } }],
      ['unreachable', { 'GET /user/tokens/verify': () => 'throw' as const }],
    ];
    for (const [name, routes] of cases) {
      const extra = {
        ...routes,
        [`GET /accounts/${ACCOUNT}/tokens/verify`]: failure(401, 1000, 'bad'),
      };
      const { code, rec } = await go(args(), { routes: extra });
      expect(code, name).toBe(1);
      expect(widgetCalls(rec), name).toEqual([]);
      expect(rec.runs, name).toEqual([]);
      expectNoLeak(rec);
    }
  });

  it('accepts a good user token, and an account-owned one through the account verify path', async () => {
    expect((await go(args())).code).toBe(0);
    const { code, rec } = await go(args(), {
      routes: {
        'GET /user/tokens/verify': failure(400, 1000, 'Invalid API Token'),
        [`GET /accounts/${ACCOUNT}/tokens/verify`]: ok({
          id: 'a',
          status: 'active',
          expires_on: soon,
        }),
      },
    });
    expect(code).toBe(0);
    expect(rec.http.some((r) => r.url.endsWith(`/accounts/${ACCOUNT}/tokens/verify`))).toBe(true);
  });
});

describe('the Worker must exist before any Turnstile request (C6)', () => {
  const cases: [string, (a: readonly string[]) => RunReply | 'throw'][] = [
    ['no deployment', () => ({ status: 0, stdout: '[]', stderr: '', timedOut: false })],
    [
      'error 10007',
      () => ({ status: 1, stdout: '', stderr: `code: 10007 ${EMAIL}`, timedOut: false }),
    ],
    ['login failure', () => ({ status: 1, stdout: '', stderr: 'not logged in', timedOut: false })],
    [
      'unreadable output',
      () => ({ status: 0, stdout: `oops ${EMAIL}`, stderr: '', timedOut: false }),
    ],
    ['timed out', () => ({ status: null, stdout: '', stderr: '', timedOut: true })],
    ['spawn failure', () => 'throw'],
  ];

  for (const mode of ['create', 'rotate', 'sync'] as const) {
    it(`${mode} refuses, names pnpm deploy:ask, calls no widget endpoint and prints no wrangler output`, async () => {
      for (const [name, run] of cases) {
        const { code, rec } = await go(args({ mode }), { run });
        expect(code, name).toBe(1);
        expect(widgetCalls(rec), name).toEqual([]);
        expect(output(rec), name).toContain('pnpm deploy:ask');
        expect(output(rec)).not.toContain(EMAIL);
        expectNoLeak(rec);
      }
    });
  }

  it('asks wrangler for the stacks-ask deployments with the empty env file', async () => {
    const { rec } = await go(args());
    const first = rec.runs[0]?.args ?? [];
    expect(first).toEqual(
      expect.arrayContaining(['deployments', 'list', '--name', WORKER_NAME, '--json']),
    );
    expect(first.slice(-2)).toEqual(['--env-file', EMPTY_ENV_FILE]);
  });
});

describe('--create (C7)', () => {
  it('lists first, makes one POST with the fixed body, prints the site key and puts the secret on stdin', async () => {
    const { code, rec } = await go(args());
    expect(code).toBe(0);
    const calls = widgetCalls(rec).map(
      (r) => `${r.method} ${r.url.slice(API_ORIGIN.length).split('?')[0]}`,
    );
    expect(calls).toEqual([`GET ${WIDGETS}`, `POST ${WIDGETS}`]);
    const post = widgetCalls(rec)[1];
    expect(JSON.parse(post?.body ?? '')).toEqual({
      name: 'stacks-ask',
      domains: ['stacks.aymandiab.com'],
      mode: 'managed',
    });
    expect(widgetCalls(rec)[0]?.url).toContain('filter=name%3Astacks-ask');
    expect(output(rec)).toContain(SITEKEY);
    const put = rec.runs.find((r) => r.args.includes('put'));
    expect(put?.args).toEqual(
      expect.arrayContaining([
        'secret',
        'put',
        'TURNSTILE_SECRET',
        '--config',
        'packages/ask/wrangler.jsonc',
      ]),
    );
    expect(put?.input).toBe(SECRET);
    expectNoLeak(rec);
  });

  it('refuses an existing widget of that exact name and prints its site key', async () => {
    const { code, rec } = await go(args(), {
      routes: { [`GET ${WIDGETS}`]: ok([widget({ secret: undefined })]) },
    });
    expect(code).toBe(1);
    expect(widgetCalls(rec).some((r) => r.method === 'POST')).toBe(false);
    expect(output(rec)).toContain(SITEKEY);
    expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
  });

  it('does not take a longer name containing it for the same widget (the filter is a substring match)', async () => {
    const other = widget({
      name: 'stacks-ask-staging',
      sitekey: '0x4BBBBBBBBBBBBBBBBBBBBBBB',
      secret: undefined,
    });
    const { code, rec } = await go(args(), { routes: { [`GET ${WIDGETS}`]: ok([other]) } });
    expect(code).toBe(0);
    expect(widgetCalls(rec).some((r) => r.method === 'POST')).toBe(true);
  });

  it('refuses when the list is longer than one page', async () => {
    const { code, rec } = await go(args(), {
      routes: { [`GET ${WIDGETS}`]: ok([], { result_info: { total_count: 400, count: 0 } }) },
    });
    expect(code).toBe(1);
    expect(widgetCalls(rec).some((r) => r.method === 'POST')).toBe(false);
  });

  it('a create that times out says the widget may exist and to run --create again', async () => {
    const { code, rec } = await go(args(), { routes: { [`POST ${WIDGETS}`]: () => 'throw' } });
    expect(code).toBe(1);
    expect(output(rec)).toContain('--create');
    expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
    expectNoLeak(rec);
  });

  it('puts nothing for a created widget that is not the expected one', async () => {
    const { code, rec } = await go(args(), {
      routes: {
        [`POST ${WIDGETS}`]: ok(widget({ domains: ['stacks.aymandiab.com', 'evil.test'] })),
      },
    });
    expect(code).toBe(1);
    expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
  });
});

describe('rotate (C8, C9)', () => {
  const rotate = (over: Partial<TurnstileArgs> = {}) => args({ mode: 'rotate', ...over });
  const ROTATE = `POST ${WIDGETS}/${SITEKEY}/rotate_secret`;

  it('GETs the widget before the rotate POST, sends invalidate_immediately: false explicitly, and puts the new secret', async () => {
    const { code, rec } = await go(rotate(), {
      routes: {
        [ROTATE]: ok(widget({ secret: SECRET })),
        [`GET ${WIDGETS}/${SITEKEY}`]: ok(widget({ secret: 'OLD-SECRET-VALUE-0000' })),
      },
    });
    expect(code).toBe(0);
    const calls = widgetCalls(rec).map((r) => `${r.method} ${r.url.slice(API_ORIGIN.length)}`);
    expect(calls).toEqual([
      `GET ${WIDGETS}/${SITEKEY}`,
      `POST ${WIDGETS}/${SITEKEY}/rotate_secret`,
    ]);
    expect(widgetCalls(rec)[1]?.body).toBe('{"invalidate_immediately":false}');
    expect(rec.runs.find((r) => r.args.includes('put'))?.input).toBe(SECRET);
    expect(output(rec)).toContain('2 hours');
    expectNoLeak(rec, [SECRET, TOKEN, ACCOUNT, 'OLD-SECRET-VALUE-0000']);
  });

  it('rotates nothing for a widget with another name or domains (the check comes first)', async () => {
    for (const bad of [
      widget({ name: 'something-else' }),
      widget({ domains: ['example.com'] }),
      widget({ domains: ['stacks.aymandiab.com', 'example.com'] }),
      widget({ domains: [] }),
      widget({ sitekey: '0x4CCCCCCCCCCCCCCCCCCCCCCC' }),
    ]) {
      const { code, rec } = await go(rotate(), {
        routes: { [`GET ${WIDGETS}/${SITEKEY}`]: ok(bad) },
      });
      expect(code).toBe(1);
      expect(widgetCalls(rec).some((r) => r.method === 'POST')).toBe(false);
      expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
    }
  });

  it('puts nothing when the rotate response is not the expected widget', async () => {
    const { code, rec } = await go(rotate(), { routes: { [ROTATE]: ok(widget({ name: 'x' })) } });
    expect(code).toBe(1);
    expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
  });

  it('puts nothing when the response has no usable secret', async () => {
    for (const secret of [undefined, '', 'has space', 42]) {
      const { code, rec } = await go(rotate(), { routes: { [ROTATE]: ok(widget({ secret })) } });
      expect(code).toBe(1);
      expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
      expect(output(rec)).toContain('--sync');
    }
  });

  it('an unsuccessful rotate changes nothing, runs no put, and reports status, code and message without the body', async () => {
    const { code, rec } = await go(rotate(), {
      routes: { [ROTATE]: failure(409, 10_042, 'rotation in progress') },
    });
    expect(code).toBe(1);
    expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
    const text = output(rec);
    expect(text).toContain('409');
    expect(text).toContain('10042');
    expect(text).toContain('rotation in progress');
    expect(text).toContain('nothing changed');
    expectNoLeak(rec);
  });

  it('S6: a success:false answer at a 5xx does not say nothing changed, and names --sync', async () => {
    for (const status of [500, 502, 503]) {
      const { code, rec } = await go(rotate(), {
        routes: { [ROTATE]: failure(status, 10_000, 'upstream trouble') },
      });
      expect(code).toBe(1);
      expect(output(rec), String(status)).not.toContain('nothing changed');
      expect(output(rec), String(status)).toContain('--sync');
      expect(output(rec)).toContain(String(status));
      expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
    }
    for (const status of [400, 403, 409, 429]) {
      const { rec } = await go(rotate(), { routes: { [ROTATE]: failure(status, 1, 'no') } });
      expect(output(rec), String(status)).toContain('nothing changed');
    }
  });

  it('S6: a success:false answer at a 200 is not Cloudflare refusing the request either, and names --sync', async () => {
    const { code, rec } = await go(rotate(), { routes: { [ROTATE]: failure(200, 1, 'odd') } });
    expect(code).toBe(1);
    expect(output(rec)).not.toContain('nothing changed');
    expect(output(rec)).toContain('--sync');
    expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
  });

  it('S1: the old secret read before the rotate is scrubbed from a later error', async () => {
    const OLD = 'CANARY-OLD-SECRET-9876543210';
    const { code, rec } = await go(rotate(), {
      routes: {
        [`GET ${WIDGETS}/${SITEKEY}`]: ok(widget({ secret: OLD })),
        [ROTATE]: failure(409, 7, `rejected ${OLD}`),
      },
    });
    expect(code).toBe(1);
    expect(output(rec)).toContain('409');
    expectNoLeak(rec, [OLD, TOKEN, ACCOUNT]);
  });

  it('a rotate that times out names --sync, since whether it rotated is unknown', async () => {
    const { code, rec } = await go(rotate(), { routes: { [ROTATE]: () => 'throw' } });
    expect(code).toBe(1);
    expect(output(rec)).toContain('--sync');
    expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
    expectNoLeak(rec);
  });
});

describe('--sync (C10)', () => {
  it('reads the secret with a GET, rotates nothing and puts it', async () => {
    const { code, rec } = await go(args({ mode: 'sync' }));
    expect(code).toBe(0);
    expect(widgetCalls(rec).map((r) => r.method)).toEqual(['GET']);
    expect(rec.runs.find((r) => r.args.includes('put'))?.input).toBe(SECRET);
  });

  it('refuses another widget', async () => {
    const { code, rec } = await go(args({ mode: 'sync' }), {
      routes: { [`GET ${WIDGETS}/${SITEKEY}`]: ok(widget({ name: 'other' })) },
    });
    expect(code).toBe(1);
    expect(rec.runs.some((r) => r.args.includes('put'))).toBe(false);
  });
});

describe('putting the secret (C11, C12, C13, C14, C19)', () => {
  const put = (reply: RunReply | 'throw') => (a: readonly string[]) =>
    a.includes('put') ? reply : runReply(a);
  const result = (stdout: string, status: number | null = 0, timedOut = false): RunReply => ({
    status,
    stdout,
    stderr: '',
    timedOut,
  });
  const SUCCESS = '✨ Success! Uploaded secret TURNSTILE_SECRET\n';

  it('C11: the secret is on stdin only, with a fixed argument list', async () => {
    const { rec } = await go(args());
    const run = rec.runs.find((r) => r.args.includes('put'));
    expect(run?.input).toBe(SECRET);
    expect(run?.args.join(' ')).not.toContain('CANARY');
    expect(rec.runs.filter((r) => r.input !== undefined)).toHaveLength(1);
  });

  it('C13: each failure names --sync and says the secret is not on the Worker', async () => {
    const noise = `an unknown line\n${EMAIL}\n${SECRET} ${TOKEN} /accounts/${ACCOUNT}/x\n`;
    const failures: [string, RunReply | 'throw'][] = [
      ['non-zero exit', result(`${SUCCESS}${noise}`, 1)],
      ['timeout', result(`${SUCCESS}${noise}`, null, true)],
      ['no success line', result(`nothing happened\n${noise}`)],
      [
        'fallback answer',
        result(`${SUCCESS}Using fallback value in non-interactive context: yes\n${noise}`),
      ],
      ['draft worker', result(`🌀 Creating new Worker "stacks-ask"...\n${SUCCESS}${noise}`)],
      ['spawn failure', 'throw'],
    ];
    for (const [name, reply] of failures) {
      const { code, rec } = await go(args(), { run: put(reply) });
      expect(code, name).toBe(1);
      expect(output(rec), name).toContain('--sync');
      if (reply !== 'throw') {
        expect(output(rec), name).toMatch(/\d+ lines? of wrangler output withheld/);
        expect(output(rec), name).not.toContain(EMAIL);
        expect(output(rec), name).not.toContain('an unknown line');
      }
      if (name === 'timeout') expect(output(rec)).toContain('may still have landed');
      expect(
        rec.runs.some((r) => r.args.includes('list') && r.args.includes('secret')),
        name,
      ).toBe(false);
      expectNoLeak(rec);
    }
  });

  it('C12: wrangler output holding the secret, the token or the account id reaches nothing printed', async () => {
    const noisy = result(
      `${SUCCESS}echo ${SECRET}\nusing ${TOKEN}\n/accounts/${ACCOUNT}/workers\n${EMAIL}\n`,
    );
    const { code, rec } = await go(args(), { run: put(noisy) });
    expect(code).toBe(0);
    expectNoLeak(rec);
    expect(output(rec)).toMatch(/\d+ lines? of wrangler output withheld/);
    expect(output(rec)).toContain('Success! Uploaded secret TURNSTILE_SECRET');
  });

  it('C14: a secret list without TURNSTILE_SECRET is a failure; so is one that cannot be read', async () => {
    for (const stdout of [
      '[]',
      '[{"name":"VISITOR_KEY","type":"secret_text"}]',
      'garbage',
      '{"name":"TURNSTILE_SECRET"}',
    ]) {
      const { code, rec } = await go(args(), {
        run: (a) => (a.includes('secret') && a.includes('list') ? result(stdout) : runReply(a)),
      });
      expect(code, stdout).toBe(1);
      expect(output(rec)).toContain('--sync');
    }
  });

  it('C14: secret list reads names only, and is asked for the same Worker config', async () => {
    const { rec } = await go(args());
    const list = rec.runs.find((r) => r.args.includes('secret') && r.args.includes('list'));
    expect(list?.args).toEqual(expect.arrayContaining(['--config', 'packages/ask/wrangler.jsonc']));
    expect(list?.input).toBeUndefined();
  });

  it('C19: a successful run ends by telling the owner to delete the API token', async () => {
    for (const mode of ['create', 'rotate', 'sync'] as const) {
      const { code, rec } = await go(args({ mode }));
      expect(code).toBe(0);
      expect(rec.lines.at(-1)?.toLowerCase()).toContain('delete the api token');
    }
  });

  it('a failed run does not claim success or tell the owner to delete anything yet', async () => {
    const { rec } = await go(args(), { run: put(result('', 1)) });
    expect(output(rec).toLowerCase()).not.toContain('done');
  });
});

describe('what wrangler is run with (C15, C16, C17)', () => {
  it('every wrangler call has the env file and a clean, forced environment', async () => {
    const clean = {
      PATH: 'p',
      USERPROFILE: 'u',
      WRANGLER_TOKEN_URL: 'https://evil.test',
      cloudflare_env: 'x',
      DOTENV_KEY: 'x',
      wrangler_output_file_path: 'C:\\out',
    };
    const ok2 = harness({ shell: clean });
    expect(await runTurnstile(args(), GOOD_LOCAL(clean), ok2.deps)).toBe(0);
    expect(ok2.rec.runs).toHaveLength(3);
    for (const run of ok2.rec.runs) {
      expect(run.args.slice(0, 2)).toEqual(['exec', 'wrangler']);
      expect(run.args.slice(-2)).toEqual(['--env-file', EMPTY_ENV_FILE]);
      const names = Object.keys(run.env).map((n) => n.toUpperCase());
      for (const bad of [
        'WRANGLER_TOKEN_URL',
        'CLOUDFLARE_ENV',
        'DOTENV_KEY',
        'WRANGLER_OUTPUT_FILE_PATH',
      ]) {
        expect(names).not.toContain(bad);
      }
      expect(run.env['CLOUDFLARE_ACCOUNT_ID']).toBe(ACCOUNT);
      expect(run.env['NODE_TLS_REJECT_UNAUTHORIZED']).toBe('1');
      expect(run.env['CLOUDFLARE_API_BASE_URL']).toBe('https://api.cloudflare.com/client/v4');
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('T3: a root .env naming WRANGLER_TOKEN_URL reaches none of the three child environments', async () => {
    const h = harness();
    const local: Local = {
      ...GOOD_LOCAL(h.shell),
      envFiles: [{ label: 'the repo root .env', text: 'WRANGLER_TOKEN_URL=https://evil.test' }],
    };
    expect(await runTurnstile(args(), local, h.deps)).toBe(0);
    expect(h.rec.runs).toHaveLength(3);
    for (const run of h.rec.runs) {
      expect(Object.keys(run.env).map((n) => n.toUpperCase())).not.toContain('WRANGLER_TOKEN_URL');
      expect(JSON.stringify(run.env)).not.toContain('evil.test');
    }
  });

  it('C17: every request goes to the fixed origin, with the typed token', async () => {
    for (const mode of ['create', 'rotate', 'sync'] as const) {
      const { rec } = await go(args({ mode }));
      expect(rec.http.length).toBeGreaterThan(0);
      for (const req of rec.http) {
        expect(req.url.startsWith('https://api.cloudflare.com/client/v4/')).toBe(true);
        expect(req.token).toBe(TOKEN);
      }
    }
  });
});

describe('the entry’s decisions, kept pure (T7)', () => {
  it('isInteractive is true only when stdin and stdout are both terminals', () => {
    expect(isInteractive(true, true)).toBe(true);
    for (const [i, o] of [
      [true, false],
      [false, true],
      [false, false],
      [undefined, true],
      [true, undefined],
      [undefined, undefined],
    ] as const) {
      expect(isInteractive(i, o), `${String(i)} ${String(o)}`).toBe(false);
    }
  });

  it('envFilePaths names the root .env and .env.local and the main checkout’s .env', () => {
    expect(envFilePaths('/repo', '/main')).toEqual([
      { label: 'the repo root .env', path: join('/repo', '.env') },
      { label: 'the repo root .env.local', path: join('/repo', '.env.local') },
      { label: "the main checkout's .env", path: join('/main', '.env') },
    ]);
  });

  it('envFilePaths leaves the main checkout out when it is the root, or unknown', () => {
    expect(envFilePaths('/repo', undefined)).toHaveLength(2);
    expect(envFilePaths('/repo', resolve('/repo'))).toHaveLength(2);
    expect(envFilePaths('/repo', '/repo/../repo')).toHaveLength(2);
  });

  it('envFileIsEmpty is true only for a file that exists and holds nothing', () => {
    expect(envFileIsEmpty('')).toBe(true);
    expect(envFileIsEmpty(undefined)).toBe(false);
    expect(envFileIsEmpty(' ')).toBe(false);
    expect(envFileIsEmpty('#')).toBe(false);
    expect(envFileIsEmpty(String.fromCharCode(10))).toBe(false);
  });
});

describe('nothing secret reaches anything printed (C12)', () => {
  type Over = NonNullable<Parameters<typeof harness>[0]>;
  const ALL: readonly Mode[] = ['create', 'rotate', 'sync'];
  const ROTATE_POST = `POST ${WIDGETS}/${SITEKEY}/rotate_secret`;
  const WIDGET_GET = `GET ${WIDGETS}/${SITEKEY}`;
  const both = `${TOKEN} ${ACCOUNT}`;
  const verifyFails = (message: string): Routes => ({
    'GET /user/tokens/verify': failure(403, 1, message),
    [`GET /accounts/${ACCOUNT}/tokens/verify`]: failure(403, 1, message),
  });
  const scenarios: {
    name: string;
    modes: readonly Mode[];
    over: Over;
    code: number;
    line: string;
    absent?: string;
  }[] = [
    { name: 'success', modes: ALL, over: {}, code: 0, line: 'Delete the API token' },
    {
      name: 'an unparseable create body holding the secret whole',
      modes: ['create'],
      over: { routes: { [`POST ${WIDGETS}`]: { body: `<html>${SECRET}</html>` } } },
      code: 1,
      line: 'unreadable response',
    },
    {
      name: 'an unparseable create body cut mid-secret',
      modes: ['create'],
      over: {
        routes: {
          [`POST ${WIDGETS}`]: {
            body: `{"success":true,"result":{"secret":"${SECRET.slice(0, 14)}`,
          },
        },
      },
      code: 1,
      line: 'unreadable response',
    },
    {
      name: 'an unparseable rotate body',
      modes: ['rotate'],
      over: { routes: { [ROTATE_POST]: { body: SECRET } } },
      code: 1,
      line: 'Whether it rotated is unknown',
      absent: 'nothing changed',
    },
    {
      name: 'an unparseable widget read',
      modes: ['rotate'],
      over: { routes: { [WIDGET_GET]: { body: `<html>${SECRET}` } } },
      code: 1,
      line: 'could not read the widget: unreadable response',
    },
    {
      name: 'a widget list error that carries the token and the account',
      modes: ['create'],
      over: { routes: { [`GET ${WIDGETS}`]: failure(500, 7, both) } },
      code: 1,
      line: 'could not list the widgets: Cloudflare answered HTTP 500',
    },
    {
      name: 'a create error that carries the token and the account',
      modes: ['create'],
      over: { routes: { [`POST ${WIDGETS}`]: failure(409, 7, both) } },
      code: 1,
      line: 'HTTP 409',
    },
    {
      name: 'a rotate error that carries the token and the account',
      modes: ['rotate'],
      over: { routes: { [ROTATE_POST]: failure(409, 7, both) } },
      code: 1,
      line: 'so nothing changed',
    },
    {
      name: 'a widget read error that carries the token and the account',
      modes: ['rotate'],
      over: { routes: { [WIDGET_GET]: failure(500, 7, both) } },
      code: 1,
      line: 'could not read the widget: Cloudflare answered HTTP 500',
    },
    {
      name: 'a network error on the create POST',
      modes: ['create'],
      over: { routes: { [`POST ${WIDGETS}`]: () => 'throw' } },
      code: 1,
      line: 'pnpm turnstile --create again',
    },
    {
      name: 'a network error on the rotate POST',
      modes: ['rotate'],
      over: { routes: { [ROTATE_POST]: () => 'throw' } },
      code: 1,
      line: 'Whether it rotated is unknown',
    },
    {
      name: 'verify errors that carry the token and the account',
      modes: ['create'],
      over: { routes: verifyFails(`account ${ACCOUNT} token ${TOKEN}`) },
      code: 1,
      line: 'the token could not be verified',
    },
    {
      name: 'verify errors with the token and the account across the 200th character',
      modes: ['create'],
      over: { routes: verifyFails('x'.repeat(190) + TOKEN + ACCOUNT) },
      code: 1,
      line: 'the token could not be verified',
    },
    {
      name: 'a spawn that throws on the put',
      modes: ['create'],
      over: {
        run: (a: readonly string[]) => (a.includes('put') ? ('throw' as const) : runReply(a)),
      },
      code: 1,
      line: 'The wrangler call could not be started',
    },
  ];
  for (const { name, modes, over, code, line, absent } of scenarios) {
    for (const mode of modes) {
      it(`${name} (${mode})`, async () => {
        const result = await go(args({ mode }), over);
        expect(result.code).toBe(code);
        expect(output(result.rec)).toContain(line);
        if (absent !== undefined) expect(output(result.rec)).not.toContain(absent);
        expectNoLeak(result.rec);
      });
    }
  }

  it('an error thrown inside the flow is caught as its class and nothing else', async () => {
    const h = harness();
    const bad: Deps = {
      ...h.deps,
      prompt: () => Promise.reject(new TypeError(`prompt broke ${TOKEN}`)),
    };
    const code = await runTurnstile(args(), GOOD_LOCAL(h.shell), bad);
    expect(code).toBe(1);
    expect(output(h.rec)).toContain('TypeError');
    expectNoLeak(h.rec);
  });
});
