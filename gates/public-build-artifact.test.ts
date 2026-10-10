/**
 * G20 — the folder about to be published is inspected once, by one module.
 *
 * "Is this folder safe to publish?" had three implementations: `gate:public`
 * greping a fixture build, `deploy:site` pre-flighting the real one, and G2
 * asserting `publish()`'s output. The two that read `dist/` had already drifted
 * apart, and the drift ran the wrong way — the thing that *actually publishes*
 * held the weaker check. It asserted `_headers` merely existed, where the gate
 * asserted `/covers/*` revalidates, which is the exact bug that shipped the
 * mobile-crash fix to an origin nobody could see.
 *
 * `inspectPublicBuild` is now the one implementation, and both are callers.
 *
 * This gate is only possible because that module builds nothing: handed a
 * directory, it can be pointed at a synthetic one assembled in `mkdtemp`. So
 * every rule is watched going red here, in milliseconds, with no build and no
 * network — which is what "a gate never observed failing is not yet a gate"
 * asks for and what the seven text-matching gates in this folder cannot do.
 *
 * What a synthetic folder cannot prove is that a *real* Astro build passes all
 * of them. That stays with `pnpm gate:public`, which calls this same module over
 * a real `dist/`. Two layers: each rule fires here, a real build survives there.
 *
 * See docs/gates.md, row G20 (public-build-artifact).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { HELD_COVER_EDGE } from '../packages/core/src/covers/cover-budget.ts';
import { plantedCover, type PlantedCoverOptions } from '../packages/core/src/test-support.ts';
import {
  HELD_EDGE_CAP,
  inspectPublicBuild,
  NOTE_BODY_CANARY,
  PUBLIC_BUILD_RULES,
  type PublicBuildRule,
} from '../scripts/lib/public-build.ts';

const ORIGIN = 'https://stacks.gate.example';

let dist: string;

beforeEach(async () => {
  dist = await mkdtemp(join(tmpdir(), 'stacks-dist-'));
  await writeCleanBuild();
});

afterEach(async () => {
  await rm(dist, { recursive: true, force: true });
});

interface ShippedBook {
  /** What a book's `notes/<id>.json` is named for. */
  readonly id?: string;
  readonly title: string;
  readonly cover?: string;
  /** `held-covers/<name>` when the build staged a held copy; typed wide to plant anything else. */
  readonly heldCover?: unknown;
  readonly status?: string;
  readonly private?: boolean;
  readonly sourcePath?: string;
  /** `true` when the build wrote this book's notes file; typed wide to plant anything else. */
  readonly thoughts?: unknown;
  /**
   * Deliberately not a contract key.
   *
   * The `unknown-key` test needs a book carrying something no `BookRecord`
   * field explains, and typing it here rather than casting keeps every other
   * planted defect honest about the shape it is planting.
   */
  readonly narrator?: string;
  /** A named field, used to plant body text somewhere the key trace permits. */
  readonly subjects?: string;
}

/** The clean build's one book, the id its notes file is named for, and its mark. */
const CLEAN_ID = 'a-book-1x2y3z';
const CLEAN_BOOK: ShippedBook = {
  id: CLEAN_ID,
  title: 'A Book',
  cover: 'covers/a.jpg',
  heldCover: 'held-covers/a.png',
  status: 'read',
  thoughts: true,
};

/**
 * The smallest folder that passes every rule.
 *
 * Deliberately hand-written rather than copied from a real build: a real one
 * would drag in whatever Astro happens to emit this month, and the point here
 * is to control exactly one variable per test. The real-build direction is
 * `pnpm gate:public`'s job.
 */
async function writeCleanBuild(): Promise<void> {
  await writeLibrary([CLEAN_BOOK]);
  await writeIndex(indexHtml());
  await mkdir(join(dist, 'covers'), { recursive: true });
  await writeFile(join(dist, 'covers', 'a.jpg'), 'pretend jpeg');
  await writeNotes(`${CLEAN_ID}.json`, { paragraphs: ['A paragraph the owner chose to share.'] });
  await writeHeld('a.png', await image(600, 900));
  await writeFile(join(dist, 'og.png'), 'x'.repeat(4096));
  await writeFile(join(dist, '_headers'), headersFile());
  await writeFile(join(dist, 'robots.txt'), 'User-agent: *\nAllow: /\n');
}

/**
 * Shaped like the real `packages/site/public/_headers`, not minimally.
 *
 * The shape is the point: `/og.png` carries the same `Cache-Control` directive
 * and sits directly after `/covers/*`. A `_headers` containing only the covers
 * block — which is what this gate planted at first — cannot catch a rule that
 * searches past the end of a block, because there is nothing past it to find.
 */
function headersFile(
  options: {
    coversCacheControl?: boolean;
    notes?: 'revalidate' | 'stale' | 'absent';
    held?: 'revalidate' | 'stale' | 'absent';
    frameOptions?: boolean;
    frameAncestors?: boolean;
  } = {},
): string {
  const revalidate = '  Cache-Control: public, max-age=0, must-revalidate';
  return [
    '# Cloudflare Pages reads this file.',
    '/*',
    '  X-Robots-Tag: noindex, nofollow',
    ...(options.frameAncestors === false
      ? []
      : ["  Content-Security-Policy: frame-ancestors 'none'"]),
    ...(options.frameOptions === false ? [] : ['  X-Frame-Options: DENY']),
    '',
    '/covers/*',
    options.coversCacheControl === false ? '  X-Content-Type-Options: nosniff' : revalidate,
    '',
    '/og.png',
    revalidate,
    '',
    ...(options.notes === 'absent'
      ? []
      : [
          '/notes/*',
          options.notes === 'stale' ? '  X-Content-Type-Options: nosniff' : revalidate,
          '',
        ]),
    ...(options.held === 'absent'
      ? []
      : [
          '/held-covers/*',
          options.held === 'stale' ? '  X-Content-Type-Options: nosniff' : revalidate,
          '',
        ]),
  ].join('\n');
}

/**
 * A policy shaped like the one Astro emits, hashes and all.
 *
 * The hashes are why this rule cannot be checked by string match: Astro computes
 * them per page from that page's own inline content, so two pages of one build
 * carry different policies and every build carries different ones again. The
 * rule parses directives, and these fixtures give it the noise a real policy has
 * in it — including the `; ` that separates Astro's generated directives from
 * the configured ones, which is not the `;` it uses everywhere else.
 */
function cspMeta(
  options: { connectSrc?: string; scriptSrc?: string; omit?: string; extra?: string } = {},
): string {
  const keep = ([name]: readonly [string, string]): boolean => name !== options.omit;
  const render = (pairs: readonly (readonly [string, string])[], join: string): string =>
    pairs
      .filter(keep)
      .map(([name, value]) => `${name} ${value}`)
      .join(join);

  // Configured directives, in config order, joined the way Astro joins them.
  const configured = [
    ['default-src', "'none'"],
    ['img-src', "'self'"],
    ['connect-src', options.connectSrc ?? "'self'"],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
  ] as const;

  // The two Astro generates, each carrying a hash it computed for this page.
  const generated = [
    [
      'script-src',
      `${options.scriptSrc ?? "'self' https://static.cloudflareinsights.com"} ` +
        `'sha256-BF0290pkb3jxQsE7z00xR8Imp8X34FLC88L0lkMnrGw='`,
    ],
    ['style-src', "'self' 'sha256-eZThLoRNDbx6YobQlsGZA8+qespsZfD/YQEGSwT5BvU='"],
  ] as const;

  return (
    '<meta http-equiv="content-security-policy" content="' +
    `${render(configured, ';')}; ${render(generated, '; ')};` +
    `${options.extra === undefined ? '' : ` ${options.extra};`}">`
  );
}

function indexHtml(
  options: { image?: string; robots?: boolean; csp?: string | false } = {},
): string {
  const image = options.image ?? `${ORIGIN}/og.png`;
  const robots = options.robots ?? true;
  const csp = options.csp ?? cspMeta();
  return [
    '<!doctype html><html><head>',
    robots ? '<meta name="robots" content="noindex, nofollow">' : '',
    csp === false ? '' : csp,
    `<meta property="og:image" content="${image}">`,
    `<meta name="twitter:image" content="${image}">`,
    '</head><body><div id="shelf"></div></body></html>',
  ].join('\n');
}

async function writeIndex(html: string): Promise<void> {
  await writeFile(join(dist, 'index.html'), html);
}

async function writeLibrary(books: readonly ShippedBook[]): Promise<void> {
  await writeFile(join(dist, 'library.json'), JSON.stringify({ books }, null, 2));
}

/**
 * One file under `notes/`, at a path relative to that folder.
 *
 * Takes a value to serialise or a raw string, because half the `notes-shape`
 * plants are files that are not the JSON they claim to be.
 */
async function writeNotes(path: string, contents: unknown): Promise<void> {
  const file = join(dist, 'notes', path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
}

/**
 * A real image, because the held rules read pixels and metadata through sharp
 * and a placeholder string is what `held-metadata`'s unreadable clause is for.
 */
function image(width: number, height: number, options: PlantedCoverOptions = {}): Promise<Buffer> {
  // The same builder `publish()`'s tests plant with, so the stage is proven to
  // strip exactly what this inspector is proven to refuse.
  return plantedCover(width, height, options);
}

/** One file under `held-covers/`, at a path relative to that folder. */
async function writeHeld(path: string, contents: Buffer | string): Promise<void> {
  const file = join(dist, 'held-covers', path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents);
}

function inspect(): ReturnType<typeof inspectPublicBuild> {
  return inspectPublicBuild(dist, { origin: ORIGIN });
}

/** Every rule some defect below was seen to produce. Checked for completeness. */
const exercised = new Set<PublicBuildRule>();

/**
 * Plants one defect and asserts it fires that rule *and no other*.
 *
 * "And no other" is the load-bearing half. A defect that trips three rules at
 * once proves none of them individually, and the clean baseline above is what
 * makes the difference attributable.
 */
async function expectOnly(rule: PublicBuildRule, plant: () => Promise<void>): Promise<void> {
  await plant();
  const fired = new Set((await inspect()).problems.map((problem) => problem.rule));
  expect([...fired].sort(), `planted a ${rule} defect`).toEqual([rule]);
  exercised.add(rule);
}

describe('G20 — a clean build', () => {
  it('reports no problems at all', async () => {
    const report = await inspect();
    expect(
      report.problems.map((problem) => `${problem.rule}: ${problem.message}`),
      'the synthetic clean build must satisfy every rule, or nothing below is attributable',
    ).toEqual([]);
  });

  it('passes prose that only looks like a URL scheme', async () => {
    // The control for `notes-shape`'s scheme clause. A rule that fired on any
    // `word:` would refuse ordinary Thoughts, and a rule that refuses prose gets
    // switched off, so the near misses are held clean here.
    await writeNotes(`${CLEAN_ID}.json`, {
      paragraphs: [
        'Note: a colon after a word is prose.',
        'My profile: unchanged, and a file, too.',
      ],
    });
    expect((await inspect()).problems).toEqual([]);
  });

  it('passes a notes file of exactly the byte cap', async () => {
    // The boundary: the cap is the most a file may weigh, so 40,000 bytes is
    // inside it and one more is the plant below.
    const wrapper = JSON.stringify({ paragraphs: [''] });
    const contents = JSON.stringify({ paragraphs: ['a'.repeat(40_000 - wrapper.length)] });
    expect(Buffer.byteLength(contents)).toBe(40_000);

    await writeNotes(`${CLEAN_ID}.json`, contents);
    expect((await inspect()).problems).toEqual([]);
  });

  it('says it read the notes files only when there were some and both rules held', async () => {
    // A rule that is silent when it passes cannot be told apart from one that
    // never ran, so the clean path counts what it read — and says nothing over
    // a build with no `notes/`, or over one where either rule fired.
    const said = async (): Promise<boolean> =>
      (await inspect()).observations.some((line) => line.startsWith('1 notes file(s)'));

    expect(await said(), 'a clean notes file').toBe(true);
    await writeNotes(`${CLEAN_ID}.json`, { paragraphs: [] });
    expect(await said(), 'a misshapen notes file').toBe(false);
    await rm(join(dist, 'notes'), { recursive: true, force: true });
    expect(
      (await inspect()).observations.some((line) => line.includes('notes file(s)')),
      'no notes folder at all',
    ).toBe(false);
  });

  it('reports what it looked at', async () => {
    // Observations are the module's only output besides problems, and the
    // callers print them. An inspection that says nothing when it passes is one
    // nobody can tell apart from an inspection that did not run.
    expect((await inspect()).observations.length).toBeGreaterThan(0);
  });
});

describe('G20 — every rule goes red', () => {
  it('note-body: a canary in a shipped chunk', async () => {
    await expectOnly('note-body', async () => {
      await mkdir(join(dist, '_astro'), { recursive: true });
      await writeFile(
        join(dist, '_astro', 'shelf.js'),
        `const x = ${JSON.stringify(NOTE_BODY_CANARY)};`,
      );
    });
  });

  it('vault-path: a note path in the built page', async () => {
    await expectOnly('vault-path', async () => {
      await writeIndex(`${indexHtml()}\n<!-- Library/note.md -->`);
    });
  });

  it('vault-path: a sourcePath field on a shipped book', async () => {
    await expectOnly('vault-path', async () => {
      await writeLibrary([{ ...CLEAN_BOOK, sourcePath: 'Library/note.md' }]);
    });
  });

  it('empty-library: an index with no books', async () => {
    await expectOnly('empty-library', async () => {
      await writeLibrary([]);
      // The lone cover would otherwise be an orphan, and this test is about the
      // empty index rather than about what that implies.
      await rm(join(dist, 'covers'), { recursive: true, force: true });
      await rm(join(dist, 'notes'), { recursive: true, force: true });
      await rm(join(dist, 'held-covers'), { recursive: true, force: true });
    });
  });

  it('empty-library: no library.json at all', async () => {
    await expectOnly('empty-library', async () => {
      await rm(join(dist, 'library.json'), { force: true });
      await rm(join(dist, 'covers'), { recursive: true, force: true });
      await rm(join(dist, 'notes'), { recursive: true, force: true });
      await rm(join(dist, 'held-covers'), { recursive: true, force: true });
    });
  });

  it('empty-library: an index that is not valid JSON', async () => {
    await expectOnly('empty-library', async () => {
      // Reported apart from a missing one. Four rules below read these books,
      // and all four go quiet here — so this has to be loud, and has to say
      // which of the two happened.
      await writeFile(join(dist, 'library.json'), '{"books": [ truncated');
      await rm(join(dist, 'covers'), { recursive: true, force: true });
      await rm(join(dist, 'notes'), { recursive: true, force: true });
      await rm(join(dist, 'held-covers'), { recursive: true, force: true });
    });
  });

  it('private-book: a book the owner held back', async () => {
    await expectOnly('private-book', async () => {
      await writeLibrary([
        { ...CLEAN_BOOK },
        { title: 'A Book Kept Back', status: 'read', private: true },
      ]);
    });
  });

  it('wishlist-book: a book the owner does not own', async () => {
    await expectOnly('wishlist-book', async () => {
      await writeLibrary([{ ...CLEAN_BOOK }, { title: 'One Day', status: 'wishlist' }]);
    });
  });

  it('foreign-cover: a cover served by somebody else', async () => {
    await expectOnly('foreign-cover', async () => {
      // A hand-edited or imported note can carry an absolute URL, and the shelf
      // passes `cover` straight to an <img src> — which leaks a visitor's IP to
      // whatever host the note named.
      await writeLibrary([{ ...CLEAN_BOOK, cover: 'https://elsewhere.example/a.jpg' }]);
      await rm(join(dist, 'covers'), { recursive: true, force: true });
    });
  });

  it('foreign-cover: a held copy outside its one same-origin segment', async () => {
    // The held copy reaches an <img src> and a texture loader as `cover` does,
    // so every way out of `held-covers/<name>` is a plant: another host, the
    // shelf's folder, a parent step, a nested path, and a value that is not a
    // path at all. The staged file is removed each time, so `orphan-held`
    // stays quiet and the path is the only defect. Round 1 added a host in
    // front of a well-formed tail, which an unanchored pattern passed, a list
    // holding a good path, which `String()` would turn into one, and the
    // encoded spellings a browser decodes before it resolves the segment.
    const plants: readonly unknown[] = [
      'https://elsewhere.example/a.png',
      '//elsewhere.example/a.png',
      'https://elsewhere.example/held-covers/a.png',
      'javascript:alert(1)',
      'covers/a.png',
      'held-covers/',
      'held-covers/..',
      'held-covers/%2e%2e',
      'held-covers/.%2E',
      'held-covers/a%2Fb.png',
      'held-covers/a%5Cb.png',
      'held-covers/%E0%A4%A',
      'held-covers/sub/a.png',
      'held-covers\\a.png',
      42,
      ['held-covers/a.png'],
    ];
    await rm(join(dist, 'held-covers'), { recursive: true, force: true });
    for (const heldCover of plants) {
      await writeLibrary([{ ...CLEAN_BOOK, heldCover }]);
      const fired = new Set((await inspect()).problems.map((problem) => problem.rule));
      expect([...fired], `planted ${JSON.stringify(heldCover)}`).toEqual(['foreign-cover']);
    }
  });

  it('orphan-held: a held copy no shipped book names', async () => {
    await expectOnly('orphan-held', async () => {
      // `orphan-cover`'s twin. A private or wishlist book's held copy, or one a
      // build of another vault left behind, is named for a title.
      await writeHeld('a-real-book-you-actually-read.png', await image(600, 900));
    });
  });

  it('orphan-held: a held copy named for a listed book, one folder down', async () => {
    await expectOnly('orphan-held', async () => {
      await writeHeld('stale/a.png', await image(600, 900));
    });
  });

  it('orphan-held: a held copy left after its book stopped naming it', async () => {
    await expectOnly('orphan-held', async () => {
      // The stale file the prune exists for: the cover shrank below the shelf
      // cap, or the book went private, and the last build's copy stayed.
      await writeLibrary([{ ...CLEAN_BOOK, heldCover: undefined }]);
    });
  });

  it('held-oversize: a held copy over the held cap on its long edge', async () => {
    await expectOnly('held-oversize', async () => {
      // Landscape, so a check that read only the height would pass it.
      await writeHeld('a.png', await image(1201, 800));
    });
  });

  it('held-oversize: a held copy of exactly the cap passes', async () => {
    // The boundary, held clean: the cap is the most an edge may measure.
    await writeHeld('a.png', await image(800, 1200));
    expect((await inspect()).problems).toEqual([]);
  });

  it('held-metadata: a held copy carrying EXIF, XMP, IPTC or PNG text', async () => {
    // One plant per kind and per format: a PNG and a JPEG with EXIF, a PNG
    // with XMP, a JPEG with IPTC and a PNG with a text chunk — the last two
    // can name a place or a person as EXIF can (round 1, the security pair).
    // Each source is first shown to carry what it plants, through the reader
    // the rule uses, so a plant sharp silently dropped cannot pass as a rule
    // that works. A Photoshop block is refused by reading only: nothing here
    // can write one.
    const plants = [
      ['EXIF in a PNG', await image(600, 900, { exif: true })],
      ['EXIF in a JPEG', await image(600, 900, { format: 'jpeg', exif: true })],
      ['XMP in a PNG', await image(600, 900, { xmp: true })],
      ['IPTC in a JPEG', await image(600, 900, { format: 'jpeg', iptc: true })],
      ['text in a PNG', await image(600, 900, { text: true })],
    ] as const;
    for (const [what, bytes] of plants) {
      const planted = await sharp(bytes).metadata();
      expect(
        planted.exif ?? planted.xmp ?? planted.iptc ?? planted.comments,
        `${what}: the plant carries it`,
      ).toBeDefined();

      await writeHeld('a.png', bytes);
      const fired = new Set((await inspect()).problems.map((problem) => problem.rule));
      expect([...fired], `planted ${what}`).toEqual(['held-metadata']);
    }
    exercised.add('held-metadata');
  });

  it('held-metadata: a held copy that is not an image', async () => {
    await expectOnly('held-metadata', async () => {
      await writeHeld('a.png', 'pretend png');
    });
  });

  it('holds held copies to a cap of its own, equal to the stage’s', () => {
    // Written apart so a raised stage cap cannot raise the check with it
    // (round 1, adversarial F2). Moving either one alone is this red line.
    expect(HELD_EDGE_CAP).toBe(HELD_COVER_EDGE);
  });

  it('says it read the held copies only when there were some and all three rules held', async () => {
    // The clean build stages one held copy, so the line is owed; a defect
    // takes it away, and so does a build with no held folder at all.
    expect((await inspect()).observations).toContain(
      '1 held copy file(s), all named, within 1200px, none carrying embedded metadata',
    );

    await writeHeld('a.png', await image(1201, 800));
    expect((await inspect()).observations.join('\n')).not.toMatch(/held copy file/);

    await rm(join(dist, 'held-covers'), { recursive: true, force: true });
    await writeLibrary([{ ...CLEAN_BOOK, heldCover: undefined }]);
    expect((await inspect()).observations.join('\n')).not.toMatch(/held copy file/);
  });

  it.each([
    [
      'orphan-held',
      async () => writeHeld('a-real-book-you-actually-read.png', await image(600, 900)),
      /1 held copy file\(s\) that no book in library\.json names — each filename is a book title: a-real-book-you-actually-read\.png/,
    ],
    [
      'held-oversize',
      async () => writeHeld('a.png', await image(1201, 800)),
      /held-covers\/a\.png is 1201x800, over the 1200px held cap on its long edge/,
    ],
    [
      'held-metadata, unreadable',
      () => writeHeld('a.png', 'pretend png'),
      /held-covers\/a\.png cannot be read as an image, so nothing can vouch for what it carries/,
    ],
    [
      'held-metadata, every kind named',
      async () => writeHeld('a.png', await image(600, 900, { exif: true, xmp: true, text: true })),
      /held-covers\/a\.png carries EXIF and XMP and PNG text — camera metadata, location included/,
    ],
    [
      'held-metadata, IPTC named',
      async () => writeHeld('a.png', await image(600, 900, { format: 'jpeg', iptc: true })),
      /held-covers\/a\.png carries IPTC — /,
    ],
  ] as const)('says in words what it found in the held copies: %s', async (_, plant, message) => {
    // Round 1, integrity F9 to F11: the held rules' messages, pinned as the
    // notes rules' are, so an emptied message is a red test.
    await plant();
    const said = (await inspect()).problems.map((problem) => problem.message).join('\n');
    expect(said).toMatch(message);
  });

  it('orphan-cover: a cover no shipped book points at', async () => {
    await expectOnly('orphan-cover', async () => {
      // Named after a real book, which is the whole problem: the filename is
      // the leak, and a grep of text files opens no JPEG to find it.
      await writeFile(join(dist, 'covers', 'a-real-book-you-actually-read.jpg'), 'pretend jpeg');
    });
  });

  it('orphan-note: a notes file no shipped book is named for', async () => {
    await expectOnly('orphan-note', async () => {
      // `orphan-cover`'s shape (#367, decision 8), and it fires on real bytes,
      // where the canary cannot. An id is a slug of a title, so the filename is
      // the leak before anything inside it is read.
      await writeNotes('a-real-book-you-actually-read-4k5j6h.json', {
        paragraphs: ['Thoughts on a book this build does not list.'],
      });
    });
  });

  it('orphan-note: a file named for a listed book, with another ending', async () => {
    await expectOnly('orphan-note', async () => {
      // Five characters, like `.json`, so a rule that cut the ending off by
      // length without checking it would read this as the clean book's file.
      await writeNotes(`${CLEAN_ID}.text`, { paragraphs: ['A paragraph under the wrong name.'] });
    });
  });

  it('orphan-note: a notes file below a subfolder', async () => {
    await expectOnly('orphan-note', async () => {
      // Named for a listed book, but one folder down. A notes file is
      // `notes/<id>.json` and nothing else, so a nested one names no book.
      await writeNotes(`stale/${CLEAN_ID}.json`, { paragraphs: ['A copy one folder down.'] });
    });
  });

  it('orphan-note: a file named for a listed book that does not carry the mark', async () => {
    await expectOnly('orphan-note', async () => {
      // The stale file the prune exists for: `idFor` is stable, so a section
      // the owner withdrew leaves a file still named for a listed book. Only
      // the mark tells the two apart (spec §3.1).
      await writeLibrary([{ ...CLEAN_BOOK, thoughts: undefined }]);
    });
  });

  it('orphan-note: a marked book whose file is missing', async () => {
    await expectOnly('orphan-note', async () => {
      await rm(join(dist, 'notes', `${CLEAN_ID}.json`));
    });
  });

  it('orphan-note: a marked book and no notes folder at all', async () => {
    // A rule that returned early on a missing folder would read this as a
    // build with nothing to inspect, and pass the mark it never checked.
    await expectOnly('orphan-note', async () => {
      await rm(join(dist, 'notes'), { recursive: true, force: true });
    });
  });

  it('orphan-note: a mark that is anything but `true`, never quoted', async () => {
    // The key trace reads names, never values, so text under a named key
    // passes `unknown-key`. The mark is a flag; anything else is refused, and
    // the message does not repeat what it found.
    // The book's file is removed too, so the stale-file check cannot answer for
    // this clause: the bad mark is the only defect left.
    const prose = 'A sentence of Thoughts a broken writer put in the mark';
    await writeLibrary([{ ...CLEAN_BOOK, thoughts: prose }]);
    await rm(join(dist, 'notes', `${CLEAN_ID}.json`));
    const problems = (await inspect()).problems;

    expect([...new Set(problems.map((problem) => problem.rule))]).toEqual(['orphan-note']);
    expect(problems.map((problem) => problem.message).join('\n')).not.toContain(prose);
  });

  it('notes-shape: a notes file that is not the shape the page reads', async () => {
    // One plant per clause of the schema (spec §3.1), each in the clean book's
    // own file, so `orphan-note` stays quiet and the shape is the only defect.
    const plants: readonly (readonly [string, unknown])[] = [
      ['not JSON', '{"paragraphs": ["truncated'],
      ['JSON null', 'null'],
      ['an array, not an object', ['A paragraph.']],
      ['no paragraphs key', {}],
      ['a second key', { paragraphs: ['A paragraph.'], title: 'A Book' }],
      ['paragraphs not an array', { paragraphs: 'A paragraph.' }],
      ['an empty list', { paragraphs: [] }],
      ['a paragraph that is not a string', { paragraphs: ['A paragraph.', 3] }],
      ['an empty paragraph', { paragraphs: ['A paragraph.', ''] }],
    ];
    for (const [what, contents] of plants) {
      await writeNotes(`${CLEAN_ID}.json`, contents);
      const fired = new Set((await inspect()).problems.map((problem) => problem.rule));
      expect([...fired], `planted ${what}`).toEqual(['notes-shape']);
    }
    exercised.add('notes-shape');
  });

  it('notes-shape: a misshapen file is named in the message, never quoted', async () => {
    // A writer that keyed the file by its prose would otherwise print the
    // owner's Thoughts to the terminal through the very message refusing it.
    // Not the canary, which `note-body` would rightly refuse and quote too.
    const prose = 'A sentence of Thoughts a broken writer used as a key';
    await writeNotes(`${CLEAN_ID}.json`, { [prose]: ['A paragraph.'] });
    const problems = (await inspect()).problems;

    expect(problems.map((problem) => problem.rule)).toEqual(['notes-shape']);
    expect(problems.map((problem) => problem.message).join('\n')).not.toContain(prose);
  });

  it('notes-shape: a notes file over the byte cap, counted in bytes', async () => {
    await expectOnly('notes-shape', async () => {
      // 20,001 two-byte characters: 40,002 bytes in UTF-8, though the string's
      // `.length` is half that. A cap counted in characters would pass it.
      await writeNotes(`${CLEAN_ID}.json`, { paragraphs: ['é'.repeat(20_001)] });
    });
  });

  it('notes-shape: a notes file carrying a URL scheme', async () => {
    // The four the spec names, in the case a vault might write them. A link is
    // flattened to its text before anything ships, so a scheme left over is an
    // address the flattening never saw.
    for (const address of [
      'see https://elsewhere.example/a',
      // Without the slashes, so `://` cannot answer for these two.
      'saved at file:C:/Users/someone/notes.md',
      'opened from obsidian:open?vault=Private',
      'write to MAILTO:someone@example.invalid',
    ]) {
      // Second of two paragraphs, so a check that read only the first, or
      // required every paragraph to carry one, would pass it.
      await writeNotes(`${CLEAN_ID}.json`, {
        paragraphs: ['A clean paragraph.', `A paragraph, ${address}.`],
      });
      const fired = new Set((await inspect()).problems.map((problem) => problem.rule));
      expect([...fired], `planted ${address}`).toEqual(['notes-shape']);
    }
  });

  it('notes-shape: a notes file carrying a comment marker', async () => {
    // The extractor withholds any section holding one, so a correct build never
    // ships a marker and this refuses nothing real. It is the byte cap's
    // reasoning applied to hidden text: a bug that bypassed the extractor's
    // check would otherwise publish an aside the owner never saw on screen.
    // Owner decision on #411, from #410's review.
    for (const marker of [
      '%% an aside %%',
      '<!-- an aside',
      'an aside -->',
      'an aside --!>',
      // A declaration, CDATA and a processing instruction, which hide text too.
      '<!DOCTYPE an aside>',
      '<![CDATA[ an aside ]]>',
      '<?x an aside ?>',
    ]) {
      await writeNotes(`${CLEAN_ID}.json`, {
        paragraphs: ['A clean paragraph.', `A paragraph with ${marker} in it.`],
      });
      const problems = (await inspect()).problems;
      expect([...new Set(problems.map((problem) => problem.rule))], `planted ${marker}`).toEqual([
        'notes-shape',
      ]);
      expect(problems.map((problem) => problem.message).join('\n')).not.toContain('an aside');
    }
  });

  it('notes-shape: a notes file carrying a raw HTML tag', async () => {
    // A tag can hide text in reading view; the extractor withholds any, so a
    // file holding one is a bug that got past it.
    for (const tag of ['<span hidden>an aside</span>', '</b> an aside', '<div', '<a href=x>']) {
      await writeNotes(`${CLEAN_ID}.json`, { paragraphs: ['A clean paragraph.', `Seen ${tag}.`] });
      const problems = (await inspect()).problems;
      expect([...new Set(problems.map((problem) => problem.rule))], `planted ${tag}`).toEqual([
        'notes-shape',
      ]);
      expect(problems.map((problem) => problem.message).join('\n')).not.toContain('an aside');
    }
  });

  // The twin of the extractor's step 10, beyond the comment and tag marks
  // above (spec §3.1.1): a correct build never writes one, so each plant is an
  // extractor regression the deploy must still refuse. Built from code points
  // where the mark is invisible. One row each, so each is seen red alone.
  it.each([
    ['two dollar signs', '$5 and $6 an aside', 'two dollar signs, which may be math'],
    ['an image or embed opener', '![an aside', 'an image or embed opener'],
    ['an inline footnote opener', '^[an aside', 'an inline footnote opener'],
    ['a Dataview field', 'mood:: an aside', 'a Dataview field marker'],
    ['a control character', `an${String.fromCodePoint(0x01)}aside`, 'a control character'],
    ['DEL', `an${String.fromCodePoint(0x7f)}aside`, 'a control character'],
    ['a C1 control character', `an${String.fromCodePoint(0x85)}aside`, 'a control character'],
    // The C1 range's upper edge (round 5, integrity F3).
    ['the last C1 control, U+009F', `an${String.fromCodePoint(0x9f)}aside`, 'a control character'],
    [
      'Unicode tag characters',
      `an aside${String.fromCodePoint(0xe0068, 0xe0069)}`,
      'Unicode tag characters',
    ],
    [
      'a near-miss heading, no-break space',
      `##${String.fromCodePoint(0xa0)}an aside`,
      'a line that may read as a heading',
    ],
    [
      'a near-miss heading, zero-width space',
      `${String.fromCodePoint(0x200b)}## an aside`,
      'a line that may read as a heading',
    ],
    [
      'a near-miss heading on a later line',
      `First line.\n# an aside`,
      'a line that may read as a heading',
    ],
    [
      'bare hashes behind a zero-width space',
      `an aside\n${String.fromCodePoint(0x200b)}##`,
      'a line that may read as a heading',
    ],
    [
      'a setext underline carrying a no-break space',
      `an aside\n---${String.fromCodePoint(0xa0)}`,
      'a line that may read as a heading',
    ],
    // The `=` half, behind a zero-width space and with one inside (round 5,
    // integrity F2).
    [
      'an equals underline behind a zero-width space',
      `an aside\n${String.fromCodePoint(0x200b)}===`,
      'a line that may read as a heading',
    ],
    [
      'an equals underline carrying a no-break space inside',
      `an aside\n==${String.fromCodePoint(0xa0)}==`,
      'a line that may read as a heading',
    ],
  ] as const)('N60 notes-shape: a notes file carrying %s', async (_, mark, words) => {
    await writeNotes(`${CLEAN_ID}.json`, { paragraphs: ['A clean paragraph.', mark] });
    const problems = (await inspect()).problems;
    expect([...new Set(problems.map((problem) => problem.rule))]).toEqual(['notes-shape']);
    const said = problems.map((problem) => problem.message).join('\n');
    // The mark named in words, so a blanked description fails (round 4, integrity F12).
    expect(said).toContain(`carries ${words}`);
    expect(said).not.toContain('an aside');
    exercised.add('notes-shape');
  });

  it('N60 notes-shape: passes the near misses of those marks', async () => {
    // One dollar sign, a `#tag`, a `###`'s text, a lone colon, a thematic break,
    // and a paragraph with line breaks, a tab and accented letters ship from a
    // correct build, so the twin must not refuse them — a twin that read a line
    // break, a tab or any letter past ASCII as a control would refuse every
    // real deploy (round 4, integrity F11).
    await writeNotes(`${CLEAN_ID}.json`, {
      paragraphs: [
        'It cost $20.',
        '#reread',
        '### is not shipped, but this is',
        'Time: an hour.',
        '---',
        'First line,\nsecond line\twith a tab, café and naïve.',
        // Prose holding a no-break space beside dashes is no underline (round 5).
        `A${String.fromCodePoint(0xa0)}thought, and dashes --`,
        `--${String.fromCodePoint(0xa0)}so it goes`,
        // The extractor's own control lines, so both twins are held alike
        // (round 6, integrity F2).
        `One${String.fromCodePoint(0xa0)}--`,
        `==${String.fromCodePoint(0xa0)}so it goes`,
        `One--${String.fromCodePoint(0xa0)}`,
        `=${String.fromCodePoint(0x200b)}word`,
        `So---${String.fromCodePoint(0xa0)}said`,
      ],
    });
    expect((await inspect()).problems).toEqual([]);
  });

  it.each([
    [
      'orphan-note, a bad mark',
      async () => {
        await writeLibrary([{ ...CLEAN_BOOK, thoughts: 'prose' }]);
        await rm(join(dist, 'notes', `${CLEAN_ID}.json`));
      },
      /1 book\(s\) whose `thoughts` mark is not `true`/,
    ],
    [
      'orphan-note, a stray file',
      () => writeNotes('stray-book-1a2b3c.json', { paragraphs: ['A paragraph.'] }),
      /1 notes file\(s\) that no book marked `thoughts: true`.*stray-book-1a2b3c\.json/,
    ],
    [
      'orphan-note, a missing file',
      () => rm(join(dist, 'notes', `${CLEAN_ID}.json`)),
      new RegExp(`1 book\\(s\\) marked \`thoughts: true\` with no notes file.*${CLEAN_ID}`),
    ],
    [
      'headers, no notes block',
      () => writeFile(join(dist, '_headers'), headersFile({ notes: 'absent' })),
      /_headers has no \/notes\/\* block — notes would rest on Pages' default/,
    ],
    [
      'headers, a stale notes block',
      () => writeFile(join(dist, '_headers'), headersFile({ notes: 'stale' })),
      /\/notes\/\* does not revalidate — a section the owner withdrew/,
    ],
    ['notes-shape, not JSON', () => writeNotes(`${CLEAN_ID}.json`, '{'), /is not valid JSON/],
    [
      'notes-shape, not an object',
      () => writeNotes(`${CLEAN_ID}.json`, 'null'),
      /is not a JSON object/,
    ],
    [
      'notes-shape, a second key',
      () => writeNotes(`${CLEAN_ID}.json`, { paragraphs: ['A.'], title: 'B' }),
      /has 2 key\(s\), where exactly one, `paragraphs`, is allowed/,
    ],
    [
      'notes-shape, another layout',
      () => writeNotes(`${CLEAN_ID}.json`, '{ "paragraphs": ["A."] }'),
      /is not byte for byte the form the build writes/,
    ],
    [
      'notes-shape, an empty list',
      () => writeNotes(`${CLEAN_ID}.json`, { paragraphs: [] }),
      /has no paragraphs/,
    ],
    [
      'notes-shape, an empty paragraph',
      () => writeNotes(`${CLEAN_ID}.json`, { paragraphs: [''] }),
      /has a paragraph that is not a non-empty string/,
    ],
    [
      'notes-shape, a URL scheme',
      () => writeNotes(`${CLEAN_ID}.json`, { paragraphs: ['see https://x.example'] }),
      /carries a URL scheme/,
    ],
    [
      'notes-shape, a hidden-text marker',
      () => writeNotes(`${CLEAN_ID}.json`, { paragraphs: ['%% x'] }),
      /carries a hidden-text marker/,
    ],
    [
      'notes-shape, an output-check mark',
      () => writeNotes(`${CLEAN_ID}.json`, { paragraphs: ['$1 and $2'] }),
      /carries two dollar signs, which may be math — the extractor withholds/,
    ],
    [
      'notes-shape, over the byte cap',
      () => writeNotes(`${CLEAN_ID}.json`, { paragraphs: ['a'.repeat(40_001)] }),
      /is \d+ bytes, over the 40000-byte cap/,
    ],
  ] as const)('says in words what it found: %s', async (label, plant, message) => {
    // Round 3's integrity F11: every message here could be emptied with every
    // test green, and an empty message passes "never quoted" trivially.
    await plant();
    const said = (await inspect()).problems.map((problem) => problem.message).join('\n');
    expect(said).toMatch(message);
    if (/notes-shape/.test(label)) expect(said).toContain(`notes/${CLEAN_ID}.json`);
  });

  it('notes-shape: a notes file that repeats its key', async () => {
    await expectOnly('notes-shape', async () => {
      // JSON.parse keeps the last copy, so the first array would be checked by
      // nothing but the byte cap.
      await writeNotes(
        `${CLEAN_ID}.json`,
        '{"paragraphs":["A paragraph a check never reads."],"paragraphs":["A clean paragraph."]}',
      );
    });
  });

  it('notes-shape: the writer’s own bytes, trailing newline and all, are clean', async () => {
    // `publish()` writes `JSON.stringify({ paragraphs })` and a newline. The
    // other plants here write no newline, so without this case a byte-form
    // check that refused the writer's own output would pass every one of them.
    await writeNotes(
      `${CLEAN_ID}.json`,
      `${JSON.stringify({ paragraphs: ['A paragraph the owner chose to share.'] })}\n`,
    );
    expect((await inspect()).problems).toEqual([]);
  });

  it('notes-shape: a notes file in some other JSON layout', async () => {
    await expectOnly('notes-shape', async () => {
      await writeNotes(`${CLEAN_ID}.json`, '{\n  "paragraphs": ["A clean paragraph."]\n}\n');
    });
  });

  it('share-image-origin: a relative og:image', async () => {
    await expectOnly('share-image-origin', async () => {
      // Relative for the whole of the project's life. Every preview scraper
      // requires an absolute URL and silently renders nothing otherwise.
      await writeIndex(indexHtml({ image: '/og.png' }));
    });
  });

  it('share-image-origin: absolute, but naming a file this build never wrote', async () => {
    await expectOnly('share-image-origin', async () => {
      // The half that went missing when two implementations each kept one: the
      // gate asked for absolute-against-origin, the deploy asked for the
      // literal `<origin>/og.png`, and this satisfies the first alone.
      await writeIndex(indexHtml({ image: `${ORIGIN}/hero.png` }));
    });
  });

  it('share-image-missing: no image tag at all', async () => {
    await expectOnly('share-image-missing', async () => {
      await writeIndex(
        `<!doctype html><html><head><meta name="robots" content="noindex">${cspMeta()}</head><body></body></html>`,
      );
    });
  });

  it('robots: the shelf would be searchable', async () => {
    await expectOnly('robots', async () => {
      await writeIndex(indexHtml({ robots: false }));
    });
  });

  it('robots: a *second* page that would be searchable', async () => {
    /**
     * The rule read `dist/index.html` alone for the whole of its life, which was
     * exactly right while the site had one page. `/attribution` is the second,
     * `noindex` is a per-page tag, and a page shipping without one would have
     * passed — turning up in a search result beside the owner's name, which is
     * the single thing the posture exists to prevent.
     *
     * Planted here rather than trusted, because a widened rule nobody has
     * watched go red on the new case is a widened rule in name only.
     */
    await expectOnly('robots', async () => {
      await mkdir(join(dist, 'attribution'), { recursive: true });
      await writeFile(
        join(dist, 'attribution', 'index.html'),
        `<!doctype html><html><head><title>Attribution</title>${cspMeta()}</head><body></body></html>`,
        'utf8',
      );
    });
  });

  it('robots: a Disallow that prevents the noindex being read', async () => {
    await expectOnly('robots', async () => {
      // The intuitive move, and the one that fails: blocking the crawl stops
      // the crawler reading the noindex, and a linked URL can still be indexed
      // on the strength of the link.
      await writeFile(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
    });
  });

  it('csp: a page that states no policy at all', async () => {
    /**
     * The state `main` was in until this rule existed. The shelf's one outbound
     * request has always been same-origin, and nothing preserved that — a
     * `fetch` to a third party added tomorrow passed every gate in this repo.
     */
    await expectOnly('csp', async () => {
      await writeIndex(indexHtml({ csp: false }));
    });
  });

  it('csp: a *second* page that states no policy', async () => {
    /**
     * Per-page, for the reason the robots rule is: `/attribution` is the second
     * page, a meta CSP governs only the document it is in, and a third page
     * shipping without one would inherit no protection from this one.
     *
     * It is also the page that forced the meta-tag design — Astro inlines a
     * stylesheet under 4kB, so `/attribution` carries an inline `<style>` whose
     * hash only a per-page policy can name.
     */
    await expectOnly('csp', async () => {
      await mkdir(join(dist, 'attribution'), { recursive: true });
      await writeFile(
        join(dist, 'attribution', 'index.html'),
        '<!doctype html><html><head><meta name="robots" content="noindex"></head><body></body></html>',
        'utf8',
      );
    });
  });

  it("csp: connect-src widened past 'self'", async () => {
    /**
     * The directive that carries the argument. #119 decided stacks adds no
     * outbound flow carrying anything derived from the owner's reading, and
     * this is the line that makes that decision cost something to break.
     */
    await expectOnly('csp', async () => {
      await writeIndex(
        indexHtml({ csp: cspMeta({ connectSrc: "'self' https://telemetry.example" }) }),
      );
    });
  });

  it('csp: a script origin nobody named', async () => {
    /**
     * The exception has to stay enumerable. `static.cloudflareinsights.com` is
     * permitted because Cloudflare injects Web Analytics at the edge and the
     * policy would otherwise log a violation on every page load; the value of
     * naming it is that a *second* origin cannot arrive unnoticed.
     *
     * Hashes are deliberately not part of this comparison — they change on
     * every build — so what is pinned is the origin set alone.
     */
    await expectOnly('csp', async () => {
      await writeIndex(
        indexHtml({
          csp: cspMeta({
            scriptSrc: "'self' https://static.cloudflareinsights.com https://cdn.example",
          }),
        }),
      );
    });
  });

  it('csp: a directive quietly dropped from the policy', async () => {
    /**
     * The finding that widened this rule, and it is #127's own failure shape.
     *
     * The rule pinned `connect-src` and the script origins and nothing else, so
     * `default-src 'none'`, `img-src`, `base-uri` and `form-action` could each
     * be deleted from `astro.config.mjs` with every gate green and the page
     * pixel-identical — while `_headers` and ADR-0065 went on describing a
     * policy that no longer said what they claimed. A comment asserting a
     * mitigation nothing enforces is the exact defect this issue exists to
     * close, and leaving four directives in that state inside the fix for it is
     * not a smaller version of the problem.
     */
    await expectOnly('csp', async () => {
      await writeIndex(indexHtml({ csp: cspMeta({ omit: 'default-src' }) }));
    });
  });

  it('csp: a directive nobody named, widening the policy past `default-src`', async () => {
    /**
     * Raised by review on the pull request, and it is the sharper half of the
     * finding above: the rule walked `CSP_DIRECTIVES` and never looked at what
     * else the policy declared. **A specific fetch directive overrides
     * `default-src` for its own resource type**, so `object-src *`,
     * `frame-src https://example.com` or `worker-src *` each widen the policy
     * with every named directive still exactly right.
     *
     * `script-src-elem` is the one that matters most: it takes precedence over
     * `script-src` for `<script>` elements, so it would have defeated the pinned
     * beacon origin — the one exception this rule exists to keep enumerable —
     * without touching the `script-src` line the rule was reading.
     */
    await expectOnly('csp', async () => {
      await writeIndex(
        indexHtml({ csp: cspMeta({ extra: 'script-src-elem https://cdn.example' }) }),
      );
    });
  });

  it('headers: framing is no longer denied by the header policy', async () => {
    /**
     * `frame-ancestors` is the one directive a `<meta>` CSP cannot carry —
     * browsers ignore it there — so it lives in `_headers`, alone, as a policy
     * of one directive. That is **not** a second copy of the page policy: the
     * two are disjoint, so neither can drift from the other, and a policy with
     * no fetch directives restricts nothing but framing.
     */
    await expectOnly('headers', async () => {
      await writeFile(join(dist, '_headers'), headersFile({ frameAncestors: false }));
    });
  });

  it('headers: framing is no longer denied to the older mechanism', async () => {
    /**
     * `X-Frame-Options` is kept beside `frame-ancestors` rather than replaced by
     * it. For `DENY` the two are equivalent in every browser that matters, with
     * one narrow exception worth the line: `frame-ancestors` covers `<embed>`
     * and `<object>` uniformly where `X-Frame-Options` historically did not, and
     * `X-Frame-Options` is honoured by clients predating CSP framing. Belt and
     * braces on a control with no cost, and both are asserted so neither can be
     * deleted on the theory that the other covers it.
     */
    await expectOnly('headers', async () => {
      await writeFile(join(dist, '_headers'), headersFile({ frameOptions: false }));
    });
  });

  it('headers: no _headers at all', async () => {
    await expectOnly('headers', async () => {
      await rm(join(dist, '_headers'), { force: true });
    });
  });

  it('headers: covers that do not revalidate, with a neighbour that does', async () => {
    await expectOnly('headers', async () => {
      // The divergence this whole module exists for — and the shape that
      // matters. `deploy:site` checked only that the file existed. The gate's
      // check searched the whole text for `/covers/*` followed by a
      // `max-age=0`, which the `/og.png` block below satisfies on its own, so
      // it went green over a covers block that no longer said anything.
      await writeFile(join(dist, '_headers'), headersFile({ coversCacheControl: false }));
    });
  });

  it('headers: notes that do not revalidate', async () => {
    await expectOnly('headers', async () => {
      // A withdrawn section must not live on in a browser cache (spec §3.3).
      await writeFile(join(dist, '_headers'), headersFile({ notes: 'stale' }));
    });
  });

  it('headers: notes whose only revalidate is inside another header', async () => {
    await expectOnly('headers', async () => {
      // The words, but not as the header: the rule reads a `Cache-Control:`
      // line, never the text anywhere in one.
      const headers = headersFile({ notes: 'absent' }).concat(
        '/notes/*\n  X-Note: Cache-Control: public, max-age=0\n',
      );
      await writeFile(join(dist, '_headers'), headers);
    });
  });

  it('headers: a notes block that revalidates beside another header is clean', async () => {
    // One revalidating Cache-Control is enough; the block may carry others.
    const headers = headersFile({ notes: 'absent' }).concat(
      '/notes/*\n  X-Content-Type-Options: nosniff\n  Cache-Control: public, max-age=0, must-revalidate\n',
    );
    await writeFile(join(dist, '_headers'), headers);
    expect((await inspect()).problems).toEqual([]);
  });

  it('headers: no /notes/* block at all', async () => {
    await expectOnly('headers', async () => {
      await writeFile(join(dist, '_headers'), headersFile({ notes: 'absent' }));
    });
  });

  it('headers: held copies that do not revalidate', async () => {
    await expectOnly('headers', async () => {
      // Images, so Pages' four-hour default applies: a cover taken down would
      // linger in browsers that long after the prune (spec §3.3).
      await writeFile(join(dist, '_headers'), headersFile({ held: 'stale' }));
    });
  });

  it('headers: no /held-covers/* block at all', async () => {
    await expectOnly('headers', async () => {
      await writeFile(join(dist, '_headers'), headersFile({ held: 'absent' }));
    });
  });

  it('headers: no /covers/* block at all', async () => {
    await expectOnly('headers', async () => {
      await writeFile(
        join(dist, '_headers'),
        '/*\n  X-Robots-Tag: noindex\n\n/og.png\n  Cache-Control: max-age=0\n',
      );
    });
  });

  it('unknown-key: a shipped book carrying a key nobody named', async () => {
    /**
     * The failure this rule exists for: somebody adds a field, wires it through
     * `toLibraryBook`, and it ships. G30 asserts that seam against a synthetic
     * record; this asserts it against the bytes in the folder, which is the
     * only version of the assertion that can see a real deploy.
     *
     * `narrator` is not hypothetical — an Audible import knows one, `BookInput`
     * carries `extra` for exactly that class, and nothing but this stands
     * between an extra key and `library.json`.
     */
    await expectOnly('unknown-key', async () => {
      await writeLibrary([{ ...CLEAN_BOOK, narrator: 'A Narrator' }]);
    });
  });

  it('note-body: a canary inside a named field, which the key trace does not see', async () => {
    /**
     * Where the boundary actually sits, demonstrated rather than asserted.
     *
     * `subjects` is a named `BookRecord` field, correctly wired, so the key
     * trace passes over it whatever it contains — the spec says so twice and
     * this proves it, because `expectOnly` would fail if `unknown-key` fired
     * here. What catches it is `note-body`, greping `library.json`'s contents:
     * honest in `gate:public` where the canary exists, and vacuous on the real
     * `dist/`, which is exactly the gap this rule was added beside.
     *
     * So a fixture build catches body text in a permitted field and a real
     * deploy does not, and neither check is the one people assume.
     */
    await expectOnly('note-body', async () => {
      await writeLibrary([{ ...CLEAN_BOOK, subjects: NOTE_BODY_CANARY }]);
    });
  });

  it('og-image: no share image in the folder', async () => {
    await expectOnly('og-image', async () => {
      await rm(join(dist, 'og.png'), { force: true });
    });
  });

  it('og-image: an implausibly small share image', async () => {
    await expectOnly('og-image', async () => {
      await writeFile(join(dist, 'og.png'), 'truncated');
    });
  });
});

describe('G20 — the rule list cannot grow blind spots', () => {
  it('has watched every rule go red', () => {
    // The anti-vacuity assertion, in the spirit of `expectFound`. Adding a
    // rule without a defect that produces it is a red build, so this gate
    // cannot quietly come to cover all but one. (It said "a twelfth rule" until
    // a twelfth arrived, which is a count in a comment doing what counts do.)
    const missing = PUBLIC_BUILD_RULES.filter((rule) => !exercised.has(rule));
    expect(
      missing,
      `rules with no planted defect above: ${missing.join(', ')}. A rule nobody has ` +
        'watched go red is not yet gated.',
    ).toEqual([]);
  });
});
