/**
 * Is this folder safe to publish?
 *
 * One question, one implementation. It had three: `gate:public` greping a
 * fixture build, `deploy:site` pre-flighting the real one, and G2 asserting
 * `publish()`'s output. The first two read the same `dist/` and had already
 * drifted — and the drift ran the wrong way. `deploy:site`, the only one of
 * them that actually publishes anything, checked merely that `_headers`
 * existed, where the gate checked that `/covers/*` revalidates; that gap is
 * how the fix for the mobile crash reached an origin nobody could see. Its
 * `og:image` check was weaker too, passing over a page with no `og:image` at
 * all so long as a `twitter:image` was present.
 *
 * Neither was a superset of the other, and neither knew the other existed.
 *
 * **This inspects; it never builds.** The two callers build very differently —
 * the gate stages the fixture vault, the deploy stages the real one, and
 * `--check-only` builds nothing whatsoever — so the folder arrives as an
 * argument and where it came from is not this module's business. That is also
 * what makes every rule cheap to watch going red: G20 assembles a synthetic
 * `dist/` in a temp directory and plants one defect at a time.
 *
 * **It reports; it never decides and never logs.** Problems come back tagged
 * with the rule that produced them, so `--check-only` can excuse the one rule
 * that genuinely cannot hold for it rather than skipping all of them.
 *
 * What stays out, deliberately: whether the *right vault* produced this folder.
 * The gate requires the fixture books to be present and the deploy requires
 * them absent — the same titles with opposite verdicts — and a module that is
 * handed a directory cannot know which. That check belongs to the caller that
 * knows, and it asserts build ordering rather than publishability. See
 * docs/adr/0028-one-inspector-for-the-public-build.md.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { walk } from './walk.ts';

/**
 * The rules, as data.
 *
 * `PublicBuildRule` is derived from this array rather than declared beside it,
 * so the runtime list and the type cannot disagree — G20 asserts every member
 * has been watched going red, and a hand-maintained second copy is exactly how
 * that assertion would start passing over a rule nobody tests.
 */
export const PUBLIC_BUILD_RULES = [
  'note-body',
  'vault-path',
  'empty-library',
  'private-book',
  'wishlist-book',
  'foreign-cover',
  'orphan-cover',
  // Two rules rather than one, because `deploy:site --check-only` has to excuse
  // exactly one of them: it asserts the built page against the *current*
  // SITE_URL, and repointing SITE_URL at a local server is how you watch the
  // live check fail on purpose. A page that lost its share tag entirely is
  // still worth saying out loud in that mode.
  'share-image-missing',
  'share-image-origin',
  'robots',
  'headers',
  'og-image',
] as const;

export type PublicBuildRule = (typeof PUBLIC_BUILD_RULES)[number];

export interface BuildProblem {
  readonly rule: PublicBuildRule;
  readonly message: string;
}

export interface PublicBuildReport {
  /** Empty means every rule held. Order is the order they were checked in. */
  readonly problems: readonly BuildProblem[];
  /**
   * What the inspection actually looked at, for the caller to print.
   *
   * Returned rather than logged, because an inspection that says nothing on
   * success cannot be told apart from one that never ran — and because a module
   * that writes to stdout is a module its own gate has to capture stdout to test.
   */
  readonly observations: readonly string[];
}

export interface InspectOptions {
  /**
   * The origin every share-image URL must be absolute against.
   *
   * Required rather than optional: a build whose `og:image` is relative renders
   * nothing in every preview scraper, and an inspection that skipped the check
   * when it was not told the origin would be silent about the one failure that
   * only shows up in someone else's chat window.
   */
  readonly origin: string;
}

/**
 * Planted in several fixture note bodies — *including the malformed one that
 * gets skipped*, so a pass cannot be an accident of that book being dropped.
 *
 * Owned here because it was an independent literal in the gate script and in
 * G2, and a canary that drifts between the place it is planted and the place it
 * is searched for is worse than no canary: both halves keep passing.
 */
export const NOTE_BODY_CANARY = 'NOTE_BODY_CANARY_do_not_ship';

/** Binary assets are covers and the OG image; no text to leak. */
const TEXTUAL = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map', '.xml']);

/** Things in a shipped text file that would give away the shape of the vault. */
const FORBIDDEN: readonly { readonly rule: PublicBuildRule; readonly what: string; readonly pattern: RegExp }[] = [
  { rule: 'note-body', what: 'note body text', pattern: new RegExp(NOTE_BODY_CANARY) },
  { rule: 'vault-path', what: 'a vault note path', pattern: /Library\/[^"'\s]*\.md/ },
  { rule: 'vault-path', what: 'the sourcePath field', pattern: /"sourcePath"/ },
];

/** Every `og:` and `twitter:` meta tag in a built page, as [key, value]. */
const SHARE_TAG = /<meta\s+(?:property|name)="((?:og|twitter):[a-z]+)"\s+content="([^"]*)"/g;

/** A cover this build serves itself: one path segment, under `covers/`. */
const SAME_ORIGIN_COVER = /^covers\/[^/\\]+$/;

/** The committed share card, and the only image a page may point at. */
const SHARE_IMAGE_FILE = 'og.png';

/** The `_headers` block that governs covers. Matched exactly, not searched for. */
const COVERS_PATTERN = '/covers/*';

/** Below this, `og.png` is a truncated copy rather than an image. */
const MIN_OG_IMAGE_BYTES = 2048;

interface ShippedBook {
  readonly title?: string;
  readonly cover?: string;
  readonly status?: string;
  readonly private?: boolean;
  readonly sourcePath?: string;
}

export function inspectPublicBuild(dir: string, options: InspectOptions): PublicBuildReport {
  const problems: BuildProblem[] = [];
  const observations: string[] = [];
  const origin = options.origin.replace(/\/$/, '');

  const fail = (rule: PublicBuildRule, message: string): void => {
    problems.push({ rule, message });
  };

  // ── Everything that shipped as text ───────────────────────────────────────
  //
  // The contents of text files, which is why the two checks below it exist: a
  // grep opens no JPEG and reads no filename, and a forbidden *list* can only
  // ever catch the patterns somebody thought of.
  let scanned = 0;
  for (const file of walk(dir)) {
    if (!TEXTUAL.has(extname(file))) continue;
    scanned += 1;

    const contents = readFileSync(file, 'utf8');
    for (const { rule, what, pattern } of FORBIDDEN) {
      const hit = pattern.exec(contents);
      if (hit !== null) {
        fail(rule, `${posix(relative(dir, file))} contains ${what}: ${JSON.stringify(hit[0].slice(0, 80))}`);
      }
    }
  }
  observations.push(`${String(scanned)} text file(s) scanned`);

  // ── The index itself ──────────────────────────────────────────────────────
  const books = readBooks(dir);
  if (books === undefined) {
    // Missing and unreadable are reported apart, because they send you to
    // different places: one means the build never ran, the other that it
    // produced something. Either way the four book-level rules below have
    // nothing to read, so this has to be loud.
    fail(
      'empty-library',
      existsSync(join(dir, 'library.json'))
        ? 'library.json is not valid JSON — nothing can be checked about the books it lists'
        : 'no library.json in the build — there is no shelf to publish',
    );
  } else if (books.length === 0) {
    fail('empty-library', 'library.json contains no books at all');
  } else {
    observations.push(`${String(books.length)} book(s) in library.json`);
  }

  for (const book of books ?? []) {
    const name = book.title ?? '(untitled)';
    if (book.private === true) fail('private-book', `private book would be published: ${name}`);
    if (book.status === 'wishlist') fail('wishlist-book', `wishlist book would be published: ${name}`);
    if (book.sourcePath !== undefined) fail('vault-path', `vault path would be published: ${name}`);
    // A hand-edited or imported note may carry an absolute URL, and the shelf
    // passes `cover` straight to an <img> src — which has a visitor's browser
    // fetching from a third party and leaking their IP to whatever host the
    // note happened to name.
    if (book.cover !== undefined && !SAME_ORIGIN_COVER.test(book.cover)) {
      fail('foreign-cover', `cover is not same-origin: ${name} → ${book.cover}`);
    }
  }

  // ── Covers ────────────────────────────────────────────────────────────────
  //
  // Every filename here is a slug of a book title, so an orphan is a leak and
  // not untidiness: build from a real vault, then run a gate that stages the
  // fixture one, and `library.json` is replaced while thirty-three real covers
  // stay behind. `publish()` prunes now and G2 asserts that; this asserts it
  // again on the folder `astro build` assembled, which `publish()` never sees.
  const coversDir = join(dir, 'covers');
  if (existsSync(coversDir)) {
    const referenced = new Set(
      (books ?? [])
        .map((book) => book.cover)
        .filter((cover): cover is string => cover !== undefined)
        .map((cover) => cover.replace(/^covers\//, '')),
    );
    const staged = readdirSync(coversDir);
    const orphans = staged.filter((name) => !referenced.has(name));
    if (orphans.length > 0) {
      fail(
        'orphan-cover',
        `${String(orphans.length)} cover(s) that no book in library.json points at — ` +
          `each filename is a book title: ${orphans.slice(0, 5).join(', ')}`,
      );
    } else {
      observations.push(`${String(staged.length)} cover(s), all referenced`);
    }
  }

  // ── The page a scraper fetches ────────────────────────────────────────────
  //
  // Read as an empty string when absent rather than skipped, so a build with no
  // index.html fails these rather than passing them by construction. The
  // earlier version wrapped all of this in an `existsSync` and would have gone
  // green over a folder with no page in it at all.
  const html = readIfPresent(join(dir, 'index.html'));

  const imageTags = [...html.matchAll(SHARE_TAG)].filter(
    ([, key]) => key === 'og:image' || key === 'twitter:image',
  );
  if (imageTags.length === 0) {
    fail(
      'share-image-missing',
      'no og:image or twitter:image in the built page — link previews show nothing',
    );
  }

  // The whole URL, not merely an absolute one.
  //
  // Two checks used to answer half of this each: the gate required absolute
  // against the origin, the deploy required the literal `<origin>/og.png`, and
  // neither required both — so `<origin>/hero.png` satisfied one and a relative
  // `/og.png` satisfied the other. `og:image` *was* relative for the whole of
  // the project's life, and every preview scraper (Slack, iMessage, WhatsApp,
  // Discord, Twitter) silently renders nothing for that; a URL that is absolute
  // but names a file this build never wrote fails the same way, more quietly.
  const wanted = `${origin}/${SHARE_IMAGE_FILE}`;
  let pointing = 0;
  for (const [, key, value] of imageTags) {
    if (value !== wanted) {
      fail(
        'share-image-origin',
        `${String(key)} is "${String(value)}" — must be exactly ${wanted}, or preview scrapers ` +
          'render nothing',
      );
    } else {
      pointing += 1;
    }
  }
  // Counted, not assumed. Saying "correct" beside a failure that says otherwise
  // is how a log stops being read.
  observations.push(`${String(pointing)}/${String(imageTags.length)} share image URL(s) → ${wanted}`);

  // Shareable, not searchable — the owner's decision, and one that is only
  // cheap before a crawler has seen the page.
  if (!/<meta\s+name="robots"\s+content="[^"]*noindex/.test(html)) {
    fail('robots', 'no `noindex` robots meta in the built page — the shelf would be searchable');
  }
  if (/^\s*Disallow:\s*\/\s*$/m.test(readIfPresent(join(dir, 'robots.txt')))) {
    // The intuitive move, and the one that fails: blocking the crawl stops the
    // crawler reading the noindex, and a linked URL can still be indexed on the
    // strength of the link alone.
    fail('robots', 'robots.txt disallows crawling, which prevents the noindex being read');
  }

  // ── Cache headers ─────────────────────────────────────────────────────────
  const headers = readIfPresent(join(dir, '_headers'));
  if (headers === '') {
    fail('headers', '_headers did not reach the build — covers and og.png would be indexable');
  } else {
    // Pages defaults images to max-age=14400 and HTML/JSON to max-age=0, and
    // every cover filename is rewritten in place by each deploy. Without this
    // the index goes live against covers up to four hours old — which is how
    // the fix for the mobile crash reached an origin nobody could see.
    //
    // Read out of the `/covers/*` block specifically. The directive appears in
    // more than one block of the real file, so anything searching the whole
    // text is answered by a neighbouring block — see `headerBlocks`.
    const covers = headerBlocks(headers).get(COVERS_PATTERN);
    if (covers === undefined) {
      fail(
        'headers',
        `_headers has no ${COVERS_PATTERN} block — covers would keep Pages' four-hour image default`,
      );
    } else if (!covers.some((header) => /^Cache-Control:.*\bmax-age=0\b/i.test(header))) {
      fail(
        'headers',
        `${COVERS_PATTERN} does not revalidate — library.json and the covers it describes would ` +
          `expire on different schedules. Headers in that block: ${covers.join(' · ') || '(none)'}`,
      );
    }
  }

  // ── The share image itself ────────────────────────────────────────────────
  //
  // Measured in the folder being inspected, not in `packages/site/public/`
  // where the committed original lives. The source being fine says nothing
  // about what Astro actually copied into the build.
  const ogImage = join(dir, SHARE_IMAGE_FILE);
  const ogBytes = existsSync(ogImage) ? statSync(ogImage).size : undefined;
  if (ogBytes === undefined) {
    fail('og-image', `${SHARE_IMAGE_FILE} did not make it into the build output`);
  } else if (ogBytes < MIN_OG_IMAGE_BYTES) {
    fail(
      'og-image',
      `${SHARE_IMAGE_FILE} is ${String(ogBytes)} bytes — implausibly small for the share card`,
    );
  } else {
    observations.push(`og.png ${String(ogBytes)} bytes`);
  }

  return { problems, observations };
}

/**
 * The books a build says it shipped, or `undefined` when there is no index.
 *
 * An unparseable `library.json` is reported as no index rather than thrown:
 * every other rule still has something useful to say about the folder, and a
 * caller that only learns about the first problem has to run the check once per
 * fix.
 */
function readBooks(dir: string): ShippedBook[] | undefined {
  const path = join(dir, 'library.json');
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { books?: ShippedBook[] };
    return parsed.books ?? [];
  } catch {
    return undefined;
  }
}

/** Empty string for a file that is not there, so callers can just pattern-match. */
function readIfPresent(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/**
 * A Cloudflare `_headers` file, as `path pattern → the headers under it`.
 *
 * Parsed into blocks rather than pattern-matched as one string, because the
 * obvious regex — find `/covers/*`, then look ahead for a `Cache-Control` with
 * `max-age=0` — does not stop at the end of that block. The real file has an
 * `/og.png` block directly after `/covers/*` carrying exactly that directive,
 * so deleting the covers block's own `Cache-Control` line left the rule green
 * against a file that no longer said the thing. The rule was observed red, but
 * only against a `_headers` containing nothing else, which is not a shape this
 * repo has ever had.
 *
 * A line at column 0 opens a block; indented lines belong to it. Comments and
 * blank lines are dropped, and a blank line does not end a block — that is
 * Cloudflare's format, and it is why the naive scan reached so far.
 */
function headerBlocks(source: string): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  let current: string[] | undefined;

  for (const line of source.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (/^\s/.test(line)) {
      current?.push(line.trim());
      continue;
    }
    current = [];
    blocks.set(line.trim(), current);
  }

  return blocks;
}

/** Messages read the same on Windows and on the Linux CI runner. */
function posix(path: string): string {
  return path.split('\\').join('/');
}
