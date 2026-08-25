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
  const across = spineCanvasWidth(options.thickness, options.height);
  const canvas = document.createElement('canvas');
  canvas.width = across;
  canvas.height = TEXTURE_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  ctx.fillStyle = options.colour;
  ctx.fillRect(0, 0, across, TEXTURE_HEIGHT);

  addCloth(ctx, options.colour, across);

  const ink = contrastingInk(options.colour);

  // Rotate so type runs along the spine's length, reading bottom-to-top.
  ctx.save();
  ctx.translate(across / 2, TEXTURE_HEIGHT / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // The rotated canvas is TEXTURE_HEIGHT long and `across` tall.
  const length = TEXTURE_HEIGHT;
  const padding = length * 0.08;
  const available = length - padding * 2;

  const { main, hasSubtitle } = splitTitle(options.title);
  const band = bandFor(main);

  const titleSize = across * band.size;
  const tracking = titleSize * band.tracking;
  ctx.font = `${String(band.weight)} ${titleSize}px ${FONT}`;
  ctx.fillStyle = ink;

  const text = band.caps ? main.toUpperCase() : main;
  const budget = available * 0.72;
  const lines =
    band.lines === 2 ? wrap(ctx, text, budget, tracking) : [fit(ctx, text, budget, tracking)];

  const left = -length / 2 + padding;
  // Two lines run *across* the spine, so the block is centred on the width and
  // each line is offset from there — the same axis the author already sits on.
  const leading = titleSize * 1.02;
  const top = -((lines.length - 1) * leading) / 2;
  lines.forEach((line, index) => {
    draw(ctx, line, left, top + index * leading, tracking);
  });

  /**
   * Where the title block ends, so the author and the rule know where to go.
   *
   * The *widest* line, not the last: a wrapped title is a block, and hanging a
   * rule off a short second line would leave it floating under the first.
   */
  const titleEnd = left + Math.max(...lines.map((line) => width(ctx, line, tracking)));

  if (options.author !== undefined) {
    const authorSize = across * 0.24;
    ctx.font = `400 ${authorSize}px ${FONT}`;
    ctx.fillStyle = fade(ink, 0.72);
    const author = fit(ctx, lastName(options.author), available * 0.34, 0);
    const authorWidth = width(ctx, author, 0);

    /**
     * The subtitle is the layout lever, and it is free — same canvas, different
     * drawing.
     *
     * A book with a subtitle (23 of the owner's 33) sets its author at the foot
     * of the spine with a hairline rule between, which is what a spine carrying
     * two levels of title does to keep them apart. A book without one sets its
     * author **directly beneath the title**, because there is nothing to separate
     * and pushing it to the foot would open a gap describing nothing.
     */
    if (hasSubtitle) {
      const at = length / 2 - padding - authorWidth;
      ctx.fillText(author, at, titleSize * 0.55);

      // Midway between the two, and only where there is room for it to read as a
      // rule rather than as a smudge.
      const gap = at - titleEnd;
      if (gap > titleSize) {
        const middle = titleEnd + gap / 2;
        ctx.strokeStyle = fade(ink, 0.45);
        ctx.lineWidth = Math.max(1, across * 0.02);
        ctx.beginPath();
        ctx.moveTo(middle, -across * 0.22);
        ctx.lineTo(middle, across * 0.22);
        ctx.stroke();
      }
    } else {
      // Just after the title, but never past the foot.
      const at = Math.min(titleEnd + titleSize * 0.9, length / 2 - padding - authorWidth);
      ctx.fillText(author, at, titleSize * 0.55);
    }
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
function addCloth(ctx: CanvasRenderingContext2D, colour: string, across: number): void {
  const ink = contrastingInk(colour);
  ctx.strokeStyle = fade(ink, 0.28);
  ctx.lineWidth = Math.max(1, across * 0.018);
  for (const y of [TEXTURE_HEIGHT * 0.045, TEXTURE_HEIGHT * 0.955]) {
    ctx.beginPath();
    ctx.moveTo(across * 0.18, y);
    ctx.lineTo(across * 0.82, y);
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

/**
 * The main title, and whether there is a subtitle under it.
 *
 * The main title is the text before the first colon, which the old `truncate`
 * already isolated as its first fallback — it is promoted here from a
 * last-resort trim to the thing every decision is made from. Both halves are
 * levers: the subtitle cuts the owner's shelf 23/10 and the length bands below
 * cut it roughly 5/15/13, so together they are real variety rather than one rule
 * firing twice.
 */
export function splitTitle(title: string): { main: string; hasSubtitle: boolean } {
  const colon = title.indexOf(':');
  if (colon === -1) return { main: title.trim(), hasSubtitle: false };

  const main = title.slice(0, colon).trim();
  const rest = title.slice(colon + 1).trim();
  // A colon with nothing after it is punctuation, not a subtitle.
  if (main.length === 0 || rest.length === 0) return { main: title.trim(), hasSubtitle: false };
  return { main, hasSubtitle: true };
}

/**
 * How a title is set, chosen from how long it is.
 *
 * **Spines differ, and the title text is what makes them differ** — not the cover
 * artwork. Same typeface, same single ink colour; weight, case and layout move
 * per book. #60 rejected lifting the cover's palette, classifying its typeface,
 * OCR, image statistics, and a per-book hash. Deriving from the title is the only
 * option whose variety tracks something real about the book, which is what
 * separates a house style with range from a bad pastiche of variety.
 *
 * ⚠️ **Case is chosen, never detected.** #60 proposed "words that arrive already
 * capitalised stay capitalised" and then measured all 33 titles: **zero arrive
 * all-caps**, 23 of 33 are title case. So there is nothing to detect, and length
 * is the only honest thing to choose from.
 */
interface TitleBand {
  /** Type size as a fraction of the canvas width. */
  readonly size: number;
  readonly weight: number;
  readonly caps: boolean;
  /** Letterspacing as a fraction of the type size. */
  readonly tracking: number;
  readonly lines: 1 | 2;
}

export function bandFor(main: string): TitleBand {
  // Short: the one title that can afford the room, and caps is what a real spine
  // does with it.
  if (main.length <= 12) return { size: 0.42, weight: 700, caps: true, tracking: 0.14, lines: 1 };
  // Medium: roughly what every book used to get.
  if (main.length <= 28) return { size: 0.36, weight: 600, caps: false, tracking: 0, lines: 1 };
  // Long: smaller and lighter, and **wrapped rather than cut**. A real spine sets
  // a 56-character title in two lines; this used to end it in an ellipsis.
  return { size: 0.26, weight: 400, caps: false, tracking: 0, lines: 2 };
}

/**
 * Letterspacing done by hand, because `ctx.letterSpacing` is not everywhere.
 *
 * It is Chrome-and-recent-Safari only, and a spine that silently lost its
 * tracking on one browser would be a different house style there with nothing
 * saying so. Three functions rather than one so measuring and drawing cannot
 * disagree about what a tracked string is.
 */
function width(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  if (tracking === 0) return ctx.measureText(text).width;
  // Trailing tracking is space after the last glyph and is not part of the ink.
  return ctx.measureText(text).width + tracking * Math.max(0, text.length - 1);
}

function draw(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  if (tracking === 0) {
    ctx.fillText(text, x, y);
    return;
  }
  let at = x;
  for (const character of text) {
    ctx.fillText(character, at, y);
    at += ctx.measureText(character).width + tracking;
  }
}

/** Titles are long and spines are short; cut at a character with an ellipsis. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  tracking: number,
): string {
  if (width(ctx, text, tracking) <= maxWidth) return text;

  let cut = text;
  while (cut.length > 1 && width(ctx, `${cut}…`, tracking) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/**
 * A long title over two lines, broken at a word.
 *
 * Greedy, and the second line is the one that takes an ellipsis if even two are
 * not enough — a title long enough to need three lines would be a paragraph on a
 * spine.
 */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  tracking: number,
): string[] {
  if (width(ctx, text, tracking) <= maxWidth) return [text];

  const words = text.split(/\s+/);
  let first = '';
  let index = 0;
  while (index < words.length) {
    const candidate = first === '' ? (words[index] ?? '') : `${first} ${words[index] ?? ''}`;
    if (first !== '' && width(ctx, candidate, tracking) > maxWidth) break;
    first = candidate;
    index += 1;
  }

  const rest = words.slice(index).join(' ');
  if (rest.length === 0) return [fit(ctx, first, maxWidth, tracking)];
  return [first, fit(ctx, rest, maxWidth, tracking)];
}

/** One name on a spine. "Yegge, Steve, Gene Kim" is not a name. */
function lastName(author: string): string {
  const first = author.split(',')[0]?.trim() ?? author;
  const words = first.split(/\s+/);
  return words.length > 1 ? (words.at(-1) ?? first) : first;
}
