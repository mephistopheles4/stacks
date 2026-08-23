/**
 * G38 — the declared mutation scopes ↔ the tree they claim to score.
 *
 * **A scope list living only in the config is a rule nothing can fail on.**
 * Excluding a directory takes it out of numerator and denominator together, so
 * the score does not move: it stops covering that code, and the change is
 * invisible in the instrument built to catch changes. `git mv
 * packages/core/src/covers packages/core/src/cover` is otherwise the cheapest
 * weakening in this rollout, and it reads as a refactor in review.
 *
 * ⚠️ **This row runs on two surfaces, which no column of `docs/gates.md`
 * records.** Everything the disk can answer is here, in `pnpm test`, in two
 * seconds, in front of whoever caused it. One clause needs a mutation run to
 * see — *the glob matched files and Stryker still produced zero mutants* — and
 * it is `pnpm deploy:site`'s, in `scripts/deploy.ts`, against ~41 minutes on a
 * runner for the rest. The split is by available evidence, not by taste: every
 * structural cause of an emptied scope (a rename, a widening exclusion, a
 * config change, the code genuinely going away) is a declaration fault that
 * needs no run to detect.
 *
 * ⚠️ **The judgement this file asserts is not tested by this file.** It reads
 * the real declaration and expects no faults, which a `declarationFaults` that
 * returned `[]` unconditionally would satisfy forever. Every clause is planted
 * against a synthetic tree in `scripts/lib/scope-check.test.ts`; what is left
 * here is the question only the disk can answer, and the vacuity floors that
 * stop it being asked of nothing.
 *
 * See docs/gates.md, row G38 (mutation-scope), and
 * docs/spec/mutation-scoring.md §§6-7.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readDeclarations } from "../scripts/lib/mutation-score.ts";
import {
  declarationFaults,
  expectedMutate,
  sourceFiles,
} from "../scripts/lib/scope-check.ts";
import { expectFound, REPO_ROOT } from "./repo.ts";
// The config Stryker actually runs, not a copy of it. `.mjs` because Stryker's
// own loader cannot read a `.ts` config — which is why the derivation it holds
// cannot be imported from the module that checks it, and has to be compared.
import config from "../stryker.config.mjs";

const declarations = readDeclarations();

describe("G38 — the scope declaration is checked against something", () => {
  it("finds the declared scopes, the exclusions and the excluded directories", () => {
    // Three floors, not two. Each list is separately deletable, and a check
    // over an empty list is the vacuous green every one of these gates is
    // written against: emptying `scopes` would otherwise leave "every declared
    // scope exists on disk" true of nothing.
    expectFound(declarations.scopes, "declared mutation scopes", 8);
    expectFound(
      declarations.scopes.flatMap((scope) => scope.exclusions),
      "declared file exclusions",
      20,
    );
    expectFound(
      declarations.excludedDirectories,
      "excluded source directories",
      2,
    );
  });

  it("sweeps a plausible number of source files", () => {
    // A walk that returned nothing would make every file trivially declared and
    // every glob trivially empty — the same hole one level down.
    expectFound(
      sourceFiles(),
      "source files under packages/, scripts/ and gates/",
      60,
    );
  });
});

describe("G38 — every source directory is declared or excluded, and nothing else", () => {
  it("has no declaration fault of any kind", () => {
    const faults = declarationFaults(declarations, sourceFiles());

    expect(
      faults.map((fault) => `[${fault.clause}] ${fault.detail}`),
      "stryker.scopes.json no longer describes the tree. Every one of these is a " +
        "declaration fault: fixing it is a one-line edit, and leaving it means a scope " +
        "stops being measured with no number moving to say so",
    ).toEqual([]);
  });

  it("drives Stryker from the declaration it was checked against", () => {
    // ⚠️ The other half of what decides a scope's membership. Everything above
    // reads `stryker.scopes.json`; Stryker reads `mutate`, which the config
    // derives from it — so an edit to the *derivation* empties a scope with
    // every clause above still green, and the first thing to notice would be a
    // deploy refusal or a number moving in a nightly. Found in review of the
    // pull request that landed this row.
    //
    // The real config module, imported and read, rather than its source text:
    // this is a value the file computes, and a regex over the computation would
    // be the prose-matching this repo has three separate lessons about.
    expect(
      config.mutate,
      "stryker.config.mjs's `mutate` is no longer the declaration in " +
        "stryker.scopes.json. Stryker mutates what this array says, so the scopes " +
        "the gate above just checked are not necessarily the scopes that get scored",
    ).toEqual(expectedMutate(declarations));
  });

  it("names a directory that exists for every declared scope", () => {
    // Asserted separately from the sweep above because the two disagree in a
    // way worth naming: a scope may hold nothing but tests, in which case its
    // directory is on disk and `missing-scope` fires. That is the honest
    // answer — a scope of nothing but specs scores nothing — and this check
    // says which of the two facts is the case.
    const missing = declarations.scopes
      .map((scope) => scope.name)
      .filter((name) => !existsSync(join(REPO_ROOT, name)));

    expect(
      missing,
      `declared scopes whose directory is not on disk: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
