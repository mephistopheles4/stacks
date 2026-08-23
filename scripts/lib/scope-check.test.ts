/**
 * The rules G38 (`mutation-scope`) asserts, put to trees that are broken on
 * purpose.
 *
 * ⚠️ **The gate itself cannot prove it detects anything.** It asserts that this
 * repo's declaration has no faults, and a `declarationFaults` that returned `[]`
 * unconditionally would satisfy it forever — the vacuous green `expectFound`
 * exists for, one level up, where the extraction is fine and the *judgement* is
 * the thing that could quietly stop working. So every clause is planted here
 * against a synthetic tree, and the gate is left to say one thing: the real tree
 * is clean.
 *
 * ⚠️ **Nothing here reads the repository**, for the reason
 * `mutation-score.test.ts` states: this file runs inside Stryker's sandbox,
 * which is a *copy* of the tree, so a spec asserting on real paths would pass in
 * `pnpm test` and fail in the run that scores it. `sourceFiles` is exercised
 * against a temp directory it is handed — the property that lets G20 point its
 * inspector at a synthetic folder.
 *
 * **Not a gate and it takes no `docs/gates.md` row** — an ordinary unit test,
 * beside the code it covers.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Declarations, MutationReport, Scope } from "./mutation-score.ts";
import {
  declarationFaults,
  directoryOf,
  emptyScopes,
  isSourceFile,
  sourceFiles,
  type Clause,
} from "./scope-check.ts";

function scope(
  name: string,
  glob: string,
  exclusions: Scope["exclusions"] = [],
): Scope {
  return { name, glob, exclusions };
}

/** A healthy declaration and the tree it describes — the baseline every plant perturbs. */
const TREE = [
  "gates/repo.ts",
  "packages/core/src/library.ts",
  "packages/core/src/adapters/obsidian-adapter.ts",
  "scripts/deploy.ts",
  "scripts/lib/walk.ts",
];

function healthy(): Declarations {
  return {
    scopes: [
      scope("packages/core/src", "packages/core/src/*.ts"),
      scope("packages/core/src/adapters", "packages/core/src/adapters/**/*.ts"),
      scope("scripts", "scripts/**/*.ts", [
        {
          path: "scripts/deploy.ts",
          mechanism: "driven as a child process; never sees the mutant",
        },
      ]),
    ],
    excludedDirectories: [
      { path: "gates", mechanism: "REPO_ROOT is the sandbox, not the repo" },
    ],
  };
}

/** The clauses a fault list names, which is what a caller actually reads. */
function clauses(
  declarations: Declarations,
  files: readonly string[],
): Clause[] {
  return declarationFaults(declarations, files).map((fault) => fault.clause);
}

function report(files: Record<string, string[]>): MutationReport {
  return {
    files: Object.fromEntries(
      Object.entries(files).map(([path, statuses]) => [
        path,
        { mutants: statuses.map((status) => ({ status })) },
      ]),
    ),
  };
}

describe("declarationFaults — the healthy case", () => {
  it("finds nothing wrong with a declaration that matches its tree", () => {
    expect(declarationFaults(healthy(), TREE)).toEqual([]);
  });
});

describe("declarationFaults — every clause, planted", () => {
  it("catches a scope whose directory was renamed out from under it", () => {
    // The cheapest weakening on the map: `git mv` resets a floor and reads as a
    // refactor in review. Two faults, because a rename breaks both the name and
    // the glob — reported together rather than one at a time.
    const renamed = TREE.map((file) =>
      file.replace("packages/core/src/adapters/", "packages/core/src/adapter/"),
    );

    expect(clauses(healthy(), renamed)).toEqual(
      expect.arrayContaining(["missing-scope", "empty-glob", "undeclared"]),
    );
  });

  it("accepts a recursive scope whose files all sit below its own root", () => {
    // ⚠️ The false red this check nearly shipped. A recursive scope holding
    // nothing *directly* — every file one level down — is a perfectly good
    // scope, and it is what a **split** looks like, which is the operation the
    // rename rules exist to bless. Reported as `missing-scope` it would say
    // "holds no source file on disk" about a scope that holds several, while
    // `empty-glob` stayed quiet because the glob does match them. Found by
    // CodeRabbit on #179.
    const declarations: Declarations = {
      scopes: [
        scope(
          "packages/core/src/adapters",
          "packages/core/src/adapters/**/*.ts",
        ),
      ],
      excludedDirectories: [],
    };

    expect(
      declarationFaults(declarations, [
        "packages/core/src/adapters/obsidian/adapter.ts",
      ]),
    ).toEqual([]);
  });

  it("keeps an excluded directory non-recursive when it asks whether it exists", () => {
    // The other half, and why one set cannot serve both. An excluded directory
    // covers the files *directly* in it and never a subtree — a subtree
    // exclusion would swallow a declared scope beneath it — so a directory whose
    // only source files live one level down excludes nothing and is stale.
    const declarations: Declarations = {
      scopes: [scope("scripts", "scripts/**/*.ts")],
      excludedDirectories: [
        { path: "gates", mechanism: "the sandbox is not the repo" },
      ],
    };
    const found = clauses(declarations, [
      "scripts/deploy.ts",
      "gates/helpers/plumbing.ts",
    ]);

    expect(found).toContain("stale-exclusion");
    expect(found).toContain("undeclared");
  });

  it("catches a source directory that is neither declared nor excluded", () => {
    expect(
      clauses(healthy(), [...TREE, "packages/site/src/shelf/scene.ts"]),
    ).toEqual(["undeclared"]);
  });

  it("catches a glob that matches nothing while its directory still exists", () => {
    // A well-formed glob pointing somewhere empty. A *mal*-formed one — a third
    // shape, `*.tsx` — never reaches this check: `globToRegExp` throws on it by
    // design, and a throw inside the gate is red with a message naming the
    // glob, which is the same answer arriving one layer earlier.
    const declarations = healthy();
    declarations.scopes[0] = scope(
      "packages/core/src",
      "packages/core/src/moved/**/*.ts",
    );

    // The directory is there, so `missing-scope` stays quiet: this is the
    // clause that separates "the code went away" from "the glob stopped
    // reaching it", and only one of those is fixed by editing the config.
    expect(clauses(declarations, TREE)).toEqual(
      expect.arrayContaining(["empty-glob", "undeclared"]),
    );
    expect(clauses(declarations, TREE)).not.toContain("missing-scope");
  });

  it("catches a blank mechanism on a file exclusion", () => {
    const declarations = healthy();
    declarations.scopes[2] = scope("scripts", "scripts/**/*.ts", [
      { path: "scripts/deploy.ts", mechanism: "   " },
    ]);

    expect(clauses(declarations, TREE)).toEqual(["blank-mechanism"]);
  });

  it("catches a blank mechanism on an excluded directory", () => {
    const declarations = healthy();
    declarations.excludedDirectories = [{ path: "gates", mechanism: "" }];

    expect(clauses(declarations, TREE)).toEqual(["blank-mechanism"]);
  });

  it("catches an exclusion naming a file that no longer exists", () => {
    const declarations = healthy();
    declarations.scopes[2] = scope("scripts", "scripts/**/*.ts", [
      {
        path: "scripts/deploy-old.ts",
        mechanism: "a mechanism attached to nothing",
      },
    ]);

    expect(clauses(declarations, TREE)).toEqual(["stale-exclusion"]);
  });

  it("catches an excluded directory that holds no source file", () => {
    const declarations = healthy();
    declarations.excludedDirectories = [
      { path: "gates", mechanism: "real" },
      { path: "tools", mechanism: "excludes nothing at all" },
    ];

    expect(clauses(declarations, TREE)).toEqual(["stale-exclusion"]);
  });

  it("catches two scopes claiming the same file", () => {
    const declarations = healthy();
    declarations.scopes.push(scope("packages/core", "packages/core/**/*.ts"));

    // Every file under `packages/core` is now claimed twice, and the count is
    // the point: an overlap is per file, so a widened glob is loud rather than
    // a single line nobody reads.
    expect(
      clauses(declarations, TREE).filter((clause) => clause === "overlap"),
    ).toHaveLength(2);
  });

  it("refuses a directory that is declared and excluded at once", () => {
    const declarations = healthy();
    declarations.excludedDirectories.push({
      path: "scripts",
      mechanism: "both, somehow",
    });

    expect(clauses(declarations, TREE)).toContain("excluded-and-declared");
  });

  it("reports every scope when the declared list is emptied", () => {
    // The vacuity plant: an empty scope list makes every file undeclared rather
    // than making the check quiet. `expectFound` in the gate is the other half.
    const declarations: Declarations = { scopes: [], excludedDirectories: [] };

    expect(clauses(declarations, TREE)).toEqual(TREE.map(() => "undeclared"));
  });
});

describe("emptyScopes — the clause the disk cannot answer", () => {
  const scopes = [
    scope("scripts", "scripts/**/*.ts"),
    scope("gates", "gates/**/*.ts"),
  ];
  const files = ["scripts/lib/walk.ts", "gates/repo.ts"];

  it("names a scope whose files exist and whose mutants do not", () => {
    // What a scope of type-only re-exports looks like in a report: the glob
    // matches, and nothing in the file can be mutated.
    expect(
      emptyScopes(report({ "scripts/lib/walk.ts": ["Killed"] }), scopes, files),
    ).toEqual(["gates"]);
  });

  it("reads the tally and not the score", () => {
    // A scope of one surviving mutant scores 0% and is healthy; a scope of none
    // scores 100% arithmetically and is broken. Nothing that reads a percentage
    // can tell those apart, which is why this reads the count.
    const survived = report({
      "scripts/lib/walk.ts": ["Survived"],
      "gates/repo.ts": ["Killed"],
    });

    expect(emptyScopes(survived, scopes, files)).toEqual([]);
  });

  it("stays silent about a scope whose glob matches nothing on disk", () => {
    // That is `empty-glob`, red at merge in two seconds. Saying it again here
    // would send a reader to the slower surface for the faster fault.
    expect(emptyScopes(report({}), scopes, ["scripts/lib/walk.ts"])).toEqual([
      "scripts",
    ]);
  });
});

describe("sourceFiles — what counts as source", () => {
  it("takes .ts, and neither a spec nor a declaration file", () => {
    expect(isSourceFile("scripts/lib/walk.ts")).toBe(true);
    expect(isSourceFile("scripts/lib/walk.test.ts")).toBe(false);
    expect(isSourceFile("packages/site/src/raw-assets.d.ts")).toBe(false);
    expect(isSourceFile("packages/site/src/pages/index.astro")).toBe(false);
  });

  it("reads a directory out of a path, and copes with one that has none", () => {
    expect(directoryOf("scripts/lib/walk.ts")).toBe("scripts/lib");
    expect(directoryOf("stryker.config.mjs")).toBe("");
  });

  it("walks the three roots and skips build output", () => {
    const root = mkdtempSync(join(tmpdir(), "scope-check-"));
    const write = (path: string): void => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), "");
    };

    write("scripts/deploy.ts");
    write("scripts/deploy.test.ts");
    write("gates/repo.ts");
    write("packages/core/src/library.ts");
    write("packages/core/dist/library.ts");
    write("packages/core/node_modules/dep/index.ts");
    write("packages/site/.astro/types.d.ts");
    write("docs/notes.ts");

    expect(sourceFiles(root)).toEqual([
      "gates/repo.ts",
      "packages/core/src/library.ts",
      "scripts/deploy.ts",
    ]);
  });
});
