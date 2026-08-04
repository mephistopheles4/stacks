/**
 * G24 — one repo root, one derivation.
 *
 * Eight scripts worked out where the repo starts, and four of them disagreed
 * about how: `join(dirname(fileURLToPath(import.meta.url)), '..')` in five
 * places, `resolve(...)` in one, `join(import.meta.dirname, '..')` in one, and
 * two that skipped the root entirely and built a destination out of
 * `import.meta.url` inline. Nothing was broken by that — `join` merely leaves a
 * literal `..` in the path, so it prints as `…\scripts\..` — which is exactly
 * why it survived eight rewrites. Nobody was ever looking at two of them at
 * once.
 *
 * This is G22 and G23's third sibling, and the same lesson a third time: a rule
 * copied by hand is a rule that drifts, and the copies are only visible to
 * someone who greps for all of the spellings at once. G23 could not anchor on a
 * name because there were three. This one *can* — the derivation is spelled in
 * terms of `import.meta`, and there is no way to reach the filesystem from a
 * module without going through it.
 *
 * **So the anchor is `import.meta` itself, not a helper's name.** Every route to
 * a path — `.url`, `.dirname`, `.filename` — is matched, which also covers the
 * `new URL('..', import.meta.url)` spelling nobody has written here yet.
 *
 * **One owner, not a directory.** `scripts/lib/` holds three other shared files
 * and none of them has any business deriving a root either. G1's own comment
 * makes the argument for this: a directory-level permission is broader than the
 * rule it is granted for, and it collects whatever later happens to land inside.
 *
 * The reverse-assert is what stops this passing vacuously. A sweep for a pattern
 * that no longer matches anything reports zero offenders and goes green forever,
 * which is `expectFound`'s whole argument — so the owner is asserted to still
 * contain the thing being swept for. The day `import.meta.dirname` is replaced
 * by whatever comes next, this fails on the control rather than lying about the
 * sweep.
 *
 * Scope is `scripts/` only. `gates/` reaches the root through `REPO_ROOT` in
 * `gates/repo.ts`, which is `process.cwd()` and not a derivation at all —
 * vitest runs from the root, so the gates have never needed one. Two harnesses
 * with one name for the same value is the intended end state, not a duplication
 * this should collapse: they answer the question by different means because
 * they are launched by different means.
 *
 * See docs/gates.md, row G24.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeOf, expectFound, filesUnder, REPO_ROOT } from './repo.ts';

/** The one file allowed to work out where the repo starts. */
const OWNER = 'scripts/lib/repo-root.ts';

/**
 * Any route from a module to its own location. Matched against `codeOf`, so the
 * paragraph in `repo-root.ts` weighing these two spellings against each other
 * does not count as a derivation — a gate that matches prose matches anything.
 */
const DERIVATION = /import\.meta\.(?:url|dirname|filename)/;

/** Every script this rule governs. Tests are none of its business. */
function governedFiles(): string[] {
  return filesUnder('scripts', ['.ts']).filter((path) => !path.endsWith('.test.ts'));
}

describe('G24 — one repo root, one derivation', () => {
  it('scans a plausible number of scripts', () => {
    // A `filesUnder` that walked nothing would report zero offenders and this
    // gate would be green while checking, precisely, nothing.
    expectFound(governedFiles(), 'scripts governed by the repo-root rule', 8);
  });

  it('keeps the owner in the tree', () => {
    expect(
      existsSync(join(REPO_ROOT, OWNER)),
      `${OWNER} is gone. Every assertion here is about that file; if it moved, move this ` +
        'gate with it rather than leaving a rule pointing at nothing.',
    ).toBe(true);
  });

  it('lets no other script derive the repo root for itself', () => {
    const offenders = governedFiles().filter(
      (path) => path !== OWNER && DERIVATION.test(codeOf(path)),
    );

    expect(
      offenders,
      `these work out the repo root for themselves: ${offenders.join(', ')}. There is one ` +
        `derivation, in ${OWNER} — \`import { REPO_ROOT } from './lib/repo-root.ts'\` and ` +
        'join off it. Eight scripts each doing this by hand is what produced four spellings ' +
        'of one path.',
    ).toEqual([]);
  });

  it('still finds the derivation in the owner, so the sweep is not broken', () => {
    // The control. Every assertion above is satisfied by a pattern that matches
    // nothing at all, and this is the one file where a match is certain.
    expect(
      DERIVATION.test(codeOf(OWNER)),
      `${OWNER} no longer derives anything the sweep can see. Either the root moved somewhere ` +
        'else — in which case the rule above is now enforcing nothing — or the spelling changed ' +
        'and DERIVATION needs to learn it.',
    ).toBe(true);
  });
});
