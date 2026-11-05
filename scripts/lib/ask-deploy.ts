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

/** `--var NAME:value` pairs for the deploy. Only names this script sets. */
export function varArgs(decision: AiDecision, flags: AskFlags): string[] {
  return [
    ...(decision.value !== undefined ? ['--var', `ASK_AI_ENABLED:${decision.value}`] : []),
    ...(flags.gateway !== undefined ? ['--var', `ASK_GATEWAY_ID:${flags.gateway}`] : []),
  ];
}
