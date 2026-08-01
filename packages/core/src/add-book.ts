import { cacheCover } from './covers/cache-cover.ts';
import { isProbablySameBook, normaliseIsbn } from './identity.ts';
import { lookup, type BookMetadata, type HttpGet } from './metadata/index.ts';
import type { BookInput, BookRecord, BookStatus } from './types.ts';
import type { VaultAdapter } from './adapters/vault-adapter.ts';

export interface AddBookOptions {
  readonly status?: BookStatus;
  /** Skip the duplicate check. */
  readonly force?: boolean;
  /** Passed to the metadata providers; see MetadataOptions. */
  readonly googleBooksKey?: string;
}

export type AddBookResult =
  | { readonly kind: 'added'; readonly path: string; readonly metadata?: BookMetadata }
  | {
      readonly kind: 'duplicate';
      /** What was searched for, or what the providers resolved it to. */
      readonly title: string;
      /** The book already on the shelf — the one the user actually wants named. */
      readonly existing: string;
      /** True when the vault answered before any provider was asked. */
      readonly matchedBeforeLookup: boolean;
    }
  | { readonly kind: 'not-found'; readonly term: string };

/**
 * `stacks add` — the 30-second path from "I read this" to a note in the vault.
 *
 * Metadata, cover and spine colour are all best-effort. A book with no cover is
 * still a book: the shelf draws a generated spine for it. Only two things can
 * stop a note being written — an unresolvable search term, and an existing
 * duplicate.
 */
export async function addBook(
  term: string,
  vault: VaultAdapter,
  get: HttpGet,
  options: AddBookOptions = {},
): Promise<AddBookResult> {
  const shelved = options.force === true ? [] : await vault.listBooks();

  /**
   * Ask the shelf before asking the internet.
   *
   * Checking only *after* the lookup meant a book already in the vault that the
   * providers cannot find reported "nothing found" — technically true of the
   * APIs, and useless to someone who can see the book on their own shelf. It is
   * also a pointless round trip.
   */
  const alreadyShelved = findShelved(shelved, term, undefined, term);
  if (alreadyShelved !== undefined) {
    return {
      kind: 'duplicate',
      title: term,
      existing: alreadyShelved,
      matchedBeforeLookup: true,
    };
  }

  const [metadata] = await lookup(term, get, {
    ...(options.googleBooksKey === undefined ? {} : { googleBooksKey: options.googleBooksKey }),
  });
  if (metadata === undefined) {
    return { kind: 'not-found', term };
  }

  // And again once the providers have said what the term actually resolves to,
  // since a partial title can name a book the first check could not recognise.
  const duplicate = findShelved(shelved, metadata.title, metadata.author, metadata.isbn ?? '');
  if (duplicate !== undefined) {
    return {
      kind: 'duplicate',
      title: metadata.title,
      existing: duplicate,
      matchedBeforeLookup: false,
    };
  }

  // Best candidate first; the downloader keeps whichever is cover-shaped.
  const coverCandidates = [metadata.coverUrlLarge, metadata.coverUrl].filter(
    (url): url is string => url !== undefined,
  );
  const cover =
    coverCandidates.length === 0
      ? undefined
      : await cacheCover(coverCandidates, metadata.title, vault);

  const book: BookInput = {
    title: metadata.title,
    status: options.status ?? 'read',
    ...maybe('author', metadata.author),
    ...maybe('isbn', metadata.isbn === undefined ? undefined : normaliseIsbn(metadata.isbn)),
    ...maybe('pages', metadata.pages),
    ...maybe('cover', cover?.relativePath),
    ...maybe('coverSource', cover?.source),
    ...maybe('spineColor', cover?.spineColor),
  };

  return { kind: 'added', path: await vault.writeBook(book), metadata };
}

/**
 * The title of the shelved book this describes, if any.
 *
 * Returns the *shelved* title rather than a boolean, because the useful thing
 * to tell someone is which of their books this already is. Reporting the search
 * result's title instead once produced "already in the vault: Yuval Noah Harari
 * Collection Set…" for a shelf holding plain Nexus — true of what the API
 * returned, unrecognisable to the reader.
 *
 * Matches on ISBN first, then normalised title+author, exactly as the adapter
 * and the importer do.
 */
function findShelved(
  shelved: readonly BookRecord[],
  title: string,
  author: string | undefined,
  isbn: string,
): string | undefined {
  const wanted = normaliseIsbn(isbn);
  if (wanted.length > 0) {
    const byIsbn = shelved.find(
      (book) => book.isbn !== undefined && normaliseIsbn(book.isbn) === wanted,
    );
    if (byIsbn !== undefined) return byIsbn.title;
  }

  const titleAuthor = `${title} ${author ?? ''}`;
  return shelved.find((book) =>
    isProbablySameBook(titleAuthor, `${book.title} ${book.author ?? ''}`),
  )?.title;
}

function maybe<K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<never, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
