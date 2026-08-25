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
import { join } from 'node:path';
import {
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
  readonly title: string;
  readonly cover?: string;
  readonly status?: string;
  readonly private?: boolean;
  readonly sourcePath?: string;
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

/**
 * The smallest folder that passes every rule.
 *
 * Deliberately hand-written rather than copied from a real build: a real one
 * would drag in whatever Astro happens to emit this month, and the point here
 * is to control exactly one variable per test. The real-build direction is
 * `pnpm gate:public`'s job.
 */
async function writeCleanBuild(): Promise<void> {
  await writeLibrary([{ title: 'A Book', cover: 'covers/a.jpg', status: 'read' }]);
  await writeIndex(indexHtml());
  await mkdir(join(dist, 'covers'), { recursive: true });
  await writeFile(join(dist, 'covers', 'a.jpg'), 'pretend jpeg');
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
  options: { coversCacheControl?: boolean; frameOptions?: boolean; frameAncestors?: boolean } = {},
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
  const fired = new Set(inspect().problems.map((problem) => problem.rule));
  expect([...fired].sort(), `planted a ${rule} defect`).toEqual([rule]);
  exercised.add(rule);
}

describe('G20 — a clean build', () => {
  it('reports no problems at all', () => {
    const report = inspect();
    expect(
      report.problems.map((problem) => `${problem.rule}: ${problem.message}`),
      'the synthetic clean build must satisfy every rule, or nothing below is attributable',
    ).toEqual([]);
  });

  it('reports what it looked at', () => {
    // Observations are the module's only output besides problems, and the
    // callers print them. An inspection that says nothing when it passes is one
    // nobody can tell apart from an inspection that did not run.
    expect(inspect().observations.length).toBeGreaterThan(0);
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
      await writeLibrary([
        { title: 'A Book', cover: 'covers/a.jpg', status: 'read', sourcePath: 'Library/note.md' },
      ]);
    });
  });

  it('empty-library: an index with no books', async () => {
    await expectOnly('empty-library', async () => {
      await writeLibrary([]);
      // The lone cover would otherwise be an orphan, and this test is about the
      // empty index rather than about what that implies.
      await rm(join(dist, 'covers'), { recursive: true, force: true });
    });
  });

  it('empty-library: no library.json at all', async () => {
    await expectOnly('empty-library', async () => {
      await rm(join(dist, 'library.json'), { force: true });
      await rm(join(dist, 'covers'), { recursive: true, force: true });
    });
  });

  it('empty-library: an index that is not valid JSON', async () => {
    await expectOnly('empty-library', async () => {
      // Reported apart from a missing one. Four rules below read these books,
      // and all four go quiet here — so this has to be loud, and has to say
      // which of the two happened.
      await writeFile(join(dist, 'library.json'), '{"books": [ truncated');
      await rm(join(dist, 'covers'), { recursive: true, force: true });
    });
  });

  it('private-book: a book the owner held back', async () => {
    await expectOnly('private-book', async () => {
      await writeLibrary([
        { title: 'A Book', cover: 'covers/a.jpg', status: 'read' },
        { title: 'A Book Kept Back', status: 'read', private: true },
      ]);
    });
  });

  it('wishlist-book: a book the owner does not own', async () => {
    await expectOnly('wishlist-book', async () => {
      await writeLibrary([
        { title: 'A Book', cover: 'covers/a.jpg', status: 'read' },
        { title: 'One Day', status: 'wishlist' },
      ]);
    });
  });

  it('foreign-cover: a cover served by somebody else', async () => {
    await expectOnly('foreign-cover', async () => {
      // A hand-edited or imported note can carry an absolute URL, and the shelf
      // passes `cover` straight to an <img src> — which leaks a visitor's IP to
      // whatever host the note named.
      await writeLibrary([
        { title: 'A Book', cover: 'https://elsewhere.example/a.jpg', status: 'read' },
      ]);
      await rm(join(dist, 'covers'), { recursive: true, force: true });
    });
  });

  it('orphan-cover: a cover no shipped book points at', async () => {
    await expectOnly('orphan-cover', async () => {
      // Named after a real book, which is the whole problem: the filename is
      // the leak, and a grep of text files opens no JPEG to find it.
      await writeFile(join(dist, 'covers', 'a-real-book-you-actually-read.jpg'), 'pretend jpeg');
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
      await writeLibrary([
        { title: 'A Book', cover: 'covers/a.jpg', status: 'read', narrator: 'A Narrator' },
      ]);
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
      await writeLibrary([
        { title: 'A Book', cover: 'covers/a.jpg', status: 'read', subjects: NOTE_BODY_CANARY },
      ]);
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
