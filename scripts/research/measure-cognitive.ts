/**
 * Scratch script for wayfinder ticket #230 — NOT part of the committed counter.
 *
 * Answers: does the split signature between cyclomatic and cognitive complexity
 * (seen on exactly two functions in #196's spike) hold across all eight declared
 * scopes, or was it an artifact of two samples?
 *
 * Runs ESLint's `complexity` rule (the committed counter's rule, at the same
 * `max: 0, variant: 'classic'` options `eslint.config.mjs` uses) and
 * `sonarjs/cognitive-complexity` (threshold `0`, the same "floor forces every
 * function to report" trick) over the same eight scopes `stryker.scopes.json`
 * declares, using the same population rule (`populationOf` from
 * `scripts/lib/complexity.ts`, imported and NOT modified) and the same file
 * walk (`sourceFiles` from `scripts/lib/scope-check.ts`).
 *
 * ## The join problem, and how this solves it
 *
 * The two rules report a function at *different* source locations and neither
 * message carries the function's name in a form both share: `complexity`
 * renders `Function 'parseNote' has a complexity of 12...` (name in the
 * message); `sonarjs/cognitive-complexity` renders `Refactor this function to
 * reduce its Cognitive Complexity from 7 to the 0 allowed.` (no name at all).
 * Matching by (line, column) alone is unsound: for a class-field or
 * object-property arrow function, `complexity` reports at the *opening paren of
 * the arrow's params* (via ESLint's own `astUtils.getFunctionHeadLoc`) while
 * `sonarjs/cognitive-complexity` reports at the `=>` token itself (via its own
 * `getMainFunctionTokenLocation`) — two different tokens, two different
 * columns, sometimes two different lines.
 *
 * The fix: a third, throwaway ESLint rule (`research/joiner`, defined inline
 * below) walks every `FunctionDeclaration` / `FunctionExpression` /
 * `ArrowFunctionExpression` and calls *the exact same two location functions
 * the real rules call* — `astUtils.getFunctionHeadLoc` (required straight out
 * of ESLint's own `lib/rules/utils/ast-utils.js`, the same file
 * `complexity.js` imports) and sonarjs's `getMainFunctionTokenLocation`
 * (required out of `eslint-plugin-sonarjs/cjs/helpers/location.js`, the same
 * file `S3776/rule.js` imports). It reports one message per function, at the
 * `complexity`-style location, carrying a JSON payload with the
 * `cognitive-complexity`-style location for the *same* function node. Because
 * both the real rules and the joiner call the identical exported functions on
 * the identical AST node, the joiner's computed locations and the real rules'
 * reported locations are byte-for-byte identical after ESLint's line/column
 * conversion — so matching is exact equality, not a heuristic.
 *
 * ⚠️ **`sonarjs/cognitive-complexity`'s floor is 0, not 1.** `complexity`
 * always reports (cyclomatic complexity is never less than 1), but cognitive
 * complexity for straight-line code is 0, and the rule only reports when
 * `complexity > threshold` — so at threshold 0 a function with zero cognitive
 * complexity is silently *absent* from the report. A joiner entry with no
 * matching cognitive message is therefore cognitive `0`, not a missing
 * measurement — the same "no report at the floor" reasoning this repo's own
 * `eslint.config.mjs` already relies on for `complexity` at `max: 0`.
 *
 * ⚠️ **Class field initializers and static blocks have no cognitive
 * counterpart at all.** `complexity` scores them as "implicit functions" via
 * `onCodePathStart`/`onCodePathEnd` with `codePath.origin` checks —
 * `scripts/lib/complexity.ts`'s own `FunctionKind` names them for that reason.
 * `sonarjs/cognitive-complexity` hooks the `:function` selector, which never
 * matches `PropertyDefinition` or `StaticBlock` — it does not visit these
 * nodes at all, so there is no cognitive score to report or to default to
 * zero. They are counted in `total functions (complexity)` below and excluded
 * from every cognitive comparison, flagged separately.
 *
 * Run: `pnpm exec tsx scripts/research/measure-cognitive.ts`
 */

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ESLint, type Linter, type Rule } from 'eslint';
import parser from '@typescript-eslint/parser';
import { populationOf } from '../lib/complexity.ts';
import { readScopes } from '../lib/mutation-score.ts';
import { sourceFiles } from '../lib/scope-check.ts';
import { REPO_ROOT } from '../lib/repo-root.ts';

const require = createRequire(import.meta.url);

// The exact functions `eslint`'s own `complexity` rule and
// `eslint-plugin-sonarjs`'s `S3776` (cognitive-complexity) rule call to find a
// function's report location — required by absolute filesystem path, which
// bypasses `package.json#exports` (that field only gates specifier
// resolution, not a path already resolved to a file on disk).
const astUtils = require(resolve(REPO_ROOT, 'node_modules/eslint/lib/rules/utils/ast-utils.js')) as {
  getFunctionHeadLoc: (node: unknown, sourceCode: unknown) => { start: LocPoint; end: LocPoint };
  getFunctionNameWithKind: (node: unknown) => string;
};
const sonarLocation = require(
  resolve(
    REPO_ROOT,
    'node_modules/eslint-plugin-sonarjs/cjs/helpers/location.js',
  ),
) as {
  getMainFunctionTokenLocation: (
    node: unknown,
    parent: unknown,
    context: unknown,
  ) => { start: LocPoint; end: LocPoint };
};

interface LocPoint {
  line: number;
  column: number;
}

const JOIN_RULE_ID = 'research/joiner';

/**
 * One message per function-shaped node, reported at the `complexity`-style
 * location, carrying the `cognitive-complexity`-style location (already
 * converted to ESLint's 1-based-column message convention) as JSON.
 */
const joinerRule: Rule.RuleModule = {
  meta: { messages: { pair: '{{payload}}' } },
  create(context) {
    const sourceCode = context.sourceCode;

    function emit(node: Rule.Node): void {
      let name: string;
      try {
        name = astUtils.getFunctionNameWithKind(node);
      } catch {
        name = 'unknown';
      }
      const cLoc = astUtils.getFunctionHeadLoc(node, sourceCode);
      let sPayload: { line: number; column: number; endLine: number; endColumn: number } | null = null;
      try {
        const sLoc = sonarLocation.getMainFunctionTokenLocation(node, (node as { parent: unknown }).parent, context);
        sPayload = {
          line: sLoc.start.line,
          column: sLoc.start.column + 1,
          endLine: sLoc.end.line,
          endColumn: sLoc.end.column + 1,
        };
      } catch {
        sPayload = null;
      }
      context.report({
        node: node as never,
        loc: cLoc,
        messageId: 'pair',
        data: { payload: JSON.stringify({ name, s: sPayload }) },
      });
    }

    return {
      FunctionDeclaration: emit,
      FunctionExpression: emit,
      ArrowFunctionExpression: emit,
    };
  },
};

const CONFIG: Linter.Config[] = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser },
    plugins: {
      sonarjs: require('eslint-plugin-sonarjs') as Record<string, unknown>,
      research: { rules: { joiner: joinerRule } },
    },
    rules: {
      complexity: ['warn', { max: 0, variant: 'classic' }],
      'sonarjs/cognitive-complexity': ['warn', 0],
      'research/joiner': 'warn',
    },
  },
];

const COMPLEXITY_MESSAGE = /^(.+) has a complexity of (\d+)\. Maximum allowed is \d+\.$/;

interface Row {
  scope: string;
  file: string;
  name: string;
  cyclomatic: number;
  /** `null` for a class-field-initializer / static-block: no cognitive counterpart exists. */
  cognitive: number | null;
}

function keyOf(m: { line?: number; column?: number; endLine?: number; endColumn?: number }): string {
  return `${m.line ?? 0}:${m.column ?? 0}:${m.endLine ?? 0}:${m.endColumn ?? 0}`;
}

async function main(): Promise<void> {
  const scopes = readScopes();
  // Excludes this script's own directory: `scripts/**/*.ts` would otherwise
  // sweep this throwaway tool itself into the `scripts` scope's population,
  // which is not part of the repo this ticket is measuring.
  const files = sourceFiles().filter((f) => !f.startsWith('scripts/research/'));
  const eslint = new ESLint({ cwd: REPO_ROOT, overrideConfigFile: true, overrideConfig: CONFIG as never });

  const rows: Row[] = [];
  let implicitFunctions = 0; // class-field-initializer / static-block: complexity-only, no cognitive counterpart.

  for (const scope of scopes) {
    const population = populationOf(scope, files);
    if (population.length === 0) continue;

    const results = await eslint.lintFiles([...population]);

    for (const result of results) {
      const complexityMsgs = result.messages.filter((m) => m.ruleId === 'complexity');
      const cognitiveMsgs = result.messages.filter((m) => m.ruleId === 'sonarjs/cognitive-complexity');
      const joinMsgs = result.messages.filter((m) => m.ruleId === JOIN_RULE_ID);

      const cognitiveByKey = new Map<string, number>();
      for (const m of cognitiveMsgs) {
        const match = /from (\d+) to the \d+ allowed\.$/.exec(m.message);
        if (match?.[1] === undefined) {
          throw new Error(`unreadable cognitive-complexity message: ${m.message}`);
        }
        cognitiveByKey.set(keyOf(m), Number(match[1]));
      }

      const joinByKey = new Map<string, { name: string; s: { line: number; column: number; endLine: number; endColumn: number } | null }>();
      for (const m of joinMsgs) {
        const payload = JSON.parse(m.message) as {
          name: string;
          s: { line: number; column: number; endLine: number; endColumn: number } | null;
        };
        joinByKey.set(keyOf(m), payload);
      }

      const fileRel = result.filePath.slice(REPO_ROOT.length + 1).split('\\').join('/');

      for (const m of complexityMsgs) {
        const parsed = COMPLEXITY_MESSAGE.exec(m.message);
        if (parsed?.[1] === undefined || parsed[2] === undefined) {
          throw new Error(`unreadable complexity message: ${m.message}`);
        }
        const label = parsed[1];
        const cyclomatic = Number(parsed[2]);
        const isImplicit = /class field initializer|class static block/i.test(label);

        if (isImplicit) {
          implicitFunctions++;
          rows.push({ scope: scope.name, file: fileRel, name: label, cyclomatic, cognitive: null });
          continue;
        }

        const join = joinByKey.get(keyOf(m));
        if (join === undefined) {
          throw new Error(
            `no joiner entry for ${fileRel}:${m.line}:${m.column} (${label}) — the joiner rule should cover ` +
              'every FunctionDeclaration/FunctionExpression/ArrowFunctionExpression complexity reports on.',
          );
        }
        const cognitive = join.s === null ? 0 : (cognitiveByKey.get(keyOf(join.s)) ?? 0);
        rows.push({ scope: scope.name, file: fileRel, name: join.name, cyclomatic, cognitive });
      }
    }
  }

  report(rows, implicitFunctions);
}

function report(rows: Row[], implicitFunctions: number): void {
  const scored = rows.filter((r): r is Row & { cognitive: number } => r.cognitive !== null);

  console.log(`# Cognitive complexity vs cyclomatic complexity — ticket #230\n`);
  console.log(`Total complexity-rule functions: ${rows.length}`);
  console.log(`Excluded (no cognitive counterpart — class field initializer / static block): ${implicitFunctions}`);
  console.log(`Scored (paired with a cognitive-complexity value): ${scored.length}\n`);

  // (a) worst function per scope, by each measure.
  console.log('## (a) Worst function per scope, by each measure\n');
  const byScope = new Map<string, (Row & { cognitive: number })[]>();
  for (const r of scored) {
    const list = byScope.get(r.scope) ?? [];
    list.push(r);
    byScope.set(r.scope, list);
  }
  for (const [scope, list] of byScope) {
    const topCyc = [...list].sort((a, b) => b.cyclomatic - a.cyclomatic)[0];
    const topCog = [...list].sort((a, b) => b.cognitive - a.cognitive)[0];
    const same = topCyc?.file === topCog?.file && topCyc?.name === topCog?.name;
    console.log(
      `${scope}: cyclomatic-worst = ${topCyc?.name} (${topCyc?.file}) CC${topCyc?.cyclomatic}/cog${topCyc?.cognitive} | ` +
        `cognitive-worst = ${topCog?.name} (${topCog?.file}) CC${topCog?.cyclomatic}/cog${topCog?.cognitive} | ` +
        `${same ? 'SAME function' : 'DIFFERENT function'}`,
    );
  }

  // Per-scope summary: population, inversions, and each scope's own r.
  console.log('\n## Per-scope summary\n');
  for (const [scope, list] of byScope) {
    const inv = list.filter((r) => r.cognitive > r.cyclomatic).length;
    const r = pearson(
      list.map((x) => x.cyclomatic),
      list.map((x) => x.cognitive),
    );
    console.log(`${scope}: n=${list.length}, inversions=${inv} (${((inv / list.length) * 100).toFixed(1)}%), r=${r.toFixed(3)}`);
  }

  // (b) inversions.
  console.log('\n## (b) Inversions (cognitive > cyclomatic)\n');
  const inversions = scored.filter((r) => r.cognitive > r.cyclomatic);
  console.log(`Inversions: ${inversions.length} / ${scored.length}`);
  for (const r of inversions.slice(0, 20)) {
    console.log(`  ${r.name} (${r.file}) — CC${r.cyclomatic} / cog${r.cognitive}`);
  }

  // (c) correlation + outliers.
  console.log('\n## (c) Correlation and outliers\n');
  const xs = scored.map((r) => r.cyclomatic);
  const ys = scored.map((r) => r.cognitive);
  console.log(`Pearson r (cyclomatic, cognitive): ${pearson(xs, ys).toFixed(4)}`);

  const byDiscount = [...scored].sort((a, b) => a.cognitive - a.cyclomatic - (b.cognitive - b.cyclomatic));
  console.log('\nBiggest discount (cyclomatic >> cognitive), top 10:');
  for (const r of byDiscount.slice(0, 10)) {
    console.log(`  ${r.name} (${r.file}) [${r.scope}] — CC${r.cyclomatic} / cog${r.cognitive} (diff ${r.cognitive - r.cyclomatic})`);
  }
  console.log('\nSmallest discount / biggest premium (cognitive close to or above cyclomatic), top 10:');
  for (const r of byDiscount.slice(-10).reverse()) {
    console.log(`  ${r.name} (${r.file}) [${r.scope}] — CC${r.cyclomatic} / cog${r.cognitive} (diff ${r.cognitive - r.cyclomatic})`);
  }

  console.log('\n## Raw pairs (scope, file, name, cyclomatic, cognitive)\n');
  for (const r of rows) {
    console.log(`${r.scope}\t${r.file}\t${r.name}\t${r.cyclomatic}\t${r.cognitive ?? 'n/a'}`);
  }
}

function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return num / Math.sqrt(dx2 * dy2);
}

await main();
