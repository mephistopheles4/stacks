/**
 * Publishing the Ask the library Worker (docs/spec/ask-the-library.md S8).
 *
 * Owner-run, and the same shape as `deploy.ts`'s upload: main only, the
 * lockfile's wrangler refused unless it matches its pin, and an environment
 * narrowed to wrangler's own names. It never touches the site; run it before
 * `deploy:site`.
 *
 *   pnpm deploy:ask               deploy the Worker, leaving AI as it is live
 *   pnpm deploy:ask --dry-run     bundle and check, upload nothing
 *   pnpm deploy:ask --ai-off      deploy with AI off, with no commit (S5)
 *   pnpm deploy:ask --ai-on       deploy with AI on, over a switched-off Worker
 *   pnpm deploy:ask --gateway <id>  deploy main against a test gateway, for C7 only
 *   pnpm deploy:ask --any-branch  deliberately publish a branch other than main
 *
 * Which flags clear which refusal is stated beside each, as in `deploy.ts`.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from '../packages/cli/src/env.ts';
import {
  bundleLeaks,
  decideAi,
  fullSampling,
  invocationLogsOff,
  parseAskArgs,
  varArgs,
} from './lib/ask-deploy.ts';
import { readLiveAi } from './lib/ask-live.ts';
import { gitOutput } from './lib/git.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { runShell } from './lib/run.ts';
import { INSTALLED_MANIFEST, pinIn, pinMismatch, uploadEnv, versionIn } from './lib/upload.ts';

const loadedEnvKeys = loadEnv();
const CONFIG = 'packages/ask/wrangler.jsonc';

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

const parsed = parseAskArgs(process.argv.slice(2));
if ('refusal' in parsed) fail(parsed.refusal);
const flags = parsed;

// Refuses to publish anything but `main`. Cleared by `--any-branch`, and not
// reached under `--dry-run`, which uploads nothing.
if (!flags.dryRun) {
  if (flags.anyBranch) {
    console.log('--any-branch: publishing a branch other than main, deliberately');
  } else {
    const branch = gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], REPO_ROOT);
    if (branch !== undefined && branch !== 'main') {
      fail(
        `on branch "${branch === 'HEAD' ? 'a detached HEAD' : branch}", not main.\n` +
          '  Merge first, or say so on purpose:\n      pnpm deploy:ask --any-branch',
      );
    }
  }
}

// The upload runs the wrangler the lockfile holds, through `pnpm exec`, and
// refuses one that is not the pin: no flag clears this. G67 holds this file to
// that one form. See ADR-0116.
const readIfThere = (file: string): string | undefined =>
  existsSync(file) ? readFileSync(file, 'utf8') : undefined;
const wranglerPin = pinIn(readIfThere(join(REPO_ROOT, 'package.json')));
const wranglerInstalled = versionIn(readIfThere(join(REPO_ROOT, ...INSTALLED_MANIFEST)));
const wranglerRefusal = pinMismatch(wranglerInstalled, wranglerPin);
if (wranglerRefusal !== undefined) fail(wranglerRefusal);
console.log(
  `checked: the installed wrangler is ${wranglerInstalled ?? 'missing'}, equal to its pin`,
);

// C15: Cloudflare's own per-request records stay off. No flag clears this.
const config = readIfThere(join(REPO_ROOT, CONFIG));
if (config === undefined || !invocationLogsOff(config)) {
  fail(`${CONFIG} does not pin observability.logs.invocation_logs to false`);
}
console.log('checked: observability.logs.invocation_logs is false');

// Every line kept, so ask:status counts the day and not a sample of it. No flag clears this.
if (!fullSampling(config)) {
  fail(`${CONFIG} does not pin observability.head_sampling_rate to 1`);
}
console.log('checked: observability.head_sampling_rate is 1');

// The AI switch (S5). A dry run reads nothing live: it uploads nothing, so it
// cannot undo anything. Every other path reads the live value first, and
// `--ai-off` and `--ai-on` say what they want without it.
const env = uploadEnv(process.env, loadedEnvKeys);
const live = flags.dryRun || flags.aiOff || flags.aiOn ? 'none' : readLiveAi(env);
const decision = decideAi(flags, live);
if (decision.refusal !== undefined) fail(decision.refusal);
if (flags.gateway !== undefined) {
  console.log(
    `--gateway: deploying against ${flags.gateway}; a plain deploy:ask puts the real one back`,
  );
}

const outdir = flags.dryRun ? mkdtempSync(join(tmpdir(), 'ask-bundle-')) : undefined;
try {
  runShell(
    'pnpm',
    [
      'exec',
      'wrangler',
      'deploy',
      '--config',
      CONFIG,
      ...varArgs(decision, flags),
      ...(outdir === undefined ? [] : ['--dry-run', '--outdir', outdir]),
    ],
    { wholeEnv: env },
  );

  if (outdir !== undefined) {
    // C15: the vault path appears nowhere in what would be uploaded.
    const bundles = new Map(
      readdirSync(outdir)
        .filter((name) => /\.(?:js|mjs|map)$/.test(name))
        .map((name) => [name, readFileSync(join(outdir, name), 'utf8')] as const),
    );
    if (bundles.size === 0) fail('the dry run wrote no bundle to check');
    const vaults = [process.env['STACKS_VAULT'] ?? '', REPO_ROOT];
    const leaks = bundleLeaks(bundles, vaults);
    if (leaks.length > 0) fail(leaks.join('\n'));
    console.log(`checked: ${String(bundles.size)} bundle file(s) hold no vault or checkout path`);
    console.log('\n--dry-run: not uploading.');
    // Not `wrangler deploy`: only this script reads the live off switch, and a bare deploy would
    // put `ASK_AI_ENABLED: "true"` back (S5).
    console.log('to publish: pnpm deploy:ask');
  } else {
    console.log('\ndeployed the Ask the library Worker');
  }
} finally {
  if (outdir !== undefined) rmSync(outdir, { recursive: true, force: true });
}
