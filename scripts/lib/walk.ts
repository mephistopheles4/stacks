/**
 * Every file under a directory, recursively, as absolute paths.
 *
 * Shared because it existed twice: `check-public-build.ts` walks a fixture
 * vault looking for the canary, and `public-build.ts` walks a built folder
 * looking for what shipped. Different questions, one traversal — and leaving a
 * second copy in a change whose whole argument is that duplicated rules drift
 * would have been a poor advertisement for it.
 *
 * A directory that is not there has no files, rather than throwing. Both
 * callers check for the folder they care about themselves, with a message that
 * says what its absence means to them.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}

/**
 * The source sweep both counters walk: repo-relative POSIX paths, sorted,
 * skipping build output and every dot-directory.
 *
 * ⚠️ **Extracted because the duplication counter found it duplicated**, on the
 * commit that added the counter — `scripts/lib/duplication.ts` and
 * `scripts/lib/scope-check.ts` held the same seven lines, which is the shape
 * [#254](https://github.com/mephistopheles4/stacks/issues/254) exists to make
 * visible. Shipping a fresh clone inside the change that starts counting clones
 * would have been a poor advertisement for it, and `walk`'s own comment above
 * already says why this file is where such a thing goes.
 *
 * **Two parameters and no more**: where to start, and what to keep. The two
 * callers differ in exactly those — one reads three declared roots and drops
 * test files, the other reads the whole tree and keeps them — and the reasons
 * they differ live with the callers, where a reader meets them.
 *
 * `.astro/` holds generated declarations and `.stryker-tmp/` is a copy of the
 * tree, which is exactly the input that would make a count report on a sandbox;
 * both go with the dot-directory rule rather than being named.
 */
export function walkSource(
  roots: readonly string[],
  keep: (path: string) => boolean,
  root: string,
): string[] {
  const skip = new Set(['node_modules', 'dist', 'artifacts']);
  const found: string[] = [];

  const descend = (current: string): void => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current)) {
      if (skip.has(entry) || entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        descend(full);
        continue;
      }
      const path = relative(root, full).split(sep).join('/');
      if (keep(path)) found.push(path);
    }
  };

  for (const source of roots) descend(join(root, source));
  return found.sort();
}
