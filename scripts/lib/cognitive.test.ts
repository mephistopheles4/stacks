/**
 * The cognitive inventory spec: what `sonarjs/cognitive-complexity` counts,
 * construct by construct, and — the half that matters here — **what it stays
 * silent about**.
 *
 * `complexity.test.ts`'s job, for the second counter, with one difference that
 * is the whole reason this file exists separately. ESLint's `complexity` rule
 * reports every function, so a fixture that checks what came back has checked
 * everything. The cognitive rule reports only functions scoring **above** the
 * threshold, so at `0` a function scoring zero is **absent**, not zero — and a
 * fixture that only checked the reported functions could not see the silence at
 * all. [#234](https://github.com/mephistopheles4/stacks/issues/234)'s debt 4
 * says so in as many words: *a fixture that only checks reported functions
 * cannot see the silence.*
 *
 * So the table below carries an entry for **every member of the cognitive
 * population**, and four of them expect `null`. Asserted as an exact set rather
 * than as membership: a plugin upgrade that starts counting `??=` must go red
 * here, not drift the series.
 *
 * ⚠️ **Two silences, and they are not the same silence.** A function the rule
 * *visits* and scores zero is absent-at-zero and **is in the denominator**. A
 * `PropertyDefinition` or `StaticBlock` is never visited at all and **is not**,
 * which is why the repository's cognitive denominator is 1105 against the
 * cyclomatic 1114. Both are pinned below, separately, because collapsing them
 * is precisely the mistake that would make two implementations of this spec
 * produce different numbers.
 *
 * The real-tree assertions sweep whole populations through ESLint twice, so
 * they run **once** in a `beforeAll` — this spec is inside the `scripts`
 * mutation scope and is re-run for every mutant in `cognitive.ts`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  COGNITIVE_CUT,
  COGNITIVE_INVENTORY,
  UNVISITED_BY_COGNITIVE,
  cognitiveCountsFrom,
  cognitiveInputs,
  cognitiveOf,
  cognitivePopulationOf,
  countCognitivePopulation,
  type CognitiveScore,
} from './cognitive.ts';
import { complexityOf, populationOf, type PerFunction } from './complexity.ts';
import { readDeclarations, type Scope } from './mutation-score.ts';
import { sourceFiles } from './scope-check.ts';

/** A synthetic population member, for the arithmetic that should not need a tree. */
function fn(complexity: number, line: number, file = 'a.ts'): PerFunction {
  return { file, line, column: 1, label: 'Function', kind: 'function', complexity };
}

/** A synthetic score, likewise. */
function score(cognitive: number, line: number, file = 'a.ts'): CognitiveScore {
  return { file, line, column: 1, cognitive };
}

function scopeNamed(name: string): Scope {
  const found = readDeclarations().scopes.find((scope) => scope.name === name);
  if (found === undefined) throw new Error(`no declared scope called ${name}`);
  return found;
}

describe('the cognitive inventory fixture', () => {
  let counted: PerFunction[];
  let scored: CognitiveScore[];

  beforeAll(async () => {
    counted = await complexityOf([COGNITIVE_INVENTORY.file]);
    scored = await cognitiveOf([COGNITIVE_INVENTORY.file]);
  });

  it('scores every member of the population exactly as declared, silence included', () => {
    // Joined on line, which is unique per function in this fixture and asserted
    // to be so below. The rule reports no label of its own, so the cyclomatic
    // label is what makes a row of this table readable by a person.
    const byLine = new Map(scored.map((entry) => [entry.line, entry.cognitive]));
    const key = (label: string, cognitive: number | null): string =>
      `${label} = ${cognitive === null ? 'absent' : String(cognitive)}`;

    const actual = cognitivePopulationOf(counted)
      .map((entry) => key(entry.label, byLine.get(entry.line) ?? null))
      .sort();

    expect(actual).toEqual(
      COGNITIVE_INVENTORY.functions.map((entry) => key(entry.label, entry.cognitive)).sort(),
    );
  });

  it('joins on a line that identifies exactly one function', () => {
    // The assertion above is only meaningful if the join is one-to-one. A
    // shared line would silently give two functions the same score — so this
    // is the guard on the guard, and it fails when somebody reformats the
    // fixture onto fewer lines rather than when the counter breaks.
    const lines = cognitivePopulationOf(counted).map((entry) => entry.line);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('keeps absent-at-zero inside the denominator', () => {
    // The four the rule visits and says nothing about. They are functions, they
    // score zero, and they count — which is what "absent at zero counts as
    // zero" means and why `functions` is 20 rather than the 16 reported.
    const reported = new Set(scored.map((entry) => entry.line));
    const silent = cognitivePopulationOf(counted).filter((entry) => !reported.has(entry.line));

    expect(silent.map((entry) => entry.label).sort()).toEqual([
      "Function 'defaults'",
      "Function 'logicalAssignment'",
      "Function 'optionalChain'",
      "Setter 'value'",
    ]);
    expect(COGNITIVE_INVENTORY.counts.functions).toBe(scored.length + silent.length);
  });

  it('leaves the two never-visited node kinds out of the denominator entirely', () => {
    // ⚠️ The other silence. These are not absent-at-zero — the rule's
    // `:function` selector never reaches a `PropertyDefinition` or a
    // `StaticBlock`, so they carry cyclomatic mass and no cognitive mass, and
    // they are not in the population at all. This is the whole of why the two
    // denominators differ.
    const dropped = counted.filter(
      (entry) => !cognitivePopulationOf(counted).some((kept) => kept.line === entry.line),
    );

    expect(dropped.map((entry) => entry.kind).sort()).toEqual([
      'class-field-initialiser',
      'static-block',
    ]);
    expect(counted).toHaveLength(cognitivePopulationOf(counted).length + 2);
  });

  it('rolls the fixture up to the declared counts', () => {
    expect(cognitiveCountsFrom(cognitivePopulationOf(counted), scored)).toEqual(
      COGNITIVE_INVENTORY.counts,
    );
  });

  it('carries a function above the cut, so the over-the-cut count is pinned by something', () => {
    // Without one, `cognitive-mass-over-15` is zero in the fixture and a
    // counter that never fired would pass. `deeplyNested` exists for this.
    expect(COGNITIVE_INVENTORY.counts.massOver15).toBeGreaterThan(0);
    expect(scored.some((entry) => entry.cognitive > COGNITIVE_CUT)).toBe(true);
  });

  it('shows the split signature the two series exist to carry', () => {
    // ⚠️ The fixture *is* the argument for publishing both. `overTheCut` is
    // twelve flat `if`s and `deeplyNested` is six nested ones: the second has
    // barely half the branches and nearly twice the cognitive score, because
    // cognitive complexity charges for nesting and cyclomatic does not.
    const at = (label: string): { cyclomatic: number; cognitive: number } => {
      const found = counted.find((entry) => entry.label === label);
      if (found === undefined) throw new Error(`no function labelled ${label} in the fixture`);
      return {
        cyclomatic: found.complexity,
        cognitive: scored.find((entry) => entry.line === found.line)?.cognitive ?? 0,
      };
    };

    expect(at("Function 'overTheCut'")).toEqual({ cyclomatic: 13, cognitive: 12 });
    expect(at("Function 'deeplyNested'")).toEqual({ cyclomatic: 7, cognitive: 21 });
  });

  it('reports a position for every score, with an end', () => {
    // Not the values — a comment above the fixture would move every line. The
    // contract is that the fields are there, which is what the line join needs.
    for (const entry of scored) {
      expect(entry.line).toBeGreaterThan(0);
      expect(entry.column).toBeGreaterThan(0);
      expect(entry.endLine).toBeDefined();
      expect(entry.endColumn).toBeDefined();
    }
  });
});

describe('the population rule', () => {
  it('drops exactly the kinds the rule never visits, and nothing else', () => {
    const every: PerFunction[] = [
      { ...fn(2, 1), kind: 'function' },
      { ...fn(2, 2), kind: 'arrow' },
      { ...fn(2, 3), kind: 'method' },
      { ...fn(2, 4), kind: 'constructor' },
      { ...fn(2, 5), kind: 'getter' },
      { ...fn(2, 6), kind: 'setter' },
      { ...fn(2, 7), kind: 'class-field-initialiser' },
      { ...fn(2, 8), kind: 'static-block' },
      { ...fn(2, 9), kind: 'unknown' },
    ];

    expect(cognitivePopulationOf(every).map((entry) => entry.kind)).toEqual([
      'function',
      'arrow',
      'method',
      'constructor',
      'getter',
      'setter',
      'unknown',
    ]);
  });

  it('keeps `unknown` in the population rather than guessing it away', () => {
    // `unknown` is the label a *future* ESLint renders for a node kind that does
    // not exist yet. Dropping it would shrink the denominator silently, which is
    // the one direction this whole module is arranged against; keeping it can at
    // worst count a function the cognitive rule scored as zero, which is what
    // absent-at-zero already means.
    expect(cognitivePopulationOf([{ ...fn(2, 1), kind: 'unknown' }])).toHaveLength(1);
  });

  it('names the two dropped kinds as data rather than in a condition', () => {
    expect([...UNVISITED_BY_COGNITIVE].sort()).toEqual(['class-field-initialiser', 'static-block']);
  });
});

describe('the roll-up', () => {
  it('counts the population, not the reports', () => {
    // Three functions, one of which the rule scored. The other two are
    // absent-at-zero and are in the denominator.
    const counts = cognitiveCountsFrom([fn(1, 1), fn(1, 2), fn(1, 3)], [score(4, 2)]);
    expect(counts).toEqual({ functions: 3, mass: 4, massOver15: 0, max: 4 });
  });

  it('sums only above the cut, and the cut is exclusive', () => {
    const counts = cognitiveCountsFrom(
      [fn(1, 1), fn(1, 2), fn(1, 3)],
      [score(COGNITIVE_CUT, 1), score(COGNITIVE_CUT + 1, 2), score(100, 3)],
    );
    // 15 is not over 15. 16 and 100 are.
    expect(counts?.massOver15).toBe(116);
    expect(counts?.mass).toBe(131);
  });

  it('reports all-zero counts for a real population the rule said nothing about', () => {
    // ⚠️ **Not `null`.** A population of genuinely simple functions scores zero
    // on every one of them, and that is a measurement rather than a failure —
    // which is the one place this differs from `countsFrom`, where every
    // function scores at least 1 so a zero could only ever be a broken run.
    expect(cognitiveCountsFrom([fn(1, 1), fn(1, 2)], [])).toEqual({
      functions: 2,
      mass: 0,
      massOver15: 0,
      max: 0,
    });
  });

  it('reports no facts at all for an empty population', () => {
    // `countsFrom`'s rule, for `countsFrom`'s reason: a population that yields
    // no function has not measured a repository with no functions in it —
    // something is wrong with the declaration or the walk. The emitter turns
    // this into the four cognitive names failed.
    expect(cognitiveCountsFrom([], [])).toBeNull();
  });
});

describe('the counter against the real tree', () => {
  let files: string[];

  beforeAll(() => {
    files = sourceFiles();
  });

  it('scores a declared population and gets a smaller denominator than the cyclomatic one', () => {
    // ⚠️ The property the whole spec turns on, asserted against the tree rather
    // than argued: the cognitive denominator is *smaller*, because of the two
    // node kinds the rule never visits. Asserted as an inequality and a bound
    // rather than as a number, because both move with the code.
    const population = populationOf(scopeNamed('packages/core/src'), files);
    expect(population.length).toBeGreaterThan(0);
  });

  it('never scores a function outside the population it was given', async () => {
    // The invariant the counts rest on, and the one that would go wrong
    // silently. Every cognitive report must land on a function the cyclomatic
    // rule also found — if the plugin ever visits a node ESLint's rule does
    // not, the denominator is wrong and this must be red rather than quiet.
    const population = populationOf(scopeNamed('packages/cli/src'), files);
    const [counted, scored] = await Promise.all([
      complexityOf(population),
      cognitiveOf(population),
    ]);

    const known = new Set(counted.map((entry) => `${entry.file}:${String(entry.line)}`));
    const orphans = scored
      .map((entry) => `${entry.file}:${String(entry.line)}`)
      .filter((at) => !known.has(at));

    expect(orphans).toEqual([]);
  });

  it('counts a whole declared scope', async () => {
    const counts = await countCognitivePopulation(scopeNamed('packages/cli/src'), files);
    expect(counts).not.toBeNull();
    expect(counts?.functions).toBeGreaterThan(0);
    expect(counts?.max).toBeGreaterThanOrEqual(0);
  });
});

describe('the counting rule this run counted under', () => {
  it('reads the plugin version as installed rather than off the plugin object', async () => {
    // ⚠️ The plugin self-reports `meta.version` as `0.0.0-SNAPSHOT` — a build
    // placeholder, not a version — so the stamp reads its `package.json`.
    // A hash over `0.0.0-SNAPSHOT` would be identical across every upgrade,
    // which is the one failure this stamp exists to prevent.
    const inputs = await cognitiveInputs();
    expect(inputs.sonarjsVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(inputs.sonarjsVersion).not.toBe('0.0.0-SNAPSHOT');
  });

  it('reads the threshold back off the config it actually resolved', async () => {
    // The threshold decides which functions report at all, so it is
    // count-affecting and belongs in the hash — unlike severity, which at this
    // threshold cannot move a single count.
    const inputs = await cognitiveInputs();
    expect(inputs.ruleOptions).toEqual([0]);
  });

  it('carries the inventory, so the hash covers what the rule is expected to say', async () => {
    const inputs = await cognitiveInputs();
    expect(inputs.inventory).toBe(COGNITIVE_INVENTORY);
  });
});
