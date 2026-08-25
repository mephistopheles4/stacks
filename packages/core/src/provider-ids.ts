import type { BookRecord } from './types.ts';

/**
 * The four contributor ids: which frontmatter key, which field, what shape.
 *
 * **The contributor set *is* the set of these keys present.** There is no
 * `contributors:` list and no winner key — a list would be derivable from these,
 * and a derived value stored beside its source is the drift this repo's gates
 * exist to catch. See docs/spec/provider-provenance.md §2.
 *
 * **Four scalars, and that is forced rather than preferred.** `updateBook`
 * leaves a key whose value is a list exactly as it is (flow collections
 * included), so a list-valued provenance key could never be written by
 * `stacks enrich` at all. A nested mapping fails the same way.
 *
 * **Every key names the provider's own field**, and for O'Reilly that is the
 * guard: CLAUDE.md documents `archive_id` as a trap — for one book it is
 * `0642572352530`, which passes an ISBN-13 check digit while starting `064` —
 * and the value recorded here is `ourn`, a different field. A key called
 * `oreilly_id` would invite pasting the wrong one, and the shape check below
 * would pass it, because both are well formed. **The name does work no
 * validator can.**
 */
export const CONTRIBUTOR_IDS = {
  /** Google's volume key, e.g. `CpbLAgAAQBAJ`. */
  google_volume_id: {
    field: 'googleVolumeId',
    shape: /^[A-Za-z0-9_-]{6,32}$/,
  },
  /** Apple's numeric `trackId`, e.g. `1384286945`. */
  apple_track_id: {
    field: 'appleTrackId',
    shape: /^\d{5,20}$/,
  },
  /** An Open Library *edition* id — `M`, never a work's `W`. */
  openlibrary_olid: {
    field: 'openLibraryOlid',
    shape: /^OL\d+M$/,
  },
  /** O'Reilly's `ourn`, e.g. `urn:orm:book:0642572352530`. */
  oreilly_ourn: {
    field: 'oreillyOurn',
    shape: /^urn:orm:book:[A-Za-z0-9._-]+$/,
  },
} as const satisfies Record<string, { readonly field: keyof BookRecord; readonly shape: RegExp }>;

export type ContributorIdKey = keyof typeof CONTRIBUTOR_IDS;

export const CONTRIBUTOR_ID_KEYS = Object.keys(CONTRIBUTOR_IDS) as readonly ContributorIdKey[];

/**
 * Whether a value is the right *shape* for its provider.
 *
 * ⚠️ **A typo guard, and explicitly not a correctness guarantee.** A well-formed
 * wrong id passes and always will — the `archive_id` case above is precisely
 * that. It earns its place for one reason: unlike the ISBN URL, which lands on a
 * graceful page for an ISBN Open Library does not know, all three linkable id
 * URLs **hard-404 on a stale id**. A wrong id is a dead link on a public page,
 * so dropping the obviously malformed ones is worth the little it buys. Reading
 * it as more than that is the mistake CLAUDE.md's `cover_source` note already
 * warns about.
 */
export function isWellFormedId(key: ContributorIdKey, value: string): boolean {
  return CONTRIBUTOR_IDS[key].shape.test(value);
}
