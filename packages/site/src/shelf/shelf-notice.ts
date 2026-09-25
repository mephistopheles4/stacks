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

import type { Notice } from './context-recovery.ts';
import type { FallbackState } from './shadow-fallback.ts';

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

/**
 * What the live shelf leaves on screen once it has been mounted, or resumed.
 *
 * A shelf that draws takes the notice down and shows its canvas. A shelf that
 * **halted** on a program that would not link never draws again (`halted` in
 * `scene.ts`), so clearing for it would remove the one sentence that says why
 * and show a frozen canvas — it gets `SHADER_MESSAGE` instead, whatever was up.
 * No shelf at all leaves whatever is up alone.
 *
 * ⚠️ **Every place `boot.ts` used to clear goes through here**: a panel rebuild
 * adopted, a fallback's redraw settled, a restore resumed in place. Each of them
 * can meet a halted shelf — the new shelf's first frame is drawn inside
 * `mountShelf`, so its link failure has already put the sentence up by the time
 * the caller clears — and each of them used to clear regardless.
 *
 * Halted is read off `shaderErrors`, which is empty exactly while the shelf
 * runs (`ShelfHandle.shaderErrors`), so there is no second flag to fall out of
 * step with it.
 */
export function settleNotice(
  canvas: HTMLCanvasElement,
  shelf: { readonly shaderErrors: readonly string[] } | undefined,
): void {
  if (shelf === undefined) return;
  if (shelf.shaderErrors.length > 0) showNotice(canvas, SHADER_MESSAGE);
  else clearNotice(canvas);
}

/* -------------------------------------------------------------------------- */

/**
 * Saying so, rather than showing an empty room.
 *
 * The sentences, one per way the shelf can fail to be there. Each is shown by
 * `showNotice`, which hides the canvas while it is up — every one of these means
 * that canvas has no live context, or holds a shelf that will never draw again.
 *
 * Here rather than in `boot.ts`, which wires them up, so a spec can read which
 * sentence a state gets: `boot.ts` is reached only through the browser.
 */

// Says what happened, not why. `webglcontextlost` carries no reason, and the
// first wording asserted one — "ran out of graphics memory" — that the evidence
// then contradicted: the page survived the loss and exited cleanly, so nothing
// was killed for running out of anything it could name.
export const LOST_MESSAGE = 'The browser reset the shelf’s 3D canvas. Reload to bring it back.';

// Says what happened and where to look, because the whole point of stopping is
// that somebody reads the panel. Without `?debug` there is no panel, so the
// sentence has to be able to stand alone.
export const SHADER_MESSAGE =
  'This device would not compile the shelf’s shaders, so drawing has stopped. Reload with ?debug to see what the driver said.';

// Only for a context the browser refused (`ContextRefused`): the one way a
// mount fails that a reload can fix.
export const UNAVAILABLE_MESSAGE =
  "This browser wouldn't give the page a 3D canvas, so the shelf can't be drawn. Reloading usually fixes it.";

// Anything else that throws out of `mountShelf` is the site's own code — the
// woodwork join refusing, the cover atlas refusing past 1,800 face-out covers —
// and no reload fixes it, so the sentence does not send anyone to try.
export const BROKEN_MESSAGE =
  'The shelf couldn’t be built because of a fault in this site, not in your browser. The console says what failed.';

/**
 * The browser would not hand `mountShelf` a WebGL context.
 *
 * Thrown around `new THREE.WebGLRenderer` and nowhere else (`openRenderer` in
 * `scene.ts`), so a refusal can be told from a throw in the site's own code.
 * Here rather than in `scene.ts` so the page's choice of sentence has a spec
 * that does not load `three`. `cause` is three's own error.
 */
export class ContextRefused extends Error {
  constructor(cause: unknown) {
    super('The browser would not give the shelf a WebGL context.', { cause });
    this.name = 'ContextRefused';
  }
}

/**
 * The sentence for a mount that threw, after saying on the console what threw.
 *
 * ⚠️ **A refusal is not logged again**: three logs its own line before it
 * throws, and G60's `refused` case allows that line and no other. Every other
 * throw is logged here with the original error, stack and all, because the
 * page's `catch` used to swallow it whole — the woodwork join's message, written
 * to be loud, reached nobody, and `pnpm smoke:render` said *"Page errors:
 * (none captured)"*.
 */
export function mountFailed(
  error: unknown,
  log: (...data: unknown[]) => void = console.error,
): string {
  if (error instanceof ContextRefused) return UNAVAILABLE_MESSAGE;
  log('The shelf could not be built:', error);
  return BROKEN_MESSAGE;
}

// The fallback's. They say what the page is doing about it, and still not why:
// nothing the page can observe names a cause. `LOST_MESSAGE` stays for a loss
// the fallback does not own, and for a second loss after it.
const REDRAWING_MESSAGE =
  'The browser reset the shelf’s 3D canvas. Redrawing it with painted shadows…';

// A failure notice is what happened, then what a reload does. What happened
// depends on how the fallback began: a link failure lost nothing, so "the
// browser reset the shelf’s 3D canvas" would be false there.
const LOST_AND_REFUSED = 'The browser reset the shelf’s 3D canvas and would not give it another.';
const UNLINKED_AND_REFUSED =
  'This device would not compile the shelf’s shaders, and the painted redraw failed too.';

const RELOAD = 'Reload to bring it back.';

// Only when the record was written: a promise about the next load that storage
// refusing would make false.
const RELOAD_PAINTED = 'Reload to bring it back — it will come back with painted shadows.';

// The record was written, and the address beats it: `?shadows=1` is folded on
// top of the base the record chose (ADR-0091 item 3), so the promise above would
// be false for exactly the tester re-running the reproduction.
const RELOAD_WITHOUT_PROBE = 'Reload without ?shadows=1 to bring it back with painted shadows.';

/**
 * The sentence for one of the fallback's notices. `clear` is not a sentence.
 *
 * `addressAsksForShadows` is whether the address a reload would load carries
 * `?shadows=1` — read when the sentence is shown, since the panel rewrites it.
 */
export function noticeFor(
  notice: Exclude<Notice, 'clear'>,
  state: FallbackState,
  addressAsksForShadows = false,
): string {
  switch (notice) {
    case 'lost':
      return LOST_MESSAGE;
    case 'redrawing':
      return REDRAWING_MESSAGE;
    case 'failed': {
      const happened =
        'via' in state && state.via === 'link-failed' ? UNLINKED_AND_REFUSED : LOST_AND_REFUSED;
      return `${happened} ${reloadSentence(state, addressAsksForShadows)}`;
    }
  }
}

function reloadSentence(state: FallbackState, addressAsksForShadows: boolean): string {
  if (!('remembered' in state) || state.remembered !== 'yes') return RELOAD;
  return addressAsksForShadows ? RELOAD_WITHOUT_PROBE : RELOAD_PAINTED;
}
