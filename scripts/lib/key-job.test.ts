/**
 * The two rules that keep the BrowserStack key where the device check's spec put it (#618, claim 3).
 *
 * The key is an environment secret of `browserstack`, which only a push to `main` may enter, and
 * the one step that holds it runs `node scripts/check-devices.ts` with no installed package. Both
 * halves are a rule about the shape of the tree, so each is a test:
 *
 * - the **import graph** of the entry holds no package and no spawn outside the one module that
 *   starts the binary, so nothing installed or spawned beside the key can read it;
 * - the **environment gate**: only `devices.yml` names the environment, and its `on:` is exactly
 *   a push to `main`, because another trigger would pass the environment's branch policy on `main`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './repo-root.ts';

const ENTRY = 'scripts/check-devices.ts';
const SPAWNER = 'scripts/lib/browserstack-local.ts';

/** Every module specifier a file names, static or dynamic, `import type` and re-exports included. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) found.push(match[1]);
    }
  }
  return found;
}

interface Walk {
  readonly files: string[];
  readonly foreign: string[];
  readonly spawners: string[];
}

/** Walks the repository's own `.ts` files from `entry`; anything else but a `node:` built-in is `foreign`. */
function walk(entry: string): Walk {
  const files: string[] = [];
  const foreign: string[] = [];
  const spawners: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.includes(file)) continue;
    files.push(file);
    for (const spec of specifiers(readFileSync(join(REPO_ROOT, file), 'utf8'))) {
      if (spec === 'node:child_process') spawners.push(file);
      if (spec.startsWith('node:')) continue;
      if (spec.startsWith('.') && spec.endsWith('.ts')) {
        const target = resolve(REPO_ROOT, dirname(file), spec);
        queue.push(relative(REPO_ROOT, target).replaceAll('\\', '/'));
      } else {
        foreign.push(`${file} imports ${spec}`);
      }
    }
  }
  return { files, foreign, spawners };
}

describe('the key-holding step’s import graph', () => {
  const graph = walk(ENTRY);

  it('reaches only node: built-ins and this repository’s .ts files, and spawns only in the binary’s module', () => {
    expect(graph.files.length).toBeGreaterThan(3);
    expect(graph.foreign).toEqual([]);
    expect(new Set(graph.spawners)).toEqual(new Set([SPAWNER]));
  });

  it('never reaches the reader that asks git where the checkout is, or the shell helper', () => {
    expect(graph.files).not.toContain('scripts/lib/browserstack-key.ts');
    expect(graph.files).not.toContain('scripts/lib/run.ts');
  });
});

describe('the environment gate', () => {
  const dir = join(REPO_ROOT, '.github', 'workflows');
  const workflows = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
  const text = (name: string): string => readFileSync(join(dir, name), 'utf8');

  /** The lines of the top-level `on:` block, without comments or blanks. */
  function onBlock(source: string): string[] {
    const lines = source.split(/\r?\n/);
    const start = lines.findIndex((line) => /^on\s*:/.test(line));
    if (start === -1) return [];
    const block = [(lines[start] ?? '').replace(/^on\s*:\s*/, '')];
    for (const line of lines.slice(start + 1)) {
      if (/^\S/.test(line)) break;
      block.push(line);
    }
    return block.map((line) => line.replace(/#.*$/, '').trim()).filter((line) => line !== '');
  }

  it('lets only devices.yml name the browserstack environment', () => {
    expect(workflows).toContain('devices.yml');
    // `environment: browserstack`, or the mapping form: `environment:` then `name: browserstack`,
    // with the mapping's other key, `url:`, allowed in between.
    const names =
      /\benvironment\s*:[^\n]*(?:\n[ \t]+url\s*:[^\n]*)?\n?[ \t]*(?:name\s*:\s*)?browserstack/;
    const naming = workflows.filter((name) => names.test(text(name).replace(/#[^\n]*/g, '')));
    expect(naming).toEqual(['devices.yml']);
  });

  it('runs devices.yml on a push to main and on nothing else', () => {
    expect(onBlock(text('devices.yml'))).toEqual(['push:', 'branches: [main]']);
  });
});
