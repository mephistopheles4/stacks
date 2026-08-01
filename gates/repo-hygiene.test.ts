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
 * See docs/gates.md, rows G5 and G13.
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { expectFound, REPO_ROOT } from './repo.ts';

/** Everything git is actually tracking, as repo-relative POSIX paths. */
function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.split('\n').filter((line) => line.length > 0);
}

function isIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', path], { cwd: REPO_ROOT });
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
 */
const GENERATED_BINARY_DIRS = ['fixtures/vault/Library/covers/'];

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
    expect(isIgnored('packages/site/public/og.png')).toBe(true);
    expect(isIgnored('artifacts/shelf.png')).toBe(true);
  });
});

describe('G13 — no third-party material is committed', () => {
  it('tracks no binary outside the generated fixture covers', () => {
    const offenders = trackedFiles().filter(
      (path) =>
        BINARY.test(path) && !GENERATED_BINARY_DIRS.some((dir) => path.startsWith(dir)),
    );

    expect(
      offenders,
      'committed binaries outside the generated fixture covers. Real cover art is ' +
        "somebody else's copyrighted image and is never committed — see fixtures/README.md: " +
        offenders.join(', '),
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
});
