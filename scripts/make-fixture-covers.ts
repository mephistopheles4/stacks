/**
 * Generates the fixture cover images.
 *
 * Zero dependencies on purpose (CLAUDE.md: prefer zero-dep solutions for small
 * utilities) — a minimal truecolour PNG encoder over node:zlib is ~40 lines and
 * saves pulling an image library into the toolchain at phase 0.
 *
 * The covers are two-tone rather than flat: a base field plus a narrow accent
 * band. A flat fill would make Phase 1's dominant-colour test meaningless,
 * because "picked the dominant colour" and "picked any pixel at all" would give
 * the same answer. With a band covering ~16% of the image, the base colour is
 * unambiguously dominant and the test asserts something real.
 *
 * Run: pnpm tsx scripts/make-fixture-covers.ts
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/repo-root.ts';

const WIDTH = 200;
const HEIGHT = 300;
const BAND_TOP = 0.62;
const BAND_BOTTOM = 0.78;

interface CoverSpec {
  readonly file: string;
  /** Expected dominant colour — Phase 1's extractor must land on this. */
  readonly base: string;
  readonly accent: string;
  /**
   * Wraps the cover in a white margin covering ~44% of the image, so white is
   * the single commonest colour by a wide margin.
   *
   * This reproduces a real defect: the first `stacks add` against a real cover
   * returned `spine_color: "#fefffe"`, because real covers are printed on and
   * photographed against white. Without this fixture the bug is invisible —
   * every other cover here is edge-to-edge colour.
   */
  readonly whiteBorder?: boolean;
  /**
   * Renders at the size of a real cover rather than a thumbnail.
   *
   * Real covers from Open Library and from EPUBs are ~1600px wide. Every
   * fixture cover being 200px wide meant an unconstrained `<img>` still fitted
   * inside the detail card, so the render gate passed a layout that overflowed
   * the whole viewport on real data. At least one fixture has to be the size
   * the real thing is.
   */
  readonly fullSize?: boolean;
  /**
   * Renders at a size between the shelf cap and the held cap: over 512px, so a
   * held copy is staged, and inside 1200px, so it is staged at native size.
   *
   * That is the size a build was once allowed to copy byte for byte, and the
   * spec replaced the rule because a byte copy carries camera metadata along
   * (`docs/spec/picking-a-book-up.md` §3.3). A cover at this size with
   * `cameraMetadata` is the one case that tells a re-encode from a copy.
   */
  readonly heldSize?: boolean;
  /**
   * Plants EXIF and XMP chunks, the way a cover the owner photographed carries
   * them.
   *
   * Invented values, nothing from a real camera. The held tier must ship none
   * of it, and `gate:public` needs a source that has some, or "no held file
   * carries EXIF or XMP" passes by construction.
   */
  readonly cameraMetadata?: boolean;
}

const FULL_WIDTH = 1400;
const FULL_HEIGHT = 2100;
const HELD_WIDTH = 800;
const HELD_HEIGHT = 1200;

const COVERS: readonly CoverSpec[] = [
  { file: 'the-tidal-engine.png', base: '#2f6d7a', accent: '#e0c8a0', fullSize: true },
  { file: 'compilers-for-the-impatient.png', base: '#8a3b2e', accent: '#f0d8b8' },
  {
    file: 'signal-and-sediment.png',
    base: '#4a6b5a',
    accent: '#d8e0c8',
    heldSize: true,
    cameraMetadata: true,
  },
  { file: 'nine-ways-of-seeing-a-warehouse.png', base: '#6a5a8c', accent: '#e8dcf0' },
  { file: 'the-salt-road-ledger.png', base: '#b08442', accent: '#2a2018' },
  { file: 'the-salt-road-ledger-audio.png', base: '#3a4a6b', accent: '#c8d4e8' },
  { file: 'white-bordered.png', base: '#7a3f5d', accent: '#f4e4d0', whiteBorder: true },
  // A cover that really is all paper. Setting the extremes aside must not turn
  // this one into "no colour at all".
  { file: 'all-white.png', base: '#ffffff', accent: '#ffffff' },
  // Large enough for a held copy, on the private book and the wishlist book.
  // Neither may ship one, and that assertion needs a cover that would.
  { file: 'a-book-kept-back.png', base: '#5c4b3a', accent: '#e8d8c0', fullSize: true },
  { file: 'the-quiet-protocol.png', base: '#34495e', accent: '#d0dce8', fullSize: true },
];

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * An `eXIf` chunk: a big-endian TIFF header and one IFD holding one ASCII tag,
 * ImageDescription (0x010E). The smallest EXIF block a reader recognises.
 */
function exifChunk(): Buffer {
  const text = Buffer.from('Invented fixture camera metadata\0', 'ascii');
  const ifd = Buffer.alloc(2 + 12 + 4);
  ifd.writeUInt16BE(1, 0); // one entry
  ifd.writeUInt16BE(0x010e, 2); // ImageDescription
  ifd.writeUInt16BE(2, 4); // ASCII
  ifd.writeUInt32BE(text.length, 6);
  ifd.writeUInt32BE(8 + ifd.length, 10); // the text follows the IFD
  ifd.writeUInt32BE(0, 14); // no next IFD
  const header = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
  return chunk('eXIf', Buffer.concat([header, ifd, text]));
}

/** An `iTXt` chunk under the keyword XMP readers look for, uncompressed. */
function xmpChunk(): Buffer {
  const packet =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ' +
    'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'dc:creator="Invented Fixture Photographer"/></rdf:RDF></x:xmpmeta>';
  return chunk(
    'iTXt',
    Buffer.concat([
      Buffer.from('XML:com.adobe.xmp\0', 'latin1'),
      Buffer.from([0, 0]), // uncompressed
      Buffer.from('\0\0', 'latin1'), // no language tag, no translated keyword
      Buffer.from(packet, 'utf8'),
    ]),
  );
}

function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Rgb,
  metadata = false,
): Buffer {
  // One filter byte (0 = none) per scanline, then RGB triples.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(metadata ? [exifChunk(), xmpChunk()] : []),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Mirrors the real vault layout: notes in Library/, covers cached in Library/covers/,
// so a note's `cover:` value stays relative to the note itself.
const outDir = join(REPO_ROOT, 'fixtures', 'vault', 'Library', 'covers');
mkdirSync(outDir, { recursive: true });

const WHITE: Rgb = [255, 255, 255];
const MARGIN_X = Math.round(WIDTH * 0.25);
const MARGIN_Y = Math.round(HEIGHT * 0.25);

for (const cover of COVERS) {
  const base = hexToRgb(cover.base);
  const accent = hexToRgb(cover.accent);

  const full = cover.fullSize === true;
  const held = cover.heldSize === true;
  const w = full ? FULL_WIDTH : held ? HELD_WIDTH : WIDTH;
  const h = full ? FULL_HEIGHT : held ? HELD_HEIGHT : HEIGHT;
  const top = Math.round(h * BAND_TOP);
  const bottom = Math.round(h * BAND_BOTTOM);
  const marginX = full ? Math.round(w * 0.25) : MARGIN_X;
  const marginY = full ? Math.round(h * 0.25) : MARGIN_Y;

  const png = encodePng(
    w,
    h,
    (x, y) => {
      if (cover.whiteBorder === true) {
        const inside = x >= marginX && x < w - marginX && y >= marginY && y < h - marginY;
        if (!inside) return WHITE;
      }
      return y >= top && y < bottom ? accent : base;
    },
    cover.cameraMetadata === true,
  );

  writeFileSync(join(outDir, cover.file), png);
  const notes = [
    cover.whiteBorder === true ? 'white border' : undefined,
    full || held ? `${w}x${h}` : undefined,
    cover.cameraMetadata === true ? 'EXIF + XMP' : undefined,
  ].filter(Boolean);
  console.log(
    `${cover.file}  base ${cover.base}  accent ${cover.accent}` +
      (notes.length > 0 ? `  (${notes.join(', ')})` : ''),
  );
}

console.log(`\n${COVERS.length} covers written to ${outDir}`);
