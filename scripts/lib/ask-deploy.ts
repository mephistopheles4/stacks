/**
 * What `pnpm deploy:ask` decides, with no process, file or network in it, so each
 * decision can be tested (docs/spec/ask-the-library.md S5 "Off switch", S8
 * "Deploy", C12, C15, C18).
 */

export interface AskFlags {
  readonly dryRun: boolean;
  readonly aiOff: boolean;
  readonly aiOn: boolean;
  readonly anyBranch: boolean;
  /** `--gateway <id>`: deploy against a test gateway, for C7 only. */
  readonly gateway?: string;
}

const GATEWAY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** `default` creates itself with logging on and no limit; `stacks-ask` is the real one. */
export const NOT_A_TEST_GATEWAY: ReadonlySet<string> = new Set(['default', 'stacks-ask']);

/** The four flags and `--gateway <id>`. Anything else is a refusal, never ignored. */
export function parseAskArgs(argv: readonly string[]): AskFlags | { readonly refusal: string } {
  let dryRun = false;
  let aiOff = false;
  let aiOn = false;
  let anyBranch = false;
  let gateway: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--ai-off') aiOff = true;
    else if (arg === '--ai-on') aiOn = true;
    else if (arg === '--any-branch') anyBranch = true;
    else if (arg === '--gateway') {
      gateway = argv[(i += 1)];
      if (gateway === undefined || !GATEWAY_ID.test(gateway) || NOT_A_TEST_GATEWAY.has(gateway)) {
        return {
          refusal: '--gateway needs a gateway id of lower-case letters, digits and hyphens',
        };
      }
    } else return { refusal: `unknown argument ${String(arg)}` };
  }
  if (aiOff && aiOn) return { refusal: '--ai-off and --ai-on contradict each other' };
  return { dryRun, aiOff, aiOn, anyBranch, ...(gateway !== undefined && { gateway }) };
}

/** The live value of `ASK_AI_ENABLED`: a string, `none` before any deploy, `unreadable` otherwise. */
export type LiveAi = string;

/** Finds the `ASK_AI_ENABLED` binding anywhere in a `wrangler versions view --json` answer. */
export function liveAiValue(view: unknown): LiveAi {
  const found: unknown[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (typeof node === 'object' && node !== null) {
      const o = node as Record<string, unknown>;
      if (o['name'] === 'ASK_AI_ENABLED') found.push(o['text'] ?? o['value']);
      Object.values(o).forEach(walk);
    }
  };
  walk(view);
  const value = found.find((v): v is string => typeof v === 'string');
  return value ?? 'unreadable';
}

export interface AiDecision {
  /** The `ASK_AI_ENABLED` this deploy will carry, when it sets one. */
  readonly value?: 'true' | 'false';
  readonly refusal?: string;
}

/**
 * S5: `--ai-off` deploys with AI off and no commit. A plain deploy reads the live
 * value first and refuses to turn AI back on without `--ai-on`, so a later deploy
 * cannot undo the switch by surprise. A value that cannot be read refuses too:
 * a check that cannot run counts as a refusal.
 */
export function decideAi(flags: AskFlags, live: LiveAi): AiDecision {
  if (flags.aiOff) return { value: 'false' };
  if (flags.aiOn) return { value: 'true' };
  if (live === 'none') return {};
  if (live === 'unreadable') {
    return {
      refusal:
        'could not read the live ASK_AI_ENABLED, so this cannot tell whether AI was switched off. ' +
        'Pass --ai-on to deploy with AI on, or --ai-off to deploy with it off.',
    };
  }
  if (live !== 'true') {
    return {
      refusal:
        `AI is switched off on the live Worker (ASK_AI_ENABLED is "${live}"). ` +
        'A plain deploy would turn it back on; pass --ai-on to do that on purpose.',
    };
  }
  return {};
}

/** Every path form of each vault location found in a bundle, for the dry run's check (C15). */
export function bundleLeaks(
  bundles: ReadonlyMap<string, string>,
  vaults: readonly string[],
): string[] {
  const forms = vaults
    .filter((v) => v.length >= 4)
    .flatMap((v) => [
      v,
      v.replaceAll('\\', '/'),
      v.replaceAll('/', '\\'),
      v.replaceAll('\\', '\\\\'),
    ]);
  return [...bundles].flatMap(([file, text]) =>
    forms.filter((f) => text.includes(f)).map(() => `${file} holds the vault path`),
  );
}

/** Whether the config pins `observability.logs.invocation_logs` to false (C15). */
export function invocationLogsOff(jsonc: string): boolean {
  const code = jsonc.replace(/^\s*\/\/.*$/gm, '');
  return /"observability"\s*:\s*\{[^}]*"logs"\s*:\s*\{[^}]*"invocation_logs"\s*:\s*false\b/.test(
    code,
  );
}

/**
 * Whether the config keeps every log line: `observability.head_sampling_rate` set to 1, and no
 * rate anywhere set to anything else (observability spec S2). A sampled log makes every count
 * `pnpm ask:status` prints wrong, and nothing would show it.
 */
export function fullSampling(jsonc: string): boolean {
  // Every `//` comment, wherever it starts on a line, but never one inside a string (a URL).
  const code = jsonc.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (m) => (m.startsWith('"') ? m : ''));
  const rates = [...code.matchAll(/"head_sampling_rate"\s*:\s*([-+0-9.eE]+)/g)].map((m) =>
    Number(m[1]),
  );
  // Directly under `observability`: a nested block such as `logs` is stepped over whole.
  const top = /"observability"\s*:\s*\{(?:[^{}]|\{[^{}]*\})*?"head_sampling_rate"\s*:/.test(code);
  return top && rates.every((rate) => rate === 1);
}

/** `--var NAME:value` pairs for the deploy. Only names this script sets. */
export function varArgs(decision: AiDecision, flags: AskFlags): string[] {
  return [
    ...(decision.value !== undefined ? ['--var', `ASK_AI_ENABLED:${decision.value}`] : []),
    ...(flags.gateway !== undefined ? ['--var', `ASK_GATEWAY_ID:${flags.gateway}`] : []),
  ];
}

/** Cloudflare's published Turnstile test keys: 1x, 2x and 3x, then zeros, then two letters. */
const TURNSTILE_TEST_KEY = /^[123]x0{20}[A-Za-z]{2}$/;

/**
 * Why this Turnstile site key must not ship, or undefined when it may. An empty key makes a drawer
 * that answers every visitor with the unavailable message, and Cloudflare's test key makes one whose
 * token any client can earn (behaviour E7).
 */
export function keyProblem(key: string): string | undefined {
  const trimmed = key.trim();
  if (trimmed === '') {
    return 'PUBLIC_TURNSTILE_SITE_KEY is empty, so the drawer would refuse every visitor';
  }
  if (TURNSTILE_TEST_KEY.test(trimmed)) {
    return "PUBLIC_TURNSTILE_SITE_KEY is Cloudflare's Turnstile test key, which any client can pass; set the production site key";
  }
  return undefined;
}

/** The same, read back from the built page: what is about to be uploaded, not what was meant. */
export function siteKeyProblem(html: string): string | undefined {
  const found = /data-site-key="([^"]*)"/.exec(html);
  // Astro leaves the attribute out when the variable is unset, so "no attribute" is "no key" too.
  if (found === null) {
    return 'the built page has no data-site-key: PUBLIC_TURNSTILE_SITE_KEY was not set when it was built, or the Ask the library panel is gone';
  }
  const problem = keyProblem(found[1] ?? '');
  return problem === undefined ? undefined : `the built page carries a bad site key: ${problem}`;
}
