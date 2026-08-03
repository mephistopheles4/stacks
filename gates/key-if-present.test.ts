/**
 * G23 — one absent-key helper, one implementation, under any name.
 *
 * `keyIfPresent` existed six times before it existed once: four files called it
 * `maybe`, one `optional`, one `pick`, and every body was byte-identical. The
 * three names are the whole lesson. Grepping for any one of them found a
 * subset, so each author checked, found nothing, and wrote it again — and the
 * architecture review that catalogued this codebase's duplication missed it for
 * the same reason.
 *
 * **So this gate matches on what a function returns, never on what it is
 * called.** An identifier check would have been satisfied by all six the day it
 * was written. The anchor is `return <ident> === undefined ? {}`, which is the
 * behaviour that makes this helper what it is: absent in, nothing out. A
 * seventh copy escapes only by no longer returning `{}` for an absent value, at
 * which point it is a different function.
 *
 * The ~27 inline `...(x === undefined ? {} : { k: x })` spreads are deliberately
 * outside this. They contain the same *text* and are not copies of anything —
 * each is one decision at one call site. The `return` in the anchor is what
 * separates them, and it needs no exempt list to do it: a spread has no return
 * statement. That is why this gate has no allowlist and therefore no allowlist
 * entry that can go stale (ADR-0022).
 *
 * There is no exemption for `packages/site/` either, even though the site
 * cannot value-import `@stacks/core` (G6). If a copy ever appears there the
 * gate goes red, and the fix is to promote the owner to a pure subpath beside
 * `@stacks/core/shelf-order` — an actionable red, not a false one.
 *
 * See docs/gates.md, row G23.
 */

import { describe, expect, it } from 'vitest';
import { codeOf, expectFound, filesUnder } from './repo.ts';

/** The one definition. */
const OWNER = 'packages/core/src/key-if-present.ts';

/**
 * The owner's own spec, which names the helper constantly and uses it for
 * nothing. Counting it as a caller is not a harmless overcount: it inflates the
 * floor below by one, and an inflated floor is slack that exactly one caller can
 * revert into. That is not hypothetical — it is how this clause first passed a
 * mutation it was written to fail.
 */
const OWNER_SPEC = 'packages/core/src/key-if-present.test.ts';

/**
 * Absent in, nothing out — as a return statement.
 *
 * Deliberately not anchored to the parameter names, the type parameters or the
 * cast that follows: a seventh copy is likely to vary all three and unlikely to
 * vary this. `\{\}` rather than `\{` is load-bearing — `frontmatter.ts` returns
 * `[]` from the same shape for a different reason, and that is not this.
 */
const RETURNS_NOTHING_WHEN_ABSENT = /return\s+[A-Za-z_$][\w$]*\s*===\s*undefined\s*\?\s*\{\}/;

/** Every `.ts` in the repo's three code roots, tests included — a copy is a copy. */
function scanned(): string[] {
  return [...filesUnder('packages', ['.ts']), ...filesUnder('gates', ['.ts']), ...filesUnder('scripts', ['.ts'])];
}

describe('G23 — one absent-key helper', () => {
  it('scans a plausible number of source files', () => {
    expectFound(scanned(), 'source files to scan', 60);
  });

  /**
   * The vacuity anchor, and the assertion this gate needs most.
   *
   * Every check below is phrased as an absence — "no file outside the owner
   * does this" — and an absence is satisfied for free the moment the pattern
   * stops matching anything at all. Reformat the helper, or let a prettier
   * config split the ternary across lines, and the sweep would pass over an
   * empty set for ever. Asserting the owner still matches is what makes the
   * other assertions mean something.
   */
  it('matches the owner, so the pattern cannot silently stop matching', () => {
    expect(RETURNS_NOTHING_WHEN_ABSENT.test(codeOf(OWNER))).toBe(true);
  });

  it('finds no second implementation, under any name', () => {
    const copies = scanned().filter(
      (path) => path !== OWNER && RETURNS_NOTHING_WHEN_ABSENT.test(codeOf(path)),
    );

    expect(
      copies,
      `these files define their own absent-key helper. There is one, in ${OWNER}, ` +
        'and it is called `keyIfPresent` — import it. This gate matches the body ' +
        'rather than the name because the last six copies wore three different names.',
    ).toEqual([]);
  });

  /**
   * The permissive half, and the reason the sweep above is not enough.
   *
   * "No file defines its own" is satisfied perfectly by a repo where nobody
   * uses the helper at all — every caller having quietly gone back to writing
   * the key unconditionally. That is the failure this exists to catch, and it
   * is the same shape as G22's `routes every cover download` clause: a positive
   * check cannot detect a missing one, so both directions get asserted.
   */
  it('is actually used, by every file that used to have its own copy', () => {
    const callers = scanned().filter(
      (path) =>
        path !== OWNER && path !== OWNER_SPEC && /\bkeyIfPresent\s*\(/.test(codeOf(path)),
    );

    // Seven, and not one fewer: the six files that each carried a copy, plus
    // `packages/cli/src/index.ts`. A floor set below the true count leaves room
    // for exactly the regression this clause exists to catch — one caller
    // quietly going back to writing the key unconditionally, with the rest still
    // holding the number up. Adding a caller is fine; losing one is not, and if
    // a caller is ever removed on purpose this number comes down with it.
    expectFound(callers, 'files calling keyIfPresent', 7);
  });

  /**
   * Comments are blanked before any of the above runs, which matters in both
   * directions here: a copy could not hide inside a block comment, and a caller
   * could not satisfy the previous check by merely *mentioning* `keyIfPresent`
   * in prose. `docs/gates.md` records this as the defect it has logged most
   * often — G14, G19, G22, and now the reason this file reads `codeOf` rather
   * than `readRepoFile`.
   */
  it('reads code, not comments', () => {
    const commented = '/* return value === undefined ? {} : x; */\nexport const a = 1;\n';
    expect(RETURNS_NOTHING_WHEN_ABSENT.test(commented.replace(/\/\*[\s\S]*?\*\//, ''))).toBe(false);
    expect(RETURNS_NOTHING_WHEN_ABSENT.test(commented)).toBe(true);
  });
});
