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
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * How long to give the edge before calling a stale page a problem.
 *
 * A deploy is not live the instant wrangler returns — Pages has to point the
 * custom domain at the new deployment, and that took about a minute the once it
 * was measured. Checking immediately and reporting failure would cry wolf on
 * every single deploy, which is the fastest way to make a check ignored.
 *
 * Declared here rather than beside the function that uses it: `const` does not
 * hoist, and `--check-only` calls that function from the middle of the file.
 */
const PROPAGATION_ATTEMPTS = 7;
const PROPAGATION_WAIT_MS = 15_000;


const dryRun = process.argv.includes('--dry-run');
const skipGates = process.argv.includes('--skip-gates');

/**
 * `--check-only`: ask the live site which build it is serving, and stop.
 *
 * Builds nothing, uploads nothing, reads the stamp out of the `dist/` that was
 * last published. It exists because the alternative advice — re-run the whole
 * deploy — answers a question by doing the thing the question is about, which
 * is both slow and a poor way to investigate a stale edge. It also makes this
 * check runnable against a local server, which is the only way to watch it
 * fail on purpose.
 */
const checkOnly = process.argv.includes('--check-only');

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
// The branch comes first, before SITE_URL and before the vault, because it is
// the check most likely to be the reason you should not be here at all — and
// because a refusal that arrives after two minutes of gates is a refusal people
// learn to pre-empt with the override.
//
// Until worktrees, "am I on the right branch" answered itself: there was one
// checkout and you were standing in it. Now there can be four, each on a
// different branch, each with a shell open, and every one of them reads the
// same `.env` — so every one of them has SITE_URL and CF_PAGES_PROJECT and can
// publish to the live domain with one command that looks identical in all four.
//
// ADR-0019 already accepts that the live site may drift from `main`;
// that was about *when* you deploy, with one checkout to deploy from. This is
// about publishing a branch nobody has reviewed to the address people have.
// Refusing wrongly costs one flag. Publishing wrongly is live.
if (!checkOnly && !dryRun) assertPublishableBranch();

/**
 * Refuses to publish anything but `main`.
 *
 * `--any-branch` is the deliberate override, named so it cannot be typed by
 * accident and reads in shell history as what it is. `--dry-run` and
 * `--check-only` skip this entirely: neither uploads, and a dry run from a
 * feature branch is exactly how you would check this path before merging.
 *
 * A detached HEAD is refused too. It has no branch name, which means nobody can
 * say afterwards what was published.
 */
function assertPublishableBranch(): void {
  if (process.argv.includes('--any-branch')) {
    console.log('--any-branch: publishing a branch other than main, deliberately');
    return;
  }

  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  // Not a checkout at all — a tarball, say. Nothing to assert against, and
  // refusing here would block a legitimate deploy for no reason.
  if (result.status !== 0) return;

  const branch = result.stdout.trim();
  if (branch === 'main') return;

  fail(
    `on branch "${branch === 'HEAD' ? 'a detached HEAD' : branch}", not main.\n` +
      `  This publishes to ${process.env['SITE_URL'] ?? 'the live site'}, and every worktree\n` +
      '  shares one .env — so this command looks the same from every checkout you have open.\n\n' +
      '  Merge first, or say so on purpose:\n' +
      '      pnpm deploy:site --any-branch',
  );
}

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
if (checkOnly) {
  console.log('--check-only: not building, not uploading');
} else if (skipGates) {
  console.warn('\n! --skip-gates: publishing without running the contract');
} else {
  run('pnpm', ['test']);
  run('pnpm', ['run', 'typecheck']);
  run('pnpm', ['gate:public']);
  run('pnpm', ['smoke:render']);
}

// ── 2. The real build. Last, so it overwrites whatever the gates staged ─────
if (!checkOnly) {
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
}

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

// `--check-only` publishes nothing, so the publication checks do not apply to
// it — and one of them cannot even hold, since it asserts the built og:image
// matches the current SITE_URL, which is precisely what you change to point the
// live check at a local server and watch it fail on purpose.
if (problems.length > 0 && !checkOnly) {
  fail(`pre-flight found ${String(problems.length)} problem(s):\n- ${problems.join('\n- ')}`);
}

/**
 * A name for this build, written into the page so the live site can be asked
 * which build it is serving.
 *
 * The check below used to compare cover *bytes*, which cannot answer that
 * question: covers are named after book titles and keep those names between
 * builds, so a deploy that changes only code leaves every cover byte-identical
 * and the check reports a clean site whichever build is live. That is not
 * hypothetical — it passed against the previous deployment minutes after an
 * upload, while `index.html` still pointed at the old bundle.
 *
 * Derived from the build's own contents rather than from the clock or the
 * commit — not for reproducibility, which this build does not have and never
 * did (`library.json` carries the moment it was generated, so two builds of one
 * tree already differ), but so the stamp cannot claim more than it knows. It
 * names *this artifact*: hashing `index.html` covers the code, because the
 * bundle's filename is content-hashed and appears in it, and hashing
 * `library.json` covers the shelf. A stamp that matches means the origin is
 * serving the bytes that were just uploaded, and nothing weaker.
 */
const stamp = checkOnly ? stampOfLastDeploy() : stampAndWrite();

/**
 * Reads back the stamp the last deploy wrote, rather than computing a new one.
 *
 * `--check-only` asks "is the origin serving what I last published", so it must
 * use *that* build's name. Re-hashing would produce a different one — the file
 * on disk now includes the stamp the hash was taken before — and the check would
 * report a mismatch against a site that is perfectly up to date.
 */
function stampOfLastDeploy(): string {
  const found = stampOf(html);
  if (found === undefined) {
    fail(
      'dist/index.html carries no build stamp, so there is nothing to compare.\n' +
        '  It was built before stamping existed, or by something other than a deploy.\n' +
        '  Run `pnpm deploy:site` and the check will have an answer.',
    );
  }
  return found;
}

function stampAndWrite(): string {
  const name = createHash('sha256')
    .update(readFileSync(join(DIST, 'index.html')))
    .update(readFileSync(libraryPath))
    .digest('hex')
    .slice(0, 12);

  const marked = html.replace('<head>', `<head><meta name="stacks:build" content="${name}">`);

  // A stamp that failed to land would make the check below fail forever, on
  // every deploy, for a reason nobody would guess — so the injection is asserted
  // rather than assumed. Astro emits a bare `<head>`; if that ever changes, this
  // says so here instead of at the far end.
  if (stampOf(marked) !== name) {
    fail('could not stamp index.html — no `<head>` to inject into, so the live check would be blind');
  }
  writeFileSync(join(DIST, 'index.html'), marked);
  return name;
}

/** The build a page says it is, or undefined if it does not say. */
function stampOf(page: string): string | undefined {
  return /<meta name="stacks:build" content="([0-9a-f]+)">/.exec(page)?.[1];
}

console.log(
  checkOnly
    ? `\nlast deployed build ${stamp}`
    : `\npre-flight OK — ${String(library.books.length)} book(s), og:image absolute, no orphans` +
      `\nbuild ${stamp}`,
);

// ── 4. Upload ───────────────────────────────────────────────────────────────
if (checkOnly) {
  await verifyLive(siteUrl.replace(/\/$/, ''));
  process.exit(0);
}

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

// ── 5. What a visitor actually gets ─────────────────────────────────────────
//
// The upload succeeding is not the same as the site changing, and the gap
// between the two is not hypothetical: the fix for the mobile crash uploaded
// cleanly, passed every check above, and left the custom domain serving the
// previous build's covers for four hours. Cover filenames are slugs of book
// titles and are rewritten in place, so a cached copy has the right name and the
// wrong bytes, and nothing anywhere reported a problem.
//
// A warning rather than a failure, because the deploy genuinely did succeed and
// no remedy for any of these can be performed from here.
//
// It can also fail to run at all: a zone that refuses non-browser clients gives
// this check nothing to read, and it says so rather than guessing. A check that
// cannot tell "stale" from "refused" is worse than no check, because it spends
// the owner's trust on a diagnosis it did not make.
await verifyLive(siteUrl.replace(/\/$/, ''));

/**
 * Which build the origin is actually serving.
 *
 * Asks the page, rather than inferring from bytes. Cover sizes cannot answer it
 * — see the stamp's own note — and comparing whole HTML would break the first
 * time the zone enabled any edge transform, since those rewrite markup and would
 * fail forever for a reason unconnected to deploying. A meta tag's content
 * survives all of them.
 */
async function verifyBuildLive(origin: string): Promise<void> {
  for (let attempt = 1; attempt <= PROPAGATION_ATTEMPTS; attempt += 1) {
    let live: string | undefined;
    try {
      // `no-store` so this measures the origin and not whatever this machine
      // fetched a minute ago. It says nothing about a visitor's cache, and
      // cannot: that is what the `_headers` revalidation is for.
      const response = await fetch(`${origin}/`, { cache: 'no-store' });

      // A refusal is not an answer, and for a long time this code treated it as
      // one. Cloudflare's bot protection serves a challenge *page* with a 403,
      // so `stampOf` found no stamp in it and the check reported "serving a
      // build with no stamp" — indistinguishable, in the output, from the real
      // failure it exists to catch, and it recommended purging the whole zone
      // cache to fix a WAF rule. Read the status before reading the body.
      if (!response.ok) {
        // Every non-200 retries, a 403 included. The first version of this bailed
        // at once on any 4xx, on the reasoning that a rule will say the same
        // thing five more times. Bot protection is not a rule — it is a *score*,
        // recomputed per request. Measured against this zone with "definitely
        // automated" set to allow, the identical request came back 403 roughly
        // one time in six, so bailing on the first would raise a false alarm
        // that often on a zone which does let the check through: exactly the
        // failure this code exists to stop making.
        if (attempt === PROPAGATION_ATTEMPTS) {
          reportUnreadable(origin, response.status);
          return;
        }
        console.log(
          `  retrying (${String(attempt)}/${String(PROPAGATION_ATTEMPTS - 1)}) — ` +
            `origin answered HTTP ${String(response.status)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, PROPAGATION_WAIT_MS));
        continue;
      }

      live = stampOf(await response.text());
    } catch {
      console.warn(`\n! could not reach ${origin} to ask which build it is serving`);
      return;
    }

    if (live === stamp) {
      console.log(`serving build ${stamp}`);
      return;
    }

    if (attempt === PROPAGATION_ATTEMPTS) {
      console.warn(
        `\n! ${origin} is serving ${live === undefined ? 'a build with no stamp' : `build ${live}`}, not ${stamp}\n` +
          '  The upload was fine. Either the edge has not caught up, or a cache is\n' +
          '  holding the previous index.html — which points at the previous bundle, so\n' +
          '  visitors get the old shelf however new the assets beside it are.\n' +
          '    - Wait a minute and re-run `pnpm deploy:site --check-only`, which asks\n' +
          '      again without rebuilding or re-uploading anything.\n' +
          '    - If it persists: dash.cloudflare.com → your zone → Caching → Configuration →\n' +
          '      Purge Everything, and set Browser Cache TTL to "Respect Existing Headers".',
      );
      return;
    }

    console.log(
      `  waiting for the edge (${String(attempt)}/${String(PROPAGATION_ATTEMPTS - 1)}) — serving ` +
        `${live === undefined ? 'an unstamped build' : live}, want ${stamp}`,
    );
    await new Promise((resolve) => setTimeout(resolve, PROPAGATION_WAIT_MS));
  }
}

/**
 * The origin refused to be read — so this deploy went out unverified.
 *
 * Deliberately *not* the cache-purge advice the stamp-mismatch path gives. The
 * two failures look identical from here and have nothing in common: one is a
 * stale copy of a real page, the other is no page at all.
 *
 * The remedy is not a request header. Measured against this zone: Node's
 * `fetch` is refused whatever user agent it sends, and so is a real headless
 * Chrome, while curl passes with any user agent but its own default — so the
 * block is on the client's fingerprint, not on anything a caller controls.
 * There is no version of this check that reads through it.
 */
function reportUnreadable(origin: string, status: number): void {
  console.warn(
    `\n! could not read ${origin} — HTTP ${String(status)}, ` +
      `${String(PROPAGATION_ATTEMPTS)} attempts\n` +
      '  The upload was fine. This is not a cache: the origin refused to serve\n' +
      '  this check at all, so it never saw a page to read a build stamp out of.\n' +
      '  Bot protection on the zone refuses every automatable client — Node fetch\n' +
      '  and headless Chrome alike — and no request header changes that.\n' +
      `  So nothing has confirmed what ${origin} is serving to visitors.\n` +
      `    - Check by hand: open ${origin}, view source, and look for\n` +
      `      <meta name="stacks:build" content="${stamp}">.\n` +
      '    - To make this check work again, the zone needs a rule that lets it\n' +
      '      through — dash.cloudflare.com → your zone → Security → WAF. Scope it\n' +
      '      to something only you can send; a header anyone could guess would\n' +
      '      hand every bot the same exemption.',
  );
}

async function verifyLive(origin: string): Promise<void> {
  await verifyBuildLive(origin);

  // Every cover, not a sample. Most covers are byte-identical between builds —
  // only the ones that changed can reveal a stale cache — so a sample of five is
  // very likely to land entirely on files that would match either way and
  // report a clean site that is not. That is not hypothetical: the first version
  // of this check sampled five and passed while the site was serving a previous
  // build. A few dozen HEAD requests cost a second.
  const covers = library.books
    .map((book) => book.cover)
    .filter((cover): cover is string => cover !== undefined);

  if (covers.length === 0) return;

  let unreachable = false;
  let refused: number | undefined;
  const checks = await Promise.all(
    covers.map(async (cover) => {
      const local = statSync(join(DIST, cover)).size;
      try {
        const response = await fetch(`${origin}/${cover}`, { method: 'HEAD' });
        // Same trap as the build check above: a challenge page has a
        // content-length like anything else, and comparing it against the
        // cover's size reports a byte mismatch — which reads as a stale cache
        // and sends you to purge a zone that was never the problem.
        if (!response.ok) {
          refused = response.status;
          return undefined;
        }
        const served = Number(response.headers.get('content-length') ?? '0');
        return served === local
          ? undefined
          : `${cover}: serving ${String(served)}B, built ${String(local)}B`;
      } catch {
        unreachable = true;
        return undefined;
      }
    }),
  );

  if (unreachable) {
    console.warn(`\n! could not reach ${origin} to check what is being served`);
    return;
  }

  if (refused !== undefined) {
    console.warn(
      `\n! ${origin} refused the cover check — HTTP ${String(refused)}\n` +
        '  Not a cache. See the note above: nothing here can read this origin.',
    );
    return;
  }

  const stale = checks.filter((line): line is string => line !== undefined);
  if (stale.length === 0) {
    console.log(`checked ${String(covers.length)} cover(s) live — the site is serving this build`);
    return;
  }

  console.warn(
    `\n! ${origin} is serving ${String(stale.length)} cover(s) from a previous build:\n` +
      stale
        .slice(0, 5)
        .map((line) => `    ${line}`)
        .join('\n') +
      '\n  The upload was fine — this is caching, and cover filenames do not change\n' +
      '  between builds, so a cached copy has the right name and the wrong bytes.\n' +
      '    - Pages usually purges its edge within a minute or two of a deploy. Re-run\n' +
      '      this check before doing anything else.\n' +
      '    - If it persists: dash.cloudflare.com → your zone → Caching → Configuration →\n' +
      '      Purge Everything, and set Browser Cache TTL to "Respect Existing Headers".\n' +
      '      A zone overrides the Cache-Control this build sends, and its default is 4\n' +
      '      hours, which is why `_headers` alone does not settle it on a custom domain.',
  );
}
