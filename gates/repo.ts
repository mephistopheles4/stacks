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
 * The body of a `## Heading` section, up to the next `## ` at the same level.
 *
 * **Throws when the heading is gone**, which is the whole point: three gates now
 * key off a Markdown heading, and a renamed one must fail loudly rather than
 * hand back nothing and let every assertion above it pass over an empty set.
 * That is `expectFound`'s argument applied to the extraction step before it.
 */
export function markdownSection(source: string, heading: string, where: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = new RegExp(`^## ${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n## )`, 'm').exec(source)?.[1];

  if (body === undefined) {
    throw new Error(
      `no "## ${heading}" section in ${where}. A gate reads it, so a renamed heading ` +
        'must fail here rather than reduce that gate to assertions over nothing.',
    );
  }
  return body;
}

/**
 * The cells of one Markdown table row.
 *
 * Splits on `|` and drops the empty edges a leading and trailing pipe produce —
 * *only* when they are actually empty. Blindly slicing both ends loses the last
 * real cell of a row written without a trailing pipe, which is legal Markdown
 * and renders identically, so a status column would be read from the wrong
 * place with nothing to show for it.
 */
export function tableCells(line: string): string[] {
  const parts = line.split('|').map((cell) => cell.trim());
  if (parts[0] === '') parts.shift();
  if (parts.at(-1) === '') parts.pop();
  return parts;
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
