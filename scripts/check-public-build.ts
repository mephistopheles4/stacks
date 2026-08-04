/**
 * The Phase 3 gate: prove the public build leaks nothing.
 *
 *     pnpm gate:public
 *
 * Inspects the **built folder**, not `library.json`. The JSON is already
 * asserted in unit tests; what matters here is what actually ships, including
 * anything Astro inlined into HTML or a bundle along the way.
 *
 * The rules themselves live in `scripts/lib/public-build.ts`, because
 * `deploy:site` has to apply exactly the same ones to the real build and the
 * two had already drifted apart while nobody could see it. This script owns the
 * two things that are *its own*: planting the canary in a fixture vault and
 * building from it. G20 owns watching each rule go red; this owns proving a
 * real Astro build survives all of them.
 *
 * The canary is planted in several fixture note bodies *including the malformed
 * one that gets skipped*, so a pass cannot be an accident of that book being
 * dropped from the library.
 */
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { inspectPublicBuild, NOTE_BODY_CANARY } from './lib/public-build.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { runShell } from './lib/run.ts';
import { walk } from './lib/walk.ts';

const VAULT = join(REPO_ROOT, 'fixtures', 'vault');
const ASSETS = join(REPO_ROOT, 'packages', 'site', 'public');
const DIST = join(REPO_ROOT, 'packages', 'site', 'dist');

// 1. The canary has to actually be in the source vault, or this gate proves
// nothing. This is the half `inspectPublicBuild` cannot check: it is handed a
// built folder and has no idea which vault produced it, or whether that vault
// ever contained the thing the search is for.
const vaultText = walk(VAULT)
  .filter((file) => extname(file) === '.md')
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

if (!vaultText.includes(NOTE_BODY_CANARY)) {
  console.error(
    `FAILED: the canary "${NOTE_BODY_CANARY}" is not in any fixture note body.\n` +
      'Without it this gate would pass no matter what the build contained.',
  );
  process.exit(1);
}
console.log(`canary present in fixture vault: ${NOTE_BODY_CANARY}`);

// 2. Build for real, as a deploy would — with an origin.
//
// Set here rather than left unset because the link preview is only correct when
// the build knows where it will be served from, and a gate that builds without
// an origin cannot tell a working preview from a broken one. Inherited by the
// child process.
const CANONICAL_ORIGIN = 'https://stacks.gate.example';
process.env['SITE_URL'] = CANONICAL_ORIGIN;

runShell('pnpm', ['stacks', 'build', '--public', '--vault', 'fixtures/vault', '--assets', ASSETS]);
runShell('pnpm', ['--filter', '@stacks/site', 'run', 'build']);

if (!existsSync(DIST)) {
  console.error(`FAILED: no build output at ${DIST}`);
  process.exit(1);
}

// 3. Every rule, against the folder that Astro actually assembled.
const report = inspectPublicBuild(DIST, { origin: CANONICAL_ORIGIN });

for (const observation of report.observations) console.log(observation);
console.log(`inspected ${relative(REPO_ROOT, DIST).split('\\').join('/')}`);

if (report.problems.length > 0) {
  console.error(
    `\nFAILED\n- ${report.problems.map((problem) => `[${problem.rule}] ${problem.message}`).join('\n- ')}`,
  );
  process.exit(1);
}

console.log('\nOK — public build carries no note bodies, no vault paths');
