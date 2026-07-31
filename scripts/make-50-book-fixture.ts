/**
 * Generates a 50-book vault for the Phase 2 render gate.
 *
 * Not committed — it is derived from the same shapes as `fixtures/vault`, and
 * committing 50 generated notes plus 50 covers would bloat the repo for
 * something a script can rebuild in a second.
 *
 *     pnpm tsx scripts/make-50-book-fixture.ts
 *
 * Output: fixtures/vault-50/ (gitignored)
 */
import { mkdirSync, rmSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_COVERS = join(ROOT, 'fixtures', 'vault', 'Library', 'covers');
const OUT = join(ROOT, 'fixtures', 'vault-50');
const OUT_LIBRARY = join(OUT, 'Library');
const OUT_COVERS = join(OUT_LIBRARY, 'covers');

const BOOK_COUNT = 50;

/** Deterministic — the render gate must produce the same shelf every run. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const FIRST = ['Tidal', 'Quiet', 'Salt', 'Lantern', 'Signal', 'Warehouse', 'Compiler', 'Sediment', 'Harbour', 'Ember', 'Glass', 'Iron', 'Paper', 'River', 'Northern'];
const SECOND = ['Engine', 'Protocol', 'Ledger', 'Work', 'Road', 'Atlas', 'Notebook', 'Almanac', 'Machine', 'Garden', 'Archive', 'Circuit'];
const SUBTITLE = ['A Field Guide', 'Notes on Craft', 'An Investigation', 'Essays', 'A Primer', 'Selected Writings'];
const SURNAME = ['Vane', 'Roy', 'Ness', 'Solberg', 'Iglesias', 'Okonkwo', 'Whitlock', 'Ferreira', 'Lindqvist', 'Petrov', 'Haddad', 'Novak'];
const GIVEN = ['Marisol', 'Dev', 'Halvard', 'Ingrid', 'Tomás', 'Beatrix', 'Ada', 'Bo', 'Greta', 'Ivan', 'Farida', 'Emil'];
const TAGS = ['nonfiction', 'fiction', 'essays', 'history', 'programming', 'ecology', 'craft'];

const random = makeRandom(20260731);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT_COVERS, { recursive: true });

const covers = readdirSync(SOURCE_COVERS).filter(
  (file) => file.endsWith('.png') && !file.startsWith('all-white') && !file.startsWith('white-bordered'),
);
for (const cover of covers) {
  copyFileSync(join(SOURCE_COVERS, cover), join(OUT_COVERS, cover));
}

const used = new Set<string>();
let written = 0;

for (let i = 0; written < BOOK_COUNT; i += 1) {
  const hasSubtitle = random() < 0.35;
  const title =
    `${pick(FIRST)} ${pick(SECOND)}` + (hasSubtitle ? `: ${pick(SUBTITLE)}` : '');
  if (used.has(title)) continue;
  used.add(title);

  const author = `${pick(GIVEN)} ${pick(SURNAME)}`;
  const roll = random();

  // Roughly the real mix: mostly read, a few in progress, a couple parked.
  const status = roll < 0.78 ? 'read' : roll < 0.88 ? 'reading' : roll < 0.95 ? 'wishlist' : 'abandoned';

  // Spread across four years so year-grouping has real rows to build.
  const year = 2023 + Math.floor(random() * 4);
  const month = String(1 + Math.floor(random() * 12)).padStart(2, '0');
  const day = String(1 + Math.floor(random() * 28)).padStart(2, '0');

  // ~15% have no cover, exercising the generated fallback spine at scale.
  const cover = random() < 0.15 ? undefined : pick(covers);

  const lines = ['---', 'type: book', `title: "${title}"`, `author: "${author}"`, `status: ${status}`];
  if (status === 'read' || status === 'abandoned') lines.push(`started: ${year}-${month}-${day}`);
  if (status === 'read') lines.push(`finished: ${year}-${month}-${day}`);
  if (status === 'read' && random() < 0.7) lines.push(`rating: ${1 + Math.floor(random() * 5)}`);
  if (cover !== undefined) lines.push(`cover: covers/${cover}`);
  lines.push(`pages: ${120 + Math.floor(random() * 640)}`);
  lines.push(`tags: [${pick(TAGS)}]`);
  lines.push('---', '', '## Notes', '', 'NOTE_BODY_CANARY_do_not_ship', '');

  const filename = title.replace(/[\\/:*?"<>|]/g, '') + '.md';
  writeFileSync(join(OUT_LIBRARY, filename), lines.join('\n'), 'utf8');
  written += 1;
}

console.log(`${written} books written to ${OUT}`);
console.log(`${covers.length} covers copied`);
