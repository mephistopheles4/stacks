import { cacheCover } from './covers/cache-cover.ts';
import { normaliseIsbn } from './identity.ts';
import { lookup, type BookMetadata, type HttpGet } from './metadata/index.ts';
import type { BookInput, BookStatus } from './types.ts';
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
  | { readonly kind: 'duplicate'; readonly title: string }
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
  const [metadata] = await lookup(term, get, {
    ...(options.googleBooksKey === undefined ? {} : { googleBooksKey: options.googleBooksKey }),
  });
  if (metadata === undefined) {
    return { kind: 'not-found', term };
  }

  if (options.force !== true) {
    const duplicate = await vault.bookExists(
      metadata.isbn ?? '',
      `${metadata.title} ${metadata.author ?? ''}`,
    );
    if (duplicate) {
      return { kind: 'duplicate', title: metadata.title };
    }
  }

  const cover =
    metadata.coverUrl === undefined
      ? undefined
      : await cacheCover(metadata.coverUrl, metadata.title, vault);

  const book: BookInput = {
    title: metadata.title,
    status: options.status ?? 'read',
    ...maybe('author', metadata.author),
    ...maybe('isbn', metadata.isbn === undefined ? undefined : normaliseIsbn(metadata.isbn)),
    ...maybe('pages', metadata.pages),
    ...maybe('cover', cover?.relativePath),
    ...maybe('spineColor', cover?.spineColor),
  };

  return { kind: 'added', path: await vault.writeBook(book), metadata };
}

function maybe<K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<never, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
