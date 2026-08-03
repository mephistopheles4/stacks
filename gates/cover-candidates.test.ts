/**
 * G22 — one cover-preference rule, one implementation.
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
 * still correct, and the shelf is quietly worse.
 *
 * **This file gates only half of that**, and the row is written to say so. What
 * is asserted here is *one implementation* — structural, so it holds for code
 * nobody has written yet, and the next command needing a cover has to find the
 * helper instead of writing the pair out again. That the one implementation
 * ranks the pair the *right way round* is not checkable from the file tree, and
 * for a while nothing checked it anywhere: reversing `coverUrls` left the whole
 * suite green. It is now pinned behaviourally, through the downloader, in
 * `packages/core/src/covers/cache-cover.test.ts`. Neither half is sufficient.
 *
 * See docs/gates.md, row G22.
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

/**
 * A file with its comments blanked out, so the assertions below read code.
 *
 * `docs/gates.md` logs this defect twice, under G14 and G19 — *a gate that
 * matches prose matches anything* — and the caller check below is vulnerable to
 * it in the permissive direction: a new caller that hand-orders its candidates
 * would need only to mention `coverUrls()` in a comment to look compliant.
 * Comments are replaced with spaces rather than removed so every offset
 * survives, and a failure still points at the right place.
 *
 * **`//` is not treated as a comment when a colon precedes it**, because
 * `https://covers.openlibrary.org/…` is a string this codebase is full of, and
 * blanking the rest of that line would hide real code from the sweep — which is
 * the same family of defect one level down: a regex deciding about text it does
 * not parse. This is still not a parser. It does not know a `//` inside a string
 * literal from one starting a comment, and the honest limit is that it handles
 * the two shapes that actually occur here: URLs, and comments.
 */
function codeOf(path: string): string {
  return readRepoFile(path).replace(/\/\*[\s\S]*?\*\/|(?<!:)\/\/[^\n]*/g, (match) =>
    match.replace(/[^\n]/g, ' '),
  );
}

describe('G22 — one cover-preference implementation', () => {
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
    // Anchors the search positively before asserting the negative. `expectFound`
    // above guards the file *walk*, not the *symbol*: renaming `coverUrlLarge`
    // would otherwise leave this sweeping for a string that no longer exists and
    // passing over an empty set — the vacuity failure docs/gates.md records
    // three instances of.
    const inOwner = sourceFiles().filter(
      (path) => path.startsWith(OWNER_DIR) && /\bcoverUrlLarge\b/.test(codeOf(path)),
    );
    expectFound(inOwner, 'files in the metadata layer naming coverUrlLarge', 2);

    const offenders = sourceFiles().filter((path) => {
      if (path.startsWith(OWNER_DIR)) return false;
      return /\bcoverUrlLarge\b/.test(codeOf(path));
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
      (path) => !NOT_A_CALLER.has(path) && /\bcacheCover\(/.test(codeOf(path)),
    );
    expectFound(callers, 'modules that call cacheCover', 3);

    const unranked = callers.filter((path) => !/\bcoverUrls\(/.test(codeOf(path)));

    expect(
      unranked,
      `these download a cover without ranking the candidates through coverUrls(): ${unranked.join(', ')}`,
    ).toEqual([]);
  });

  it('exempts no file that actually calls cacheCover', () => {
    // The allowlist bites permissively: a file on it is skipped by the caller
    // check above, permanently. ADR-0022 requires every allowlisted entry to
    // still exist *and* still need its exemption; G10 asserts the same of its
    // own.
    //
    // "Still needs it" is the subtle half, and the first version of this got it
    // wrong: it asked whether the file still defines or re-exports cacheCover,
    // which `index.ts` does forever — so a file could re-export it *and* call
    // it, and both this check and the caller check would wave it through. That
    // is the exact scenario the exemption is supposed to make impossible.
    //
    // So the question is not "does it still look like a non-caller" but "is
    // there a call site here". A re-export names cacheCover with no `(`; the
    // definition is the one `cacheCover(` that is not a call, so it is removed
    // before looking.
    for (const path of NOT_A_CALLER) {
      expect(existsSync(join(REPO_ROOT, path)), `exempt file no longer exists: ${path}`).toBe(true);

      const withoutDefinition = codeOf(path).replace(
        /(?:export\s+)?(?:async\s+)?function\s+cacheCover\s*\(/g,
        '',
      );

      expect(
        /\bcacheCover\(/.test(withoutDefinition),
        `${path} is exempt from the caller check, but it calls cacheCover. Drop it from ` +
          'NOT_A_CALLER and rank its candidates through coverUrls().',
      ).toBe(false);
    }
  });
});
