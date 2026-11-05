/**
 * G69 — the Worker calls the model from one function, and that call always
 * names the gateway and skips the cache (C8 of docs/spec/ask-the-library.md).
 *
 * The AI Gateway spend limit only counts calls that go through the gateway, and
 * the prototype measured that a call made without the `gateway` option is not
 * blocked at all. So a second call site, or one that forgot the option, is a
 * bill with no cap and nothing red to say so. Four clauses:
 *
 *   1. `AI.run` appears in `packages/ask/src/ai.ts` exactly once, and nowhere
 *      else in the repository's TypeScript;
 *   2. the call's arguments carry `gateway` with `env.ASK_GATEWAY_ID` and
 *      `skipCache: true`;
 *   3. no other source file in `packages/ask/src` touches the binding at all,
 *      `env.ts`'s declaration of it excepted. A destructured `AI` would route
 *      round clause 1;
 *   4. `ai.ts` names the binding exactly once, by the call, so a local alias
 *      cannot let a second call through while the count of calls stays 1.
 *
 * See docs/gates.md, row G69 (one-ai-call).
 */

import { describe, expect, it } from 'vitest';
import { expectFound, filesUnder, readRepoFile } from './repo.ts';

const HOME = 'packages/ask/src/ai.ts';
const DECLARATION = 'packages/ask/src/env.ts';

/** A call to the binding's `run`, however it is spaced or optionally chained. */
const RUN = /\bAI\s*(?:\?\.|\.)\s*run\b/g;
/** The binding named at all: `env.AI`, `{ AI }`, `{ AI: alias }`, `['AI']`. */
const BINDING = /\.\s*AI\b|\bAI\s*[},:]|\[\s*['"`]AI['"`]\s*\]/;

/** Comments out: a doc comment may say `AI.run` without calling it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** The text of the first call's argument list, to its matching parenthesis. */
function firstCall(source: string): string | undefined {
  const start = source.search(RUN);
  if (start < 0) return undefined;
  const open = source.indexOf('(', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return undefined;
}

export function runSites(files: ReadonlyMap<string, string>): string[] {
  return [...files].flatMap(([path, source]) =>
    path === HOME ? [] : [...code(source).matchAll(RUN)].map(() => path),
  );
}

export function callFaults(raw: string): string[] {
  const source = code(raw);
  const count = [...source.matchAll(RUN)].length;
  if (count !== 1) return [`${String(count)} calls to AI.run, expected exactly 1`];
  const args = firstCall(source) ?? '';
  const faults: string[] = [];
  if (!/gateway\s*:\s*\{[^}]*\bid\s*:\s*env\.ASK_GATEWAY_ID\b/.test(args)) {
    faults.push('the call does not pass gateway: { id: env.ASK_GATEWAY_ID }');
  }
  if (!/skipCache\s*:\s*true\b/.test(args)) faults.push('the call does not pass skipCache: true');
  return faults;
}

/**
 * In the home file the binding is named exactly once, by the call: a local alias next to it
 * (`const m = env.AI`) would let a second call through while the count of calls stays 1.
 */
export function aliasFaults(raw: string): string[] {
  const names = [...code(raw).matchAll(new RegExp(BINDING.source, 'g'))].length;
  return names === 1
    ? []
    : [`${String(names)} mentions of the AI binding in ai.ts, expected exactly 1`];
}

export function bindingFaults(files: ReadonlyMap<string, string>): string[] {
  return [...files]
    .filter(([path]) => path !== HOME && path !== DECLARATION)
    .filter(([, source]) => BINDING.test(code(source)))
    .map(([path]) => `${path} names the AI binding`);
}

const workerSources = (): Map<string, string> =>
  new Map(
    filesUnder('packages/ask/src', ['.ts'])
      .filter((path) => !path.endsWith('.test.ts'))
      .map((path) => [path, readRepoFile(path)]),
  );

describe('G69 — the model is called from one function, through the gateway', () => {
  it('finds the Worker, its one call and the files it scans', () => {
    expectFound(firstCall(readRepoFile(HOME)) ? [HOME] : [], 'the call in ai.ts');
    expectFound([...workerSources().keys()], 'Worker source files', 8);
  });

  it('calls AI.run nowhere but ai.ts, anywhere in the repository', () => {
    const everywhere = new Map(
      ['packages', 'scripts', 'gates']
        .flatMap((dir) => filesUnder(dir, ['.ts', '.mts', '.js', '.mjs']))
        .filter((path) => !path.endsWith('.test.ts') && !path.includes('node_modules'))
        .map((path) => [path, readRepoFile(path)] as const),
    );
    expect(runSites(everywhere)).toEqual([]);
  });

  it('has the one call pass the gateway id and skipCache', () => {
    expect(callFaults(readRepoFile(HOME))).toEqual([]);
  });

  it('names the binding once in ai.ts, by the call', () => {
    expect(aliasFaults(readRepoFile(HOME))).toEqual([]);
  });

  it('has no other Worker file name the binding', () => {
    expect(bindingFaults(workerSources())).toEqual([]);
  });

  describe('the judgement, planted on synthetic sources', () => {
    const good =
      'await env.AI.run(MODEL, { messages }, { gateway: { id: env.ASK_GATEWAY_ID, skipCache: true } });';

    it('accepts the right call', () => {
      expect(callFaults(good)).toEqual([]);
    });

    it('refuses a call with no gateway option', () => {
      expect(callFaults('await env.AI.run(MODEL, { messages });')).not.toEqual([]);
    });

    it('refuses a call that names the gateway but not skipCache', () => {
      const bad = 'await env.AI.run(M, i, { gateway: { id: env.ASK_GATEWAY_ID } });';
      expect(callFaults(bad)).toEqual(['the call does not pass skipCache: true']);
    });

    it('refuses a hard-coded gateway id', () => {
      const bad = 'await env.AI.run(M, i, { gateway: { id: "x", skipCache: true } });';
      expect(callFaults(bad)).toEqual([
        'the call does not pass gateway: { id: env.ASK_GATEWAY_ID }',
      ]);
    });

    it('refuses a second call in the home file', () => {
      expect(callFaults(`${good}\n${good}`)).toEqual(['2 calls to AI.run, expected exactly 1']);
    });

    it('refuses a call in another file, however it is spaced or chained', () => {
      const files = new Map([
        ['a.ts', 'env.AI . run(m)'],
        ['b.ts', 'env.AI?.run(m)'],
        ['c.ts', 'nothing here'],
      ]);
      expect(runSites(files)).toEqual(['a.ts', 'b.ts']);
    });

    it('refuses a destructured or indexed binding in another file', () => {
      const files = new Map([
        ['x.ts', 'const { AI } = env;'],
        ['y.ts', "env['AI']"],
        ['z.ts', 'const a = env.AI;'],
        ['w.ts', 'const { AI: model } = env; await model.run(M, i);'],
        ['ok.ts', 'const brain = 1; // AIM'],
        [DECLARATION, 'readonly AI: AiBinding;'],
      ]);
      expect(bindingFaults(files)).toEqual([
        'x.ts names the AI binding',
        'y.ts names the AI binding',
        'z.ts names the AI binding',
        'w.ts names the AI binding',
      ]);
    });

    it('refuses a local alias of the binding in the home file', () => {
      expect(aliasFaults(good)).toEqual([]);
      expect(aliasFaults(`const m = env.AI;\n${good}`)).toEqual([
        '2 mentions of the AI binding in ai.ts, expected exactly 1',
      ]);
      expect(aliasFaults(`const { AI: m } = env;\n${good}`)).not.toEqual([]);
    });
  });
});
