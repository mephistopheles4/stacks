import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { coverFileName, resolveCoverPath } from './covers/cover-path.ts';
import { buildLibrary, type Library } from './library.ts';
import { renderOgImage } from './og-image.ts';
import { SHELVED_STATUSES } from './shelf-order.ts';
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

  // Books you do not own do not leave the machine. Wishlist books were already
  // filtered at render time and by the OG image, so nothing displayed them —
  // but they shipped in library.json, where anyone could read the list of books
  // the owner merely wants. Filtered here rather than in `buildLibrary` so a
  // local index still shows you your own wishlist.
  const shelved = options.isPublic
    ? books.filter((book) => SHELVED_STATUSES.has(book.status))
    : books;

  const built = buildLibrary(shelved, {
    isPublic: options.isPublic,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  const { copied, missing } = await copyCovers(shelved, vault, assetsDir);

  // Measured after copying, from the files that actually shipped.
  const measured = await withCoverAspects(built, assetsDir);

  // Every `cover:` in a public build points at the copy beside it and nowhere
  // else. A hand-edited or imported note may carry `//elsewhere.example/x.png`
  // or an absolute `http` URL, and the shelf passes those straight to an <img>
  // src — which would have a visitor's browser fetching from a third party, and
  // leaking their IP to whatever host the note happened to name.
  const library = options.isPublic ? withLocalCovers(measured) : measured;

  const libraryPath = join(assetsDir, 'library.json');
  await writeFile(libraryPath, `${JSON.stringify(library, null, 2)}\n`, 'utf8');

  const ogImagePath = join(assetsDir, 'og.png');
  await writeFile(ogImagePath, await renderOgImage(library.books, titleFor(options, library)));

  return { library, libraryPath, coversCopied: copied, coversMissing: missing, ogImagePath };
}

/**
 * Stamps each book with the true proportions of the cover that shipped.
 *
 * Measured here rather than at parse time because it describes the *image*, not
 * the note — a derived build fact, like the rest of library.json. A cover that
 * cannot be read simply gets no aspect and the shelf falls back to a normal
 * book shape.
 */
async function withCoverAspects(library: Library, assetsDir: string): Promise<Library> {
  const books = await Promise.all(
    library.books.map(async (book) => {
      if (book.cover === undefined) return book;
      const coverPath = resolveCoverPath(join(assetsDir, 'covers'), book.cover);
      if (coverPath === undefined) return book;
      try {
        const { width, height } = await sharp(coverPath).metadata();
        if (width === undefined || height === undefined || height === 0) return book;
        return { ...book, coverAspect: Number((width / height).toFixed(4)) };
      } catch {
        return book;
      }
    }),
  );

  return { ...library, books };
}

/**
 * Deletes staged covers this build does not reference.
 *
 * This is the only thing in the build that removes data, so it is deliberate
 * about *where* as well as *what*. `wanted` holds bare filenames from
 * `coverFileName`, so no note can steer a deletion out of the folder — but the
 * folder itself comes from `--assets`, which is a user-supplied flag, and
 * `stacks build --public --assets ~/Pictures` must not empty `~/Pictures/covers`.
 *
 * The signal that a directory is a staging area this tool owns is that a
 * previous run left its `library.json` in the parent. A folder without one is
 * either brand new — in which case its covers folder was just created and holds
 * nothing to prune — or it is somebody else's, and is left alone with a warning.
 * Files only, never directories.
 */
async function pruneCovers(
  assetsDir: string,
  outDir: string,
  wanted: ReadonlySet<string>,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(outDir, { withFileTypes: true });
  } catch {
    return; // Nothing staged yet.
  }

  const files = entries.filter((entry) => entry.isFile());
  if (files.length === 0) return;

  const ours = await exists(join(assetsDir, 'library.json'));
  if (!ours) {
    console.warn(
      `warning: ${outDir} holds ${String(files.length)} file(s) but ${assetsDir} has no ` +
        'library.json from a previous build, so it does not look like a folder stacks stages ' +
        'into. Leaving it alone — covers from this build were still written.',
    );
    return;
  }

  for (const entry of files) {
    if (wanted.has(entry.name)) continue;
    await rm(join(outDir, entry.name), { force: true });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rewrites every `cover:` to the copy staged beside `library.json`.
 *
 * `copyCovers` already reduces a cover to its filename before staging it, so
 * the file on disk is always `covers/<name>`. This makes the metadata say so
 * too, instead of repeating whatever the note happened to contain.
 */
function withLocalCovers(library: Library): Library {
  return {
    ...library,
    books: library.books.map((book) => {
      if (book.cover === undefined) return book;
      const filename = coverFileName(book.cover);
      if (filename === '') {
        const { cover: _dropped, ...rest } = book;
        return rest;
      }
      return { ...book, cover: `covers/${filename}` };
    }),
  };
}

function titleFor(options: PublishOptions, library: Library): { title?: string; subtitle: string } {
  return {
    ...(options.title === undefined ? {} : { title: options.title }),
    subtitle: `${library.bookCount} book${library.bookCount === 1 ? '' : 's'}`,
  };
}

/**
 * Copies exactly the covers referenced by a book, and removes anything else.
 *
 * A cover the vault lost is reported, not fatal: the shelf draws a generated
 * spine for a book with no cover, so a missing file degrades the look rather
 * than failing the build.
 *
 * The staging folder used to be additive, which was a real leak rather than
 * untidiness. Build from your own vault, then run either gate — both stage the
 * *fixture* vault into the same folder — and `library.json` is replaced while
 * every real cover stays behind, each filename a slug of a real book title. The
 * gate then greps the output, finds nothing (it reads text files, and these are
 * JPEGs), and reports the build clean. Deploying that ships an index of eight
 * invented books beside thirty-three orphaned real ones.
 *
 * So the folder is now exactly what this build references. That also settles
 * the filename question in general: a cover named after a book that is in the
 * index beside it reveals nothing the index does not.
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
      // covers directory and stage something else into a public build. Shared
      // with `enrich.ts` — see covers/cover-path.ts for why it is not
      // `node:path`'s `basename`.
      .map((cover) => coverFileName(cover))
      .filter((filename) => filename !== ''),
  );

  const outDir = join(assetsDir, 'covers');
  await mkdir(outDir, { recursive: true });
  await pruneCovers(assetsDir, outDir, wanted);

  if (wanted.size === 0) return { copied: 0, missing: [] };

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
