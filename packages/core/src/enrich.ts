import { cacheCover } from './covers/cache-cover.ts';
import { resolveCoverPath } from './covers/cover-path.ts';
import { spineColour } from './covers/dominant-colour.ts';
import { isProbablySameBook, normaliseIsbn } from './identity.ts';
import { lookup, type HttpGet } from './metadata/index.ts';
import type { FrontmatterChanges, VaultAdapter } from './adapters/vault-adapter.ts';
import type { BookRecord } from './types.ts';

/**
 * Filling the gaps in a note that already exists.
 *
 * The rule that makes this safe to run over a whole vault: it only ever writes
 * a key that is **absent**. Anything you set by hand — a title you corrected, a
 * spine colour you chose, a rating — is never touched, and neither is the note
 * body. Before `updateBook` existed the only way to improve a note was to delete
 * and re-add it, which threw all of that away.
 *
 * Identity is checked before anything is written. Metadata for a book that
 * merely resembles this one is worse than no metadata, and a title search will
 * cheerfully return a near-miss.
 */

/** Only these are ever filled. Notably absent: title, status, dates, rating, tags. */
const FILLABLE = ['author', 'isbn', 'pages', 'cover'] as const;

export interface EnrichOptions {
  readonly dryRun?: boolean;
  readonly googleBooksKey?: string;
}

export type EnrichOutcome =
  | { readonly kind: 'filled'; readonly title: string; readonly fields: readonly string[] }
  | { readonly kind: 'complete'; readonly title: string }
  | { readonly kind: 'not-found'; readonly title: string }
  | { readonly kind: 'mismatch'; readonly title: string; readonly found: string };

export function missingFields(book: BookRecord): string[] {
  const missing: string[] = FILLABLE.filter((field) => book[field] === undefined);
  // A cover with no colour is a gap too, and one that needs no network at all.
  if (book.cover !== undefined && book.spineColor === undefined) missing.push('spine_color');
  return missing;
}

export async function enrichBook(
  book: BookRecord,
  vault: VaultAdapter,
  get: HttpGet,
  options: EnrichOptions = {},
): Promise<EnrichOutcome> {
  const missing = missingFields(book);
  if (missing.length === 0) return { kind: 'complete', title: book.title };

  const changes: Record<string, string | number> = {};
  const filled: string[] = [];

  // A spine colour can be read from the cover already on disk, so it is worth
  // doing before deciding whether the network is needed at all.
  if (missing.includes('spine_color') && book.cover !== undefined) {
    const coverPath = resolveCoverPath(vault.coverDir(), book.cover);
    const colour = coverPath === undefined ? undefined : await spineColour(coverPath);
    if (colour !== undefined) {
      changes['spine_color'] = colour;
      filled.push('spine_color');
    }
  }

  const needsLookup = missing.some((field) => field !== 'spine_color');
  if (needsLookup) {
    const term = book.isbn ?? `${book.title} ${book.author ?? ''}`.trim();
    const [found] = await lookup(term, get, {
      ...(options.googleBooksKey === undefined ? {} : { googleBooksKey: options.googleBooksKey }),
    });

    if (found === undefined) {
      if (filled.length === 0) return { kind: 'not-found', title: book.title };
    } else if (
      // An ISBN search is proof of identity; a title search is a suggestion.
      book.isbn === undefined &&
      !isProbablySameBook(
        `${book.title} ${book.author ?? ''}`,
        `${found.title} ${found.author ?? ''}`,
      )
    ) {
      return { kind: 'mismatch', title: book.title, found: found.title };
    } else {
      if (book.author === undefined && found.author !== undefined) {
        changes['author'] = found.author;
        filled.push('author');
      }
      if (book.isbn === undefined && found.isbn !== undefined) {
        changes['isbn'] = normaliseIsbn(found.isbn);
        filled.push('isbn');
      }
      if (book.pages === undefined && found.pages !== undefined) {
        changes['pages'] = found.pages;
        filled.push('pages');
      }

      if (book.cover === undefined) {
        const candidates = [found.coverUrlLarge, found.coverUrl].filter(
          (url): url is string => url !== undefined,
        );
        const cover =
          candidates.length === 0 || options.dryRun === true
            ? undefined
            : await cacheCover(candidates, book.title, vault);
        if (cover !== undefined) {
          changes['cover'] = cover.relativePath;
          // Written alongside the cover, never on its own: the two describe the
          // same bytes, and a `cover_source` next to a cover it did not come
          // from would be worse than none at all.
          changes['cover_source'] = cover.source;
          filled.push('cover');
          if (book.spineColor === undefined && cover.spineColor !== undefined) {
            changes['spine_color'] = cover.spineColor;
            if (!filled.includes('spine_color')) filled.push('spine_color');
          }
        } else if (candidates.length > 0 && options.dryRun === true) {
          filled.push('cover');
        }
      }
    }
  }

  if (filled.length === 0) return { kind: 'complete', title: book.title };

  if (options.dryRun !== true) {
    await vault.updateBook(book.sourcePath, changes as FrontmatterChanges);
  }
  return { kind: 'filled', title: book.title, fields: filled };
}

