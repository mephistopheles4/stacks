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
 * vault paths, every shipped key a named field, an absolute og:image — because
 * the thing that gets published is the thing worth checking.
 *
 * ⚠️ **One of those rules does not survive the trip, and this comment used to
 * say it did.** It claimed "no note bodies", and the `note-body` rule greps for
 * a canary that exists only in `fixtures/vault` — so on a real-vault deploy it
 * cannot fire. It is honest inside `pnpm gate:public`, where the canary is
 * planted, and vacuous here. What holds invariant 2 on this folder is
 * structural — no `BookRecord` field carries a body — and the `unknown-key`
 * rule is that structure asserted rather than assumed. ⚠️ **It checks key
 * names, never values.** See `scripts/lib/public-build.ts` and
 * `docs/spec/trend-layer.md` §5.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../packages/cli/src/env.ts';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import {
  PROPAGATION_ATTEMPTS,
  describeStaleCover,
  probeBuild,
  probeCovers,
  stampMeta,
  stampOf,
} from './lib/edge-probe.ts';
import { gitOutput } from './lib/git.ts';
import { inspectPublicBuild, type PublicBuildRule } from './lib/public-build.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { runShell } from './lib/run.ts';

// The same loader the CLI uses, rather than a third hand-rolled `.env` parser:
// a real environment variable still wins, so `SITE_URL=... pnpm deploy` does
// what it says. Without this the script would not see STACKS_VAULT at all,
// because only the CLI was ever reading the file.
loadEnv();

const DIST = join(REPO_ROOT, 'packages', 'site', 'dist');

/** How `dist/` is named in messages, so they read the same on every platform. */
const DIST_LABEL = 'packages/site/dist';

/** Pinned: a deploy tool that silently changes under you is not a deploy tool. */
const WRANGLER = 'wrangler@4';

// How long to give the edge, how a page names its build, and how a refusal is
// told apart from a stale answer all live in `./lib/edge-probe.ts` now. Surface
// D — the same question asked between deploys, from `pnpm trend:sync` — is the
// second caller, and two callers deriving one contract is what ADR-0030 is
// about. It is also the first in-process oracle this check has ever had: from
// here its only one drives this whole script as a child process.


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
 * `runShell` — the shell and the joined command line are its business, not this
 * script's. All this adds is the failure style: a deploy that stops should say
 * so in the same shape as every other refusal here, not as a stack trace.
 */
function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): void {
  try {
    runShell(command, args, { env });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
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

  // Not a checkout at all — a tarball, say. Nothing to assert against, and
  // refusing here would block a legitimate deploy for no reason.
  const branch = gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], REPO_ROOT);
  if (branch === undefined) return;
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
//
// The rules live in `scripts/lib/public-build.ts`, and `gate:public`
// applies exactly the same ones to a fixture build. They used to be two
// implementations, and this one — the only one that actually publishes
// anything — held the weaker half of both places they differed: it checked that
// `_headers` existed where the gate checked that `/covers/*` revalidates, and
// it accepted a page with no `og:image` at all so long as a `twitter:image` was
// there. Neither was a superset of the other, and neither knew the other
// existed. See docs/adr/0028-one-inspector-for-the-public-build.md.
interface ShippedBook {
  readonly title: string;
  readonly cover?: string;
}

const libraryPath = join(DIST, 'library.json');
if (!existsSync(libraryPath)) fail(`no library.json in ${DIST}`);

const library = JSON.parse(readFileSync(libraryPath, 'utf8')) as { books: ShippedBook[] };
const html = existsSync(join(DIST, 'index.html'))
  ? readFileSync(join(DIST, 'index.html'), 'utf8')
  : '';

const report = inspectPublicBuild(DIST, { origin: siteUrl });
for (const observation of report.observations) console.log(`  ${observation}`);

const problems: { rule: PublicBuildRule | 'stale-fixtures'; message: string }[] = [...report.problems];

// The one check that stays here, because it is not about publishability at all.
//
// `gate:public` *requires* these titles to be present in the folder it inspects
// and this requires them absent — the same strings with opposite verdicts — so
// a module handed a directory, which cannot know which vault produced it, is
// the wrong owner. What this asserts is that step 2 ran after step 1.
//
// Read from the fixture vault rather than hardcoded. It was two titles out of
// twelve, and one of those two — `Compilers for the Impatient` — has carried a
// subtitle in its frontmatter the whole time, so it never matched a shipped
// book and only one title was ever really checked.
//
// Through the adapter, because that is invariant 4 and because it is also the
// only way to get this right: a note's filename is not its title. Five of the
// twelve fixtures differ, and reading `title:` out of the file by hand would be
// a second parser of the format `enrich` and `updateBook` already have scars
// from.
if (!checkOnly) {
  // Said first, because the fixture vault contains two deliberately broken
  // notes and the adapter warns about them by name. Unannounced, in the middle
  // of a deploy, those read as something wrong with the vault being published.
  console.log('\n  reading fixture titles — any skip warnings below are the fixtures’ own, by design');
  const titles = await fixtureTitles();
  // An empty list would satisfy the filter below however the build went, which
  // is the same vacuous pass this check was just rewritten to close. Louder
  // than a problem, because it means the check itself is broken rather than the
  // build.
  if (titles.length === 0) {
    fail(
      'no fixture notes found to check the build against. This check exists to catch the ' +
        'gates’ staged data surviving into a deploy, and with nothing to compare it would ' +
        'pass over any build at all.',
    );
  }

  const shipped = new Set(library.books.map((book) => book.title));
  const staged = titles.filter((title) => shipped.has(title));
  if (staged.length > 0) {
    problems.push({
      rule: 'stale-fixtures',
      message:
        `fixture books are in the build — the real vault build did not run last: ${staged.slice(0, 3).join(', ')}`,
    });
  }
}

/**
 * Every book title in the fixture vault, as `library.json` would spell it.
 *
 * The same adapter the build uses, so the two cannot disagree about what a note
 * is called. A malformed fixture is skipped with a warning here exactly as it
 * is everywhere else — invariant 3 — and one fewer title to compare is a
 * weaker check, not a broken deploy.
 */
async function fixtureTitles(): Promise<string[]> {
  const vaultPath = join(REPO_ROOT, 'fixtures', 'vault');
  if (!existsSync(vaultPath)) return [];
  const books = await new ObsidianAdapter(vaultPath).listBooks();
  return books.map((book) => book.title);
}

/**
 * `--check-only` publishes nothing, so a problem is information rather than a
 * refusal — it exists to investigate a stale edge, and a pre-flight that
 * refuses to run would answer the question by declining to ask it.
 *
 * Exactly one rule is dropped rather than warned about. `share-image-origin`
 * asserts the built page against the *current* SITE_URL, and repointing
 * SITE_URL at a local server is precisely how you watch the live check fail on
 * purpose — a warning everybody expects is noise. `share-image-missing` is not
 * dropped with it: a page that lost its share tag altogether is worth saying out
 * loud whatever mode you are in, and separating those two is the whole reason
 * problems carry a rule.
 */
const applicable = checkOnly
  ? problems.filter((problem) => problem.rule !== 'share-image-origin')
  : problems;

if (applicable.length > 0) {
  const listed = applicable.map((problem) => `[${problem.rule}] ${problem.message}`).join('\n- ');
  if (checkOnly) {
    // Careful about what this claims. `--check-only` builds nothing, so this is
    // the `dist/` sitting on *this* machine — which may be whatever `gate:public`
    // last staged, and is not necessarily what the origin is serving.
    console.warn(
      `\n! the local ${DIST_LABEL} has ${String(applicable.length)} problem(s) — this is the folder ` +
        `on disk, not what the origin is serving:\n- ${listed}`,
    );
  } else {
    // Which flags clear this: none, on any path that publishes.
    //
    // The convention is that every refusal here says so rather than leaving the
    // reader to read `process.argv` — a flag whose reach is undocumented is how
    // `--skip-gates` came to skip the whole contract with nothing saying so
    // (#152). Stated as a fact about this refusal, checked against the code
    // above it: `--skip-gates` skips the step-1 gate suite and its reach stops
    // there — execution arrives here either way, and this refusal is outside
    // it. `--dry-run` runs this and stops before the upload, and `--check-only`
    // takes the warning branch, which publishes nothing.
    fail(
      `pre-flight found ${String(applicable.length)} problem(s):\n- ${listed}\n\n` +
        '  No flag clears this. --skip-gates skips the gate suite, not the pre-flight,\n' +
        '  and --dry-run runs it. --check-only reports instead of refusing, but it\n' +
        '  builds nothing and uploads nothing, and it drops share-image-origin.\n' +
        '  Nothing is uploaded until this passes.',
    );
  }
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

  const marked = html.replace('<head>', `<head>${stampMeta(name)}`);

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

console.log(
  checkOnly
    ? `\nlast deployed build ${stamp}`
    : `\npre-flight OK — ${String(library.books.length)} book(s), every key named, og:image absolute, no orphans` +
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
  const answer = await probeBuild(origin, stamp, {
    onRetry: (message, attempt, attempts) =>
      console.log(`  waiting for the edge (${String(attempt)}/${String(attempts - 1)}) — ${message}`),
  });

  if (answer.kind === 'current') {
    console.log(`serving build ${stamp}`);
    return;
  }

  if (answer.kind === 'unreachable') {
    console.warn(`\n! could not reach ${origin} to ask which build it is serving`);
    return;
  }

  if (answer.kind === 'refused') {
    reportUnreadable(origin, answer.status);
    return;
  }

  console.warn(
    `\n! ${origin} is serving ${answer.serving === undefined ? 'a build with no stamp' : `build ${answer.serving}`}, not ${stamp}\n` +
      '  The upload was fine. Either the edge has not caught up, or a cache is\n' +
      '  holding the previous index.html — which points at the previous bundle, so\n' +
      '  visitors get the old shelf however new the assets beside it are.\n' +
      '    - Wait a minute and re-run `pnpm deploy:site --check-only`, which asks\n' +
      '      again without rebuilding or re-uploading anything.\n' +
      '    - If it persists: dash.cloudflare.com → your zone → Caching → Configuration →\n' +
      '      Purge Everything, and set Browser Cache TTL to "Respect Existing Headers".',
  );
}

/**
 * The origin refused to be read — so this deploy went out unverified.
 *
 * Deliberately *not* the cache-purge advice the stamp-mismatch path gives. The
 * two failures look identical from here and have nothing in common: one is a
 * stale copy of a real page, the other is no page at all.
 *
 * The remedy is not a request header, which is the one thing worth knowing here.
 * Measured while this zone was challenging: Node's `fetch` was refused whatever
 * user agent it sent, and so was a real headless Chrome, while curl passed with
 * any user agent but its own default — so the decision was made on the client's
 * fingerprint, not on anything a caller controls. Looking browsery enough is not
 * available, and a fix that appeared to work that way would be one heuristic
 * update from silently reverting.
 *
 * The remedy is at the zone, wherever this is deployed, and it is the operator's
 * to choose. So the message names where to look rather than asserting a cause —
 * all this function knows is a status code.
 */
function reportUnreadable(origin: string, status: number): void {
  console.warn(
    `\n! could not read ${origin} — HTTP ${String(status)}, ` +
      `${String(PROPAGATION_ATTEMPTS)} attempts\n` +
      '  The upload was fine. This is not a cache: the origin refused to serve\n' +
      '  this check at all, so it never saw a page to read a build stamp out of.\n' +
      `  So nothing has confirmed what ${origin} is serving to visitors.\n` +
      '  Bot protection is the usual cause, but this only knows a status code —\n' +
      '  so name it rather than assume it:\n' +
      `    - Check by hand: open ${origin}, view source, and look for\n` +
      `      <meta name="stacks:build" content="${stamp}">. If that is right,\n` +
      '      the deploy is fine and only this check is blind.\n' +
      '    - Name the cause: dash.cloudflare.com → your zone → Security → Events.\n' +
      '      Each row says which service mitigated the request, which beats\n' +
      '      guessing from out here. Fix it there, at the zone.\n' +
      '  Sending a browser user agent does NOT fix this and has been tried: the\n' +
      '  refusal is decided on the client fingerprint. See ADR-0027.',
  );
}

async function verifyLive(origin: string): Promise<void> {
  await verifyBuildLive(origin);

  // Every cover, not a sample — the reason is in `probeCovers`, which is where
  // the comparison lives now. What stays here is what to say about its verdict:
  // one probe, two readers, and `trend:sync` prints something else entirely.
  // A cover named in `library.json` and missing from `dist/` is skipped rather
  // than thrown on — the pre-flight's orphan rule already refused this build if
  // one is, so reaching here means there is nothing to report. `trend:sync`
  // builds the same map for surface D and needs the skip for real, because its
  // `dist/` can predate a note.
  const built = new Map(
    library.books
      .map((book) => book.cover)
      .filter((cover): cover is string => cover !== undefined)
      .filter((cover) => existsSync(join(DIST, cover)))
      .map((cover) => [cover, statSync(join(DIST, cover)).size] as const),
  );

  if (built.size === 0) return;

  const answer = await probeCovers(origin, built);

  if (answer.kind === 'unreachable') {
    console.warn(`\n! could not reach ${origin} to check what is being served`);
    return;
  }

  if (answer.kind === 'refused') {
    console.warn(
      `\n! ${origin} refused the cover check — HTTP ${String(answer.status)}\n` +
        '  Not a cache. See the note above: nothing here can read this origin.',
    );
    return;
  }

  if (answer.stale.length === 0) {
    console.log(`checked ${String(answer.checked)} cover(s) live — the site is serving this build`);
    return;
  }

  console.warn(
    `\n! ${origin} is serving ${String(answer.stale.length)} cover(s) from a previous build:\n` +
      answer.stale
        .slice(0, 5)
        .map((one) => `    ${describeStaleCover(one)}`)
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
