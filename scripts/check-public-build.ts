/**
 * The Phase 3 gate: prove the public build leaks nothing.
 *
 *     pnpm gate:public
 *
 * Greps the **built folder**, not `library.json`. The JSON is already asserted
 * in unit tests; what matters here is what actually ships, including anything
 * Astro inlined into HTML or a bundle along the way.
 *
 * The canary is planted in several fixture note bodies *including the malformed
 * one that gets skipped*, so a pass cannot be an accident of that book being
 * dropped from the library.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = join(ROOT, 'fixtures', 'vault');
const ASSETS = join(ROOT, 'packages', 'site', 'public');
const DIST = join(ROOT, 'packages', 'site', 'dist');

const CANARY = 'NOTE_BODY_CANARY_do_not_ship';

/** Things that would give away the shape of the vault. */
const FORBIDDEN: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  { what: 'note body text', pattern: new RegExp(CANARY) },
  { what: 'a vault note path', pattern: /Library\/[^"'\s]*\.md/ },
  { what: 'the sourcePath field', pattern: /"sourcePath"/ },
];

/** Binary assets are covers and the OG image; no text to leak. */
const TEXTUAL = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map', '.xml']);

/**
 * `shell: true` because `pnpm` is a `.cmd` shim on Windows and will not spawn
 * without one. Node deprecates passing an args *array* alongside it (DEP0190),
 * since the two are concatenated rather than escaped — so the command is built
 * as one string here. Every argument is a literal in this file; none comes from
 * a vault, an argv or an environment variable.
 */
function run(command: string, args: readonly string[]): void {
  const line = [command, ...args].join(' ');
  const result = spawnSync(line, { cwd: ROOT, shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${line} exited ${String(result.status)}`);
  }
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}

// 1. The canary has to actually be in the source vault, or this gate proves nothing.
const vaultText = walk(VAULT)
  .filter((file) => extname(file) === '.md')
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

if (!vaultText.includes(CANARY)) {
  console.error(
    `FAILED: the canary "${CANARY}" is not in any fixture note body.\n` +
      'Without it this gate would pass no matter what the build contained.',
  );
  process.exit(1);
}
console.log(`canary present in fixture vault: ${CANARY}`);

// 2. Build for real.
run('pnpm', ['stacks', 'build', '--public', '--vault', 'fixtures/vault', '--assets', ASSETS]);
run('pnpm', ['--filter', '@stacks/site', 'run', 'build']);

if (!existsSync(DIST)) {
  console.error(`FAILED: no build output at ${DIST}`);
  process.exit(1);
}

// 3. Grep everything that shipped.
const failures: string[] = [];
let scanned = 0;

for (const file of walk(DIST)) {
  if (!TEXTUAL.has(extname(file))) continue;
  scanned += 1;

  const contents = readFileSync(file, 'utf8');
  for (const { what, pattern } of FORBIDDEN) {
    const hit = pattern.exec(contents);
    if (hit !== null) {
      failures.push(`${relative(ROOT, file)} contains ${what}: ${JSON.stringify(hit[0].slice(0, 80))}`);
    }
  }
}

// 4. Every cover that shipped is one a shipped book points at.
//
// The grep above reads the *contents* of *text* files, so it opens no JPEG and
// inspects no filename. That is precisely the hole the staging folder fell
// through: build from a real vault, then run this gate — which stages the
// fixture vault into the same folder — and the real covers used to survive,
// each filename a slug of a real book title, while this reported the build
// clean. `publish()` now prunes, and gates/public-build.test.ts asserts that.
//
// This asserts it again on `dist/`, because that is the folder that gets
// deployed and it is assembled by `astro build`, not by `publish()`. A gate
// that only checks the code path would stay green if a stale `dist/` survived
// or Astro ever copied something extra — which is the same "test the artifact,
// not the code" argument that put this gate on the built folder to begin with.
const distCovers = join(DIST, 'covers');
if (existsSync(distCovers)) {
  const shipped = JSON.parse(readFileSync(join(DIST, 'library.json'), 'utf8')) as {
    books: { cover?: string }[];
  };
  const referenced = new Set(
    shipped.books
      .map((book) => book.cover)
      .filter((cover): cover is string => cover !== undefined)
      .map((cover) => cover.replace(/^covers\//, '')),
  );

  const orphans = readdirSync(distCovers).filter((name) => !referenced.has(name));
  if (orphans.length > 0) {
    failures.push(
      `${orphans.length} cover(s) in dist/covers that no book in library.json points at — ` +
        `each filename is a book title: ${orphans.slice(0, 5).join(', ')}`,
    );
  }
  console.log(`covers in dist: ${String(readdirSync(distCovers).length)}, all referenced`);
}

const ogImage = join(ASSETS, 'og.png');
if (!existsSync(ogImage) || statSync(ogImage).size < 2048) {
  failures.push('og.png is missing or implausibly small');
}
if (!existsSync(join(DIST, 'og.png'))) {
  failures.push('og.png did not make it into the build output');
}

console.log(`scanned ${scanned} text file(s) in ${relative(ROOT, DIST)}`);
console.log(`og image ${statSync(ogImage).size} bytes`);

if (failures.length > 0) {
  console.error(`\nFAILED\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('\nOK — public build carries no note bodies, no vault paths');
