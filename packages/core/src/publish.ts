import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { buildLibrary, type Library } from './library.ts';
import { renderOgImage } from './og-image.ts';
import type { BookRecord } from './types.ts';
import type { VaultAdapter } from './adapters/vault-adapter.ts';

/**
 * Stages everything the static site needs into one folder.
 *
 * `stacks build --public` writes here; `astro build` then folds this folder
 * into `dist/`. Keeping the two steps separate means the CLI never has to know
 * how the site is built, and the site never has to know where the vault is.
 *
 * Nothing below a note's frontmatter is ever staged, because nothing below it
 * was ever parsed — `BookRecord` has no body field to leak.
 */

export interface PublishOptions {
  readonly isPublic: boolean;
  readonly title?: string;
  readonly now?: Date;
}

export interface PublishResult {
  readonly library: Library;
  readonly libraryPath: string;
  readonly coversCopied: number;
  readonly coversMissing: readonly string[];
  readonly ogImagePath: string;
}

export async function publish(
  books: readonly BookRecord[],
  vault: VaultAdapter,
  assetsDir: string,
  options: PublishOptions,
): Promise<PublishResult> {
  await mkdir(assetsDir, { recursive: true });

  const library = buildLibrary(books, {
    isPublic: options.isPublic,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  const libraryPath = join(assetsDir, 'library.json');
  await writeFile(libraryPath, `${JSON.stringify(library, null, 2)}\n`, 'utf8');

  const { copied, missing } = await copyCovers(books, vault, assetsDir);

  const ogImagePath = join(assetsDir, 'og.png');
  await writeFile(ogImagePath, await renderOgImage(library.books, titleFor(options, library)));

  return { library, libraryPath, coversCopied: copied, coversMissing: missing, ogImagePath };
}

function titleFor(options: PublishOptions, library: Library): { title?: string; subtitle: string } {
  return {
    ...(options.title === undefined ? {} : { title: options.title }),
    subtitle: `${library.bookCount} book${library.bookCount === 1 ? '' : 's'}`,
  };
}

/**
 * Copies only the covers actually referenced by a book.
 *
 * A cover the vault lost is reported, not fatal: the shelf draws a generated
 * spine for a book with no cover, so a missing file degrades the look rather
 * than failing the build.
 */
async function copyCovers(
  books: readonly BookRecord[],
  vault: VaultAdapter,
  assetsDir: string,
): Promise<{ copied: number; missing: string[] }> {
  const wanted = new Set(
    books
      .map((book) => book.cover)
      .filter((cover): cover is string => cover !== undefined)
      // Only the filename is used, so a `cover:` value cannot walk out of the
      // covers directory and stage something else into a public build.
      .map((cover) => basename(cover)),
  );

  if (wanted.size === 0) return { copied: 0, missing: [] };

  const outDir = join(assetsDir, 'covers');
  await mkdir(outDir, { recursive: true });

  let copied = 0;
  const missing: string[] = [];

  for (const filename of wanted) {
    try {
      await copyFile(join(vault.coverDir(), filename), join(outDir, filename));
      copied += 1;
    } catch {
      missing.push(filename);
    }
  }

  return { copied, missing };
}
