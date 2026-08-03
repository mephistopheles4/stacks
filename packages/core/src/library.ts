import type { CoverSource } from './covers/cover-source.ts';
import type { BookRecord } from './types.ts';
import { keyIfPresent } from './key-if-present.ts';

/**
 * `library.json` — the build artifact the shelf reads.
 *
 * Always regenerable from the vault, never hand-edited, gitignored
 * (invariant 1). It carries frontmatter-derived fields only; there is no path
 * by which a note body could reach it, because `BookRecord` has no body field
 * to begin with (invariant 2).
 */

export interface LibraryBook {
  readonly id: string;
  readonly title: string;
  readonly author?: string;
  readonly isbn?: string;
  readonly status: string;
  readonly started?: string;
  readonly finished?: string;
  readonly rating?: number;
  readonly cover?: string;
  /** Which provider the cover came from; see `covers/cover-source.ts`. */
  readonly coverSource?: CoverSource;
  readonly spineColor?: string;
  readonly pages?: number;
  readonly faceOut?: boolean;
  readonly shelfOrder?: number;
  /** Held back from public builds. Only ever present in a local one. */
  readonly private?: boolean;
  /**
   * The cover's width ÷ height, measured at build time.
   *
   * Books are not one shape. Print covers run about 0.65; audiobook art is
   * square. Without this the shelf forces every cover onto one face and squashes
   * the square ones. Derived, so it lives here rather than in the frontmatter.
   */
  readonly coverAspect?: number;
  readonly tags: readonly string[];
  /** Present in local builds only — stripped when `isPublic` is set. */
  readonly sourcePath?: string;
}

export interface Library {
  readonly version: 1;
  readonly generatedAt: string;
  readonly bookCount: number;
  readonly books: readonly LibraryBook[];
}

export interface BuildLibraryOptions {
  /** Strips anything that would leak the shape of the vault. */
  readonly isPublic?: boolean;
  /** Injected so builds are reproducible in tests. */
  readonly now?: Date;
}

export function buildLibrary(
  records: readonly BookRecord[],
  options: BuildLibraryOptions = {},
): Library {
  const isPublic = options.isPublic ?? false;
  const books = records.map((record) => toLibraryBook(record, isPublic));

  return {
    version: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    bookCount: books.length,
    books: [...books].sort(byFinishedThenTitle),
  };
}

function toLibraryBook(record: BookRecord, isPublic: boolean): LibraryBook {
  const book: LibraryBook = {
    id: idFor(record),
    title: record.title,
    status: record.status,
    tags: record.tags,
    ...keyIfPresent('author', record.author),
    ...keyIfPresent('isbn', record.isbn),
    ...keyIfPresent('started', record.started),
    ...keyIfPresent('finished', record.finished),
    ...keyIfPresent('rating', record.rating),
    ...keyIfPresent('cover', record.cover),
    ...keyIfPresent('coverSource', record.coverSource),
    ...keyIfPresent('spineColor', record.spineColor),
    ...keyIfPresent('pages', record.pages),
    ...keyIfPresent('faceOut', record.faceOut),
    ...keyIfPresent('shelfOrder', record.shelfOrder),
    // Carried so a local index can show you which books are held back. A public
    // build never contains one, so this is only ever `true` in a build that
    // stays on your machine.
    ...keyIfPresent('private', record.private),
  };

  // A public build must expose no vault paths (brief, "share build").
  return isPublic ? book : { ...book, sourcePath: record.sourcePath };
}

/**
 * Stable across rebuilds and independent of ordering, so the shelf can keep a
 * book selected while the vault changes underneath it.
 */
function idFor(record: BookRecord): string {
  const slug = record.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // Two editions of the same title (print and audiobook) must not collide.
  const discriminator = record.isbn ?? record.sourcePath;
  return `${slug || 'untitled'}-${shortHash(discriminator)}`;
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).slice(0, 6);
}

/** Newest finished first; unfinished books last, alphabetically. */
function byFinishedThenTitle(a: LibraryBook, b: LibraryBook): number {
  if (a.finished !== undefined && b.finished !== undefined) {
    return a.finished === b.finished ? a.title.localeCompare(b.title) : b.finished.localeCompare(a.finished);
  }
  if (a.finished !== undefined) return -1;
  if (b.finished !== undefined) return 1;
  return a.title.localeCompare(b.title);
}
