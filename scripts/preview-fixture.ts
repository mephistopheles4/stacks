/**
 * `pnpm preview:fixture` — the fixture site on a Cloudflare Pages preview branch (room spec S13.4).
 *
 *     pnpm preview:fixture                    the room, as built, for the real `_headers`, size and Safari rows
 *     pnpm preview:fixture --probe            the confinement probe at the worker's path
 *     pnpm preview:fixture --probe --control  the same with the worker's policy loosened: must come back red
 *     pnpm preview:fixture --dry-run          build and judge, print the command, upload nothing
 *     pnpm preview:fixture --delete           delete the preview branch's preview deployments
 *
 * It builds the 50-book fixture vault into a scratch `dist/` of its own, runs G20's rules and the
 * fixture-marker check on it, and uploads **only that folder**, never `packages/site/dist`, never a
 * real vault. The branch is a constant (`PREVIEW_BRANCH`) and the command refuses `main` and the
 * project's production branch. A preview is a public address: read it, then `--delete`.
 *
 * The upload runs the wrangler the lockfile holds, through `pnpm exec` (G67), refuses one that is
 * not the pin, and gives wrangler an environment without any `.env` key or BrowserStack variable
 * (`uploadEnv`). It is the owner's to run (S17). See `docs/commands.md`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../packages/cli/src/env.ts';
import { browserstackRootRefusalsOnDisk } from './lib/browserstack-key.ts';
import { writeProbe } from './lib/confinement-probe.ts';
import { buildFixtureDist, judgeFixtureDist, runScratch } from './lib/fixture-dist.ts';
import {
  branchRefusal,
  parsePreviewArgs,
  PREVIEW_BRANCH,
  previewDeploymentIds,
  projectRefusal,
} from './lib/preview-fixture.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { runShell, shellCommand } from './lib/run.ts';
import { INSTALLED_MANIFEST, pinIn, pinMismatch, uploadEnv, versionIn } from './lib/upload.ts';

const loadedEnvKeys = loadEnv();

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

// The BrowserStack key never rests where wrangler reads it (S13.6). No flag clears this.
const keyInRootEnv = browserstackRootRefusalsOnDisk();
if (keyInRootEnv.length > 0) fail(keyInRootEnv.join('\n'));

const args = parsePreviewArgs(process.argv.slice(2));
if (typeof args === 'string') fail(args);

// The branch is a constant and is checked here, where it is used: no flag clears this.
const branchProblem = branchRefusal(PREVIEW_BRANCH);
if (branchProblem !== undefined) fail(branchProblem);

const project = process.env['CF_PAGES_PROJECT'] ?? 'stacks';
const projectProblem = projectRefusal(project);
if (projectProblem !== undefined) fail(projectProblem);

// The lockfile's wrangler, never another off the PATH. No flag clears this (ADR-0116).
const readIfThere = (file: string): string | undefined =>
  existsSync(file) ? readFileSync(file, 'utf8') : undefined;
const wranglerPin = pinIn(readIfThere(join(REPO_ROOT, 'package.json')));
const wranglerInstalled = versionIn(readIfThere(join(REPO_ROOT, ...INSTALLED_MANIFEST)));
const wranglerRefusal = pinMismatch(wranglerInstalled, wranglerPin);
if (wranglerRefusal !== undefined) fail(wranglerRefusal);

if (args.remove) {
  // Only the preview branch's own preview deployments: the list is read, and every id it names is
  // checked against the branch and the environment before anything is deleted.
  // Wrangler's list is one request with no page argument, so a project with more previews than a
  // page holds shows only the first. List again after each round of deletions, up to a limit, until
  // none of this branch's previews is left; fail if some remain.
  const listIds = (): string[] => {
    const listed = spawnSync(
      shellCommand('pnpm', [
        'exec',
        'wrangler',
        'pages',
        'deployment',
        'list',
        '--project-name',
        project,
        '--environment',
        'preview',
        '--json',
      ]),
      {
        cwd: REPO_ROOT,
        shell: true,
        encoding: 'utf8',
        env: uploadEnv(process.env, loadedEnvKeys),
      },
    );
    if (listed.status !== 0) fail('could not list the preview deployments');
    const ids = previewDeploymentIds(listed.stdout);
    if (ids === undefined)
      fail('the deployment list is not in the shape wrangler prints; nothing more was deleted');
    return ids;
  };
  const ROUNDS = 10;
  for (let round = 1; round <= ROUNDS + 1; round += 1) {
    const ids = listIds();
    console.log(`${String(ids.length)} preview deployment(s) on ${PREVIEW_BRANCH}`);
    if (ids.length === 0) break;
    if (round > ROUNDS)
      fail(`previews of ${PREVIEW_BRANCH} are still listed after ${String(ROUNDS)} rounds`);
    for (const id of ids) {
      runShell(
        'pnpm',
        [
          'exec',
          'wrangler',
          'pages',
          'deployment',
          'delete',
          id,
          '--project-name',
          project,
          '--force',
        ],
        { wholeEnv: uploadEnv(process.env, loadedEnvKeys) },
      );
    }
  }
  process.exit(0);
}

const scratchRun = runScratch('preview');
const scratch = scratchRun.dist;
// A dry run leaves its folder to be looked at; any other run removes it on exit.
if (!args.dryRun) process.on('exit', scratchRun.remove);
buildFixtureDist(scratch);
const judged = await judgeFixtureDist(scratch);
for (const line of judged.lines) console.log(line);
if (!judged.ok) fail('the fixture build is not uploadable; nothing is uploaded');

// The probe goes in after G20 has passed on the folder, and into this scratch copy alone.
if (args.probe) {
  writeProbe(scratch, args.control);
  console.log(
    args.control
      ? 'the probe is at the worker path with the worker policy loosened: it must come back red'
      : 'the probe is at the worker path, under the worker policy',
  );
}

if (args.dryRun) {
  console.log(`\n--dry-run: not uploading. ${scratch} is ready.`);
  console.log(
    `checked: the installed wrangler is ${wranglerInstalled ?? 'missing'}, equal to its pin`,
  );
  // G67 holds this file to printing the wrangler command, as the deploys do. It is not the one to
  // run by hand: a shell that holds a BrowserStack key would hand it to wrangler, which the command
  // below does not (root `.env` refusal, `uploadEnv`, installed-version check).
  console.log(
    `to publish: pnpm exec wrangler pages deploy ${scratch} --project-name ${project} --branch ${PREVIEW_BRANCH}`,
  );
  const switches = [args.probe ? ' --probe' : '', args.control ? ' --control' : ''].join('');
  console.log(`to publish with its guards, run: pnpm preview:fixture${switches}`);
  process.exit(0);
}

run();

function run(): void {
  // The upload, and the last refusal in the file: a failing `wrangler` stops the run here.
  runShell(
    'pnpm',
    [
      'exec',
      'wrangler',
      'pages',
      'deploy',
      `"${scratch}"`,
      '--project-name',
      project,
      '--branch',
      PREVIEW_BRANCH,
    ],
    { wholeEnv: uploadEnv(process.env, loadedEnvKeys) },
  );
  console.log(
    '\nuploaded to a preview. Read it, then `pnpm preview:fixture --delete`: a preview is a public address.',
  );
}
