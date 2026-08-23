/**
 * Turning a `cover:` value into a path, safely, in one place.
 *
 * `cover:` comes from a hand-edited note, so it is untrusted input that gets
 * joined to a directory. The rule has always been that only the filename is
 * ever used. It was implemented twice: `publish.ts` used `node:path`'s
 * `basename`, and `enrich.ts` rolled its own `cover.split('/').pop()`.
 *
 * That difference matters more than it looks. `node:path`'s `basename` is
 * platform-aware — on Windows it strips `\` as well as `/`, and on Linux it
 * does not, because there `\` is a legal character in a filename and the join
 * is harmless anyway. The hand-rolled version only ever handled `/`, so
 * `cover: ..\..\..\somewhere.png` walked straight out of the covers directory
 * on Windows, which is the platform this project actually runs on. The comment
 * above it said it could not.
 *
 * So: one implementation, stripping both separators regardless of host, plus a
 * containment check that does not care how clever the input was. Correct on
 * every platform rather than correct on whichever one you happen to be testing.
 */

import { join, resolve, sep } from "node:path";

/**
 * The filename part of a `cover:` value and nothing else.
 *
 * Returns an empty string when there is no usable filename — `.` and `..` are
 * directory references rather than names, and joining either one walks back out
 * of the directory it was joined to.
 */
export function coverFileName(cover: string): string {
  const lastSeparator = Math.max(
    cover.lastIndexOf("/"),
    cover.lastIndexOf("\\"),
  );
  const name = cover.slice(lastSeparator + 1).trim();
  return name === "" || name === "." || name === ".." ? "" : name;
}

/**
 * Where a `cover:` value lands inside `coverDir`, or `undefined` if it does not
 * land inside it at all.
 *
 * The containment check is deliberately belt-and-braces over `coverFileName`:
 * Windows has path forms that carry no separator and still are not plain names
 * (`C:x.png` is drive-relative), and a rule this one is enforcing should not
 * depend on having enumerated every such form correctly.
 */
export function resolveCoverPath(
  coverDir: string,
  cover: string,
): string | undefined {
  const name = coverFileName(cover);
  if (name === "") return undefined;

  const root = resolve(coverDir);
  const candidate = resolve(join(root, name));
  return candidate.startsWith(root + sep) ? candidate : undefined;
}
