/**
 * G47 — `jscpd.floors.json`'s `ignoredLines` counters ↔ a real sweep of the tree.
 *
 * **A `jscpd` suppression block removes its lines from the clone count and from
 * the total-line denominator together.** Measured, jscpd 5.0.16: 34 raw lines
 * with a 12-line block report 20. So the percentage does not move, the clone
 * count falls, and the change lives in a source file nowhere near any file the
 * deploy reads — G38's failure shape and G43's directive shape in one comment.
 * Without this row, a suppression lands in a pull request and nothing says a
 * word.
 *
 * **This is G43 (`ignored-mutants`) applied to a second tool**, and it is what
 * dissolved the only surviving objection to capping the duplication counts:
 * under a cap, a suppression block is the cheapest way to clear a refusal, and
 * it leaves no diff anywhere. It closes **at merge instead of at deploy**, for
 * G43's reason exactly — `main-protection` carries
 * `required_approving_review_count: 0`, so the gate suite and CodeQL are the
 * only two things in this repository that can stop a merge.
 *
 * ⚠️ **The slug names what is counted, not the document.** `duplication-floors`
 * was the alternative and is rejected on G43's precedent: this asserts the
 * `ignoredLines` field and the population list, and says nothing about the caps
 * that [#258](https://github.com/mephistopheles4/stacks/issues/258) will add
 * beside them.
 *
 * ⚠️ **It also compares the recorded counting rule to the installed one, which
 * G43 does not do for its own file — and the asymmetry is deliberate.**
 * `stryker.floors.json`'s own comment records that nothing catches a stale
 * `configHash` before a deploy: *"no gate, no test and no CI check compares
 * this stamp"*, so the drift reaches `main` green and is found by whoever next
 * tries to publish. That hole is [#224](https://github.com/mephistopheles4/stacks/issues/224)'s
 * to close for the existing stamps. What this row declines to do is **ship a
 * second copy of it**: a hash that may silently disagree with the tool
 * installed beside it is not pinning anything. **It does nothing for
 * `stryker.floors.json`**, and reading it as cover for that file would be
 * wrong.
 *
 * ⚠️ **The judgement this file asserts is not tested by this file.** It reads
 * the real tree and the real declaration file and expects them to agree, which
 * an `ignoredMismatches` returning `[]` unconditionally would satisfy forever.
 * Both directions are planted against synthetic inputs in
 * `scripts/lib/duplication.test.ts`; what is left here is the question only the
 * disk can answer, plus the floors that stop it being asked of nothing.
 *
 * See docs/gates.md, row G47 (ignored-clones), and
 * docs/spec/static-analysis-and-style.md §5.
 */

import { describe, expect, it } from 'vitest';
import { populationOf } from '../scripts/lib/complexity.ts';
import {
  TREE_POPULATION,
  declarationCorrespondence,
  duplicationInputs,
  ignoredMismatches,
  readDeclarations,
  sweepIgnoredLines,
  treePopulationOf,
} from '../scripts/lib/duplication.ts';
import { duplicationHashOf } from '../scripts/lib/floors.ts';
import { readScopes } from '../scripts/lib/mutation-score.ts';
import { sourceFiles } from '../scripts/lib/scope-check.ts';
import { expectFound } from './repo.ts';

const declared = readDeclarations();
const scopes = readScopes();
const files = sourceFiles();
const tree = treePopulationOf();

/** Every population this repository measures, and the files each is swept over. */
const populations = new Map<string, readonly string[]>([
  ...scopes.map((scope) => [scope.name, populationOf(scope, files)] as const),
  [TREE_POPULATION, tree],
]);

describe('G47 — the counters are asserted against something', () => {
  it('finds the declarations and the source they are counted over', () => {
    // Three floors, each for its own vacuous green. Emptying `populations` in
    // the declaration file would otherwise leave "every counter matches" true
    // of nothing; emptying the declared scopes would leave the sweep with
    // nothing to attribute; and an empty tree walk would sweep no file at all
    // while both other floors stayed green. G43's third floor is the one whose
    // absence was a real hole there, and all three are written out here rather
    // than inherited.
    expectFound([...declared.populations.keys()], 'populations in jscpd.floors.json', 9);
    expectFound(scopes, 'declared mutation scopes', 8);
    expectFound(tree, 'TypeScript files swept for suppression blocks', 150);
  });

  it('sweeps the whole tree, not the eight scopes — test code included', () => {
    // ⚠️ The population that is flattest for complexity is the loudest for
    // duplication: #239 measured every one of 1931 test functions at McCabe 10
    // or below, while #232 measured `gates/` moving 4 → 119 clones across one
    // threshold step. A tree walk that had quietly inherited `sourceFiles()`'s
    // `*.test.ts` drop would measure the wrong population and nothing would
    // say so, which is why it is asserted rather than trusted.
    expect(tree.some((file) => file.endsWith('.test.ts'))).toBe(true);
    expect(tree.some((file) => file.startsWith('gates/'))).toBe(true);
    expect(tree.every((file) => !file.endsWith('.d.ts'))).toBe(true);
  });
});

describe('G47 — every recorded counter is what the tree actually holds', () => {
  it('agrees with the sweep, and reports a swept population it fails to name', () => {
    const swept = new Map(
      [...populations].map(([name, population]) => [name, sweepIgnoredLines(population)]),
    );

    // ⚠️ **`ignoredMismatches`, never a comparison spelled again here.** This
    // file's header says the judgement is planted in `duplication.test.ts`, and
    // that is only true if this row runs *that* judgement — a copy would leave
    // the planted one green while this one broke, and this one green while the
    // planted one broke. It is also the drift this whole commit exists to
    // count. G43 calls its equivalent for the same reason.
    const mismatched = ignoredMismatches(swept, declared);

    expect(
      mismatched.map(
        (one) =>
          `${one.population}: the tree holds ${String(one.swept)} suppressed line(s), ` +
          `jscpd.floors.json records ${String(one.recorded)}`,
      ),
      'jscpd.floors.json no longer describes the tree. A suppression block takes its lines ' +
        'out of the clone count and out of the denominator together, so the percentage does ' +
        'not move and no number anywhere says it happened — the count belongs beside the ' +
        'series it changes the meaning of. Update `ignoredLines` for the population named, ' +
        'add a `notes` line saying why the block is there, and if you did not add the block, ' +
        'find out who did before you update anything',
    ).toEqual([]);
  });

  it('names every population, in both directions', () => {
    const { undeclared, orphaned } = declarationCorrespondence([...populations.keys()], declared);

    expect(
      undeclared,
      'a population is measured that jscpd.floors.json does not name, so a suppression in ' +
        'it would be counted by nobody. Add an entry with `ignoredLines: 0`',
    ).toEqual([]);
    expect(
      orphaned,
      'jscpd.floors.json names a population nothing measures. Either a scope was renamed ' +
        'and this entry was left behind — which is the shape G38 exists to make loud — or ' +
        'the entry was never real',
    ).toEqual([]);
  });
});

describe('G47 — the recorded counting rule is the installed one', () => {
  it('matches the jscpd this checkout actually has, and its three thresholds', () => {
    expect(
      declared.duplicationHash,
      "jscpd.floors.json's duplicationHash is not the rule this checkout would count " +
        'under. A threshold change or a jscpd upgrade makes every duplication count mean ' +
        'something else — #232 measured 12 clones at 50/5 and 82 at 20/3 over the identical ' +
        'tree — so the stamp is refreshed in the same diff as whatever moved it. This says ' +
        'nothing about stryker.floors.json, whose stamps are still unwatched until #224',
    ).toBe(duplicationHashOf(duplicationInputs()));
  });
});
