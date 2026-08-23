import type { CachedCover } from "./cache-cover.ts";
import type { BookInput } from "../types.ts";

/** The three keys a cached cover contributes to a note. */
export type CoverKeys = Pick<BookInput, "cover" | "coverSource" | "spineColor">;

/**
 * A cached cover as the keys that describe it, or nothing.
 *
 * The rule this makes structural: **a note's `cover_source` describes the bytes
 * of that note's `cover`.** A source beside a cover it did not come from is
 * worse than no source at all — it reads as a permission, and the three
 * providers do not permit the same things (see `cover-source.ts`). Taking one
 * `CachedCover` and returning all three keys together means the wrong pairing
 * cannot be assembled by hand on this path.
 *
 * **This covers the creation path only** — `stacks add` and `stacks import`,
 * both of which build a `BookInput` and hand it to `writeBook`. `stacks enrich`
 * writes the same three keys and does not use this, because it goes through
 * `updateBook`: it speaks the *file* vocabulary (`cover_source`, not
 * `coverSource`), it must not overwrite a spine colour set by hand, and it
 * tracks which fields it filled for its report. Those are its own concerns, and
 * a shaper flexible enough to serve them would say less than this one does.
 *
 * The other writer of `cover_source` is `stacks covers --backfill`, which never
 * downloads anything — it infers provenance from the shape of a cover already
 * on disk. So the rule above has four writers and this owns one path of them,
 * which is why it is a helper and not a gate.
 */
export function coverKeys(cover: CachedCover | undefined): CoverKeys {
  if (cover === undefined) return {};
  return {
    cover: cover.relativePath,
    coverSource: cover.source,
    ...(cover.spineColor === undefined ? {} : { spineColor: cover.spineColor }),
  };
}
