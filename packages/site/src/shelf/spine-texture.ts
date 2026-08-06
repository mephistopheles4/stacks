import * as THREE from 'three';

/**
 * The printed spine: title and author, set vertically, on the book's own colour.
 *
 * Drawn to a 2D canvas rather than pulled in with a text-geometry or SDF-text
 * library. A spine is a few hundred pixels of type at most, canvas rendering is
 * exact at that size, and it keeps the page free of another dependency.
 *
 * Text runs bottom-to-top, which is the British and most common European
 * convention and reads correctly when the book is on a shelf.
 */

/** Texture pixels across the spine's width. */
const SPINE_TEXTURE_WIDTH = 128;
const TEXTURE_HEIGHT = 1024;

/** Below this thickness a spine is too narrow for type to be legible. */
export const MIN_LEGIBLE_THICKNESS = 0.075;

/**
 * PROTOTYPE ONLY — ticket #68, carrying #58's bundled arithmetic.
 *
 * The canvas above is 128×1024 for *every* book whatever its thickness, and is
 * stretched onto a plane scaled `(thickness, height)` — so letterforms are
 * distorted 0.87×–1.97× across the shelf. #58 found that this, and not size, is
 * what `MIN_LEGIBLE_THICKNESS` was really guarding against. Sizing the canvas to
 * the book's own aspect retires the cutoff and gives the six thinnest books type.
 *
 * The clamp is #58's: 32 keeps a floor of pixels to set type in, 128 is today's
 * width and nothing needs more.
 */
export const SPINE_CANVAS_HEIGHT = TEXTURE_HEIGHT;
export const SPINE_CANVAS_WIDTH_TODAY = SPINE_TEXTURE_WIDTH;

export function spineCanvasWidth(thickness: number, height: number): number {
  return Math.min(128, Math.max(32, Math.round((TEXTURE_HEIGHT * thickness) / height)));
}

const FONT = '"Georgia", "Times New Roman", serif';

export interface SpineTextOptions {
  readonly title: string;
  readonly author?: string;
  readonly colour: string;
  /** Prototype: canvas pixels across. Absent is today's fixed 128. */
  readonly width?: number;
}

export function makeSpineTexture(options: SpineTextOptions): THREE.CanvasTexture | undefined {
  const TEXTURE_WIDTH = options.width ?? SPINE_TEXTURE_WIDTH;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  ctx.fillStyle = options.colour;
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  addCloth(ctx, options.colour, TEXTURE_WIDTH);

  const ink = contrastingInk(options.colour);

  // Rotate so type runs along the spine's length, reading bottom-to-top.
  ctx.save();
  ctx.translate(TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // The rotated canvas is TEXTURE_HEIGHT long and TEXTURE_WIDTH tall.
  const length = TEXTURE_HEIGHT;
  const padding = length * 0.08;
  const available = length - padding * 2;

  const titleSize = TEXTURE_WIDTH * 0.36;
  ctx.font = `600 ${titleSize}px ${FONT}`;
  ctx.fillStyle = ink;
  const title = truncate(ctx, options.title, available * 0.72);
  ctx.fillText(title, -length / 2 + padding, options.author === undefined ? 0 : -titleSize * 0.42);

  if (options.author !== undefined) {
    const authorSize = TEXTURE_WIDTH * 0.24;
    ctx.font = `400 ${authorSize}px ${FONT}`;
    ctx.fillStyle = fade(ink, 0.72);
    const author = truncate(ctx, lastName(options.author), available * 0.34);
    // Author sits at the foot of the spine, as it does in print.
    ctx.fillText(author, length / 2 - padding - ctx.measureText(author).width, titleSize * 0.55);
  }

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Two hairline rules near the ends, the way cloth bindings are usually blocked.
 *
 * Cheap, and it stops a spine reading as a flat rectangle of colour when the
 * title is short.
 */
function addCloth(ctx: CanvasRenderingContext2D, colour: string, TEXTURE_WIDTH: number): void {
  const ink = contrastingInk(colour);
  ctx.strokeStyle = fade(ink, 0.28);
  ctx.lineWidth = Math.max(1, TEXTURE_WIDTH * 0.018);
  for (const y of [TEXTURE_HEIGHT * 0.045, TEXTURE_HEIGHT * 0.955]) {
    ctx.beginPath();
    ctx.moveTo(TEXTURE_WIDTH * 0.18, y);
    ctx.lineTo(TEXTURE_WIDTH * 0.82, y);
    ctx.stroke();
  }
}

/** Light type on a dark board, dark type on a pale one. */
function contrastingInk(colour: string): string {
  const hex = colour.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if (!Number.isFinite(r + g + b)) return '#f5efe6';
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.58 ? '#241f1b' : '#f5efe6';
}

function fade(colour: string, alpha: number): string {
  const hex = colour.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Titles are long and spines are short; cut at a word where possible. */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  // Drop a subtitle first — "Staff Engineer" beats "Staff Engineer: Leaders…".
  const beforeColon = text.split(':')[0]?.trim();
  if (beforeColon !== undefined && beforeColon !== text && ctx.measureText(beforeColon).width <= maxWidth) {
    return beforeColon;
  }

  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/** One name on a spine. "Yegge, Steve, Gene Kim" is not a name. */
function lastName(author: string): string {
  const first = author.split(',')[0]?.trim() ?? author;
  const words = first.split(/\s+/);
  return words.length > 1 ? (words.at(-1) ?? first) : first;
}
