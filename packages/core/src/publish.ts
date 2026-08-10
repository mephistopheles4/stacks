import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { MAX_COVER_EDGE, measureCover } from './covers/cover-budget.ts';
import { coverFileName, resolveCoverPath } from './covers/cover-path.ts';
import { buildLibrary, type Library } from './library.ts';
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
  readonly now?: Date;
}

export interface PublishResult {
  readonly library: Library;
  readonly libraryPath: string;
  readonly coversCopied: number;
  readonly coversMissing: readonly string[];
}

export async function publish(
  books: readonly BookRecord[],
  vault: VaultAdapter,
  assetsDir: string,
  options: PublishOptions,
): Promise<PublishResult> {
  await mkdir(assetsDir, { recursive: true });

  // Two kinds of book do not leave the machine.
  //
  // Wishlist ones because you do not own them: they were already filtered at
  // render time and by the OG image, so nothing displayed them, but they
  // shipped in library.json where anyone could read the list of books the owner
  // merely wants.
  //
  // `private: true` ones because the owner said so. The shelf is published by a
  // pipeline that never asks again — a book is public the moment `stacks add`
  // finishes — and this is the per-book way to say no.
  //
  // Filtered here rather than in `buildLibrary`, so a local index still shows
  // you everything on your own machine. Private means "not published", not
  // "hidden from you".
  const shelved = options.isPublic
    ? books.filter((book) => SHELVED_STATUSES.has(book.status) && book.private !== true)
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

  // The share image is *not* written here, and used to be. `og.png` is now
  // committed brand art sitting in the same folder this stages into, so a build
  // that rendered one would overwrite the designed card with a generated one
  // every time — silently, since both are a 1200x630 PNG at that path.
  // `gate:public` still checks it reaches `dist/` and is not a truncated file.

  return { library, libraryPath, coversCopied: copied, coversMissing: missing };
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

      const size = await measureCover(coverPath);
      if (size === undefined || size.height === 0) return book;
      return { ...book, coverAspect: Number((size.width / size.height).toFixed(4)) };
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
      await stageCover(join(vault.coverDir(), filename), join(outDir, filename));
      copied += 1;
    } catch {
      missing.push(filename);
    }
  }

  return { copied, missing };
}

/**
 * Copies one cover, shrinking it to something a phone can hold.
 *
 * The vault keeps whatever the provider gave — Apple's artwork runs to 2400px —
 * and that is right for the vault: it is your copy of the cover. It is wrong for
 * the shelf, where every cover becomes an uncompressed GPU texture and the
 * browser uploads all of them before the first frame. See cover-budget.ts for
 * the numbers; the short version is that the untouched vault covers came to
 * 314 MB decoded and phones were killing the tab.
 *
 * `withoutEnlargement` so a small cover is never blown up into a blurry big one,
 * and `fit: 'inside'` so the proportions survive — `withCoverAspects` measures
 * the file this writes, and a stretched cover would be measured as stretched and
 * then drawn that way on the shelf.
 *
 * A cover already inside the cap is copied byte for byte rather than
 * re-encoded, so this never quietly degrades an image it did not need to touch.
 * What it does to the ones it *must* touch is `encoded` below.
 */
async function stageCover(from: string, to: string): Promise<void> {
  const size = await measureCover(from);

  // An unreadable file, or one already inside the cap, is copied untouched: a
  // cover the shelf cannot decode is a missing cover rather than a failed build,
  // and re-encoding an image that did not need it is a quiet quality loss.
  if (size === undefined || Math.max(size.width, size.height) <= MAX_COVER_EDGE) {
    await copyFile(from, to);
    return;
  }

  const resized = sharp(from).resize({
    width: MAX_COVER_EDGE,
    height: MAX_COVER_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  });

  await encoded(resized, (await sharp(from).metadata()).format).toFile(to);
}

/**
 * The encoder settings a shrunk cover is written under.
 *
 * These used to be sharp's defaults, which nobody chose: **quality 80 with
 * 4:2:0 chroma subsampling**. 4:2:0 keeps colour at half resolution on both
 * axes. That is imperceptible on a photograph, which is what the default is
 * tuned for, and plainly visible on what a book cover actually is — hard-edged
 * type over a large flat saturated field. White serif type on red fringed pink,
 * and the fringe was introduced *here*, between a clean provider file and the
 * shelf.
 *
 * Quality 90 rather than 80 because this is a **second** lossy generation: the
 * vault already holds the provider's JPEG, and re-encoding a JPEG compounds its
 * artifacts rather than merely adding to a clean source.
 *
 * ⚠️ **Applied per format, never unconditionally**, because `.jpeg()` sets
 * sharp's *output* format — it does not merely configure it. Calling it on a
 * PNG cover writes JPEG bytes to a `.png` filename, which every browser sniffs
 * and renders, so nothing downstream would ever report it. PNG needs nothing
 * from this: it is lossless and has no chroma channel to subsample.
 *
 * The cost is bytes on the wire and only that — about 44 KB per re-encoded
 * cover, 1.2 MB to 1.9 MB across the owner's 43. `TEXTURE_BUDGET_BYTES` is
 * measured in *decoded* pixels and cannot move: the dimensions are unchanged.
 */
function encoded(image: Sharp, format: string | undefined): Sharp {
  switch (format) {
    case 'jpeg':
      return image.jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true });
    case 'webp':
      // The other lossy format `looksLikeImage` admits. `smartSubsample` is
      // WebP's spelling of the same fix; its default is likewise 4:2:0.
      return image.webp({ quality: 90, smartSubsample: true });
    default:
      return image;
  }
}
