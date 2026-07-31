import sharp from 'sharp';
import type { LibraryBook } from './library.ts';

/**
 * The link-preview image: a flat 2D render of the shelf.
 *
 * Built as an SVG of coloured spines and rasterised by sharp, rather than by
 * screenshotting the 3D scene. A headless browser in the build path would be a
 * heavy dependency for one static image, and this way the OG image regenerates
 * from `library.json` alone — the same source the shelf reads.
 *
 * It carries no titles and no note text. It is the *shape* of a library:
 * how much, in what colours, over how many shelves.
 */

const WIDTH = 1200;
const HEIGHT = 630;

const PADDING = 56;
/** Never more shelves than this, however large the library. */
const ROWS_CAP = 4;
/** How far a small library's spines may be widened to fill a shelf. */
const MAX_STRETCH = 4;
const SHELF_THICKNESS = 9;

const BACKGROUND = '#1a1613';
const WOOD = '#6b4f3a';
const WOOD_DARK = '#4a3527';
const INK = '#f2e8dc';
const INK_DIM = '#a89684';

const MIN_SPINE = 9;
const MAX_SPINE = 26;
const PAGES_MIN = 120;
const PAGES_MAX = 800;

const FALLBACK = ['#6b4f6b', '#4a6b5a', '#2f6d7a', '#8a5a3b', '#5a5f8c', '#7a4550'];

export interface OgImageOptions {
  readonly title?: string;
  readonly subtitle?: string;
}

export async function renderOgImage(
  books: readonly LibraryBook[],
  options: OgImageOptions = {},
): Promise<Buffer> {
  return sharp(Buffer.from(buildSvg(books, options), 'utf8')).png().toBuffer();
}

function buildSvg(books: readonly LibraryBook[], options: OgImageOptions): string {
  const shelved = books.filter((book) => book.status !== 'wishlist');

  const caseTop = PADDING + 96;
  const caseHeight = HEIGHT - caseTop - PADDING;
  const innerWidth = WIDTH - PADDING * 2;
  const fillWidth = innerWidth * 0.9;

  /**
   * Books fill each shelf before starting the next, and the case always shows
   * its full height — a part-filled bookcase, which is what a growing library
   * actually looks like.
   *
   * Rows are stretched to fill the width and centred, capped so a very small
   * library gets chunky spines rather than absurd ones. Four shelves with two
   * books on each reads as an empty room, not as a library.
   */
  const averageSpine = (MIN_SPINE + MAX_SPINE) / 2 + 2;
  const capacity = Math.max(1, Math.floor(fillWidth / averageSpine));
  const rowsUsed = Math.min(ROWS_CAP, Math.max(1, Math.ceil(shelved.length / capacity)));
  const perRow = Math.ceil(shelved.length / rowsUsed);
  const rowHeight = caseHeight / ROWS_CAP;

  const parts: string[] = [];
  parts.push(`<rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>`);
  parts.push(
    `<rect x="${PADDING}" y="${caseTop}" width="${innerWidth}" height="${caseHeight}" fill="${WOOD_DARK}" rx="6"/>`,
  );

  for (let row = 0; row < ROWS_CAP; row += 1) {
    const shelfY = caseTop + (row + 1) * rowHeight - SHELF_THICKNESS;
    parts.push(
      `<rect x="${PADDING}" y="${shelfY}" width="${innerWidth}" height="${SHELF_THICKNESS}" fill="${WOOD}"/>`,
    );

    const slice = shelved.slice(row * perRow, (row + 1) * perRow);
    if (slice.length === 0) continue;

    const natural = slice.reduce((total, book) => total + spineWidth(book.pages) + 2, 0);
    const scale = Math.min(MAX_STRETCH, Math.max(1, fillWidth / natural));
    const drawn = natural * scale;
    let cursor = PADDING + (innerWidth - drawn) / 2;

    for (const book of slice) {
      const width = spineWidth(book.pages) * scale;
      const height = rowHeight * (0.62 + unit(book.id) * 0.2);
      parts.push(
        `<rect x="${cursor.toFixed(1)}" y="${(shelfY - height).toFixed(1)}" width="${width.toFixed(1)}" ` +
          `height="${height.toFixed(1)}" fill="${escapeAttr(colourOf(book))}" rx="1.5"/>`,
      );
      cursor += width + 2 * scale;
    }
  }

  const title = escapeText(options.title ?? 'Stacks');
  const subtitle = escapeText(options.subtitle ?? `${shelved.length} books`);

  parts.push(
    `<text x="${PADDING}" y="${PADDING + 46}" fill="${INK}" font-size="46" font-weight="600" ` +
      `font-family="Segoe UI, Helvetica, Arial, sans-serif">${title}</text>`,
  );
  parts.push(
    `<text x="${PADDING}" y="${PADDING + 80}" fill="${INK_DIM}" font-size="22" ` +
      `font-family="Segoe UI, Helvetica, Arial, sans-serif">${subtitle}</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${parts.join('')}</svg>`;
}

function spineWidth(pages: number | undefined): number {
  if (pages === undefined) return (MIN_SPINE + MAX_SPINE) / 2;
  const t = Math.min(Math.max((pages - PAGES_MIN) / (PAGES_MAX - PAGES_MIN), 0), 1);
  return MIN_SPINE + t * (MAX_SPINE - MIN_SPINE);
}

/** Only ever a hex colour reaches the SVG — never an arbitrary vault string. */
function colourOf(book: LibraryBook): string {
  const colour = book.spineColor;
  if (colour !== undefined && /^#[0-9a-fA-F]{6}$/.test(colour)) return colour;
  return FALLBACK[Math.floor(unit(book.id) * FALLBACK.length)] ?? FALLBACK[0] ?? '#6b4f6b';
}

function unit(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 8) / 0x1000000;
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}
