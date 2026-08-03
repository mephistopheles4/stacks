/**
 * G20 — one cover-preference rule, one implementation.
 *
 * Which cover URL to try first is a rule about two fields of `BookMetadata`:
 * `coverUrlLarge` before `coverUrl`, because Google's larger image is sometimes
 * a high-resolution cover and sometimes the publisher's jacket spread, and only
 * fetching it tells you which. `coverUrls()` states that once.
 *
 * It was stated three times, in `add-book.ts`, `enrich.ts` and `import/`. They
 * agreed — which is exactly the position G10 describes, where two copies of one
 * rule agreed until one of them didn't. **The difference here is that this rule
 * fails silently.** Reverse the pair and you keep Google's ~128px thumbnail
 * instead of the large image: a cover still lands on disk, `cover_source` is
 * still correct, every existing test still passes, and the shelf is quietly
 * worse. Nothing goes red, so nothing but a structural check can catch it.
 *
 * The assertion is structural rather than behavioural for the same reason G10's
 * is: it holds for code nobody has written yet. The next command that needs a
 * cover has to find the helper instead of writing the pair out again.
 *
 * See docs/gates.md, row G20.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expectFound, filesUnder, readRepoFile, REPO_ROOT } from './repo.ts';

/**
 * The one place that ranks cover URLs — and the providers that populate the
 * fields, which necessarily name them.
 *
 * Scoped to the directory rather than a single file because the metadata layer
 * is where `coverUrlLarge` is *produced*: `google-books.ts` reads it out of a
 * response and `index.ts` carries it across a gap-fill. Those are not copies of
 * the preference rule, and a gate that forbade them would be forbidding the
 * field's existence.
 */
const OWNER_DIR = 'packages/core/src/metadata/';

/** Where the ranking itself lives, named so a move has to be deliberate. */
const OWNER = 'packages/core/src/metadata/types.ts';

/**
 * Files that name `cacheCover` without calling it: the module that defines it,
 * and the package root that re-exports it. Neither has candidates to rank.
 */
const NOT_A_CALLER: ReadonlySet<string> = new Set([
  'packages/core/src/covers/cache-cover.ts',
  'packages/core/src/index.ts',
]);

function sourceFiles(): string[] {
  return filesUnder('packages', ['.ts']).filter((path) => !path.endsWith('.test.ts'));
}

describe('G20 — one cover-preference implementation', () => {
  it('scans a plausible number of source files', () => {
    expectFound(sourceFiles(), 'source files to scan', 20);
  });

  it('keeps the helper where the gate says it is', () => {
    // Everything below is scoped to a directory, so a `coverUrls` that moved
    // out of the metadata layer would leave this gate asserting over nothing.
    expect(existsSync(join(REPO_ROOT, OWNER)), `${OWNER} is missing`).toBe(true);
    expect(readRepoFile(OWNER), `${OWNER} should define coverUrls`).toMatch(
      /export function coverUrls\b/,
    );
  });

  it('is the only place that ranks the two cover URLs', () => {
    const offenders = sourceFiles().filter((path) => {
      if (path.startsWith(OWNER_DIR)) return false;
      return /\bcoverUrlLarge\b/.test(readRepoFile(path));
    });

    expect(
      offenders,
      'these name coverUrlLarge outside the metadata layer, which means they are ' +
        `ordering the candidates by hand instead of calling coverUrls() from ${OWNER}. ` +
        `Getting the order backwards costs cover quality and fails no test: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('routes every cover download through the ranked list', () => {
    // The reverse direction: a caller that reaches for cacheCover must have got
    // its candidates from somewhere. Each of these builds its list differently
    // — the importer deliberately prepends the export's own artwork — but all
    // three rank a metadata record through the same helper.
    const callers = sourceFiles().filter(
      (path) => !NOT_A_CALLER.has(path) && /\bcacheCover\(/.test(readRepoFile(path)),
    );
    expectFound(callers, 'modules that call cacheCover', 3);

    const unranked = callers.filter((path) => !/\bcoverUrls\(/.test(readRepoFile(path)));

    expect(
      unranked,
      `these download a cover without ranking the candidates through coverUrls(): ${unranked.join(', ')}`,
    ).toEqual([]);
  });
});
