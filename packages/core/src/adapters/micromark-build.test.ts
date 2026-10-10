import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isDefaultBuild } from './thoughts-section.ts';

/**
 * What `micromark` the extractor runs, and what runs under it (ADR-0107).
 *
 * The parser reads the owner's whole note body, private remainder included, so
 * the build that loads and every package beneath it are part of invariant 2's
 * surface. Neither is watched by anything else: a lockfile refresh can move
 * the tokenizer packages below the four pins with no pin changing, and an
 * inherited `development` condition loads a build that can print the body.
 */

const CORE = fileURLToPath(new URL('../..', import.meta.url));
const EXTRACTOR = pathToFileURL(
  fileURLToPath(new URL('./thoughts-section.ts', import.meta.url)),
).href;

describe('N65: the build that loads', () => {
  it.each([
    [
      'the default entry',
      'file:///x/node_modules/.pnpm/micromark@4.0.2/node_modules/micromark/index.js',
      true,
    ],
    [
      'the development entry',
      'file:///x/node_modules/.pnpm/micromark@4.0.2/node_modules/micromark/dev/index.js',
      false,
    ],
    ['anything else', 'file:///x/node_modules/micromark/stream.js', false],
  ])('reads %s as default: %s', (_, entry, expected) => {
    expect(isDefaultBuild(entry)).toBe(expected);
  });

  /**
   * Both parses, in a fresh Node with the conditions given: the extractor on a
   * note that ships, and the `## About` writer's lookup on a body with
   * `## Notes`. Either would trace the whole note under the development build.
   */
  function parseIn(conditions: readonly string[]): unknown {
    const note = '---\ntype: book\ntitle: A\n---\n\n## Thoughts\n\nKept.\n';
    const body = 'Intro.\n\n## Notes\n\nPrivate.\n';
    const code = [
      `const { extractThoughts, notesHeadingAt } = await import(${JSON.stringify(EXTRACTOR)});`,
      `const extract = extractThoughts(${JSON.stringify(note)});`,
      `const notesAt = notesHeadingAt(${JSON.stringify(body)}) ?? null;`,
      'process.stdout.write(JSON.stringify({ extract, notesAt }));',
    ].join('\n');
    const env = { ...process.env, NODE_OPTIONS: '' };
    const out = execFileSync(
      process.execPath,
      [...conditions, '--import', 'tsx', '--input-type=module', '--eval', code],
      { cwd: CORE, env, encoding: 'utf8' },
    );
    return JSON.parse(out) as unknown;
  }

  it('withholds every section, and finds no `## Notes`, when the development build loads', () => {
    expect(parseIn(['--conditions=development'])).toEqual({
      extract: {
        kind: 'withheld',
        reason:
          'micromark loaded its development build, so no section is read — run without a `development` condition (check NODE_OPTIONS)',
      },
      notesAt: null,
    });
  });

  it('ships, and finds `## Notes`, under the conditions the CLI runs with', () => {
    expect(parseIn([])).toEqual({
      extract: { kind: 'shipped', paragraphs: ['Kept.'] },
      notesAt: 'Intro.\n\n'.length,
    });
  });

  it('runs the default build in this suite, as the CLI does', () => {
    expect(isDefaultBuild(import.meta.resolve('micromark'))).toBe(true);
  });
});

/**
 * Every package the four pins reach at run time, as `name@version`.
 *
 * The CommonMark rules live in `micromark-core-commonmark` and its siblings,
 * reached by caret ranges shared with `markdownlint`. A move of any one is its
 * own change, on the security route (ADR-0107): update this list in it, with
 * the named cases and G2 green and the new version at least seven days old.
 * `supports-color` and `has-flag` come through `debug`'s optional peer, which
 * pnpm links because the workspace holds it.
 */
const CLOSURE = [
  '@types/debug@4.1.13',
  '@types/ms@2.1.0',
  'character-entities@2.0.2',
  'debug@4.4.3',
  'decode-named-character-reference@1.3.0',
  'dequal@2.0.3',
  'devlop@1.1.0',
  'has-flag@4.0.0',
  'micromark-core-commonmark@2.0.3',
  'micromark-extension-gfm-footnote@2.1.0',
  'micromark-extension-gfm-table@2.1.1',
  'micromark-factory-destination@2.0.1',
  'micromark-factory-label@2.0.1',
  'micromark-factory-space@2.0.1',
  'micromark-factory-title@2.0.1',
  'micromark-factory-whitespace@2.0.1',
  'micromark-util-character@2.1.1',
  'micromark-util-chunked@2.0.1',
  'micromark-util-classify-character@2.0.1',
  'micromark-util-combine-extensions@2.0.1',
  'micromark-util-decode-numeric-character-reference@2.0.2',
  'micromark-util-encode@2.0.1',
  'micromark-util-html-tag-name@2.0.1',
  'micromark-util-normalize-identifier@2.0.1',
  'micromark-util-resolve-all@2.0.1',
  'micromark-util-sanitize-uri@2.0.1',
  'micromark-util-subtokenize@2.1.0',
  'micromark-util-symbol@2.0.1',
  'micromark-util-types@2.0.2',
  'micromark@4.0.2',
  'ms@2.1.3',
  'supports-color@7.2.0',
];

/** The four pins, as `packages/core/package.json` names them. */
const PINS = [
  'micromark',
  'micromark-extension-gfm-footnote',
  'micromark-extension-gfm-table',
  'micromark-util-types',
];

/** Where Node would find `name` from `from`: the nearest `node_modules/<name>` up the tree. */
function packageDir(from: string, name: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const manifest = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(manifest)) return realpathSync(dirname(manifest));
    if (dirname(dir) === dir) return undefined;
  }
}

/** The closure, walked from `core` by dependencies and optional peers that resolve. */
function resolvedClosure(): string[] {
  const seen = new Set<string>();
  const queue: [string, string][] = PINS.map((name) => [CORE, name]);
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const [from, name] = next;
    const dir = packageDir(from, name);
    if (dir === undefined) continue;
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, unknown>;
    };
    const key = `${manifest.name}@${manifest.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const reached = {
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.peerDependenciesMeta,
    };
    for (const dep of Object.keys(reached)) queue.push([dir, dep]);
  }
  return [...seen].sort();
}

describe('N67: the closure below the pins', () => {
  it('pins the four packages exactly in core', () => {
    const manifest = JSON.parse(readFileSync(join(CORE, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const pinned = { ...manifest.dependencies, ...manifest.devDependencies };
    expect(PINS.map((name) => `${name}@${pinned[name] ?? '(none)'}`)).toEqual(
      PINS.map((name) => CLOSURE.find((key) => key.startsWith(`${name}@`))),
    );
  });

  it('resolves every package of the closure at the committed version, and no other', () => {
    expect(resolvedClosure()).toEqual(CLOSURE);
  });
});
