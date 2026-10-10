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
import sharp from 'sharp';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import { HELD_COVER_EDGE, MAX_COVER_EDGE } from '../packages/core/src/covers/cover-budget.ts';
import { coverFileName } from '../packages/core/src/covers/cover-path.ts';
import { SHELVED_STATUSES } from '../packages/core/src/shelf-order.ts';
import {
  inspectPublicBuild,
  NOTE_BODY_CANARY,
  notesPresence,
  THOUGHTS_SHIP_PHRASE,
} from './lib/public-build.ts';
import { PUBLISH_HELD_COVERS, PUBLISH_THOUGHTS } from '../packages/core/src/publish.ts';
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

// 1c. The held tier's vacuity guard (spec §3.3, §5). Each held-tier claim this
// gate and the inspector make is about a fixture cover that would break it:
// a published cover over the held cap (the resize), a published one carrying
// EXIF or XMP (the re-encode), and a cover over the shelf cap on a private book
// and on a wishlist book (the filter). Without all four, a build that staged
// nothing, or copied everything, would pass. Read through the adapter, never
// by parsing the notes by hand (invariant 4).
console.log('\nreading fixture covers — any skip warnings below are the fixtures’ own, by design');
const vault = new ObsidianAdapter(VAULT);
const fixtureCovers = await Promise.all(
  (await vault.listBooks()).map(async (book) => {
    const name = book.cover === undefined ? '' : coverFileName(book.cover);
    const metadata =
      name === ''
        ? undefined
        : await sharp(join(vault.coverDir(), name))
            .metadata()
            .catch(() => undefined);
    return {
      title: book.title,
      name,
      published: SHELVED_STATUSES.has(book.status) && book.private !== true,
      privateBook: book.private === true,
      wishlist: book.status === 'wishlist',
      edge: metadata === undefined ? 0 : Math.max(metadata.width, metadata.height),
      carriesMetadata: metadata?.exif !== undefined || metadata?.xmp !== undefined,
    };
  }),
);
const wantHeld = fixtureCovers.filter((cover) => cover.published && cover.edge > MAX_COVER_EDGE);
const mustNotHold = fixtureCovers.filter(
  (cover) => !cover.published && cover.edge > MAX_COVER_EDGE,
);
const heldCases: readonly (readonly [string, boolean])[] = [
  [
    `a published cover over the ${String(HELD_COVER_EDGE)}px held cap`,
    wantHeld.some((cover) => cover.edge > HELD_COVER_EDGE),
  ],
  [
    'a published cover over the shelf cap carrying EXIF or XMP',
    wantHeld.some((cover) => cover.carriesMetadata),
  ],
  [
    'a private book with a cover over the shelf cap',
    mustNotHold.some((cover) => cover.privateBook),
  ],
  ['a wishlist book with a cover over the shelf cap', mustNotHold.some((cover) => cover.wishlist)],
];
const unplanted = heldCases.filter(([, present]) => !present).map(([what]) => what);
if (unplanted.length > 0) {
  console.error(
    `FAILED: the fixture vault holds no ${unplanted.join('; no ')}.\nWithout each one the ` +
      'held-tier checks would pass no matter what the build staged.',
  );
  process.exit(1);
}
console.log(
  `held-tier cases planted: ${String(wantHeld.length)} published cover(s) over ` +
    `${String(MAX_COVER_EDGE)}px, ${String(mustNotHold.length)} held back`,
);

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
const report = await inspectPublicBuild(DIST, { origin: CANONICAL_ORIGIN });

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
// No early exit when it is off: the held tier's checks below must still run.
const presence = notesPresence(staged, PUBLISH_THOUGHTS);
if (presence.problem !== undefined) {
  console.error(`\nFAILED: ${presence.problem}`);
  process.exit(1);
}
console.log(presence.observation);

// 5. The held tier's presence half, and the filter. The inspector held every
// file in `held-covers/` to the cap, to no metadata and to a book that names
// it; this proves each published cover over the shelf cap got its copy, named
// by its book, and that the private and wishlist books' covers got none.
// Here and not in the inspector, which cannot know which vault built the folder.
const heldDir = join(DIST, 'held-covers');
const shippedBooks = (
  JSON.parse(readFileSync(join(DIST, 'library.json'), 'utf8')) as {
    books: { title: string; heldCover?: unknown }[];
  }
).books;
// Switched off (spec §4's undo), the stage must ship no copy and name none,
// and this follows it so the takedown deploy passes its own gate.
const heldFailures = PUBLISH_HELD_COVERS
  ? [
      ...wantHeld
        .filter(
          (cover) =>
            !existsSync(join(heldDir, cover.name)) ||
            shippedBooks.find((book) => book.title === cover.title)?.heldCover !==
              `held-covers/${cover.name}`,
        )
        .map((cover) => `no held copy staged and named for "${cover.title}" (${cover.name})`),
      ...mustNotHold
        .filter((cover) => existsSync(join(heldDir, cover.name)))
        .map((cover) => `a held copy shipped for a book held back: ${cover.name}`),
    ]
  : [
      ...(existsSync(heldDir) ? walk(heldDir) : []).map(
        (file) =>
          `the held stage is switched off, yet ${relative(DIST, file).split('\\').join('/')} shipped`,
      ),
      ...shippedBooks
        .filter((book) => book.heldCover !== undefined)
        .map((book) => `the held stage is switched off, yet "${book.title}" names a held copy`),
    ];
if (heldFailures.length > 0) {
  console.error(`\nFAILED: the held tier\n- ${heldFailures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  PUBLISH_HELD_COVERS
    ? `${String(wantHeld.length)} held copy file(s) staged and named; none for the ` +
        `${String(mustNotHold.length)} held back`
    : 'held stage switched off: dist/held-covers/ holds no file and no book names one',
);

console.log(
  (PUBLISH_THOUGHTS
    ? '\nOK — public build carries no note bodies beyond the Thoughts split, no vault paths, '
    : '\nOK — public build carries no note bodies, no vault paths, ') +
    (PUBLISH_HELD_COVERS
      ? `and a held copy for every published cover over ${String(MAX_COVER_EDGE)}px`
      : 'and no held copy'),
);
