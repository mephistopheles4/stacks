/**
 * Shared GPU resources, kept for the life of the page and **bounded**.
 *
 * Two things on the shelf are shared across every book and keyed by a number the
 * panel can dial: the spine's normal map (one per profile) and the head cap's
 * geometry (one per roll). Both are the same shape of claim — *a shelf of any
 * size uploads two of these* — so both want the same cache: module-level, so a
 * rebuild does not re-bake, and never emptied, because it is bounded by the
 * number of bindings rather than by the size of the library.
 *
 * **That last sentence is only true of the shipped shelf, and the bound is here
 * because of what is not.** `books.headCap` and `materials.spineProfile` are
 * rebuild-class controls, so every drag of a slider plus a rebuild mints another
 * key: 51 rise values × 101 roll values is not two textures, it is thousands,
 * and nothing would ever free them. A leak on a debug surface built to diagnose
 * leaks is the one this project has already measured itself avoiding — the
 * painters hold flat at 60 textures across 500 repaints, on a panel that exists
 * to catch a count that climbs until the tab dies.
 *
 * So the cache keeps the most recent few and disposes the rest. A shipped shelf
 * never reaches the limit; a dialled one cannot run away.
 */

/** Comfortably above the two a shipped shelf holds, far below a slider's range. */
const LIMIT = 8;

export interface SharedCache<T> {
  /** The value for a key, made once. `undefined` is cached too — see below. */
  get(key: string, make: () => T | undefined): T | undefined;
}

/**
 * @param dispose frees the resource this cache holds. Called on eviction only.
 */
export function sharedCache<T>(dispose: (value: T) => void): SharedCache<T> {
  // Insertion-ordered, which is what makes the oldest key the first one out.
  const entries = new Map<string, T | undefined>();

  return {
    get(key, make) {
      // `has` rather than a truthiness check: `undefined` is a real answer here
      // — a browser that will not give a 2D context will not give one on the
      // second ask either, and re-running the bake every book would be the
      // expensive way to find that out again.
      if (entries.has(key)) return entries.get(key);

      const made = make();
      entries.set(key, made);

      while (entries.size > LIMIT) {
        const oldest = entries.keys().next();
        if (oldest.done === true) break;
        const evicted = entries.get(oldest.value);
        entries.delete(oldest.value);
        if (evicted !== undefined) dispose(evicted);
      }

      return made;
    },
  };
}
