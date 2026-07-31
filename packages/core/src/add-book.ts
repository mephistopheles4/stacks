import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spineColour } from './covers/dominant-colour.ts';
import { normaliseIsbn } from './identity.ts';
import { lookup, type BookMetadata, type HttpGet } from './metadata/index.ts';
import type { BookInput, BookStatus } from './types.ts';
import type { VaultAdapter } from './adapters/vault-adapter.ts';

export interface AddBookOptions {
  readonly status?: BookStatus;
  /** Skip the duplicate check. */
  readonly force?: boolean;
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
  const [metadata] = await lookup(term, get);
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

  const cover = await cacheCover(metadata, vault);

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

interface CachedCover {
  readonly relativePath: string;
  readonly spineColor?: string;
}

/**
 * Downloads the cover and reads its dominant colour.
 *
 * Every failure here returns `undefined` rather than throwing: a missing cover
 * downgrades the book's appearance, it does not stop it being logged.
 */
async function cacheCover(
  metadata: BookMetadata,
  vault: VaultAdapter,
): Promise<CachedCover | undefined> {
  if (metadata.coverUrl === undefined) return undefined;

  const extension = /\.(jpe?g|png|webp)(?:$|\?)/i.exec(metadata.coverUrl)?.[1] ?? 'jpg';
  const filename = `${slug(metadata.title)}.${extension.toLowerCase()}`;
  const dir = vault.coverDir();
  const absolute = join(dir, filename);

  try {
    const response = await fetch(metadata.coverUrl);
    if (!response.ok) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    // Open Library serves a 1x1 placeholder for "no cover on file".
    if (bytes.length < 1024) return undefined;

    await mkdir(dir, { recursive: true });
    await writeFile(absolute, bytes);
  } catch {
    return undefined;
  }

  return {
    relativePath: `covers/${filename}`,
    ...maybe('spineColor', await spineColour(absolute)),
  };
}

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cover'
  );
}

function maybe<K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<never, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
