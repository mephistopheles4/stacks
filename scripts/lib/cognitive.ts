/**
 * Cognitive complexity over a declared population, as four counts.
 *
 * **`complexity.ts`'s twin, and deliberately not its replacement.** The two
 * measures agree broadly and diverge really — 1105 scored pairs at Pearson
 * r 0.9159, with 54 places where cognitive exceeds cyclomatic — and one
 * function in this repository scores cyclomatic 17 and cognitive **0**, because
 * optional chaining is branching to one measure and nothing at all to the
 * other. A replacement makes a 17-branch function invisible. See
 * [ADR-0073](../../docs/adr/0073-cognitive-complexity-is-published-beside-cyclomatic.md)
 * and [#234](https://github.com/mephistopheles4/stacks/issues/234).
 *
 * **The counting rule is the plugin's, not this repo's**, which is
 * `complexity.ts`'s position for the other measure and carries the same cost
 * with one addition: cognitive complexity has no published bound the way
 * McCabe's 10 does, so the cut here is the supplier's own 15 and **nothing may
 * ever refuse on it**. What lives in this file is the population rule, the
 * roll-up, and the translation from a lint report into numbers.
 *
 * ⚠️ **This counter cannot derive its own denominator, and that is the one
 * structural difference from its twin.** ESLint's `complexity` rule at `max: 0`
 * reports every function, so the report *is* the population. The cognitive rule
 * reports only functions scoring **above** its threshold, and at `0` a function
 * scoring zero is silently absent — so the report is a subset of unknown size.
 * The population therefore comes from the **cyclomatic** report, minus the two
 * node kinds this rule never visits, and every function the rule said nothing
 * about counts as zero. That is why the denominators differ — #230 measured
 * 1105 against 1114, and the **gap of nine** is the invariant rather than
 * either total, which move with the tree.
 *
 * **Pure where it can be, with the disk and ESLint at the edge**, as its twin
 * is: `cognitivePopulationOf` and `cognitiveCountsFrom` touch nothing, which is
 * what lets the spec exercise the arithmetic against synthetic functions.
 */

import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
// ⚠️ `relativeTo` and `rulesOf` are imported rather than copied. The two
// counters keep separate ESLint *configs* on purpose — one rule per report, so
// no count depends on a filter — and that discipline says nothing about a path
// helper or a config reader. Two spellings of one path is G24's whole subject.
import {
  complexityOf,
  populationOf,
  relativeTo,
  rulesOf,
  type FunctionKind,
  type PerFunction,
} from './complexity.ts';
import type { Scope } from './mutation-score.ts';
import { REPO_ROOT } from './repo-root.ts';

/**
 * The supplier's own default threshold, and **not** a bound anybody derived.
 *
 * ⚠️ **A constant with no published reasoning, which is exactly what
 * `MCCABE_CUT` is not.** McCabe published 10 in 1976 *with his argument*; this
 * is `DEFAULT_THRESHOLD` in the plugin's source, published without one. The
 * distinguishing test, stated so it can be applied again: **is the number
 * published with reasoning, or merely published?** By that test 10 passes and
 * 15 fails.
 *
 * So 15 is adopted as a definition inside a number on a page, on one condition:
 * **nothing may ever refuse on it.** `cognitive-mass-over-15` is published and
 * takes no cap, and `docs/spec/static-analysis-and-style.md` §5 is what holds
 * that. A constant nobody derived must not be what stops a deploy.
 *
 * The guard against a silent change is the series *name* — move the cut and the
 * name is either wrong or renamed, and a rename is G36's to catch. Neither cut
 * is a hash input, so for both of them the name is what is left.
 *
 * ⚠️ **It is anchored differently from `MCCABE_CUT`'s, and it had to be.**
 * `floors.test.ts` closes that one against `CAPPED_SERIES`, which works only
 * because `complexity-mass-over-10` is in that array. **No cognitive name is,
 * and none ever will be** — `cognitive-mass-over-15` may never be capped, which
 * is the whole condition on accepting an underived cut. So the same assertion
 * would be vacuous here. `cognitive.test.ts` anchors on `TREND_SERIES` instead,
 * which carries the name and which G36 holds to the `## Trends` table.
 */
export const COGNITIVE_CUT = 15;

/**
 * The two function-shaped node kinds the cognitive rule never visits.
 *
 * ⚠️ **This is the whole of why the two denominators differ**, and it is data
 * rather than a condition so that a spec can assert it. The rule hooks the
 * `:function` selector, which reaches `FunctionDeclaration`,
 * `FunctionExpression` and `ArrowFunctionExpression` — and never a
 * `PropertyDefinition` or a `StaticBlock`. ESLint's `complexity` rule scores
 * both of those as implicit functions, so they carry cyclomatic mass and no
 * cognitive mass at all.
 *
 * ⚠️ **Nine such nodes across the eight declared scopes, and the nine is the
 * durable number — not the totals either side of it.** #230 measured 1114
 * cyclomatic functions against 1105 cognitive; re-measured on adoption the
 * totals were 1133 and 1124, all nine of the difference in
 * `packages/site/src/shelf`. The totals grow with the tree and the gap does
 * not, so a reader checking this comment should check the difference.
 *
 * ⚠️ **Not to be confused with absent-at-zero.** A function this rule *visits*
 * and scores zero is silently absent from the report and **is** in the
 * denominator. These two are never visited and are **not**. Collapsing the two
 * silences is the mistake that would make two implementations of this spec
 * produce different numbers.
 */
export const UNVISITED_BY_COGNITIVE: readonly FunctionKind[] = [
  'class-field-initialiser',
  'static-block',
];

/** Where the counter's rule lives. Explicit, because ESLint would never find it. */
export const COGNITIVE_CONFIG = 'eslint.cognitive.mjs';

/** One function, as the cognitive rule scored it. */
export interface CognitiveScore {
  /** Repo-relative, POSIX separators — `PerFunction.file`'s spelling. */
  file: string;
  /**
   * Where the rule reported, 1-based.
   *
   * ⚠️ **Not the same span the `complexity` rule reports**, and a consumer
   * joining the two has to know it. ESLint reports a function at its *head*;
   * this rule reports at the function's **name token** where there is one. The
   * two agree on `line` for every shape in the inventory fixture and are free
   * to disagree on `column`, which is why nothing here joins on a column.
   */
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  cognitive: number;
}

/** One population's four counts. */
export interface CognitiveCounts {
  /** Functions in the population — **including every one the rule was silent about**. */
  functions: number;
  /** Σ cognitive complexity over those functions, absences counting as zero. */
  mass: number;
  /** Σ cognitive complexity over functions above `COGNITIVE_CUT`. */
  massOver15: number;
  /**
   * The largest single function's cognitive complexity.
   *
   * ⚠️ **`0` is a legal value here and is not a failure**, which is the one
   * place this differs from `Counts.max`. Every function has cyclomatic
   * complexity of at least 1, so a cyclomatic max of zero could only ever be a
   * broken run; a population of genuinely flat functions has a cognitive max of
   * exactly zero and has been measured correctly.
   */
  max: number;
}

/**
 * The rule's message, as `meta.messages.refactorFunction` declares it:
 * `"Refactor this function to reduce its Cognitive Complexity from
 * {{complexityAmount}} to the {{threshold}} allowed."`
 *
 * Anchored on the literal spans either side of the two placeholders, for
 * `complexity.ts`'s `MESSAGE`'s reason: the structured data is discarded before
 * any consumer sees it, so the number survives only in the rendered prose and a
 * wording change must go red rather than read as zero functions.
 */
const MESSAGE =
  /^Refactor this function to reduce its Cognitive Complexity from (\d+) to the \d+ allowed\.$/;

/** The rule this counter reads, and the only one its config enables. */
const RULE = 'sonarjs/cognitive-complexity';

/** The counter's own ESLint, pointed at its own config and never at the repo's. */
function counter(): ESLint {
  return new ESLint({ cwd: REPO_ROOT, overrideConfigFile: resolve(REPO_ROOT, COGNITIVE_CONFIG) });
}

/**
 * The cognitive population, from the cyclomatic one.
 *
 * **Everything ESLint scored as a function, minus the kinds this rule never
 * visits.** Nothing is dropped for scoring zero — that is the point.
 *
 * ⚠️ **`unknown` is kept.** It is the kind assigned to a label a *future*
 * ESLint renders for a node kind that does not exist yet, and dropping it would
 * shrink the denominator with nothing to point at. Keeping it can at worst
 * count a function this rule scored as zero, which is what absent-at-zero
 * already means everywhere else in this file — the cheap failure, chosen over
 * the silent one.
 */
export function cognitivePopulationOf(functions: readonly PerFunction[]): PerFunction[] {
  const unvisited = new Set<FunctionKind>(UNVISITED_BY_COGNITIVE);
  return functions.filter((entry) => !unvisited.has(entry.kind));
}

/**
 * Every function the cognitive rule scored above its threshold, in the given files.
 *
 * ⚠️ **Throws rather than under-counting**, which is `complexityOf`'s rule and
 * carries here with one extra edge. There, a file contributing no functions was
 * indistinguishable from a file holding none; here a *scored* file contributing
 * no messages is entirely normal — a file of flat functions reports nothing at
 * all. So the silence cannot be checked, and every other way of losing a file
 * has to be raised instead: a file that did not parse, a file ESLint declined
 * to lint, and a message whose number will not read.
 *
 * **What it does not throw on is a diagnostic about code it was not asked
 * about** — an unused `eslint-disable` directive reports with `ruleId: null`
 * and means the file *was* linted, so it is skipped rather than raised.
 * `complexityOf`'s distinction, for `complexityOf`'s reason.
 */
export async function cognitiveOf(files: readonly string[]): Promise<CognitiveScore[]> {
  if (files.length === 0) return [];

  const eslint = counter();

  /**
   * Asked before linting, and structurally rather than by reading prose — the
   * third face of this function's one rule. It matters *more* here than it does
   * for the cyclomatic counter: an ignored file and a file of flat functions
   * both produce zero messages, so after the fact there is nothing at all to
   * tell them apart.
   */
  const ignored = (
    await Promise.all(files.map(async (file) => ((await eslint.isPathIgnored(file)) ? file : null)))
  ).filter((file): file is string => file !== null);

  if (ignored.length > 0) {
    throw new Error(
      `ESLint is configured to ignore ${String(ignored.length)} file(s) in this population, ` +
        `starting with ${ignored[0] ?? ''}. An ignored file reports no cognitive scores, which ` +
        'is exactly what a file of flat functions reports — so the population would lose it ' +
        'silently and every absence would still count as a legitimate zero.',
    );
  }

  const results = await eslint.lintFiles([...files]);
  const found: CognitiveScore[] = [];

  for (const result of results) {
    const file = relativeTo(REPO_ROOT, result.filePath);

    for (const message of result.messages) {
      if (message.fatal === true) {
        throw new Error(
          `ESLint could not parse ${file}: ${message.message}. A file that does not parse ` +
            'reports no cognitive scores, which is indistinguishable from a file of flat ' +
            'functions.',
        );
      }
      if (message.ruleId !== RULE) continue;

      const parsed = MESSAGE.exec(message.message);
      if (parsed === null) {
        throw new Error(
          `unreadable cognitive message on ${file}:${String(message.line ?? 0)} — ` +
            `${message.message}. The rule's message template is an input to the count; pin a ` +
            'different plugin version or update the parse, but do not let a function count as ' +
            'zero.',
        );
      }

      found.push({
        file,
        line: message.line ?? 0,
        column: message.column ?? 0,
        ...(message.endLine === undefined ? {} : { endLine: message.endLine }),
        ...(message.endColumn === undefined ? {} : { endColumn: message.endColumn }),
        cognitive: Number(parsed[1]),
      });
    }
  }
  return found;
}

/**
 * The four counts over a population and the scores the rule reported for it, or
 * **no facts** where the population is empty.
 *
 * ⚠️ **The two arguments are not the same set, and that asymmetry is the
 * measure.** `population` is every function; `scored` is only those above the
 * threshold. Every function in the first and not the second contributes zero to
 * `mass` and one to `functions` — which is what *absent at zero counts as zero*
 * means, written where two implementations can be held to it.
 *
 * ⚠️ **`null` only for an empty population, never for empty scores.**
 * `countsFrom` returns `null` for no functions because a population that yields
 * none is a broken declaration; that reasoning transfers. What does *not*
 * transfer is its second half: there, zeros were refused because every function
 * scores at least 1, so a zero could only be a failure. Here a real population
 * of flat functions genuinely scores zero on all four counts, and refusing that
 * would fail a healthy run.
 */
export function cognitiveCountsFrom(
  population: readonly PerFunction[],
  scored: readonly CognitiveScore[],
): CognitiveCounts | null {
  if (population.length === 0) return null;

  let mass = 0;
  let massOver15 = 0;
  let max = 0;

  for (const entry of scored) {
    mass += entry.cognitive;
    if (entry.cognitive > COGNITIVE_CUT) massOver15 += entry.cognitive;
    if (entry.cognitive > max) max = entry.cognitive;
  }
  return { functions: population.length, mass, massOver15, max };
}

/**
 * One declared scope's four cognitive counts, or `null` for an empty population.
 *
 * **Two ESLint passes over the same files**, because the two rules live in two
 * configs on purpose — see `eslint.cognitive.mjs`. The cyclomatic pass is what
 * produces the denominator, so it is not optional here even though its numbers
 * are thrown away: this counter has no other way to learn how many functions it
 * was silent about.
 */
export async function countCognitivePopulation(
  scope: Scope,
  files: readonly string[],
): Promise<CognitiveCounts | null> {
  const population = populationOf(scope, files);
  if (population.length === 0) return null;

  const [counted, scored] = await Promise.all([
    complexityOf(population),
    cognitiveOf(population),
  ]);
  return cognitiveCountsFrom(cognitivePopulationOf(counted), scored);
}

/**
 * What the cognitive inventory fixture must produce, and the assertion half of it.
 *
 * **One entry per member of the cognitive population**, including the four the
 * rule says nothing about — `cognitive: null` is *absent*, and it is the half a
 * fixture that only checked reported functions could not see.
 * [#234](https://github.com/mephistopheles4/stacks/issues/234)'s debt 4 asks
 * for exactly this.
 *
 * **Total, not sampled**, for `INVENTORY`'s reason: an un-sampled construct is
 * precisely the change that would otherwise move every series at once and read
 * as a code change.
 *
 * ⚠️ **The two never-visited kinds are absent from this table entirely**, and
 * that is not the same absence as a `null`. They are not in the population, so
 * they have no row; the four `null`s are in the population and score zero.
 * `cognitive.test.ts` pins both silences separately.
 *
 * ⚠️ **Exported because the `fixtureHash` is computed from it**, alongside the
 * three installed versions and both resolved rule option sets. A record stamped
 * under a different counting rule is refused rather than compared, and these
 * numbers are part of what "a different counting rule" means.
 */
export const COGNITIVE_INVENTORY = {
  file: 'fixtures/complexity/inventory.ts',
  /**
   * The cyclomatic label and the expected cognitive score, one per population
   * member. The label is the *cyclomatic* rule's — this rule renders none of
   * its own — and it is here so a row is readable by a person rather than
   * because anything joins on it.
   */
  functions: [
    { label: "Function 'declaration'", cognitive: 3 },
    { label: "Function 'loops'", cognitive: 5 },
    { label: "Function 'switchAndCatch'", cognitive: 2 },
    // Absent at zero: the three logical assignment forms are not nesting and
    // not branching to this measure.
    { label: "Function 'logicalAssignment'", cognitive: null },
    // ⚠️ Absent at zero, and this is the divergence in miniature. Cyclomatic
    // scores this 4 — every `?.` link is a branch — and cognitive scores it
    // nothing at all. `resolveSettings` is the same mechanism at 17 against 0.
    { label: "Function 'optionalChain'", cognitive: null },
    // Absent at zero: a default is an implicit branch to ESLint and nothing here.
    { label: "Function 'defaults'", cognitive: null },
    // Twelve flat `if`s: 12. Compare `deeplyNested` below.
    { label: "Function 'overTheCut'", cognitive: 12 },
    // ⚠️ Six *nested* `if`s: 1+2+3+4+5+6 = 21, against a cyclomatic 7. Half the
    // branches of `overTheCut` and nearly twice the score. The nesting penalty
    // is the construct with no cyclomatic counterpart at all.
    { label: "Function 'deeplyNested'", cognitive: 21 },
    { label: "Function 'namedExpression'", cognitive: 1 },
    { label: 'Arrow function', cognitive: 1 },
    { label: "Async function 'asyncDeclaration'", cognitive: 1 },
    { label: "Generator function 'generatorDeclaration'", cognitive: 1 },
    { label: 'Async arrow function', cognitive: 1 },
    { label: "Function 'outer'", cognitive: 1 },
    { label: 'Arrow function', cognitive: 1 },
    { label: 'Constructor', cognitive: 1 },
    { label: "Method 'method'", cognitive: 2 },
    { label: "Static method 'make'", cognitive: 1 },
    { label: "Getter 'value'", cognitive: 1 },
    // Absent at zero: `??` is branching to one measure and nothing to the other.
    { label: "Setter 'value'", cognitive: null },
  ],
  /**
   * The roll-up over the list above. Written out rather than derived: two ways
   * of saying it.
   *
   * `functions` is **20**, not the 16 the rule reports — the four `null`s are
   * in the denominator. It is also not the cyclomatic 22, because the field
   * initialiser and the static block are not in the population at all. Both
   * differences in one number, which is the number this fixture exists for.
   */
  counts: { functions: 20, mass: 55, massOver15: 21, max: 21 },
} as const;

/**
 * Everything that decides what a *cognitive* count means.
 *
 * `CounterInputs`' half of the stamp for the second rule. Both halves are
 * folded into the one `fixtureHash`, per
 * [#234](https://github.com/mephistopheles4/stacks/issues/234) §2 — and the
 * cost of one hash rather than two is recorded there and in ADR-0073 rather
 * than hidden: a plugin upgrade then refuses every *cyclomatic* cap comparison
 * as well, although no cyclomatic number moved. That is the fail-closed
 * direction and the refusal names the hash.
 */
export interface CognitiveInputs {
  /**
   * The plugin version, **as installed**.
   *
   * ⚠️ **Read from its `package.json`, never from `sonarjs.meta.version`**,
   * which self-reports `0.0.0-SNAPSHOT` — a build placeholder rather than a
   * version. A hash over that string would be byte-identical across every
   * upgrade the plugin ever ships, which is the single failure this stamp
   * exists to prevent.
   */
  sonarjsVersion: string;
  /**
   * The resolved rule's **options**, severity dropped: `[0]`.
   *
   * ⚠️ **The threshold is hashed and severity is not, and the two are not the
   * same judgement.** Severity cannot move a count — at this threshold every
   * scoring function reports whether the rule says `warn` or `error` — so
   * hashing it would refuse every record across an edit whose numbers were
   * identical either side. The **threshold decides which functions report at
   * all**: raise it to 15 and every function scoring 15 or less vanishes from
   * the report while still sitting in the denominator, so `mass` collapses with
   * no code changed. It is `CounterInputs.ruleOptions`' rule — hash what
   * changes the number, and nothing else — reaching the opposite verdict on a
   * different option, which is why it is worth stating.
   */
  ruleOptions: readonly unknown[];
  inventory: typeof COGNITIVE_INVENTORY;
}

export async function cognitiveInputs(): Promise<CognitiveInputs> {
  // `calculateConfigForFile` is typed `any`, which is the shape `rulesOf` below
  // already refuses to trust. Annotated `unknown` so the refusal starts here
  // rather than one call later. Same annotation, same reason, as `counterInputs`.
  const config: unknown = await counter().calculateConfigForFile(COGNITIVE_INVENTORY.file);
  const entry = rulesOf(config)[RULE];

  if (entry === undefined) {
    throw new Error(
      `${COGNITIVE_CONFIG} resolved no \`${RULE}\` rule for the inventory fixture. The counter ` +
        'has no counting rule, and a hash over its absence would mean nothing.',
    );
  }

  // `require` rather than an import, because a package's own `package.json` is
  // what states the installed version and the plugin's `meta.version` states a
  // placeholder. `package.json` states a fact; `meta` states an intention that
  // was never filled in.
  //
  // ⚠️ **Resolved from `REPO_ROOT`, never from `import.meta.url`.** Two reasons
  // and both are load-bearing: the dependency is declared in the root
  // `package.json`, so the root is where "as installed" is true of — and G24
  // (`repo-root`) sweeps `scripts/` for `import.meta.url` as a root derivation
  // and cannot tell one use from another, which is that gate working rather
  // than misfiring.
  const { version } = createRequire(join(REPO_ROOT, 'package.json'))(
    'eslint-plugin-sonarjs/package.json',
  ) as { version: string };

  return {
    sonarjsVersion: version,
    // `[severity, ...options]` is ESLint's normalised shape; the tail is the options.
    ruleOptions: Array.isArray(entry) ? entry.slice(1) : [],
    inventory: COGNITIVE_INVENTORY,
  };
}
