/**
 * G5 — the vault is the source of truth (invariant 1).
 * G13 — no third-party material is committed, ever.
 *
 * G5 is one line of the invariant made mechanical: `library.json` is a build
 * artifact, always regenerable, never hand-edited, gitignored. The way that
 * rule breaks is not somebody editing the file — it is somebody committing it,
 * after which it stops being regenerable and starts being a second database.
 *
 * G13 is the rule most likely to be broken by someone who has never read
 * `fixtures/README.md`, and it is invisible to every other gate here. Cover art
 * from a provider is somebody else's copyrighted image; the project's standing
 * constraint is that none of it is committed, and that fixtures are wholly
 * invented. Real covers exist at runtime only, in a gitignored vault. A
 * contributor adding one real cover to "improve the fixtures" would be the
 * easiest possible way to create a legal problem, and nothing but this would
 * notice.
 *
 * See docs/gates.md, rows G5 (vault-is-truth) and G13 (no-third-party-material).
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { expectFound, REPO_ROOT, trackedFiles } from './repo.ts';

function isIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', path], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether any `.gitignore` **rule** names this path, tracked or not.
 *
 * `git check-ignore` consults the index and never reports a tracked file as
 * ignored — correct, since tracking wins — but it makes "this file must not be
 * ignored" unfalsifiable for a file that is currently tracked. Adding the rule
 * back changes nothing it can see, which is precisely the change worth
 * catching. `--no-index` reads the rules instead of the outcome.
 */
function matchesIgnoreRule(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', '--', path], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

const BINARY = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|ico|pdf|mp3|m4a|m4b|mp4|zip)$/i;

/**
 * The only committed binaries, and why each is allowed.
 *
 * `fixtures/vault/Library/covers/` holds two-tone PNGs emitted by
 * `scripts/make-fixture-covers.ts` — a ~40-line zero-dep encoder over
 * node:zlib. They depict nothing; they exist so the dominant-colour extractor
 * has something non-uniform to find.
 *
 * `docs/images/` holds the README's screenshot, cropped by
 * `scripts/make-readme-image.ts` from what `pnpm smoke:render` renders — and
 * that gate renders the **50-book fixture vault**, so every title on those
 * spines is invented too. That is the whole reason this directory can be
 * allowlisted: the same render pointed at a real vault would publish somebody's
 * reading list and somebody else's cover art, which is exactly what this row
 * exists to stop. An entry here is a claim about *provenance*, never about file
 * type.
 */
const GENERATED_BINARY_DIRS = ['fixtures/vault/Library/covers/', 'docs/images/'];

/**
 * The brand art, allowed one filename at a time.
 *
 * Same claim as the two directories above and a cleaner one: these were drawn
 * for this app. The icons are rasterised from the committed SVGs beside them by
 * `scripts/make-icons.ts`; `og.png` is the designed share card. There is no
 * third party anywhere near any of them.
 *
 * Filenames rather than a directory, because the directory is
 * `packages/site/public/` — the folder `stacks build --public` stages a real
 * vault's covers into. A prefix entry there would allow committing exactly the
 * thing this rule exists to stop, and it would do it in the one place a real
 * cover is already sitting on disk. So each file is named, and anything else
 * that appears beside them goes red.
 */
const BRAND_BINARY_FILES = [
  'packages/site/public/favicon-16.png',
  'packages/site/public/favicon-32.png',
  'packages/site/public/apple-touch-icon.png',
  'packages/site/public/og.png',
];

describe('G5 — library.json is a build artifact', () => {
  it('is not tracked by git', () => {
    const tracked = trackedFiles();
    expectFound(tracked, 'tracked files', 20);

    const committed = tracked.filter((path) => path.endsWith('library.json'));
    expect(
      committed,
      `library.json is a build artifact and must stay regenerable: ${committed.join(', ')}`,
    ).toEqual([]);
  });

  it('is gitignored wherever it gets written', () => {
    // Both the default local output and the staged public one.
    expect(isIgnored('library.json')).toBe(true);
    expect(isIgnored('packages/site/public/library.json')).toBe(true);
  });

  it('keeps the rest of the build output out too', () => {
    expect(isIgnored('packages/site/public/covers/anything.jpg')).toBe(true);
    expect(isIgnored('artifacts/shelf.png')).toBe(true);

    // `og.png` sits in that same folder and is deliberately *not* ignored: it
    // is the designed share card, committed, and `publish()` no longer writes
    // one. If a build ever starts rendering it again, this is the line that
    // says the two decisions have to move together — and it reads the rule
    // rather than the outcome, because the outcome cannot change while the file
    // is tracked.
    expect(matchesIgnoreRule('packages/site/public/og.png')).toBe(false);
  });
});

describe('G13 — no third-party material is committed', () => {
  it('tracks no binary outside the generated fixture covers and the brand art', () => {
    const allowedFiles = new Set(BRAND_BINARY_FILES);
    const offenders = trackedFiles().filter(
      (path) =>
        BINARY.test(path) &&
        !GENERATED_BINARY_DIRS.some((dir) => path.startsWith(dir)) &&
        !allowedFiles.has(path),
    );

    expect(
      offenders,
      'committed binaries outside the generated fixture covers and the brand art. Real ' +
        "cover art is somebody else's copyrighted image and is never committed — see " +
        `fixtures/README.md: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('still tracks the generated fixture covers, so the rule is not vacuous', () => {
    // If the fixture covers vanished, the assertion above would pass over an
    // empty set and stop meaning anything.
    const fixtures = trackedFiles().filter((path) =>
      GENERATED_BINARY_DIRS.some((dir) => path.startsWith(dir)),
    );
    expectFound(fixtures, 'generated fixture covers', 5);
  });

  it('has no allowlisted directory that has gone empty', () => {
    for (const dir of GENERATED_BINARY_DIRS) {
      const inside = trackedFiles().filter((path) => path.startsWith(dir));
      expect(inside.length, `${dir} is allowlisted but tracks nothing — drop it`).toBeGreaterThan(0);
    }
  });

  it('tracks every allowlisted brand file', () => {
    // Both halves of a named entry. A file that stopped being committed leaves
    // a permission behind for something nobody ships, and — because the page
    // links all four — a 404 on every visit that no other gate would notice.
    // `og.png` is the one that matters most: it was written by `publish()`
    // until it became committed art, so the failure mode is a build quietly
    // going back to overwriting it and someone deleting the "stale" original.
    const tracked = new Set(trackedFiles());
    const missing = BRAND_BINARY_FILES.filter((path) => !tracked.has(path));

    expect(
      missing,
      'allowlisted as brand art but not tracked — the page links every one of these, ' +
        `so a missing file is a 404 on every visit: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps docs/images to exactly the generated screenshot', () => {
    // A directory-level permission is broader than the rest of this allowlist,
    // and nothing here can inspect an image to tell an invented shelf from a
    // real one. So the *filename* is pinned instead: dropping any other picture
    // in beside it goes red, and replacing this one is a deliberate act that
    // shows up in review as a changed binary rather than as a new file nobody
    // looks at. Regenerate with:
    //   pnpm smoke:render && pnpm tsx scripts/make-readme-image.ts
    const images = trackedFiles().filter((path) => path.startsWith('docs/images/'));

    expect(
      images,
      'docs/images/ holds the README screenshot rendered from the fixture vault, and ' +
        'nothing else. A picture of a real shelf publishes real titles and real cover ' +
        `art — see fixtures/README.md: ${images.join(', ')}`,
    ).toEqual(['docs/images/shelf.png']);
  });
});
