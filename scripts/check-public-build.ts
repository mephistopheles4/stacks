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
 * four things that are *its own*: checking the canary is planted in the fixture
 * vault, building from it, checking a fixture's `## Thoughts` carries the ship
 * phrase with the canary below the section, and checking that phrase reaches
 * `dist/notes/` — the last two being the Thoughts split's vacuity guard and
 * presence half, which the shared inspector must never hold because a real
 * deploy carries no fixture phrase (ADR-0028). G20 owns watching each rule go red; this owns proving a
 * real Astro build survives all of them.
 *
 * The canary is planted in several fixture note bodies *including the malformed
 * one that gets skipped*, so a pass cannot be an accident of that book being
 * dropped from the library.
 */
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import {
  inspectPublicBuild,
  NOTE_BODY_CANARY,
  notesPresence,
  THOUGHTS_SHIP_PHRASE,
} from './lib/public-build.ts';
import { PUBLISH_THOUGHTS } from '../packages/core/src/publish.ts';
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

// 1b. The split's vacuity guard: a fixture note must carry the ship phrase
// inside `## Thoughts`, with the canary below the section, or the presence
// check in step 4 proves nothing about the split (#367, decision 9). Deliberately
// crude — a line scan, not the extractor — because it reads fixtures to prove a
// case is planted, not to judge a boundary.
const planted = walk(VAULT)
  .filter((file) => extname(file) === '.md')
  .some((file) => {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const start = lines.findIndex((line) => line.trimEnd() === '## Thoughts');
    if (start === -1) return false;
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => /^#{1,2}\s/.test(line));
    if (end === -1) return false;
    return (
      rest.slice(0, end).join('\n').includes(THOUGHTS_SHIP_PHRASE) &&
      !rest.slice(0, end).join('\n').includes(NOTE_BODY_CANARY) &&
      rest.slice(end).join('\n').includes(NOTE_BODY_CANARY)
    );
  });

if (!planted) {
  console.error(
    `FAILED: no fixture note carries "${THOUGHTS_SHIP_PHRASE}" inside \`## Thoughts\` with the ` +
      'canary below the section.\nWithout it the presence check would pass no matter what the ' +
      'extractor shipped.',
  );
  process.exit(1);
}
console.log(`ship phrase planted in a fixture's Thoughts: ${THOUGHTS_SHIP_PHRASE}`);

// 2. Build for real, as a deploy would — with an origin.
//
// Set here rather than left unset because the link preview is only correct when
// the build knows where it will be served from, and a gate that builds without
// an origin cannot tell a working preview from a broken one. Inherited by the
// child process.
const CANONICAL_ORIGIN = 'https://stacks.gate.example';
process.env['SITE_URL'] = CANONICAL_ORIGIN;

// `ASSETS` is quoted because it is absolute, and an absolute path here starts
// at a home directory that may well have a space in it — `runShell` joins its
// arguments verbatim and quotes nothing. `fixtures/vault` needs none: it is a
// repo-relative literal and `cwd` is the repo root.
runShell('pnpm', [
  'stacks',
  'build',
  '--public',
  '--vault',
  'fixtures/vault',
  '--assets',
  `"${ASSETS}"`,
]);
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

// 4. The split's presence half, on the folder Astro assembled. G2 proves
// `publish()` writes the section; this proves `notes/` survives into `dist/`
// (#367, decision 4). Here and not in the inspector, which also reads real
// deploys, where no fixture phrase exists (ADR-0028).
const notesDir = join(DIST, 'notes');
const staged = (existsSync(notesDir) ? walk(notesDir) : []).map((file) => ({
  name: relative(DIST, file).split('\\').join('/'),
  text: readFileSync(file, 'utf8'),
}));

// Switched off (spec §4's undo), the stage must ship nothing, and this check
// follows it so the takedown deploy passes its own gate.
const presence = notesPresence(staged, PUBLISH_THOUGHTS);
if (presence.problem !== undefined) {
  console.error(`\nFAILED: ${presence.problem}`);
  process.exit(1);
}
console.log(presence.observation);
console.log(
  PUBLISH_THOUGHTS
    ? '\nOK — public build carries no note bodies beyond the Thoughts split, no vault paths'
    : '\nOK — public build carries no note bodies, no vault paths',
);
