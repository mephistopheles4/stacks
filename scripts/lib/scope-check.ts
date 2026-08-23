/**
 * Whether `stryker.scopes.json` still describes the tree it claims to score.
 *
 * **A scope list living only in the config is a rule nothing can fail on.**
 * Excluding a directory removes it from numerator and denominator together, so
 * the score does not move — it simply stops covering that code, and the change
 * is invisible in the instrument built to catch changes. This module is what
 * makes that edit fail.
 *
 * ⚠️ **Two surfaces, one rule set, and the split is by available evidence
 * rather than by taste.** Everything the disk can answer — a scope that does
 * not exist, a source directory in neither list, a blank mechanism, an overlap,
 * a glob matching nothing — is a **declaration fault**, caught by G38
 * (`mutation-scope`) in `pnpm test`, in two seconds, in front of whoever caused
 * it. Only one clause needs a mutation run to see: **the glob matched files and
 * Stryker still produced zero mutants**. That is `emptyScopes` below, and it is
 * `pnpm deploy:site`'s, against ~41 minutes on a runner for the rest.
 *
 * **The rules are pure and the disk is at the edge.** `declarationFaults` and
 * `emptyScopes` take a file list; only `sourceFiles` reads anything. That is
 * what lets `scope-check.test.ts` plant a rename against a synthetic tree
 * instead of against this repo's real one — a gate whose only input is a
 * healthy tree cannot show that it detects anything.
 *
 * See docs/gates.md, row G38 (mutation-scope), and
 * docs/spec/mutation-scoring.md §§6-7.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  globToRegExp,
  scoreRun,
  total,
  type Declarations,
  type MutationReport,
  type Scope,
} from './mutation-score.ts';
import { REPO_ROOT } from './repo-root.ts';

/**
 * Where source lives, for the purposes of "every source directory is declared
 * or excluded".
 *
 * The three roots the Vitest project itself names — `packages/**`, `gates/` and
 * `scripts/` — because the question this module asks is *is this code inside
 * something a mutation run measures*, and a directory outside the test project
 * has no in-process oracle to begin with. Adding a fourth root here is a
 * deliberate act; discovering one is not possible, which is the point.
 */
export const SOURCE_ROOTS = ['packages', 'scripts', 'gates'] as const;

/** Directories a source sweep must never descend into. */
const SKIP = new Set(['node_modules', 'dist', 'artifacts']);

/**
 * A file this check counts as source.
 *
 * `*.test.ts` is out because Stryker's `mutate` negates it — the negation whose
 * absence once mutated the test suite and read the score nine points low. A
 * `.d.ts` is out because it declares types and carries no statement a mutant
 * could change, so a directory holding only declarations is not a source
 * directory and demanding a scope for it would be a rule nobody could satisfy.
 */
export function isSourceFile(path: string): boolean {
  return path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.d.ts');
}

/** The directory part of a repo-relative POSIX path. */
export function directoryOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

/**
 * Whether a scope's glob reaches anything at all on disk.
 *
 * One question asked by both halves of this module — the structural clause that
 * goes red at merge, and the deploy residual that has to tell *the glob reaches
 * nothing* from *the glob reaches files that produce no mutants*. They are the
 * two sides of one distinction, so they read it from one place: two copies would
 * drift into disagreeing about which of those two faults a scope has.
 */
function matchesAnyFile(glob: string, files: readonly string[]): boolean {
  const match = globToRegExp(glob);
  return files.some((file) => match.test(file));
}

/**
 * Every source file under the roots above, as paths relative to `root`, POSIX.
 *
 * The only thing in this module that touches a disk. Dot-directories are
 * skipped along with the three build outputs — `.astro/` holds generated
 * declarations and `.stryker-tmp/` is a copy of the tree, which is exactly the
 * kind of input that would make this check report on a sandbox. A root that
 * does not exist has no files rather than throwing, so a repo without a
 * `gates/` is a shorter list and not a crash.
 *
 * **`root` is a parameter for the reason G20's inspector takes one**: handed a
 * directory, this cannot know which tree produced it, and that is what lets its
 * spec point it at a synthetic one in a temp directory. Asserting against the
 * real tree from a spec would pass here and fail inside Stryker's sandbox,
 * which is a copy — the trap that keeps `gates/` out of the mutation scope in
 * the first place.
 */
export function sourceFiles(root: string = REPO_ROOT): string[] {
  const found: string[] = [];

  const walk = (current: string): void => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current)) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const path = relative(root, full).split(sep).join('/');
      if (isSourceFile(path)) found.push(path);
    }
  };

  for (const source of SOURCE_ROOTS) walk(join(root, source));
  return found.sort();
}

/**
 * The seven ways a declaration can be wrong, named so a failure says which.
 *
 * **Five of them are the ticket's, and two go beyond it.** The ticket lists six
 * structural clauses; five are fault kinds — `missing-scope`, `undeclared`,
 * `blank-mechanism`, `overlap`, `empty-glob` — and the sixth is the vacuity
 * floors, which live in the gate rather than here because they are about the
 * *inputs* being present at all. The two additions are declared rather than
 * folded in:
 *
 * - **`stale-exclusion`** — *"every declared scope exists on disk"* applied to
 *   the other list. An exclusion naming a file that has moved is a mechanism
 *   attached to nothing, reading as a live exemption, and it is half of what
 *   makes **removal** show up in a diff.
 * - **`excluded-and-declared`** — *"no overlap"* applied across the two lists
 *   rather than between two scopes, which is all the ticket's wording covers. A
 *   directory in both is not a contradiction the other clauses can see: the
 *   files in it are claimed, so `undeclared` stays quiet, and the exclusion
 *   still names something real, so `stale-exclusion` does too.
 *
 * ⚠️ **`expectedMutate` below is a further check and deliberately not a clause
 * here.** It compares the declaration against `stryker.config.mjs`, not against
 * the tree, so it answers a different question — *is this declaration the one
 * Stryker runs* — and folding it into a fault list about the disk would blur
 * which of the two artifacts is wrong.
 */
export type Clause =
  | 'missing-scope'
  | 'empty-glob'
  | 'undeclared'
  | 'overlap'
  | 'blank-mechanism'
  | 'stale-exclusion'
  | 'excluded-and-declared';

export interface Fault {
  clause: Clause;
  detail: string;
}

/**
 * Every way the declaration disagrees with the tree, in one pass.
 *
 * Returns findings rather than throwing, because a caller that can only learn
 * *the first* thing wrong makes a rename look like one fault when it is
 * usually three.
 */
export function declarationFaults(declarations: Declarations, files: readonly string[]): Fault[] {
  const { scopes, excludedDirectories } = declarations;
  const faults: Fault[] = [];

  /**
   * ⚠️ **Two sets, because the two lists are recursive in opposite ways.**
   *
   * `directories` holds the direct parent of each source file. `ancestors` adds
   * every directory above them, which is what a **recursive scope** needs: a
   * scope holding nothing directly and everything one level down is a perfectly
   * good scope — it is what a *split* looks like, the operation the rename rules
   * bless — and checking it against direct parents alone reported
   * `missing-scope` on it while `empty-glob` stayed quiet, because the glob does
   * match those files. One fault, and its message was untrue.
   *
   * An **excluded directory** keeps the direct set, and that is not an
   * oversight: an exclusion covers the files directly in a directory and never a
   * subtree, since a subtree exclusion would swallow a declared scope beneath
   * it. So a directory whose only source files live one level down excludes
   * nothing, and saying so is the point of `stale-exclusion`.
   *
   * Found by CodeRabbit on #179 — latent rather than live, because every
   * declared scope today happens to hold at least one file directly.
   */
  const directories = new Set(files.map(directoryOf));
  const ancestors = new Set<string>();
  for (const directory of directories) {
    for (let current = directory; current.length > 0; current = directoryOf(current)) {
      ancestors.add(current);
    }
  }

  const excludedDirs = new Set(excludedDirectories.map((entry) => entry.path));

  // A scope's name is a directory, and the glob is only its definition. Both
  // are checked: a name pointing at nothing is a rename nobody finished, and a
  // glob matching nothing is the same rename seen from the other side.
  for (const scope of scopes) {
    if (!ancestors.has(scope.name)) {
      faults.push({
        clause: 'missing-scope',
        detail:
          `declared scope "${scope.name}" holds no source file on disk. A rename must ` +
          'carry the floor across explicitly — a delete and an add in one diff, with the ' +
          'number visible on both sides.',
      });
    }
    if (excludedDirs.has(scope.name)) {
      faults.push({
        clause: 'excluded-and-declared',
        detail: `"${scope.name}" is both a declared scope and an excluded directory. Declared or excluded, never both.`,
      });
    }
  }

  const matchers = scopes.map((scope) => ({ scope, match: globToRegExp(scope.glob) }));

  for (const scope of scopes) {
    if (!matchesAnyFile(scope.glob, files)) {
      faults.push({
        clause: 'empty-glob',
        detail:
          `declared scope "${scope.name}" has a glob (${scope.glob}) that matches no source ` +
          'file. It scores nothing, and a scope that scores nothing lowers no number when the ' +
          'code it named goes away.',
      });
    }
  }

  // No third state. Every source file is claimed by a scope, or sits directly
  // in a directory declared out with a mechanism.
  for (const file of files) {
    const claims = matchers.filter((candidate) => candidate.match.test(file));
    if (claims.length > 1) {
      faults.push({
        clause: 'overlap',
        detail: `${file} is claimed by more than one declared scope: ${claims.map((c) => c.scope.name).join(', ')}`,
      });
    }
    if (claims.length === 0 && !excludedDirs.has(directoryOf(file))) {
      faults.push({
        clause: 'undeclared',
        detail:
          `${file} is in no declared scope and in no excluded directory. Declare the ` +
          'directory, or exclude it and say by what mechanism it is out of reach — those ' +
          'are the two states, and there is no third.',
      });
    }
  }

  // Both lists, both directions: a mechanism is a sentence somebody has to
  // write, and the entry has to still name something real.
  for (const scope of scopes) {
    for (const exclusion of scope.exclusions) {
      if (exclusion.mechanism.trim().length === 0) {
        faults.push({
          clause: 'blank-mechanism',
          detail: `exclusion ${exclusion.path} (in scope "${scope.name}") carries no mechanism. A file is excluded because a named mechanism puts it out of reach, or it is not excluded.`,
        });
      }
      if (!files.includes(exclusion.path)) {
        faults.push({
          clause: 'stale-exclusion',
          detail: `exclusion ${exclusion.path} (in scope "${scope.name}") names no source file on disk. The mechanism beside it is attached to nothing.`,
        });
      }
    }
  }

  for (const entry of excludedDirectories) {
    if (entry.mechanism.trim().length === 0) {
      faults.push({
        clause: 'blank-mechanism',
        detail: `excluded directory ${entry.path} carries no mechanism. Two reasons only: a named mechanism puts it out of reach, or it is not excluded.`,
      });
    }
    if (!directories.has(entry.path)) {
      faults.push({
        clause: 'stale-exclusion',
        detail: `excluded directory ${entry.path} holds no source file on disk. It excludes nothing and reads as though it does.`,
      });
    }
  }

  return faults;
}

/**
 * The `mutate` array `stryker.config.mjs` must derive from the declarations.
 *
 * ⚠️ **Without this, the declaration is only half of what decides a scope's
 * membership, and the gate reads the wrong half.** Everything above asks whether
 * `stryker.scopes.json` describes the tree; Stryker is driven by `mutate`, which
 * the config *derives* from that file. An edit to the derivation — dropping a
 * scope, adding a negation, losing the test-file negation that once let 2,665
 * mutations of the test suite into a score — leaves every clause above green and
 * empties a scope silently. `docs/spec/mutation-scoring.md` §6 lists *"the
 * `mutate` config changes"* as a declaration fault needing no run to detect, and
 * this is what makes that true. Found in review of the pull request that landed
 * the row.
 *
 * The order is part of the assertion: scope globs in declaration order, then
 * every exclusion as a negation grouped by its scope, then the test negation
 * last. Excluded *directories* are absent on purpose — nothing negates them,
 * because no scope glob reaches them in the first place.
 *
 * **A second copy of the derivation, deliberately, and the one case where this
 * repo accepts one:** the config is `.mjs` because Stryker's loader cannot read
 * a `.ts` one, so the two halves cannot share a module. That is what a
 * correspondence gate is for — and only one side is hand-written, so they cannot
 * drift together.
 */
export function expectedMutate(declarations: Declarations): string[] {
  const { scopes } = declarations;
  return [
    ...scopes.map((scope) => scope.glob),
    ...scopes.flatMap((scope) => scope.exclusions.map((exclusion) => `!${exclusion.path}`)),
    '!**/*.test.ts',
  ];
}

/**
 * Declared scopes whose glob matches files on disk and which a run scored zero
 * mutants — the one clause the disk cannot answer.
 *
 * ⚠️ **Asked of the tally, never of the score.** An empty denominator produces
 * 100% arithmetically, which is what Stryker's own summary line prints for a
 * scope with no mutants and is indistinguishable from a scope that is genuinely
 * perfect. `total(tally) === 0` is the only reading that separates them, and it
 * holds whether the report omits the files or carries them with no mutants.
 *
 * A scope whose glob matches nothing on disk is **not** reported here: that is
 * `empty-glob`, already red at merge, and saying it twice would send a reader
 * to the slower surface for the faster fault.
 */
export function emptyScopes(
  report: MutationReport,
  scopes: readonly Scope[],
  files: readonly string[],
): string[] {
  const run = scoreRun(report, [...scopes]);

  return scopes
    .filter((scope) => {
      if (!matchesAnyFile(scope.glob, files)) return false;
      const tally = run.perScope.get(scope.name);
      return tally !== undefined && total(tally) === 0;
    })
    .map((scope) => scope.name);
}
