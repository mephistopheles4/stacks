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

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
