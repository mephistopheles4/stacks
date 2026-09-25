/**
 * Generates a 50-book vault for the Phase 2 render gate — or N books.
 *
 * Not committed — it is derived from the same shapes as `fixtures/vault`, and
 * committing 50 generated notes plus 50 covers would bloat the repo for
 * something a script can rebuild in a second.
 *
 *     pnpm fixtures:50                 → fixtures/vault-50/
 *     pnpm fixtures:50 --books 300     → fixtures/vault-300/
 *
 * Output: fixtures/vault-N/ (gitignored). Every title, author and cover is
 * invented; the only images are the generated ones in `fixtures/vault/`.
 *
 * **Past the first 50, a book has no cover.** The same seed and loop, so the
 * first 50 books of any size are the 50-book vault exactly. The books after
 * them exist to make the bookcase tall — G60 (`one-shadow-reader`) holds its
 * draws constant at any library size — and a cover each would be about 1.1 MB
 * of decoded texture apiece (`cover-budget.ts`), past G15's budget, which the
 * 200-book target is documented as not meant to fit. The 50-book page is where
 * covers are drawn.
 */
import { mkdirSync, rmSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// By path, as every other script here reaches into core: `scripts/` is outside
// the workspace's package graph and does not resolve the package name.
import { spineColour } from '../packages/core/src/covers/dominant-colour.ts';
import { REPO_ROOT } from './lib/repo-root.ts';

/** `--books N`: a whole number of at least 1. Anything else is refused, not defaulted. */
function bookCount(argv: readonly string[]): number {
  const at = argv.indexOf('--books');
  if (at === -1) return 50;
  const requested = Number(argv[at + 1]);
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error(`--books needs a whole number of books, not "${String(argv[at + 1])}"`);
  }
  return requested;
}

const BOOK_COUNT = bookCount(process.argv.slice(2));
/** Books with a chance of a cover; every one after these is coverless. */
const COVERED = 50;

const SOURCE_COVERS = join(REPO_ROOT, 'fixtures', 'vault', 'Library', 'covers');
const OUT = join(REPO_ROOT, 'fixtures', `vault-${String(BOOK_COUNT)}`);
const OUT_LIBRARY = join(OUT, 'Library');
const OUT_COVERS = join(OUT_LIBRARY, 'covers');

/** Deterministic — the render gate must produce the same shelf every run. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const FIRST = [
  'Tidal',
  'Quiet',
  'Salt',
  'Lantern',
  'Signal',
  'Warehouse',
  'Compiler',
  'Sediment',
  'Harbour',
  'Ember',
  'Glass',
  'Iron',
  'Paper',
  'River',
  'Northern',
];
const SECOND = [
  'Engine',
  'Protocol',
  'Ledger',
  'Work',
  'Road',
  'Atlas',
  'Notebook',
  'Almanac',
  'Machine',
  'Garden',
  'Archive',
  'Circuit',
];
const SUBTITLE = [
  'A Field Guide',
  'Notes on Craft',
  'An Investigation',
  'Essays',
  'A Primer',
  'Selected Writings',
];
const SURNAME = [
  'Vane',
  'Roy',
  'Ness',
  'Solberg',
  'Iglesias',
  'Okonkwo',
  'Whitlock',
  'Ferreira',
  'Lindqvist',
  'Petrov',
  'Haddad',
  'Novak',
];
const GIVEN = [
  'Marisol',
  'Dev',
  'Halvard',
  'Ingrid',
  'Tomás',
  'Beatrix',
  'Ada',
  'Bo',
  'Greta',
  'Ivan',
  'Farida',
  'Emil',
];
const TAGS = ['nonfiction', 'fiction', 'essays', 'history', 'programming', 'ecology', 'craft'];

const random = makeRandom(20260731);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT_COVERS, { recursive: true });

const covers = readdirSync(SOURCE_COVERS).filter(
  (file) =>
    file.endsWith('.png') && !file.startsWith('all-white') && !file.startsWith('white-bordered'),
);
for (const cover of covers) {
  copyFileSync(join(SOURCE_COVERS, cover), join(OUT_COVERS, cover));
}

/**
 * Every cover's spine colour, sampled the way a real vault's would be.
 *
 * `stacks add` extracts this from the strip of artwork nearest the binding and
 * writes it into the note; this generator writes notes directly, so without it
 * every fixture book fell through to `fallbackColour(id)` — a palette keyed off
 * the book's id with **no relationship to the cover beside it**. The fixture
 * therefore showed blue covers on maroon spines, which a real shelf never does,
 * and it is the instrument everyone inspects.
 *
 * Sampled through core's own `spineColour`, not a copy of its rule: a fixture
 * that models the extraction slightly differently is a fixture that agrees with
 * the shelf right up until the moment it matters.
 *
 * Books with **no** cover still get no `spine_color`, which is not an oversight —
 * ~15% of these are deliberately coverless, and the fallback palette is exactly
 * what should happen when there is nothing to sample.
 */
const spineColours = new Map<string, string>();
for (const cover of covers) {
  const colour = await spineColour(join(OUT_COVERS, cover));
  if (colour !== undefined) spineColours.set(cover, colour);
}

const used = new Set<string>();
let written = 0;

for (let i = 0; written < BOOK_COUNT; i += 1) {
  const hasSubtitle = random() < 0.35;
  const title = `${pick(FIRST)} ${pick(SECOND)}` + (hasSubtitle ? `: ${pick(SUBTITLE)}` : '');
  if (used.has(title)) continue;
  used.add(title);

  const author = `${pick(GIVEN)} ${pick(SURNAME)}`;
  const roll = random();

  // Roughly the real mix: mostly read, a few in progress, a couple parked.
  const status =
    roll < 0.78 ? 'read' : roll < 0.88 ? 'reading' : roll < 0.95 ? 'wishlist' : 'abandoned';

  // Spread across four years so year-grouping has real rows to build.
  const year = 2023 + Math.floor(random() * 4);
  const month = String(1 + Math.floor(random() * 12)).padStart(2, '0');
  const day = String(1 + Math.floor(random() * 28)).padStart(2, '0');

  // ~15% have no cover, exercising the generated fallback spine at scale. The
  // dice are still thrown past the first 50, so no draw moves for the books
  // before them; the cover is dropped after the throw.
  const thrown = random() < 0.15 ? undefined : pick(covers);
  const cover = written < COVERED ? thrown : undefined;

  const lines = [
    '---',
    'type: book',
    `title: "${title}"`,
    `author: "${author}"`,
    `status: ${status}`,
  ];
  if (status === 'read' || status === 'abandoned') lines.push(`started: ${year}-${month}-${day}`);
  if (status === 'read') lines.push(`finished: ${year}-${month}-${day}`);
  if (status === 'read' && random() < 0.7) lines.push(`rating: ${1 + Math.floor(random() * 5)}`);
  if (cover !== undefined) {
    lines.push(`cover: covers/${cover}`);
    const colour = spineColours.get(cover);
    if (colour !== undefined) lines.push(`spine_color: "${colour}"`);
  }
  lines.push(`pages: ${120 + Math.floor(random() * 640)}`);
  lines.push(`tags: [${pick(TAGS)}]`);

  /**
   * Contributor ids on most books, and none at all on some.
   *
   * ⚠️ **Without these the fixture shelf could not render a provider mark**, so
   * G35 — which is the only thing that looks at a real card in a real browser —
   * only ever saw the one text search link that a book with no identifier falls
   * back to. The marks are the row's normal state and were the part nothing
   * exercised.
   *
   * The values are invented and must still pass the parser's shape checks, which
   * is a second thing this covers: a fixture that quietly failed those would
   * produce a linkless card and look like a rendering bug.
   *
   * ~20% are left bare so the fallback keeps its coverage too. Both states are
   * real — 6 of the owner's 41 books have no ISBN.
   */
  const identified = random() < 0.8;
  if (identified) {
    const n = 1 + Math.floor(random() * 8999);
    lines.push(`isbn: "978${String(1000000000 + n * 7).slice(0, 10)}"`);
    lines.push(
      `google_volume_id: ${'ABCDEFGHJKLMNPQRSTUVWXYZ'[n % 24]}${String(n).padStart(6, '0')}QBAJ`,
    );
    lines.push(`apple_track_id: ${String(1000000000 + n)}`);
    lines.push(`openlibrary_olid: OL${String(20000000 + n)}M`);
    lines.push(`publisher: "${pick(['Meridian House', 'Coldwater Press', 'Underhill & Sons'])}"`);
    lines.push(`published: ${year}-${month}-${day}`);
    lines.push(`subjects: "${pick(TAGS)}; ${pick(TAGS)}"`);
  }

  lines.push('---', '', '## Notes', '', 'NOTE_BODY_CANARY_do_not_ship', '');

  const filename = title.replace(/[\\/:*?"<>|]/g, '') + '.md';
  writeFileSync(join(OUT_LIBRARY, filename), lines.join('\n'), 'utf8');
  written += 1;
}

console.log(`${written} books written to ${OUT}`);
console.log(`${covers.length} covers copied`);
