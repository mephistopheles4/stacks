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
 * behaviour that makes this helper what it is: absent in, nothing out.
 *
 * **The honest limit is the shape, not the behaviour.** Two rewrites return
 * `{}` for an absent value and escape: an early return
 * (`if (v === undefined) return {};`) and an expression-bodied arrow. Both were
 * checked rather than assumed. Widening to catch the first would flag
 * `covers/cover-keys.ts:31`, which is that exact line and is *not* a copy of
 * anything — so the choice is a narrow anchor with a stated gap, or a broad one
 * with a standing exemption for a file that has done nothing wrong. This picks
 * the gap, on the same reasoning `codeOf` states about not being a parser: it
 * catches the shape all six copies actually took, which is also the shape
 * copy-paste produces.
 *
 * The seventeen inline `...(x === undefined ? {} : { k: x })` spreads are
 * deliberately outside this. They contain the same *text* and are not copies
 * of anything — each is one decision at one call site. The `return` in the
 * anchor is what separates them, and it needs no exempt list to do it: a
 * spread has no return statement.
 *
 * **The copy sweep therefore has no exemptions at all**, including none for
 * `packages/site/`, even though the site cannot value-import `@stacks/core`
 * (G6). If a copy ever appears there the gate goes red, and the fix is to
 * promote the owner to a pure subpath beside `@stacks/core/shelf-order` — an
 * actionable red, not a false one.
 *
 * The *caller* count below does have one exemption, `OWNER_SPEC`, and every
 * path this file names — owner, spec and all seven expected callers — is
 * asserted to still exist. ADR-0022 requires that of any structural
 * allowlist, and a one-entry exemption is still an allowlist. An earlier
 * draft of this comment claimed the gate had none, which was true of the
 * sweep and false of the file.
 *
 * See docs/gates.md, row G23 (key-if-present).
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { codeOf, expectFound, filesUnder, REPO_ROOT } from './repo.ts';

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
 * The seven files that call the helper — named, not merely counted.
 *
 * A bare floor cannot tell a legitimate removal from the regression it exists
 * to catch, so the next reader who sees this go red would have no way to
 * choose between fixing the caller and lowering the number. That choice is
 * the slack, so this list makes it decidable: if a file here was deleted or
 * genuinely stopped needing the helper, it comes off this list in the same
 * commit. If it is still here and no longer calling, that is the defect.
 */
const EXPECTED_CALLERS: readonly string[] = [
  'packages/cli/src/index.ts',
  'packages/core/src/add-book.ts',
  'packages/core/src/frontmatter.ts',
  'packages/core/src/import/audible.ts',
  'packages/core/src/library.ts',
  'packages/core/src/metadata/google-books.ts',
  'packages/core/src/metadata/open-library.ts',
];

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
  return [
    ...filesUnder('packages', ['.ts']),
    ...filesUnder('gates', ['.ts']),
    ...filesUnder('scripts', ['.ts']),
  ];
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

    // Seven, and not one fewer. A floor set below the true count leaves room
    // for exactly the regression this clause exists to catch — one caller going
    // back to writing the key unconditionally, with the rest still holding the
    // number up. Adding a caller is fine; losing one is not.
    //
    // The seven are named rather than merely counted, because the next reader
    // to see this go red needs to tell a legitimate removal from the regression,
    // and a bare number cannot answer that. Diff this list against `callers`:
    // if a file here was deleted or genuinely stopped needing the helper, bring
    // the number down with it. If it is still there and no longer calling,
    // that is the defect. Lowering the number to make the gate pass, without
    // being able to say which of the two happened, is the slack this whole
    // clause is about.
    expect(
      EXPECTED_CALLERS.filter((path) => !callers.includes(path)),
      'these files used to call keyIfPresent and no longer do',
    ).toEqual([]);
    expectFound(callers, 'files calling keyIfPresent', EXPECTED_CALLERS.length);
  });

  /**
   * ADR-0022, applied to every path this file hardcodes.
   *
   * `OWNER_SPEC` is an exemption from the caller count, and `EXPECTED_CALLERS`
   * is a list of files assumed to exist. Rename the spec and the exemption
   * matches nothing — the spec then counts as a caller, inflating the total by
   * one, and the floor is met by six real callers instead of seven. That is
   * the same slack this gate already went green through once, arriving by a
   * different door.
   */
  it('names no file that has moved', () => {
    const missing = [OWNER, OWNER_SPEC, ...EXPECTED_CALLERS].filter(
      (path) => !existsSync(join(REPO_ROOT, path)),
    );
    expect(missing, 'paths this gate hardcodes that no longer exist').toEqual([]);
  });

  /**
   * Comments are blanked before any of the above runs, which matters in both
   * directions: a copy cannot hide inside a block comment, and a caller cannot
   * satisfy the count by merely *mentioning* `keyIfPresent` in prose.
   *
   * **Asserted through `codeOf` itself**, against a real file on disk, because
   * the point is that *the shared helper* blanks comments — not that some
   * regex written here does. An earlier draft re-implemented a partial strip
   * inline and compared against that, which would have stayed green while
   * `codeOf`'s URL-aware arm was broken underneath it. That is verbatim the
   * defect `docs/gates.md` logs under G14, G19 and G22: *anchor the assertion
   * to the thing that carries the claim.* Written here for the fourth time,
   * inside the gate whose docblock cites the other three.
   *
   * The probe lives under `artifacts/`, which `filesUnder` skips and git
   * ignores, so it cannot be seen by the sweeps above while it exists.
   */
  it('blanks comments, via the same codeOf the sweeps use', () => {
    const dir = join(REPO_ROOT, 'artifacts');
    const probe = 'artifacts/__g23-comment-probe.ts';
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(REPO_ROOT, probe),
      '/* return commented === undefined ? {} : x; */\n' +
        '// return alsoCommented === undefined ? {} : x;\n' +
        'export const url = "https://example.com/a";\n' +
        'export const real = 1;\n',
      'utf8',
    );

    const code = codeOf(probe);

    expect(RETURNS_NOTHING_WHEN_ABSENT.test(code), 'a commented-out body counted as code').toBe(
      false,
    );
    expect(code, 'a URL was eaten as a comment').toContain('https://example.com/a');
    expect(code, 'real code was blanked').toContain('export const real = 1;');
  });

  afterAll(() => {
    rmSync(join(REPO_ROOT, 'artifacts/__g23-comment-probe.ts'), { force: true });
  });
});
