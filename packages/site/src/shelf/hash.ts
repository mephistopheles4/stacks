/**
 * FNV-1a squashed to 0..1 — deterministic, no dependency, good enough.
 *
 * One copy, in one file, because there were two: `books.ts` used it for a
 * book's stable height and its fallback spine colour, `scene.ts` for the
 * per-book jitter in a row's lean. Identical, byte for byte, and nothing
 * comparing them — so fixing one would have left the other wrong and no build
 * would have gone red. That is the shape G10 exists for.
 *
 * Everything derived from it is stable per book on purpose: a rebuild must not
 * reshuffle the shelf's silhouette or repaint its spines.
 */
export function hashUnit(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 8) / 0x1000000;
}
