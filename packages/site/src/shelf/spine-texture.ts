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

/** Texture pixels along the spine's length. The width is the book's own. */
const TEXTURE_HEIGHT = 1024;

/**
 * Canvas pixels across the spine, from the book's own proportions.
 *
 * **This is what retires `MIN_LEGIBLE_THICKNESS`, and the cutoff was never about
 * size.** The canvas was 128×1024 for *every* book whatever its thickness, and it
 * is stretched onto a plane scaled `(thickness, height)` — so letterforms were
 * distorted **0.87×–1.97×** across the shelf. Nothing about that canvas knew the
 * book. A rule reading "below 0.075 a spine is too narrow for type to be legible"
 * was really a distortion rule wearing a legibility rule's words: at
 * `minDistance` even the thinnest spine is 45 px wide (~16 px cap height), and at
 * the full-shelf framing *no* spine's type is readable, thin or thick (#58,
 * confirmed on a render in #68).
 *
 * So the six thinnest books get type, 41 typed books become 49, and no letterform
 * is stretched.
 *
 * ## ⚠️ The clamp is #58's, and the ceiling does not reach the outcome it was
 * sold on
 *
 * 32 keeps a floor of pixels to set type in — below it there is not enough canvas
 * to put a letterform on. That end is sound.
 *
 * `SPINE_CANVAS_MAX` is #58's *"128 is today's width and nothing needs more"*,
 * which is a claim about how many pixels type needs and not about aspect — and
 * aspect is what this function is for. A book wants `1024 × thickness / height`
 * texels, and on the owner's library that is **111 to 252**: every book past 128
 * saturates and keeps exactly the distortion it had.
 *
 * Measured both ways, and the honest summary is that this fixes the squeeze and
 * not the stretch:
 *
 * | | fixed 128 | clamped 32..128 |
 * | --- | --- | --- |
 * | the owner's 27 typed books | 0.87×–1.97× | **1.00×–1.97×** |
 * | the 50-book fixture | 0.46×–1.64× | **1.00×–1.64×** |
 *
 * Every book that was squeezed is now exact, and the worst-stretched book is
 * untouched. Raising the ceiling to 256 would cover the real library's 0.246 top
 * aspect and make the whole range exact, at up to double the canvas on the
 * thickest books — which are also the ones with the most spine on screen. That is
 * an owner's call about bytes against letterforms, so it is one named constant
 * and this note, rather than a number changed on the way past.
 */
const SPINE_CANVAS_MIN = 32;
const SPINE_CANVAS_MAX = 128;

export function spineCanvasWidth(thickness: number, height: number): number {
  const wanted = Math.round((TEXTURE_HEIGHT * thickness) / height);
  return Math.min(SPINE_CANVAS_MAX, Math.max(SPINE_CANVAS_MIN, wanted));
}

const FONT = '"Georgia", "Times New Roman", serif';

export interface SpineTextOptions {
  readonly title: string;
  readonly author?: string;
  readonly colour: string;
  /** The book's own, so the canvas can carry its aspect. World units, both. */
  readonly thickness: number;
  readonly height: number;
}

export function makeSpineTexture(options: SpineTextOptions): THREE.CanvasTexture | undefined {
  const TEXTURE_WIDTH = spineCanvasWidth(options.thickness, options.height);
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
