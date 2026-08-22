/**
 * Cyclomatic complexity over a declared population, as four counts.
 *
 * **The counting rule is ESLint's, not this repo's.** A hand-rolled walk was
 * written first (`prototype/complexity-walk`) and is kept as the prototype only:
 * two counters that disagree by one on `parseNote` is the drift the spec
 * refuses, and ESLint's is the one somebody else maintains. What lives here is
 * the population rule, the roll-up, and the translation from a lint report into
 * numbers — no counting of its own.
 *
 * **Four counts, never a ratio.** The prototype put every candidate statistic
 * through two games on this repo's worst function — a mechanical three-way
 * split, and thirty trivial functions appended beside it — and no ratio
 * survived both. Read side by side the raw counts hide neither: dilution is
 * *functions and mass up by the same amount and nothing else moving*; a split is
 * *functions up, mass flat, max down*. So the record carries counts and the page
 * derives shares. See `docs/spec/complexity-on-the-trend-layer.md` §2.
 *
 * **Pure where it can be, with the disk and ESLint at the edge.**
 * `populationOf` and `countsFrom` take what they need and touch nothing, which
 * is what lets the spec exercise the roll-up's arithmetic against synthetic
 * functions instead of against whatever this tree happens to contain today.
 * `scope-check.ts`'s split, for `scope-check.ts`'s reason.
 */

import { relative, sep } from 'node:path';
import { ESLint } from 'eslint';
import { version as parserVersion } from '@typescript-eslint/parser';
import { globToRegExp, type Scope } from './mutation-score.ts';
import { REPO_ROOT } from './repo-root.ts';

/**
 * McCabe's own upper bound for a module, from the 1976 paper.
 *
 * ⚠️ **A sourced constant inside a measure's definition, and not a threshold.**
 * Nothing goes red when a function crosses it: `complexity-mass-over-10` is a
 * number to watch move, and the only teeth in this rollout are the per-scope
 * cap, which is derived from the repo's own history rather than from a
 * published figure.
 */
export const MCCABE_CUT = 10;

/**
 * What kind of function-shaped node a count belongs to.
 *
 * ⚠️ **Derived from the message text, because ESLint no longer offers it any
 * other way.** `LintMessage` carries no `data` and, since v9, no `nodeType`
 * either — so the rule's structured `{ name, complexity, max }` is discarded
 * before any consumer sees it, and the kind survives only in the rendered
 * label. The inventory fixture holds **every label this rule can render**,
 * decorated forms included, so a wording change in ESLint goes red rather than
 * silently reclassifying.
 *
 * `unknown` is the exception and cannot be fixtured: no construct produces it
 * today, because it exists for the label a *future* ESLint renders for a node
 * kind that does not exist yet. It is a value and not a throw on purpose — an
 * unrecognised label costs the pre-commit print its grouping and costs the four
 * counts nothing, so failing the run over one would be the larger bug.
 *
 * `class-field-initialiser` and `static-block` are the two ESLint scores as
 * **implicit functions** — the roll-up counts them, which is why they are named
 * here rather than folded into `unknown`. They are also the two with no
 * counterpart in an Istanbul `fnMap`, which is what the pre-commit CRAP print
 * needs them for.
 */
export type FunctionKind =
  | 'function'
  | 'arrow'
  | 'method'
  | 'constructor'
  | 'getter'
  | 'setter'
  | 'class-field-initialiser'
  | 'static-block'
  | 'unknown';

/** One function, as ESLint scored it. */
export interface PerFunction {
  /** Repo-relative, POSIX separators — the same spelling `stryker.scopes.json` uses. */
  file: string;
  /**
   * Where the rule reported, 1-based.
   *
   * ⚠️ **Three different spans, depending on `kind`, and a consumer joining
   * against another tool's ranges has to know which it is holding.** ESLint
   * reports an ordinary function at its *head* (`function foo(a, b)`, not the
   * body), a class field initialiser at the *whole* `PropertyDefinition`, and a
   * static block at the `static` keyword *token* alone. So containment is a
   * tiebreak between candidates sharing a start line, never a test for "is that
   * other range inside this function".
   */
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  /** The rendered label, verbatim: `Function 'parseNote'`, `Class static block`. */
  label: string;
  kind: FunctionKind;
  /** The identifier ESLint quoted, absent where the function is anonymous. */
  name?: string;
  complexity: number;
}

/** One population's four counts. */
export interface Counts {
  /** Functions counted — the denominator the other three are read against. */
  functions: number;
  /** Σ cyclomatic complexity over those functions. */
  mass: number;
  /** Σ complexity over functions above `MCCABE_CUT`. */
  massOver10: number;
  /** The largest single function's complexity. */
  max: number;
}

/**
 * The rule's message, as `meta.messages.complex` declares it:
 * `"{{name}} has a complexity of {{complexity}}. Maximum allowed is {{max}}."`
 *
 * Anchored on the literal spans either side of the two placeholders, so the
 * label may contain anything — including the apostrophes ESLint puts around a
 * function's name — without the number moving.
 */
const MESSAGE = /^(.+) has a complexity of (\d+)\. Maximum allowed is \d+\.$/;

/** The quoted identifier in a label, where there is one. */
const QUOTED = /'([^']*)'/;

/**
 * Label to kind.
 *
 * **Substring tests rather than prefixes, and the order is load-bearing.**
 * ESLint prepends modifiers — `Async function 'x'`, `Static method 'y'`,
 * `Generator function 'z'` — so a prefix match would drop every decorated form
 * into `unknown`. `arrow function` is tested before `function` because an async
 * arrow renders as *Async arrow function* and matches both.
 */
const KINDS: readonly (readonly [string, FunctionKind])[] = [
  ['class field initializer', 'class-field-initialiser'],
  ['class static block', 'static-block'],
  ['arrow function', 'arrow'],
  ['constructor', 'constructor'],
  ['getter', 'getter'],
  ['setter', 'setter'],
  ['method', 'method'],
  ['function', 'function'],
];

function kindOf(label: string): FunctionKind {
  const lowered = label.toLowerCase();
  for (const [needle, kind] of KINDS) {
    if (lowered.includes(needle)) return kind;
  }
  return 'unknown';
}

/** A repo-relative POSIX path, whatever the platform handed us. */
function relativeTo(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

/**
 * One population: a scope's glob, minus `*.test.ts`. **Nothing else is read.**
 *
 * ⚠️ **`exclusions` are deliberately not applied, and neither is
 * `excludedDirectories`.** Every exclusion mechanism in `stryker.scopes.json` is
 * about *oracle reach* — whether an in-process test can see a mutant — which
 * says nothing about a static measure of the source. Applying them would drop
 * `packages/site/src/shelf` from 385 functions to 113 and `packages/cli/src`
 * from 26 to **three**, so a scope could shed nine tenths of its complexity by
 * gaining a browser-only file.
 *
 * ⚠️ **The one caller that inverts this is the pre-commit CRAP print**, which
 * applies exclusions for the reason each entry's mechanism names: a CRAP score
 * for a file whose only oracle is a browser would be a fact about Vitest's
 * reach and not about the code. It filters them itself rather than passing a
 * flag here — the two rules are opposite and both are worth reading in full at
 * the place they apply.
 *
 * The `*.test.ts` drop happens here and is idempotent, so this is correct
 * whether it is handed `sourceFiles()` (which has already dropped them) or a
 * raw walk. Keeping it here is what stops the population rule from leaking into
 * `emit-metrics.ts`, which no in-process oracle reaches.
 */
export function populationOf(scope: Scope, files: readonly string[]): string[] {
  const match = globToRegExp(scope.glob);
  return files.filter((file) => match.test(file) && !file.endsWith('.test.ts')).sort();
}

/**
 * Every function in the given files, as ESLint scores them.
 *
 * **Takes an explicit file list and knows nothing about globs**, so the
 * pre-commit hook can hand it the files a commit touches and get the same
 * numbers the series are built from — one counter, one config, two callers.
 *
 * ⚠️ **Throws rather than under-counting, and there are three ways to
 * under-count.** A file that did not parse, a file ESLint declined to lint, and
 * a `complexity` message whose number will not read all produce the same thing:
 * a file contributing no functions, which is byte for byte what a file holding
 * no functions looks like. None of the three is detectable after the fact, so
 * each is raised where it happens. A count that silently became zero is worse
 * than a run that stopped.
 *
 * **What it does not throw on is a diagnostic about code it was not asked
 * about** — an unused `eslint-disable` directive reports with `ruleId: null` and
 * means the file *was* linted, so it is skipped rather than raised. There are no
 * such comments in this repo today; the distinction is kept because turning one
 * into a hard failure of the whole metrics run would be a worse bug than the one
 * being guarded.
 *
 * The caller decides what a broken step means; for the emitter that is
 * `RunFacts.failed`, and for the pre-commit print a diagnostic and exit 0.
 */
export async function complexityOf(files: readonly string[]): Promise<PerFunction[]> {
  if (files.length === 0) return [];

  const eslint = new ESLint({ cwd: REPO_ROOT });

  /**
   * ⚠️ **Asked before linting, and structurally rather than by reading a
   * warning's prose.** A file ESLint declines to lint comes back as a result
   * carrying a `ruleId: null` warning and *no* complexity messages — which is
   * byte for byte what a file holding no functions looks like, so the loop
   * below cannot tell them apart. `isPathIgnored` is the only reading that
   * separates them, and it is the third face of this function's one rule:
   * never let a file leave the population quietly.
   *
   * Nothing is ignored today — `eslint.config.mjs` declares no `ignores` and
   * ESLint's defaults reach only `node_modules`, which no scope glob touches.
   * It is checked anyway because the failure it guards is invisible: an
   * `ignores` entry added later for an unrelated reason would shrink a
   * population and move a series with no diff to point at.
   */
  const ignored = (
    await Promise.all(files.map(async (file) => ((await eslint.isPathIgnored(file)) ? file : null)))
  ).filter((file): file is string => file !== null);

  if (ignored.length > 0) {
    throw new Error(
      `ESLint is configured to ignore ${ignored.length} file(s) in this population, starting ` +
        `with ${ignored[0]}. An ignored file reports no functions, which is indistinguishable ` +
        'from a file that has none — so the population would shrink silently.',
    );
  }

  const results = await eslint.lintFiles([...files]);
  const found: PerFunction[] = [];

  for (const result of results) {
    const file = relativeTo(REPO_ROOT, result.filePath);

    for (const message of result.messages) {
      if (message.fatal === true) {
        throw new Error(
          `ESLint could not parse ${file}: ${message.message}. A file that does not parse ` +
            'reports no functions, which is indistinguishable from a file that has none.',
        );
      }
      if (message.ruleId !== 'complexity') continue;

      const parsed = MESSAGE.exec(message.message);
      if (parsed === null) {
        throw new Error(
          `unreadable complexity message on ${file}:${message.line ?? 0} — ${message.message}. ` +
            'The rule\'s message template is an input to the count; pin a different ESLint ' +
            'version or update the parse, but do not let a function count as zero.',
        );
      }

      const label = parsed[1] ?? '';
      const name = QUOTED.exec(label)?.[1];
      found.push({
        file,
        line: message.line ?? 0,
        column: message.column ?? 0,
        ...(message.endLine === undefined ? {} : { endLine: message.endLine }),
        ...(message.endColumn === undefined ? {} : { endColumn: message.endColumn }),
        label,
        kind: kindOf(label),
        ...(name === undefined ? {} : { name }),
        complexity: Number(parsed[2]),
      });
    }
  }
  return found;
}

/**
 * The four counts over a set of functions, or **no facts** where there are none.
 *
 * ⚠️ **`null`, never zeros.** A population that yields no function has not
 * measured a repository with no complexity in it — something is wrong with the
 * declaration, or with the walk. `0` is a legal value for `complexity-max` in a
 * scope of trivial functions, so a zeroed record would be indistinguishable
 * from a real one. The caller decides what the absence means: the emitter puts
 * **all four** series into `RunFacts.failed`, so the families are omitted and
 * `run_ok` is `0`. `ScopeScore.score`'s rule, for `ScopeScore.score`'s reason.
 */
export function countsFrom(functions: readonly PerFunction[]): Counts | null {
  if (functions.length === 0) return null;

  let mass = 0;
  let massOver10 = 0;
  let max = 0;

  for (const entry of functions) {
    mass += entry.complexity;
    if (entry.complexity > MCCABE_CUT) massOver10 += entry.complexity;
    if (entry.complexity > max) max = entry.complexity;
  }
  return { functions: functions.length, mass, massOver10, max };
}

/**
 * One declared scope's four counts, or `null` for a population with no function.
 *
 * The whole of what the emitter needs, once per scope. `files` is the tree —
 * `sourceFiles()` from `scope-check.ts`, walked once and handed to every scope,
 * rather than eight walks.
 */
export async function countPopulation(
  scope: Scope,
  files: readonly string[],
): Promise<Counts | null> {
  const population = populationOf(scope, files);
  if (population.length === 0) return null;
  return countsFrom(await complexityOf(population));
}

/**
 * What the inventory fixture must produce, and the assertion half of it.
 *
 * Every counted construct and every function-shaped node appears in
 * `fixtures/complexity/inventory.ts` at least once; this is what the rule is
 * expected to say about each. **Total, not sampled** — an un-sampled construct
 * is precisely the change that would otherwise move every series at once and
 * read as a code change.
 *
 * ⚠️ **Exported because the cap's fixture hash will be computed from it**,
 * alongside the two installed versions and the resolved rule options. Nothing
 * computes that hash yet — the cap is a later step, and until it lands this is
 * an export with one consumer, its own spec. When it does land, a record stamped
 * under a different counting rule is to be refused rather than compared, and
 * these numbers are what "a different counting rule" will mean.
 */
export const INVENTORY = {
  file: 'fixtures/complexity/inventory.ts',
  /** Label and expected complexity, one per function-shaped node in the fixture. */
  functions: [
    { label: "Function 'declaration'", kind: 'function', complexity: 6 },
    { label: "Function 'loops'", kind: 'function', complexity: 6 },
    { label: "Function 'switchAndCatch'", kind: 'function', complexity: 4 },
    { label: "Function 'logicalAssignment'", kind: 'function', complexity: 4 },
    { label: "Function 'optionalChain'", kind: 'function', complexity: 4 },
    { label: "Function 'defaults'", kind: 'function', complexity: 3 },
    { label: "Function 'overTheCut'", kind: 'function', complexity: 13 },
    { label: "Function 'namedExpression'", kind: 'function', complexity: 2 },
    { label: 'Arrow function', kind: 'arrow', complexity: 2 },
    { label: "Async function 'asyncDeclaration'", kind: 'function', complexity: 2 },
    { label: "Generator function 'generatorDeclaration'", kind: 'function', complexity: 2 },
    { label: 'Async arrow function', kind: 'arrow', complexity: 2 },
    { label: "Function 'outer'", kind: 'function', complexity: 2 },
    { label: 'Arrow function', kind: 'arrow', complexity: 2 },
    { label: 'Class field initializer', kind: 'class-field-initialiser', complexity: 2 },
    { label: 'Class static block', kind: 'static-block', complexity: 1 },
    { label: 'Constructor', kind: 'constructor', complexity: 2 },
    { label: "Method 'method'", kind: 'method', complexity: 3 },
    { label: "Static method 'make'", kind: 'method', complexity: 2 },
    { label: "Getter 'value'", kind: 'getter', complexity: 2 },
    { label: "Setter 'value'", kind: 'setter', complexity: 2 },
  ],
  /** The roll-up over the list above. Written out rather than derived: two ways of saying it. */
  counts: { functions: 21, mass: 68, massOver10: 13, max: 13 },
} as const;

/**
 * Everything that decides what a count *means*, in the order the cap hashes it.
 *
 * ⚠️ **The rule options are read back off the config ESLint actually resolved,
 * never kept as a second literal here.** A copy in TypeScript is the one input
 * the hash cannot see: edit `eslint.config.mjs` to `max: 5` and a constant would
 * go on hashing the old value, so every cap would be compared across two
 * different counting rules and nothing would say so. It is `RunFacts.configHash`'s
 * rule one layer over — stamp the configuration you loaded, not the one you were
 * handed.
 *
 * The two versions are read *as installed* for the same reason: `package.json`
 * states an intention and `node_modules` states a fact, and only one of them is
 * an input to the number.
 */
export interface CounterInputs {
  eslintVersion: string;
  parserVersion: string;
  /**
   * The resolved rule's **options**, severity dropped: `[{ max: 0, variant: 'classic' }]`.
   *
   * ⚠️ **Severity is excluded deliberately, and it is the one judgement in this
   * object.** At `max: 0` every function reports whether the rule is set to
   * `warn` or `error`, so severity cannot move a single count — and hashing it
   * would make `warn` → `error` refuse every record on the deploy path while
   * the numbers either side were identical. That is `configHashOf`'s
   * `SCORE_NEUTRAL_OPTIONS` applied to a different config: hash what changes the
   * number, and nothing else. It is also what §4 asks for in its own words —
   * *the `complexity` rule's options object*.
   *
   * A rule configured with no options at all hashes as `[]`, which is a
   * different counting rule (ESLint's defaults are `max: 20`) and reads as one.
   */
  ruleOptions: readonly unknown[];
  inventory: typeof INVENTORY;
}

/** The `rules` map off a resolved config, without asserting what is in it. */
function rulesOf(config: unknown): Record<string, unknown> {
  if (typeof config !== 'object' || config === null) return {};
  const { rules } = config as { rules?: unknown };
  return typeof rules === 'object' && rules !== null ? (rules as Record<string, unknown>) : {};
}

export async function counterInputs(): Promise<CounterInputs> {
  const config = await new ESLint({ cwd: REPO_ROOT }).calculateConfigForFile(INVENTORY.file);
  const entry = rulesOf(config)['complexity'];

  if (entry === undefined) {
    throw new Error(
      'eslint.config.mjs resolved no `complexity` rule for the inventory fixture. The counter ' +
        'has no counting rule, and a hash over its absence would mean nothing.',
    );
  }
  return {
    eslintVersion: ESLint.version,
    parserVersion,
    // `[severity, ...options]` is ESLint's normalised shape; the tail is the options.
    ruleOptions: Array.isArray(entry) ? entry.slice(1) : [],
    inventory: INVENTORY,
  };
}
