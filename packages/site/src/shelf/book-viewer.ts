/**
 * Examining the held book — a modal `<dialog>` over the shelf (#418, ADR-0109,
 * spec `picking-a-book-up.md` §3.4).
 *
 * The control on the held book's page closes the book in your hand and lets you
 * turn it, drawn on the shelf's own canvas beneath. The dialog is the shell and
 * carries no picture: a transparent surface that swallows pointer and keys.
 *
 * **A native `<dialog>` opened with `showModal`, as ADR-0052 chose**, because
 * the platform's element brings what a hand-rolled one gets wrong: focus moves
 * in, the rest of the page goes inert, Escape closes it, and Android's back
 * gesture closes it too (Chrome routes close requests to a modal dialog; the
 * opening click is the user activation it needs). What changed is only what it
 * shows: the flat `<img>` and its 512px ceiling are gone, because the book is
 * the thing being looked at and it is already in the scene.
 *
 * **Every way out is the dialog's own `close` event** — Escape, "Back to the
 * page", a tap, Android back — so there is one place that leaves, and it asks
 * the pickup to (`intents.leave`). The pickup closing it itself, on a put-back
 * or a lost context, goes through `close()`, which is not heard as an exit.
 *
 * The turning rules are `book-turn.ts`; this reads the pointer and the keys and
 * hands each result to the pickup, which owns the turn.
 */
import { dragTurn, isTurnKey, keyTurn, press, type Press, type Turn } from './book-turn.ts';

/** The markup this drives, owned by the template and looked up in `start.ts`. */
export interface BookViewerElements {
  readonly dialog: HTMLDialogElement;
  /** "Back to the page": a surface you can only leave by a convention traps some people. */
  readonly close: HTMLButtonElement;
}

/** What the view asks of the pickup, bound once by `createPickup`. */
export interface ExamineIntents {
  /** The page's control was activated. */
  examine(): void;
  /** The view was left by any way out: Escape, the button, a tap, Android back. */
  leave(): void;
  /** Turn the book: the pickup applies this to the turn it holds, if it is examining. */
  turn(update: (turn: Turn) => Turn): void;
}

export interface BookViewer {
  /**
   * Whether the view is up.
   *
   * Read by the page's Escape handler, which puts the held book back. Both
   * listen on the document, so without this one Escape would leave the view
   * and put the book down in the same keystroke — the user having asked to
   * leave one surface and been returned two levels.
   */
  isOpen(): boolean;
  /** Opens the view, named for the book, as `aria-label`. */
  open(name: string): void;
  /** Closes it without asking the pickup to leave: the pickup is already doing so. */
  close(): void;
  bind(intents: ExamineIntents): void;
  teardown(): void;
}

/** The class `held-page.ts` puts on the control that opens this view. */
export const EXAMINE_BUTTON_CLASS = 'held-examine';

export function mountBookViewer(
  elements: BookViewerElements,
  /**
   * The layer the held book's pages live in, listened to by **delegation**.
   *
   * Each pickup builds its pages anew, so the control is a different element
   * for every book. A listener bound to it would survive exactly one book.
   */
  body: HTMLElement,
): BookViewer {
  const { dialog, close } = elements;
  let intents: ExamineIntents | undefined;
  /** `close` events yet to arrive that the pickup itself asked for. */
  let quiet = 0;

  const onBodyClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`.${EXAMINE_BUTTON_CLASS}`) === null) return;
    intents?.examine();
  };

  const onClosed = (): void => {
    if (quiet > 0) {
      quiet -= 1;
      return;
    }
    intents?.leave();
  };

  // ---- the pointer: a drag turns, a tap leaves ---------------------------------
  let current: { readonly id: number; readonly press: Press } | undefined;
  let last = { x: 0, y: 0 };

  const onPointerDown = (event: PointerEvent): void => {
    if (current !== undefined) return;
    current = { id: event.pointerId, press: press(event.clientX, event.clientY) };
    last = { x: event.clientX, y: event.clientY };
    try {
      dialog.setPointerCapture(event.pointerId);
    } catch {
      // A pointer already gone: the drag simply goes uncaptured.
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (current?.id !== event.pointerId) return;
    current.press.move(event.clientX, event.clientY);
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last = { x: event.clientX, y: event.clientY };
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    intents?.turn((turn) => dragTurn(turn, dx, dy, shortSide));
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (current?.id !== event.pointerId) return;
    const { press: finished } = current;
    current = undefined;
    // The close button leaves by its own click; a tap on it is not a second exit.
    const onButton = event.target instanceof Node && close.contains(event.target);
    if (finished.isTap() && !onButton) dialog.close();
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (current?.id === event.pointerId) current = undefined;
  };

  // ---- the keys: arrows turn 15°, Home squares ------------------------------------
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isTurnKey(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const { key } = event;
    intents?.turn((turn) => keyTurn(turn, key) ?? turn);
  };

  const onCloseClick = (): void => {
    dialog.close();
  };

  body.addEventListener('click', onBodyClick);
  dialog.addEventListener('close', onClosed);
  dialog.addEventListener('pointerdown', onPointerDown);
  dialog.addEventListener('pointermove', onPointerMove);
  dialog.addEventListener('pointerup', onPointerUp);
  dialog.addEventListener('pointercancel', onPointerCancel);
  dialog.addEventListener('keydown', onKeyDown);
  close.addEventListener('click', onCloseClick);

  return {
    isOpen: () => dialog.open,
    open: (name) => {
      // Named for the book, not "Book". `showModal` puts focus on the close
      // button, so the dialog's own name is the only thing announced on arrival —
      // a static one would say the same words for every book on the shelf.
      dialog.setAttribute('aria-label', name);
      current = undefined;
      if (!dialog.open) dialog.showModal();
    },
    close: () => {
      if (!dialog.open) return;
      quiet += 1;
      dialog.close();
    },
    bind: (next) => {
      intents = next;
    },
    teardown: () => {
      body.removeEventListener('click', onBodyClick);
      dialog.removeEventListener('close', onClosed);
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointermove', onPointerMove);
      dialog.removeEventListener('pointerup', onPointerUp);
      dialog.removeEventListener('pointercancel', onPointerCancel);
      dialog.removeEventListener('keydown', onKeyDown);
      close.removeEventListener('click', onCloseClick);
    },
  };
}
