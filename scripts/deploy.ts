/**
 * Publishing the shelf.
 *
 * The vault is private, local, and gitignored, so CI can never build the real
 * site — it can only ever build the fixture one. That makes deploying a local
 * operation by construction, and it means every check that runs before a deploy
 * has to run here.
 *
 * Two things this script exists to get right.
 *
 * **Order.** `gate:public` and `smoke:render` both stage a *fixture* vault into
 * `packages/site/public/`. Run either one after building from the real vault and
 * the folder holds eight invented books; deploy that and you have published the
 * fixtures. So the gates run first and the real build runs last, always, and
 * that is not a style preference — it is the difference between publishing your
 * library and publishing a test.
 *
 * **Checking the artifact, not the code path.** `gate:public` proves the code
 * cannot leak, using fixtures. It says nothing about the folder actually about
 * to be uploaded. The pre-flight below re-asserts the same properties against
 * the real `dist/` — no private books, no wishlist books, no orphan covers, no
 * note bodies, an absolute og:image — because the thing that gets published is
 * the thing worth checking.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../packages/cli/src/env.ts';

// The same loader the CLI uses, rather than a third hand-rolled `.env` parser:
// a real environment variable still wins, so `SITE_URL=... pnpm deploy` does
// what it says. Without this the script would not see STACKS_VAULT at all,
// because only the CLI was ever reading the file.
loadEnv();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'packages', 'site', 'dist');

/** Pinned: a deploy tool that silently changes under you is not a deploy tool. */
const WRANGLER = 'wrangler@4';

const dryRun = process.argv.includes('--dry-run');
const skipGates = process.argv.includes('--skip-gates');

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

/**
 * `shell: true` because pnpm is a .cmd shim on Windows. One string rather than
 * an args array, per DEP0190 — every argument here is a literal or comes from
 * the owner's own environment.
 */
function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): void {
  const line = [command, ...args].join(' ');
  console.log(`\n$ ${line}`);
  const result = spawnSync(line, {
    cwd: ROOT,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) fail(`${line} exited ${String(result.status)}`);
}

// ── 0. Everything the deploy needs, checked before anything runs ────────────
//
// SITE_URL is required rather than optional. Without it the build emits a
// relative og:image, every link-preview scraper renders nothing, and the shelf
// arrives at its one moment — being sent to someone — as a bare URL. A deploy
// that silently produces that is worse than one that refuses.
const siteUrl = process.env['SITE_URL'];
if (siteUrl === undefined || siteUrl.length === 0) {
  fail(
    'SITE_URL is not set.\n' +
      '  Cloudflare Pages serves your production branch at https://<project>.pages.dev,\n' +
      '  so set it to that (or your custom domain) in .env:\n' +
      '      SITE_URL=https://stacks.pages.dev\n' +
      '  Without it the link preview shows no image, which is the one thing it is for.',
  );
}
try {
  new URL(siteUrl);
} catch {
  fail(`SITE_URL is not a valid URL: ${siteUrl}`);
}

const vault = process.env['STACKS_VAULT'];
if (vault === undefined || vault.length === 0) fail('STACKS_VAULT is not set (see .env.example)');
if (!existsSync(vault)) fail(`STACKS_VAULT points at nothing: ${vault}`);

const project = process.env['CF_PAGES_PROJECT'] ?? 'stacks';

console.log(`deploying ${vault}`);
console.log(`        → ${siteUrl}  (Cloudflare Pages project "${project}")`);

// ── 1. The gates. These stage FIXTURE data — which is why they go first ─────
if (skipGates) {
  console.warn('\n! --skip-gates: publishing without running the contract');
} else {
  run('pnpm', ['test']);
  run('pnpm', ['run', 'typecheck']);
  run('pnpm', ['gate:public']);
  run('pnpm', ['smoke:render']);
}

// ── 2. The real build. Last, so it overwrites whatever the gates staged ─────
run('pnpm', [
  'stacks',
  'build',
  '--public',
  '--vault',
  `"${vault}"`,
  '--assets',
  'packages/site/public',
]);
run('pnpm', ['--filter', '@stacks/site', 'run', 'build'], { SITE_URL: siteUrl });

// ── 3. Pre-flight on the artifact that is actually about to be published ────
interface ShippedBook {
  readonly title: string;
  readonly cover?: string;
  readonly status?: string;
  readonly private?: boolean;
  readonly sourcePath?: string;
}

const libraryPath = join(DIST, 'library.json');
if (!existsSync(libraryPath)) fail(`no library.json in ${DIST}`);

const library = JSON.parse(readFileSync(libraryPath, 'utf8')) as { books: ShippedBook[] };
const problems: string[] = [];

if (library.books.length === 0) problems.push('library.json contains no books at all');

// The fixture vault has eight; publishing that from a deploy means the ordering
// above broke and the gates' staged data survived.
const fixtureTitles = ['The Tidal Engine', 'Compilers for the Impatient'];
if (library.books.some((book) => fixtureTitles.includes(book.title))) {
  problems.push('fixture books are in the build — the real vault build did not run last');
}

for (const book of library.books) {
  if (book.private === true) problems.push(`private book would be published: ${book.title}`);
  if (book.status === 'wishlist') problems.push(`wishlist book would be published: ${book.title}`);
  if (book.sourcePath !== undefined) problems.push(`vault path would be published: ${book.title}`);
  if (book.cover !== undefined && !/^covers\/[^/\\]+$/.test(book.cover)) {
    problems.push(`cover is not same-origin: ${book.title} → ${book.cover}`);
  }
}

const coversDir = join(DIST, 'covers');
if (existsSync(coversDir)) {
  const referenced = new Set(
    library.books
      .map((book) => book.cover)
      .filter((cover): cover is string => cover !== undefined)
      .map((cover) => cover.replace(/^covers\//, '')),
  );
  const orphans = readdirSync(coversDir).filter((name) => !referenced.has(name));
  if (orphans.length > 0) {
    problems.push(`${String(orphans.length)} orphan cover(s), named after books: ${orphans.slice(0, 3).join(', ')}`);
  }
}

const html = existsSync(join(DIST, 'index.html'))
  ? readFileSync(join(DIST, 'index.html'), 'utf8')
  : '';
if (!html.includes(`content="${siteUrl.replace(/\/$/, '')}/og.png"`)) {
  problems.push(`og:image is not absolute against ${siteUrl} — link previews will show nothing`);
}
if (!/<meta\s+name="robots"\s+content="[^"]*noindex/.test(html)) {
  problems.push('no `noindex` robots meta — the shelf would be searchable, not just shareable');
}
if (!existsSync(join(DIST, '_headers'))) {
  problems.push('_headers missing — covers and og.png would be indexable on their own');
}

if (problems.length > 0) fail(`pre-flight found ${String(problems.length)} problem(s):\n- ${problems.join('\n- ')}`);

console.log(`\npre-flight OK — ${String(library.books.length)} book(s), og:image absolute, no orphans`);

// ── 4. Upload ───────────────────────────────────────────────────────────────
if (dryRun) {
  console.log(`\n--dry-run: not uploading. ${DIST} is ready.`);
  console.log(`to publish: pnpm dlx ${WRANGLER} pages deploy packages/site/dist --project-name ${project}`);
  process.exit(0);
}

run('pnpm', [
  'dlx',
  WRANGLER,
  'pages',
  'deploy',
  'packages/site/dist',
  '--project-name',
  project,
  '--branch',
  'main',
]);

console.log(`\ndeployed → ${siteUrl}`);
