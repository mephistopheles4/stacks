// Complexity walker prototype — cyclomatic (McCabe) complexity per function,
// rolled up per stryker.scopes.json scope, using typescript@7.0.2's
// typescript/unstable/{sync,ast} surface (there is no classic compiler API
// in this TS version — see the research on research/complexity-tooling-for-typescript).
//
// Usage:
//   node prototype/complexity/walk.mjs            # full run, writes RESULTS.md
//
// This file is also importable as a module (see the exported functions below)
// so the gaming/dilution experiments can reuse the same counting logic against
// scratch copies without duplicating it.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import {
  SyntaxKind,
  isIfStatement,
  isConditionalExpression,
  isForStatement,
  isForInStatement,
  isForOfStatement,
  isWhileStatement,
  isDoStatement,
  isCaseClause,
  isCatchClause,
  isBinaryExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isArrowFunction,
  isMethodDeclaration,
  isConstructorDeclaration,
  isGetAccessorDeclaration,
  isSetAccessorDeclaration,
} from "typescript/unstable/ast";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

const LOGICAL_OPERATOR_KINDS = new Set([
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".astro",
  ".cache",
  "artifacts",
]);

// ---------------------------------------------------------------------------
// Scope loading (stryker.scopes.json) + a tiny glob matcher.
// ---------------------------------------------------------------------------

export function loadScopes() {
  const raw = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "stryker.scopes.json"), "utf8")
  );
  return raw.scopes;
}

// Minimal glob->RegExp translator supporting '*' (single segment) and
// '**/' (zero or more segments), which is all the globs in
// stryker.scopes.json use. Not a general-purpose glob library.
export function globToRegExp(glob) {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*" && glob[i + 2] === "/") {
      re += "(?:.*/)?";
      i += 3;
      continue;
    }
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i += 2;
      continue;
    }
    if (c === "*") {
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
      i += 1;
      continue;
    }
    re += c;
    i += 1;
  }
  return new RegExp("^" + re + "$");
}

// The directory to actually walk on disk for a given glob — the fixed prefix
// before the first wildcard segment.
function baseDirFor(glob) {
  const starIdx = glob.indexOf("*");
  const prefix = starIdx === -1 ? glob : glob.slice(0, starIdx);
  const lastSlash = prefix.lastIndexOf("/");
  return lastSlash === -1 ? "" : prefix.slice(0, lastSlash);
}

function collectTsFiles(absDir, relBase, out) {
  if (!existsSync(absDir)) return out;
  for (const entry of readdirSync(absDir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = path.join(absDir, entry);
    const rel = relBase ? `${relBase}/${entry}` : entry;
    const st = statSync(abs);
    if (st.isDirectory()) {
      collectTsFiles(abs, rel, out);
    } else if (entry.endsWith(".ts")) {
      out.push(rel.replace(/\\/g, "/"));
    }
  }
  return out;
}

const isTestFile = (relPath) => relPath.endsWith(".test.ts");

/**
 * Resolves every declared scope to its file lists.
 * Returns: { [scopeName]: { glob, full: string[] (rel paths, no *.test.ts),
 *                            excluded: string[] (rel paths named in exclusions),
 *                            postExclusion: string[] } }
 */
export function resolveScopeFiles(scopes) {
  const result = {};
  for (const scope of scopes) {
    const baseDir = baseDirFor(scope.glob);
    const relCandidates = collectTsFiles(
      path.join(REPO_ROOT, baseDir),
      baseDir,
      []
    );
    const re = globToRegExp(scope.glob);
    const full = relCandidates
      .filter((rel) => re.test(rel) && !isTestFile(rel))
      .sort();
    const excludedSet = new Set(
      (scope.exclusions || []).map((e) => e.path)
    );
    const postExclusion = full.filter((rel) => !excludedSet.has(rel));
    result[scope.name] = {
      glob: scope.glob,
      full,
      excluded: full.filter((rel) => excludedSet.has(rel)),
      postExclusion,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// McCabe complexity walker.
//
// Counting rule (written down, per the task brief): each function-like
// (FunctionDeclaration, FunctionExpression, ArrowFunction, MethodDeclaration,
// constructor, get/set accessors) starts at 1; +1 per IfStatement,
// ConditionalExpression, each loop (for/for-in/for-of/while/do), each
// CaseClause (classic — every case, not a modified/collapsed count), each
// CatchClause, and each &&, ||, ?? BinaryExpression (incl. &&=, ||=, ??=).
// ?. and default parameters are NOT counted. Nested functions are separate
// scopes — their branches never count toward the enclosing function.
// ---------------------------------------------------------------------------

function isFunctionLike(node) {
  return (
    isFunctionDeclaration(node) ||
    isFunctionExpression(node) ||
    isArrowFunction(node) ||
    isMethodDeclaration(node) ||
    isConstructorDeclaration(node) ||
    isGetAccessorDeclaration(node) ||
    isSetAccessorDeclaration(node)
  );
}

// Anything whose SyntaxKind name looks function-shaped and that actually
// carries a body (ruling out signatures/type nodes, which have no
// implementation to walk) but isn't one of the 7 kinds above — e.g. a class
// static initialization block. Tracked so deliverable 6 isn't silent.
const FUNCTION_SHAPED_NAME = /Function|Method|Constructor|Accessor/;
function isUnhandledFunctionShaped(node) {
  if (isFunctionLike(node)) return false;
  const name = SyntaxKind[node.kind];
  if (!name || !FUNCTION_SHAPED_NAME.test(name)) return false;
  return node.body !== undefined;
}

function functionKindLabel(node) {
  switch (node.kind) {
    case SyntaxKind.FunctionDeclaration:
      return "FunctionDeclaration";
    case SyntaxKind.FunctionExpression:
      return "FunctionExpression";
    case SyntaxKind.ArrowFunction:
      return "ArrowFunction";
    case SyntaxKind.MethodDeclaration:
      return "MethodDeclaration";
    case SyntaxKind.Constructor:
      return "Constructor";
    case SyntaxKind.GetAccessor:
      return "GetAccessor";
    case SyntaxKind.SetAccessor:
      return "SetAccessor";
    default:
      return "Unknown";
  }
}

function getFunctionName(node, sourceFile, line) {
  try {
    if (node.name) {
      const text = node.name.getText(sourceFile);
      if (text) return text;
    }
  } catch {
    // fall through to anonymous
  }
  return `<anonymous>:${line}`;
}

/**
 * Walks one SourceFile and returns a flat list of
 * { name, kind, line, complexity } for every function-like scope in it,
 * McCabe-style (nested functions are independent entries; their branches do
 * not add to the enclosing function's count).
 */
export function walkSourceFile(sourceFile, skippedKinds) {
  const results = [];

  function visit(node, currentFn) {
    if (isUnhandledFunctionShaped(node)) {
      const startPos = node.getStart(sourceFile);
      const { line } = sourceFile.getLineAndCharacterOfPosition(startPos);
      const name = SyntaxKind[node.kind];
      if (skippedKinds && !skippedKinds.has(name)) {
        skippedKinds.set(name, {
          file: sourceFile.fileName,
          line: line + 1,
        });
      }
      // Still descend so branches inside it aren't silently lost if it
      // turns out to contain nested, handled function-likes.
      node.forEachChild((child) => visit(child, currentFn));
      return;
    }

    if (isFunctionLike(node)) {
      const startPos = node.getStart(sourceFile);
      const { line } = sourceFile.getLineAndCharacterOfPosition(startPos);
      const fn = {
        name: getFunctionName(node, sourceFile, line + 1),
        kind: functionKindLabel(node),
        line: line + 1,
        complexity: 1,
      };
      results.push(fn);
      node.forEachChild((child) => visit(child, fn));
      return;
    }

    if (currentFn) {
      if (isIfStatement(node)) currentFn.complexity++;
      else if (isConditionalExpression(node)) currentFn.complexity++;
      else if (
        isForStatement(node) ||
        isForInStatement(node) ||
        isForOfStatement(node) ||
        isWhileStatement(node) ||
        isDoStatement(node)
      )
        currentFn.complexity++;
      else if (isCaseClause(node)) currentFn.complexity++;
      else if (isCatchClause(node)) currentFn.complexity++;
      else if (
        isBinaryExpression(node) &&
        LOGICAL_OPERATOR_KINDS.has(node.operatorToken.kind)
      )
        currentFn.complexity++;
    }

    node.forEachChild((child) => visit(child, currentFn));
  }

  visit(sourceFile, null);
  return results;
}

// ---------------------------------------------------------------------------
// A single long-lived API session, shared across every file in the run.
// ---------------------------------------------------------------------------

export class Session {
  constructor() {
    this.api = new API({ cwd: REPO_ROOT });
  }

  openProject(tsconfigAbsPath) {
    const snapshot = this.api.updateSnapshot({
      openProjects: [tsconfigAbsPath],
    });
    const project = snapshot.getProject(tsconfigAbsPath);
    if (!project) {
      throw new Error(`updateSnapshot did not return project ${tsconfigAbsPath}`);
    }
    this.snapshot = snapshot;
    this.project = project;
    return project;
  }

  getSourceFile(absPath) {
    return this.project.program.getSourceFile(absPath);
  }

  close() {
    this.snapshot?.dispose();
    this.api.close();
  }
}

// ---------------------------------------------------------------------------
// Stats.
// ---------------------------------------------------------------------------

export function computeStats(complexities) {
  const count = complexities.length;
  if (count === 0) {
    return {
      count: 0,
      sum: 0,
      mean: 0,
      max: 0,
      p90: 0,
      shareGt10: 0,
      massShareGt10: 0,
    };
  }
  const sorted = [...complexities].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const max = sorted[sorted.length - 1];
  const p90Index = Math.min(count - 1, Math.ceil(0.9 * count) - 1);
  const p90 = sorted[p90Index];
  const over10 = sorted.filter((c) => c > 10);
  const shareGt10 = over10.length / count;
  const massOver10 = over10.reduce((a, b) => a + b, 0);
  const massShareGt10 = sum === 0 ? 0 : massOver10 / sum;
  return { count, sum, mean, max, p90, shareGt10, massShareGt10 };
}

export function histogram(complexities) {
  const buckets = {
    "1": 0,
    "2-3": 0,
    "4-6": 0,
    "7-10": 0,
    "11-20": 0,
    "21+": 0,
  };
  for (const c of complexities) {
    if (c === 1) buckets["1"]++;
    else if (c <= 3) buckets["2-3"]++;
    else if (c <= 6) buckets["4-6"]++;
    else if (c <= 10) buckets["7-10"]++;
    else if (c <= 20) buckets["11-20"]++;
    else buckets["21+"]++;
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Main run (only executes when this file is run directly, not on import).
// ---------------------------------------------------------------------------

async function main() {
  const t0 = performance.now();
  const scopes = loadScopes();
  const scopeFiles = resolveScopeFiles(scopes);

  // Union of every scope's full-glob file set (the "declared scopes" the
  // commit subject refers to) — this is the "repo-wide" set for the top-25
  // table and the histogram.
  const unionSet = new Map(); // relPath -> scopeName (first match wins)
  for (const scope of scopes) {
    for (const rel of scopeFiles[scope.name].full) {
      if (!unionSet.has(rel)) unionSet.set(rel, scope.name);
    }
  }

  const session = new Session();
  session.openProject(path.join(REPO_ROOT, "tsconfig.json"));

  const perFileFunctions = new Map(); // relPath -> functions[]
  const refused = [];
  const skippedKinds = new Map();

  for (const [rel] of unionSet) {
    const abs = path.join(REPO_ROOT, rel);
    const sourceFile = session.getSourceFile(abs);
    if (!sourceFile) {
      refused.push(rel);
      continue;
    }
    perFileFunctions.set(rel, walkSourceFile(sourceFile, skippedKinds));
  }

  const t1 = performance.now();
  session.close();

  const fs = await import("node:fs/promises");

  // Emit a JSON dump so a follow-up scratch experiment script can reuse the
  // exact same walked data (used for the gaming/dilution experiments in
  // RESULTS.md §4) without re-spawning the API.
  const dump = {
    wallClockMs: t1 - t0,
    filesWalked: unionSet.size,
    filesRefused: refused,
    scopeFiles,
    perFileFunctions: Object.fromEntries(perFileFunctions),
    unionScopeOf: Object.fromEntries(unionSet),
  };
  const outDir = process.env.WALK_OUTPUT_DIR || path.join(REPO_ROOT, "..", "walk-scratch");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "walk-output.json");
  await fs.writeFile(outPath, JSON.stringify(dump, null, 2));

  console.log(`Walked ${unionSet.size} files in ${(t1 - t0).toFixed(1)}ms`);
  console.log(`Refused/unsupported: ${refused.length}`, refused);
  console.log(`Skipped function-shaped kinds: ${skippedKinds.size}`);

  // -------------------------------------------------------------------
  // Report generation.
  // -------------------------------------------------------------------

  const allFns = [];
  for (const [rel, fns] of perFileFunctions) {
    for (const fn of fns) {
      allFns.push({ ...fn, file: rel, scope: unionSet.get(rel) });
    }
  }

  const top25 = [...allFns]
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 25);

  const hist = histogram(allFns.map((f) => f.complexity));

  const md = [];
  md.push("# Complexity walk over every declared scope");
  md.push("");
  md.push(
    "Cyclomatic (McCabe) complexity, per function, computed against the " +
      "pinned `typescript@7.0.2` using `typescript/unstable/{sync,ast}` " +
      "(there is no classic compiler API in this TS version — see " +
      "`git show research/complexity-tooling-for-typescript:docs/research/complexity-tooling-for-typescript.md`). " +
      "One long-lived `API` session was used for the whole run."
  );
  md.push("");
  md.push(
    "Counting rule: each function-like (`FunctionDeclaration`, " +
      "`FunctionExpression`, `ArrowFunction`, `MethodDeclaration`, " +
      "constructor, get/set accessor) starts at 1; +1 per `IfStatement`, " +
      "`ConditionalExpression`, each loop (`for`/`for-in`/`for-of`/`while`/`do`), " +
      "each classic `CaseClause`, each `CatchClause`, and each `&&`, `||`, `??` " +
      "`BinaryExpression` (including `&&=`, `||=`, `??=`). `?.` and default " +
      "parameters are **not** counted. Nested functions are separate scopes: " +
      "their branches never count toward the enclosing function."
  );
  md.push("");

  md.push("## 1. Top 25 functions, repo-wide");
  md.push("");
  md.push(
    "Repo-wide = the union of all 8 declared scopes' full globs " +
      "(`*.test.ts` excluded, matching Stryker), deduplicated. " +
      String(allFns.length) +
      " functions across " +
      unionSet.size +
      " files."
  );
  md.push("");
  md.push("| # | Function | File | Scope | CC |");
  md.push("| --- | --- | --- | --- | --- |");
  top25.forEach((fn, i) => {
    md.push(
      `| ${i + 1} | \`${fn.name}\` | \`${fn.file}:${fn.line}\` | ${fn.scope} | ${fn.complexity} |`
    );
  });
  md.push("");

  md.push("## 2. Per-scope statistics");
  md.push("");
  md.push(
    "Two tables per scope: the full glob, and the same scope after applying " +
      "its declared mutation exclusions (`stryker.scopes.json`). " +
      "\"CC>10 share\" = share of *functions* with complexity over 10. " +
      "\"Mass share CC>10\" = sum of complexity over those functions, divided " +
      "by the scope's total complexity — SlopCodeBench's structural-erosion figure."
  );
  md.push("");

  const statLine = (label, s) =>
    `| ${label} | ${s.count} | ${s.sum} | ${s.mean.toFixed(2)} | ${s.max} | ${s.p90} | ${(s.shareGt10 * 100).toFixed(1)}% | ${(s.massShareGt10 * 100).toFixed(1)}% |`;

  for (const scope of scopes) {
    const sf = scopeFiles[scope.name];
    const fullFns = sf.full.flatMap((rel) => perFileFunctions.get(rel) ?? []);
    const postFns = sf.postExclusion.flatMap((rel) => perFileFunctions.get(rel) ?? []);
    const statsFull = computeStats(fullFns.map((f) => f.complexity));
    const statsPost = computeStats(postFns.map((f) => f.complexity));

    md.push(`### \`${scope.name}\``);
    md.push("");
    md.push(`Glob: \`${scope.glob}\` — ${sf.full.length} files (full), ${sf.postExclusion.length} files (post-exclusion).`);
    if (sf.excluded.length > 0) {
      md.push("");
      md.push(
        `Mutation-excluded but still walked here: ${sf.excluded.map((e) => `\`${e}\``).join(", ")}.`
      );
    }
    md.push("");
    md.push("| Set | Functions | Sum | Mean | Max | p90 | CC>10 share | Mass share CC>10 |");
    md.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    md.push(statLine("Full glob", statsFull));
    md.push(statLine("Post-exclusion", statsPost));
    md.push("");
  }

  md.push("## 3. Distribution — all " + allFns.length + " functions, repo-wide");
  md.push("");
  md.push("| Bucket | Count |");
  md.push("| --- | --- |");
  for (const [bucket, count] of Object.entries(hist)) {
    md.push(`| ${bucket} | ${count} |`);
  }
  md.push("");

  md.push("## 4. Gaming and dilution experiments");
  md.push("");
  md.push(
    "Both experiments target `enrichBook` in `packages/core/src/enrich.ts:135` " +
      "(CC 40, the repo-wide max) and recompute the `packages/core/src` scope " +
      "(84 functions, sum 298, mean 3.55, max 40, p90 6, CC>10 share 6.0%, " +
      "mass share CC>10 30.9%) with that one file's functions swapped for a " +
      "modified copy. Both scratch copies were parsed with the same walker in " +
      "a throwaway inferred TS project (no repo files were touched); neither " +
      "was committed."
  );
  md.push("");
  md.push(
    "**Gaming — mechanical extract-function split.** `enrichBook` was split " +
      "into 3 helpers (`fillSpineColourFromCoverOnDisk` CC 5, " +
      "`lookupAndApplyMetadata` CC 30 — it inherited almost all of the " +
      "original branching, `writeAboutSection` CC 4) plus a thinner orchestrator " +
      "(CC 6, down from 40), with state threaded through a shared mutable object " +
      "rather than closures. Scope-level effect:"
  );
  md.push("");
  md.push("| Stat | Baseline | After split | Delta |");
  md.push("| --- | --- | --- | --- |");
  md.push("| Functions | 84 | 87 | +3 |");
  md.push("| Sum | 298 | 303 | +5 |");
  md.push("| Mean | 3.55 | 3.48 | -0.07 |");
  md.push("| Max | 40 | 30 | -10 |");
  md.push("| p90 | 6 | 6 | 0 |");
  md.push("| CC>10 share | 6.0% | 5.7% | -0.3pp |");
  md.push("| Mass share CC>10 | 30.9% | 27.1% | -3.8pp |");
  md.push("");
  md.push(
    "Max and the structural-erosion figure both dropped noticeably from moving " +
      "code around, not from removing any branch — the sum barely moved (+5, " +
      "from the extra `if`/return-kind checks the split itself introduced to " +
      "pass results back up). A per-function ceiling like max, or a metric " +
      "built on `CC>10`, is exactly what a purely mechanical split games: no " +
      "branch was deleted, but the single function that carried them is gone, " +
      "so the file now clears whatever `max`-based gate it used to fail. `sum` " +
      "is the one figure here a mechanical split can't shrink — it went up "+
      "slightly, because splitting is never quite free."
  );
  md.push("");
  md.push(
    "**Dilution — 30 trivial CC-1 functions appended to the same file.** " +
      "`enrichBook` itself was left untouched; only noise was added:"
  );
  md.push("");
  md.push("| Stat | Baseline | After dilution | Delta |");
  md.push("| --- | --- | --- | --- |");
  md.push("| Functions | 84 | 114 | +30 |");
  md.push("| Sum | 298 | 328 | +30 |");
  md.push("| Mean | 3.55 | 2.88 | -0.67 |");
  md.push("| Max | 40 | 40 | 0 |");
  md.push("| p90 | 6 | 5 | -1 |");
  md.push("| CC>10 share | 6.0% | 4.4% | -1.6pp |");
  md.push("| Mass share CC>10 | 30.9% | 28.0% | -2.9pp |");
  md.push("");
  md.push(
    "Max is untouched (dilution can't move it), but mean, p90, CC>10 share, " +
      "and even the mass-share erosion figure all fell — the last one is " +
      "supposed to resist exactly this ('mass' is meant to survive denominator " +
      "padding better than a plain count-based share does), and it still moved " +
      "2.9 points on 30 one-line functions that touch nothing real. `sum` " +
      "moved too, but only by the amount of noise added (+30 for +30 " +
      "CC-1 functions) — visible as noise rather than hidden as improvement, " +
      "which is the property that makes it the one number here dilution " +
      "can't use to fake a healthier file."
  );
  md.push("");

  md.push("## 5. Wall-clock");
  md.push("");
  md.push(
    `${unionSet.size} files, one API session, ${(t1 - t0).toFixed(1)}ms total ` +
      "(spawn of the native `tsc` binary + project load + every file's parse " +
      "+ the JS-side complexity walk)."
  );
  md.push("");

  md.push("## 6. Parse refusals and skipped function kinds");
  md.push("");
  if (refused.length === 0) {
    md.push("No file in the walked set was refused by `program.getSourceFile` — every file returned a `SourceFile`.");
  } else {
    md.push("Files `program.getSourceFile` returned `undefined` for (skipped, not counted anywhere above):");
    md.push("");
    for (const rel of refused) md.push(`- \`${rel}\``);
  }
  md.push("");
  if (skippedKinds.size === 0) {
    md.push("No function-shaped AST node kind was encountered outside the 7 handled kinds (FunctionDeclaration, FunctionExpression, ArrowFunction, MethodDeclaration, Constructor, GetAccessor, SetAccessor) — e.g. no class static initialization blocks were found in the walked scopes.");
  } else {
    md.push("Function-shaped kinds encountered but not walked as a scope (not one of the 7 handled kinds):");
    md.push("");
    for (const [kind, info] of skippedKinds) {
      md.push(`- \`${kind}\` — e.g. \`${info.file}:${info.line}\``);
    }
  }
  md.push("");

  const resultsPath = path.join(REPO_ROOT, "prototype", "complexity", "RESULTS.md");
  await fs.writeFile(resultsPath, md.join("\n"));
  console.log(`Wrote ${resultsPath}`);
  console.log(`Wrote ${outPath} (JSON dump, for scratch experiment reuse)`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
