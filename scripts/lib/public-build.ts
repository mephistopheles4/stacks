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
import type { LibraryBook } from '../../packages/core/src/library.ts';
import type { BookRecord } from '../../packages/core/src/types.ts';
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
  'orphan-note',
  'notes-shape',
  'unknown-key',
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
  'csp',
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

/**
 * The canary's opposite: planted inside a fixture's `## Thoughts`, and required
 * to be **present** in that book's `notes/<id>.json`.
 *
 * Owned beside the canary for the canary's reason — a phrase that drifts between
 * where it is planted and where it is looked for leaves both halves passing.
 *
 * ⚠️ **Plain words only.** The section ships stripped of Markdown by hand, so an
 * underscore, an asterisk or a backtick in here could be eaten on the way and
 * the presence check would fail for a reason unconnected to the split. And it
 * must never contain the canary, which `note-body` searches for as a pattern.
 *
 * ⚠️ **Never a rule in this module.** A fixture phrase required by the shared
 * inspector would fail every real deploy, which carries no fixture
 * ([ADR-0028](../../docs/adr/0028-one-inspector-for-the-public-build.md)). G2
 * asserts it against `publish()`; `gate:public` learns it with the extractor.
 * See [#367](https://github.com/mephistopheles4/stacks/issues/367).
 */
export const THOUGHTS_SHIP_PHRASE = 'THOUGHTS SHIP PHRASE must reach the page';

/** Binary assets are covers and the OG image; no text to leak. */
const TEXTUAL = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map', '.xml']);

/**
 * Things in a shipped text file that would give away the shape of the vault.
 *
 * ⚠️ **The `note-body` rule is fixture-only, and on a real-vault deploy it
 * cannot fire.** It greps for `NOTE_BODY_CANARY`, a literal that exists in
 * `fixtures/vault` and nowhere else — so it is honest and load-bearing inside
 * `pnpm gate:public`, where the canary is planted and G20 watches it go red,
 * and vacuous against the folder `deploy:site` is about to upload. Written down
 * rather than repaired: the two `vault-path` patterns below it, a note path and
 * the `sourcePath` field, do fire on real bytes.
 *
 * **What actually protects invariant 2 on a real build is structural** — no
 * `BookRecord` field carries a body, so `library.json` cannot — and the
 * `unknown-key` rule below is that structure asserted on the artifact rather
 * than assumed of it. The one body section that does ship, `## Thoughts`, goes
 * to `notes/` alone, where `orphan-note` and `notes-shape` hold it. ⚠️
 * **Neither checks contents.** Body text stuffed into `subjects` — a named
 * field, correctly wired — passes every assertion in this file. See
 * `docs/spec/trend-layer.md` §5, responses (i) and (iii).
 */
const FORBIDDEN: readonly {
  readonly rule: PublicBuildRule;
  readonly what: string;
  readonly pattern: RegExp;
}[] = [
  { rule: 'note-body', what: 'note body text', pattern: new RegExp(NOTE_BODY_CANARY) },
  { rule: 'vault-path', what: 'a vault note path', pattern: /Library\/[^"'\s]*\.md/ },
  { rule: 'vault-path', what: 'the sourcePath field', pattern: /"sourcePath"/ },
];

/** Every `og:` and `twitter:` meta tag in a built page, as [key, value]. */
const SHARE_TAG = /<meta\s+(?:property|name)="((?:og|twitter):[a-z]+)"\s+content="([^"]*)"/g;

/** A cover this build serves itself: one path segment, under `covers/`. */
const SAME_ORIGIN_COVER = /^covers\/[^/\\]+$/;

/**
 * Where a build stages a book's published Thoughts, as `notes/<id>.json`.
 *
 * `publish()`'s notes stage writes here, through the adapter's
 * `readPublicSection`
 * ([`docs/spec/picking-a-book-up.md`](../../docs/spec/picking-a-book-up.md),
 * step 2). The two rules that read it landed first, so they were watched going
 * red before the first real file existed
 * ([#367](https://github.com/mephistopheles4/stacks/issues/367)).
 */
const NOTES_DIR = 'notes';

/**
 * The most a notes file may weigh, in bytes.
 *
 * The extractor withholds a section over 8,000 code points; at four bytes each
 * in UTF-8, plus room for the JSON around them, nothing it emits can reach this.
 * It exists so a bug that bypassed the first cap still fails the build (spec
 * §3.1). Counted in bytes, never in `.length`, which counts UTF-16 units.
 */
const MAX_NOTES_FILE_BYTES = 40_000;

/**
 * A URL scheme in a notes file: the four the spec names, in any case.
 *
 * Links are flattened to their text before a section ships, so a scheme left
 * over is an address the flattening never saw — a bare URL or an autolink.
 * `file:` and `obsidian:` carry a user or a vault name.
 *
 * ⚠️ **Four named schemes, not any `word:`.** A generic scheme pattern refuses
 * ordinary prose ("Note: …"), and a rule that fires on prose gets switched off.
 * `://` covers every hierarchical scheme. `javascript:` and `data:` are not
 * named because nothing on the page can follow one: the text is set through
 * `textContent` and never lands in an `href` (spec §3.4).
 */
const URL_SCHEME = /:\/\/|\b(?:file|obsidian|mailto):/i;

/**
 * A hidden-text marker in a notes file: `%%`, either HTML comment closer, or
 * the start of raw HTML — `<` and a letter, `/`, `!` or `?`, which covers a
 * tag, a comment, a declaration, CDATA and a processing instruction.
 *
 * The extractor withholds any section holding one, so a correct build never
 * ships a marker and this refuses nothing real. It is the byte cap's reasoning
 * applied to hidden text: a bug that bypassed the extractor's check would
 * otherwise publish an aside the owner never saw on screen. Added on #411 by
 * owner decision, from #410's review, and widened to `<!` and `<?` by #411's
 * own review and to any tag start by its second; bare home paths and "File:"
 * prose were left as the spec has them, since either would move the extractor
 * too.
 *
 * ⚠️ **Kept apart from its twin deliberately; move one and move the other.**
 * `COMMENT_MARKER` and `HTML_START` in
 * `packages/core/src/adapters/thoughts-section.ts` are the extractor's rules,
 * and this one pattern matches what the two match together; a shared import
 * would let one weakening clear both, `DERIVED_KEYS`'s reason.
 */
const HIDDEN_MARKER = /%%|<[A-Za-z/!?]|--!?>/;

/**
 * The rest of the extractor's output check, as this rule's own list: every
 * pattern of spec §3.1.1's step 7 but the cap, which the extractor reads on the
 * section and again on each paragraph that ships (step 10). A correct build
 * never writes a file holding one, so each refuses only an extractor regression
 * (#411's round 3, adversarial F7).
 *
 * ⚠️ **A twin, never a shared import**, for `HIDDEN_MARKER`'s reason: one
 * weakening must not clear the extractor and the deploy check at once. Move one
 * and move the other — `SECTION_GUARDS` in
 * `packages/core/src/adapters/thoughts-section.ts`. A lone backtick, a single
 * `$` and `]:` in running text are not here, because the parser ships them as
 * literal text when they open nothing.
 */
const OUTPUT_MARKS: readonly { readonly what: string; readonly test: (text: string) => boolean }[] =
  [
    { what: 'two dollar signs, which may be math', test: (text) => /\$[\s\S]*\$/.test(text) },
    { what: 'an image or embed opener', test: (text) => text.includes('![') },
    { what: 'an inline footnote opener', test: (text) => text.includes('^[') },
    { what: 'a Dataview field marker', test: (text) => text.includes('::') },
    {
      what: 'a control character',
      test: (text) =>
        [...text].some((char) => {
          const code = char.codePointAt(0) ?? 0;
          return (code < 0x20 && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f);
        }),
    },
    { what: 'Unicode tag characters', test: (text) => /[\u{E0000}-\u{E007F}]/u.test(text) },
    {
      what: 'a line that may read as a heading',
      test: (text) => /^[\t\p{Zs}\p{Cf}]*#{1,2}[\t\p{Zs}\p{Cf}]/mu.test(text),
    },
  ];

/** The committed share card, and the only image a page may point at. */
const SHARE_IMAGE_FILE = 'og.png';

/** The `_headers` block that governs covers. Matched exactly, not searched for. */
const COVERS_PATTERN = '/covers/*';

/** The `_headers` block that governs published Thoughts. Matched exactly, like the covers one. */
const NOTES_PATTERN = '/notes/*';

/** The `_headers` block that governs every response, security headers included. */
const EVERY_PATH_PATTERN = '/*';

/**
 * The policy Astro emits into every page, as a `<meta http-equiv>`.
 *
 * Read out of the HTML rather than out of `_headers` because that is where it
 * is. `style-src` is hash-pinned per page from that page's own inline content —
 * Astro inlines a stylesheet under 4kB, which is why `/attribution` carries an
 * inline `<style>` and the index does not — so a hand-written copy in `_headers`
 * would go stale the first time a stylesheet crossed that threshold, and the
 * only symptom would be an unstyled page. See `packages/site/astro.config.mjs`.
 */
const CSP_META = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"/i;

/**
 * The whole policy, as `directive → the sources it must carry, exactly`.
 *
 * **Every directive, not merely the interesting one.** This pinned `connect-src`
 * and the script origins alone at first, which left `default-src 'none'`,
 * `img-src`, `base-uri` and `form-action` deletable from `astro.config.mjs` with
 * every gate green and the page pixel-identical — while `_headers` and
 * [ADR-0065](../../docs/adr/0065-the-csp-is-generated-not-written.md) went on
 * describing a policy that no longer said what they claimed. That is #127's own
 * failure shape reproduced inside the fix for it, so the rule holds the set.
 *
 * `connect-src 'self'` is still the line the issue was written for: the shelf's
 * only outbound request is `fetch('/library.json')`, same origin, and that was a
 * property measured **once, by grep**. A `fetch` to a third party added tomorrow
 * passed `pnpm test`, `pnpm build`, `pnpm gate:public` and `pnpm smoke:render`
 * without comment.
 *
 * `script-src` carries the one exception, and the reason it is named rather than
 * merely allowed: `static.cloudflareinsights.com` is Cloudflare Web Analytics,
 * injected at the edge and present in no file in this repo. Refusing it is a real
 * choice and not a no-op — the browser would refuse the script and the analytics
 * would stop — but it is a policy file overriding a zone setting for no privacy
 * gain, since the beacon reports same-origin and carries nothing derived from the
 * owner's reading. See ADR-0065. **The property is *same-origin except one named
 * origin*, and a set is what keeps the exception enumerable**: the answer to
 * "which third parties does the shelf permit" has to be a list somebody can
 * read, so the *second* one cannot arrive unnoticed.
 *
 * ⚠️ **Hashes are excluded from every comparison** — Astro recomputes them on
 * each build from each page's own inline content, so a rule that held whole
 * directive values would be red on the next commit for a reason unconnected to
 * what it guards. `style-src` is here for its `'self'` and for the guarantee it
 * is present at all; its hashes are the part that legitimately changes.
 */
const CSP_DIRECTIVES: ReadonlyMap<string, readonly string[]> = new Map([
  ['default-src', ["'none'"]],
  ['img-src', ["'self'"]],
  ['connect-src', ["'self'"]],
  ['base-uri', ["'none'"]],
  ['form-action', ["'none'"]],
  ['script-src', ["'self'", 'https://static.cloudflareinsights.com']],
  ['style-src', ["'self'"]],
]);

/**
 * Framing, denied twice, because a `<meta>` CSP cannot deny it at all.
 *
 * Browsers ignore `frame-ancestors` in a meta tag, so it lives in `_headers` as
 * **a policy of one directive**. That is not a second copy of the page policy:
 * the two are disjoint — the meta tag carries every hash-bearing directive and
 * this carries the only one it cannot — so neither can drift from the other, and
 * a policy declaring no fetch directives restricts nothing except framing.
 *
 * `X-Frame-Options` is kept beside it rather than replaced by it. For `DENY` the
 * two are equivalent in every browser that matters; the exception worth the line
 * is that `frame-ancestors` covers `<embed>` and `<object>` uniformly where
 * `X-Frame-Options` historically did not, and `X-Frame-Options` is read by
 * clients predating CSP framing. Both are asserted, so neither can be deleted on
 * the theory that the other covers it.
 *
 * ⚠️ **Described and not enforced is how `_headers` came to assert a
 * Content-Security-Policy it did not have**, which is the whole of #127. A
 * control this file describes, this rule checks.
 */
const FRAMING_DENIED: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  {
    what: "Content-Security-Policy: frame-ancestors 'none'",
    pattern: /^Content-Security-Policy:\s*frame-ancestors\s+'none'\s*$/i,
  },
  { what: 'X-Frame-Options: DENY', pattern: /^X-Frame-Options:\s*DENY\s*$/i },
];

/** Below this, `og.png` is a truncated copy rather than an image. */
const MIN_OG_IMAGE_BYTES = 2048;

/**
 * Every `BookRecord` field, by the name it wears in `library.json`.
 *
 * Typed against `BookRecord` rather than merely written down, so a rename or a
 * typo is a compile error. What the type cannot check is *completeness* — a new
 * field missing from this list makes the deploy refuse until somebody adds it,
 * which is the safe direction and is the entire check.
 *
 * `sourcePath` is here because it *is* a named field. Whether it may ship is a
 * different question, and `vault-path` above already answers it.
 */
const RECORD_KEYS = [
  'sourcePath',
  'title',
  'author',
  'isbn',
  'status',
  'started',
  'finished',
  'rating',
  'cover',
  'coverSource',
  'spineColor',
  'pages',
  'binding',
  'private',
  'faceOut',
  'shelfOrder',
  'tags',
  'publisher',
  'published',
  'subjects',
  'googleVolumeId',
  'appleTrackId',
  'openLibraryOlid',
  'oreillyOurn',
] as const satisfies readonly (keyof BookRecord)[];

/**
 * Keys that come from somewhere other than a record field, enumerated.
 *
 * `id` is derived from title and ISBN so the shelf can keep a book selected
 * across rebuilds; `coverAspect` is measured from the cover file at build time,
 * because a square audiobook cover forced onto a print face is squashed;
 * `thoughts` is `true` when the build wrote the book's `notes/<id>.json`, so the
 * page knows to fetch it (spec §3.1) — a flag set by the notes stage, never
 * text, and `orphan-note` refuses any value but `true`. All three are
 * `library.json`'s own, and G30 names the same three.
 *
 * ⚠️ **This list is the most dangerous line in this file.** A key that should
 * never have shipped is made to ship by adding its name here — red turns green
 * in a one-line diff that reads like documentation, with no rule deleted and no
 * assertion weakened. So: three entries, and anything joining them owes a
 * sentence saying what derives it and why it is not a record field.
 *
 * **Which is why `gates/library-seam.test.ts` keeps its own copy and this does
 * not import it.** Two lists is normally the thing this repo refuses — a rule
 * written down twice goes true in one place and false in the other — and the
 * exception is bought deliberately: drift between them fails **loudly in the
 * safe direction** (G30 red, or the deploy refuses), while a shared list would
 * let the one-line weakening above clear the gate and the pre-flight at once.
 * They answer different questions anyway: G30 asks what `toLibraryBook`
 * produces, this asks what a folder may carry. Move one and move the other.
 */
const DERIVED_KEYS = [
  'id',
  'coverAspect',
  'thoughts',
] as const satisfies readonly (keyof LibraryBook)[];

/** The whole vocabulary a shipped book may spell. */
const SHIPPABLE_KEYS: ReadonlySet<string> = new Set<string>([...RECORD_KEYS, ...DERIVED_KEYS]);

interface ShippedBook {
  readonly id?: string;
  readonly title?: string;
  readonly cover?: string;
  readonly status?: string;
  readonly private?: boolean;
  readonly sourcePath?: string;
  /** Read as `unknown`, because a mark that is not `true` is itself a defect. */
  readonly thoughts?: unknown;
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
        fail(
          rule,
          `${posix(relative(dir, file))} contains ${what}: ${JSON.stringify(hit[0].slice(0, 80))}`,
        );
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

  // ── The key trace ─────────────────────────────────────────────────────────
  //
  // Every key on every shipped book is a named `BookRecord` field or a named
  // derived one. This is G30's assertion applied to the bytes in the folder
  // instead of to a synthetic record: G30 proves `toLibraryBook` behaves, and
  // nothing before this proved that the file about to be uploaded is what
  // `toLibraryBook` produced. It is the one rule here that would catch somebody
  // adding a field, wiring it through the seam, and shipping it.
  //
  // ⚠️ **Key names, never values.** See the note on `FORBIDDEN` above.
  //
  // It cannot go vacuous: `empty-library` refuses a build with no books, no
  // `library.json`, or an unparseable one, so a folder that reaches this loop
  // with nothing to trace has already failed. G20 plants all three.
  const unnamed = new Map<string, string>();
  const tracedKeys = new Set<string>();

  for (const book of books ?? []) {
    const name = book.title ?? '(untitled)';

    for (const key of Object.keys(book)) {
      tracedKeys.add(key);
      if (!SHIPPABLE_KEYS.has(key) && !unnamed.has(key)) unnamed.set(key, name);
    }
    if (book.private === true) fail('private-book', `private book would be published: ${name}`);
    if (book.status === 'wishlist')
      fail('wishlist-book', `wishlist book would be published: ${name}`);
    if (book.sourcePath !== undefined) fail('vault-path', `vault path would be published: ${name}`);
    // A hand-edited or imported note may carry an absolute URL, and the shelf
    // passes `cover` straight to an <img> src — which has a visitor's browser
    // fetching from a third party and leaking their IP to whatever host the
    // note happened to name.
    if (book.cover !== undefined && !SAME_ORIGIN_COVER.test(book.cover)) {
      fail('foreign-cover', `cover is not same-origin: ${name} → ${book.cover}`);
    }
  }

  if (unnamed.size > 0) {
    fail(
      'unknown-key',
      `${String(unnamed.size)} key(s) on shipped books that no BookRecord field and no named ` +
        `derived key explains: ` +
        [...unnamed].map(([key, name]) => `${key} (first on "${name}")`).join(', ') +
        '. Either the artifact is inventing data, or the key is deliberate — in which case name ' +
        'it in RECORD_KEYS or DERIVED_KEYS in scripts/lib/public-build.ts, with a sentence ' +
        'saying why',
    );
  } else if (tracedKeys.size > 0) {
    // Said out loud on the clean path, so a deploy's own output shows the trace
    // had something to trace. A rule that is silent when it passes cannot be
    // told apart from one that never ran.
    observations.push(`${String(tracedKeys.size)} distinct book key(s), every one named`);
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

  // ── Published Thoughts ────────────────────────────────────────────────────
  const notesProblems = inspectNotes(dir, books ?? []);
  problems.push(...notesProblems.problems);
  observations.push(...notesProblems.observations);

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
  observations.push(
    `${String(pointing)}/${String(imageTags.length)} share image URL(s) → ${wanted}`,
  );

  /**
   * Shareable, not searchable — on **every** page, not just the index.
   *
   * This read `dist/index.html` alone for the whole of its life, which was
   * exactly right while the site had one page. `/attribution` is the second, and
   * `noindex` is a per-page tag: a new page shipping without one would have
   * passed this gate silently and turned up in a search result beside the
   * owner's name, which is the one thing the posture exists to prevent.
   *
   * The share-image rules deliberately stay index-only below: a legal-notice
   * page needs no share card, and requiring one would be a rule invented by this
   * change rather than carried by it.
   */
  const pages = walk(dir).filter((file) => extname(file) === '.html');
  const unmarked = pages.filter(
    (file) => !/<meta\s+name="robots"\s+content="[^"]*noindex/.test(readFileSync(file, 'utf8')),
  );

  if (pages.length === 0) {
    fail('robots', 'the build contains no HTML at all — there is no page to publish');
  }
  for (const file of unmarked) {
    fail(
      'robots',
      `no \`noindex\` robots meta in ${posix(relative(dir, file))} — that page would be searchable`,
    );
  }
  if (unmarked.length === 0 && pages.length > 0) {
    observations.push(`${String(pages.length)} page(s), all noindex`);
  }
  // ── What each page is allowed to talk to ──────────────────────────────────
  //
  // Per page, for exactly the reason `robots` is: a meta CSP governs only the
  // document carrying it, so a page added tomorrow ships with no policy at all
  // unless the build gives it one. Checked here rather than in `_headers`
  // because that is where Astro puts it — see `CSP_META`.
  //
  // It cannot go vacuous: a build with no HTML in it has already failed
  // `robots` above, so this loop is never silent over an empty folder.
  let policed = 0;
  for (const file of pages) {
    const where = posix(relative(dir, file));
    const found = CSP_META.exec(readFileSync(file, 'utf8'));

    if (found === null) {
      fail(
        'csp',
        `no Content-Security-Policy in ${where} — nothing constrains what that page may load or connect to`,
      );
      continue;
    }

    const directives = parseCsp(found[1] ?? '');
    const before = problems.length;

    for (const [name, wanted] of CSP_DIRECTIVES) {
      const declared = directives.get(name);
      if (declared === undefined) {
        fail(
          'csp',
          `${where} declares no ${name} — the policy is weaker than the one this repo documents`,
        );
        continue;
      }

      // Hashes are the part that legitimately differs per page and per build.
      const sources = declared.filter((source) => !source.startsWith("'sha"));
      const same =
        sources.length === wanted.length && sources.every((source) => wanted.includes(source));

      if (!same) {
        fail(
          'csp',
          `${where} sets ${name} to ${sources.join(' ') || '(nothing)'} — must be exactly ` +
            `${wanted.join(' ')}. Either the build grew a source nobody named, or the change is deliberate, ` +
            'in which case name it in CSP_DIRECTIVES in scripts/lib/public-build.ts with a sentence saying why',
        );
      }
    }

    // ⚠️ **The set is closed, and reading only the names above left it open.**
    //
    // A specific fetch directive overrides `default-src` for its own resource
    // type, so `object-src *`, `frame-src https://…` or `worker-src *` each
    // widen the policy with every directive above still exactly right.
    // `script-src-elem` is the one that matters: it takes precedence over
    // `script-src` for `<script>` elements, so it defeats the pinned beacon
    // origin — the one exception this rule exists to keep enumerable — without
    // touching the line the loop above reads.
    //
    // Raised by review on the pull request that added this rule, which is the
    // second time here that checking the named thing missed the unnamed one.
    for (const name of directives.keys()) {
      if (CSP_DIRECTIVES.has(name)) continue;
      fail(
        'csp',
        `${where} declares ${name}, which nothing in this repo names — a directive outside the pinned ` +
          'set can only widen the policy, and a specific fetch directive overrides `default-src` for its ' +
          'own resource type. Name it in CSP_DIRECTIVES in scripts/lib/public-build.ts with a sentence ' +
          'saying why, or take it out of astro.config.mjs',
      );
    }

    if (problems.length === before) policed += 1;
  }
  if (policed > 0 && policed === pages.length) {
    // Counted, not assumed — the same rule the share-image observation follows.
    observations.push(
      `${String(policed)} page(s), every one policed to ${String(CSP_DIRECTIVES.size)} pinned CSP directive(s), ` +
        `connect-src ${(CSP_DIRECTIVES.get('connect-src') ?? []).join(' ')}`,
    );
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
    const blocks = headerBlocks(headers);

    // The half of the policy a `<meta>` tag cannot carry. Read out of the `/*`
    // block by name, for the same reason the covers rule is: a directive found
    // anywhere in the text can be one a neighbouring block happens to carry.
    const everyPath = blocks.get(EVERY_PATH_PATTERN) ?? [];
    for (const { what, pattern } of FRAMING_DENIED) {
      if (everyPath.some((header) => pattern.test(header))) continue;
      fail(
        'headers',
        `${EVERY_PATH_PATTERN} is missing \`${what}\` — browsers ignore \`frame-ancestors\` in the ` +
          `\`<meta>\` policy the build emits, so framing is denied here or nowhere. Headers in that ` +
          `block: ${everyPath.join(' · ') || '(none)'}`,
      );
    }

    const revalidating: readonly (readonly [string, string, string])[] = [
      [
        COVERS_PATTERN,
        "covers would keep Pages' four-hour image default",
        'library.json and the covers it describes would expire on different schedules',
      ],
      // JSON already gets max-age=0 by default; the block says so on purpose,
      // so a withdrawn section cannot outlive the deploy that pruned it in a
      // browser cache if that default ever changes (spec §3.3).
      [
        NOTES_PATTERN,
        "notes would rest on Pages' default, which this repo does not control",
        'a section the owner withdrew could outlive its prune in a browser cache',
      ],
    ];
    for (const [pattern, ifAbsent, ifStale] of revalidating) {
      const block = blocks.get(pattern);
      if (block === undefined) {
        fail('headers', `_headers has no ${pattern} block — ${ifAbsent}`);
      } else if (!block.some((header) => /^Cache-Control:.*\bmax-age=0\b/i.test(header))) {
        fail(
          'headers',
          `${pattern} does not revalidate — ${ifStale}. Headers in that block: ` +
            `${block.join(' · ') || '(none)'}`,
        );
      }
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

/**
 * The `notes/` folder: `orphan-note` and `notes-shape`.
 *
 * The one place a note's body may ship (invariant 2), so both rules read the
 * bytes rather than trust the extractor. `orphan-note` is `orphan-cover` for
 * notes: an id is a slug of a title, so a file no listed book is named for is a
 * leak by its name alone. `notes-shape` holds every file to spec §3.1's schema,
 * so a file can carry paragraphs and nothing else. Messages name the file and
 * never quote it: what is inside is the owner's prose.
 *
 * **Both directions of spec §3.1**, held through the `thoughts: true` mark a
 * book carries in `library.json` when its file was written: every file is
 * named for a marked book, which is what refuses a stale file for a book that
 * is still listed, and every marked book has its file. A mark that is anything
 * but `true` is refused too, because the key trace reads names and never
 * values, so text under the mark would otherwise pass it.
 *
 * Read whether or not a `notes/` folder exists: a build with marked books and
 * no folder is missing every file, and a rule that returned early there would
 * pass the mark it never checked.
 */
function inspectNotes(dir: string, books: readonly ShippedBook[]): PublicBuildReport {
  const notesDir = join(dir, NOTES_DIR);
  const problems: BuildProblem[] = [];

  const badMarks = books.filter((book) => book.thoughts !== undefined && book.thoughts !== true);
  if (badMarks.length > 0) {
    problems.push({
      rule: 'orphan-note',
      message:
        `${String(badMarks.length)} book(s) whose \`thoughts\` mark is not \`true\` — it is a flag, ` +
        `never text: ${badMarks
          .slice(0, 5)
          .map((book) => book.id ?? '(no id)')
          .join(', ')}`,
    });
  }

  const marked = new Set(books.filter((book) => book.thoughts === true).map((book) => book.id));
  const staged = existsSync(notesDir)
    ? walk(notesDir).map((file) => ({ file, name: posix(relative(notesDir, file)) }))
    : [];
  const stagedNames = new Set(staged.map(({ name }) => name));

  const orphans = staged.filter(
    ({ name }) => !(name.endsWith('.json') && marked.has(name.slice(0, -'.json'.length))),
  );
  if (orphans.length > 0) {
    problems.push({
      rule: 'orphan-note',
      message:
        `${String(orphans.length)} notes file(s) that no book marked \`thoughts: true\` in ` +
        `library.json is named for — each filename is a book id, and an id is a slug of a title: ` +
        orphans
          .slice(0, 5)
          .map(({ name }) => name)
          .join(', '),
    });
  }

  const missing = [...marked].filter((id) => !stagedNames.has(`${String(id)}.json`));
  if (missing.length > 0) {
    problems.push({
      rule: 'orphan-note',
      message:
        `${String(missing.length)} book(s) marked \`thoughts: true\` with no notes file — the page ` +
        `would fetch a file this build never shipped: ${missing.slice(0, 5).map(String).join(', ')}`,
    });
  }

  for (const { file, name } of staged) {
    const bytes = statSync(file).size;
    const problem =
      bytes > MAX_NOTES_FILE_BYTES
        ? `is ${String(bytes)} bytes, over the ${String(MAX_NOTES_FILE_BYTES)}-byte cap`
        : notesShapeProblem(readFileSync(file, 'utf8'));
    if (problem !== undefined)
      problems.push({ rule: 'notes-shape', message: `notes/${name} ${problem}` });
  }

  // Counted, not assumed: said only when both rules held over every file.
  const observations =
    problems.length === 0
      ? [
          `${String(staged.length)} notes file(s), one for each book marked thoughts: true, ` +
            'each shaped { paragraphs }',
        ]
      : [];
  return { problems, observations };
}

/**
 * What is wrong with a notes file's contents, or `undefined` when it is exactly
 * `{ "paragraphs": string[] }`, non-empty, every string non-empty, and free of
 * any URL scheme (spec §3.1) and of any hidden-text marker (#411), in exactly
 * the bytes the build writes.
 *
 * Named keys rather than a schema library, for `unknown-key`'s reason: an
 * allowlist of one, which adding a second key cannot pass by accident.
 */
function notesShapeProblem(text: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'is not valid JSON';
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return 'is not a JSON object';
  }

  // Counted, never named: a writer that keyed the file by its prose would put
  // the owner's Thoughts in the terminal through a message that listed keys.
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== 'paragraphs') {
    return (
      `has ${String(keys.length)} key(s), ${keys.includes('paragraphs') ? '' : 'none of them `paragraphs`, '}` +
      'where exactly one, `paragraphs`, is allowed'
    );
  }

  // Byte for byte what the writer emits, one trailing newline allowed: a file
  // that repeats `paragraphs` parses to its last copy, so the checks below
  // would read one array while the page could be served another.
  const canonical = JSON.stringify(parsed);
  if (text !== canonical && text !== `${canonical}\n`) {
    return 'is not byte for byte the form the build writes — a repeated key or extra text could hide from these checks';
  }

  const { paragraphs } = parsed as { paragraphs: unknown };
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return 'has no paragraphs — `paragraphs` must be a non-empty list';
  }
  if (!paragraphs.every((paragraph) => typeof paragraph === 'string' && paragraph !== '')) {
    return 'has a paragraph that is not a non-empty string';
  }
  if (paragraphs.some((paragraph) => URL_SCHEME.test(paragraph as string))) {
    return 'carries a URL scheme — a link must reach the page as its text alone';
  }
  if (paragraphs.some((paragraph) => HIDDEN_MARKER.test(paragraph as string))) {
    return 'carries a hidden-text marker (a comment, a tag or a declaration) — text Obsidian hides must never reach the page';
  }
  const mark = OUTPUT_MARKS.find(({ test }) =>
    paragraphs.some((paragraph) => test(paragraph as string)),
  );
  if (mark !== undefined) {
    return `carries ${mark.what} — the extractor withholds any section holding one, so this file is an extractor regression`;
  }
  return undefined;
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

/**
 * A Content-Security-Policy, as `directive name → its source list`.
 *
 * Parsed rather than pattern-matched for the reason `headerBlocks` is: the
 * obvious regex — find `connect-src`, look ahead for `'self'` — is answered by
 * a neighbouring directive, and `default-src 'none'` sits two along. Splitting
 * on `;` is the whole grammar, and Astro separates its generated directives
 * with `; ` where it uses a bare `;` for the configured ones, so the trim
 * matters. A repeated directive keeps the **first**, which is what browsers do.
 */
function parseCsp(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();

  for (const part of policy.split(';')) {
    const tokens = part
      .trim()
      .split(/\s+/)
      .filter((token) => token !== '');
    const name = tokens.shift();
    if (name === undefined || directives.has(name.toLowerCase())) continue;
    directives.set(name.toLowerCase(), tokens);
  }

  return directives;
}

/** Messages read the same on Windows and on the Linux CI runner. */
function posix(path: string): string {
  return path.split('\\').join('/');
}
