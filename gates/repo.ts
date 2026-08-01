/**
 * Shared plumbing for the repo-level gates.
 *
 * These gates read the tree itself, so they need the repo root and a way to
 * walk it. Nothing here knows anything about books.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** Vitest runs from the repo root, so this is just the cwd — named for clarity. */
export const REPO_ROOT = resolve(process.cwd());

/** Directories a source sweep must never descend into. */
const SKIP = new Set(['node_modules', '.git', 'dist', '.astro', '.cache', 'artifacts']);

/**
 * Every file under `dir` matching one of `extensions`, as repo-relative POSIX
 * paths so assertions read the same on Windows and Linux.
 */
export function filesUnder(dir: string, extensions: readonly string[]): string[] {
  const root = join(REPO_ROOT, dir);
  const found: string[] = [];

  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (extensions.some((extension) => entry.endsWith(extension))) {
        found.push(relative(REPO_ROOT, full).split(sep).join('/'));
      }
    }
  };

  walk(root);
  return found.sort();
}

/** Reads a repo-relative file. */
export function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

/**
 * Every match of a single-capture-group pattern, deduplicated and sorted.
 *
 * Gates built on extraction have a specific failure mode: a regex that stops
 * matching reports an empty set, and an empty set trivially satisfies "every
 * key found is documented". Callers must assert the count is non-zero — see
 * `expectFound`.
 */
export function extractAll(source: string, pattern: RegExp): string[] {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const found = new Set<string>();
  for (const match of source.matchAll(global)) {
    if (match[1] !== undefined) found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * Guards the green-washing case above: a gate that extracts nothing must fail
 * loudly, not pass vacuously.
 */
export function expectFound<T>(values: readonly T[], what: string, atLeast = 1): readonly T[] {
  if (values.length < atLeast) {
    throw new Error(
      `extraction found ${values.length} ${what} (expected at least ${atLeast}). ` +
        'The format being parsed has probably changed, which would make this gate pass vacuously.',
    );
  }
  return values;
}
