/**
 * The sentence the page shows when there is no shelf to show — and the canvas
 * it stands in for, hidden while it is up.
 *
 * A 3D page that fails renders as nothing at all: no error, no broken image, no
 * clue that anything was ever meant to be there. The notice replaces that with a
 * sentence, because a visitor who knows the shelf is missing can reload, and a
 * visitor looking at a black rectangle cannot tell it apart from the design.
 *
 * ## The notice replaces the canvas; it never sits over it
 *
 * Every notice `boot.ts` shows means the canvas behind it has no live context:
 * lost and waiting for a restore, lost for good, never given one, or stopped
 * by a shader that would not link. So a notice hides the canvas, and clearing
 * it shows the canvas again. One rule, in the two functions every caller goes
 * through, rather than a hide beside each notice that one caller forgets.
 *
 * ⚠️ **Chrome paints a lost canvas it will not restore opaque white**, with a
 * small sad-face icon. On the Pixel 10 Pro XL a real loss ended exactly there
 * in every run: the new canvas refused, the old one kept so the sentence had
 * somewhere to go, and that canvas filling the page in white — mean brightness
 * 235 of 255, the wordmark nearly gone. Hidden, the page shows its own
 * background and the sentence reads the way it was written to.
 *
 * `visibility`, and not the `hidden` attribute or `display`. `Shelf.astro`'s
 * `canvas { display: block }` is an author rule, and it beats the user agent's
 * `[hidden] { display: none }`, so the attribute would hide nothing. And
 * `visibility` keeps the element's box: the notice is positioned against the
 * shelf rather than the canvas either way, but nothing that measures the
 * canvas — its `ResizeObserver`, `projectBook` — reads a zero while it is
 * hidden. A hidden element is not hit-tested either, so a dead canvas takes no
 * drag.
 *
 * DOM through the canvas's own `ownerDocument` rather than the global, so a
 * spec can hand in a fake with no DOM shim. See `shelf-notice.test.ts`.
 */

/** The class `Shelf.astro` styles, through `:global`, since this builds the element. */
export const NOTICE_CLASS = 'shelf-notice';

/** Puts `message` up in place of the shelf, replacing any notice already there. */
export function showNotice(canvas: HTMLCanvasElement, message: string): void {
  const host = canvas.parentElement;
  if (host === null) return;

  clearNotice(canvas);

  const notice = canvas.ownerDocument.createElement('p');
  notice.className = NOTICE_CLASS;
  // textContent, not innerHTML — same rule as the card, and these strings are
  // fixed anyway.
  notice.textContent = message;
  notice.setAttribute('role', 'status');
  host.append(notice);
  canvas.style.visibility = 'hidden';
}

/** Takes the notice down, if there is one, and shows the canvas again. */
export function clearNotice(canvas: HTMLCanvasElement): void {
  canvas.parentElement?.querySelector(`.${NOTICE_CLASS}`)?.remove();
  // Removes the inline value rather than writing `visible`, so the stylesheet
  // decides again. A shallow clone of a hidden canvas carries this style with
  // it, and this is what shows the fallback's new canvas once it is drawn.
  canvas.style.removeProperty('visibility');
}
