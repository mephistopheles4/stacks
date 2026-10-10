/**
 * The cover, larger — a modal `<dialog>` over the page.
 *
 * The card shows the cover at 4.5rem, which is a thumbnail by any reading, and
 * the shelf shows it at a few hundred pixels from a camera you cannot bring
 * closer than `minDistance`. So the artwork a book actually has was, until this,
 * not visible anywhere on the site.
 *
 * **A native `<dialog>` opened with `showModal`, and that is the whole design.**
 * A full-viewport scrim that swallows clicks *is* modal however it is labelled,
 * and the platform's element brings the four things a hand-rolled one gets wrong:
 * focus moves in, the rest of the page goes inert, Escape closes it, and focus
 * returns to whatever opened it. Compare the card itself, which is deliberately
 * **not** `role="dialog"` (`Shelf.astro`) — because focus never moves there and
 * claiming modality it does not have would be the same mismatch from the other
 * side. The two surfaces differ in behaviour, so they differ in role.
 *
 * **It shows the held copy when the build staged one**, up to 1200px on its
 * long edge, and the card's own 512px file otherwise (`held-covers/`, spec
 * §3.3, #377). The card hands the held path over with `offerHeldCopy`, keyed
 * by its cover button; the card's own image never loads it, so the larger file
 * is fetched only when someone opens this view. A DOM image costs no GPU memory, so the texture
 * budget is not a reason to hold it back. It is never scaled *past* native
 * size: a blurry big cover is a worse answer than an honest small one, which is
 * why a cover the vault holds only at 512px or less gets no held copy at all.
 */

/** The markup this drives, owned by the template and looked up in `start.ts`. */
export interface CoverViewerElements {
  readonly dialog: HTMLDialogElement;
  readonly image: HTMLImageElement;
}

export interface CoverViewer {
  /**
   * Whether the enlarged cover is up.
   *
   * Read by the page's Escape handler, which dismisses the *card*. Both listen
   * on the document, so without this one Escape would close the viewer and the
   * card underneath it in the same keystroke — the user having asked to leave
   * one surface and been returned two levels.
   */
  isOpen(): boolean;
  teardown(): void;
}

/** The class `card.ts` puts on the button wrapping a cover. */
export const COVER_BUTTON_CLASS = 'card-cover';

/**
 * The held copy each cover button offers, keyed by the button itself.
 *
 * Held in memory, never in the DOM: an attribute the viewer read back would
 * be page text turned into an image address, which is the shape CodeQL's
 * DOM-text rule refuses, and nothing outside this page has a reason to see the
 * path. Weak, so a card's buttons go with the card on every swap.
 */
const heldCopies = new WeakMap<Element, string>();

/** Called by the card for a book whose build staged a held copy. */
export function offerHeldCopy(button: Element, path: string): void {
  heldCopies.set(button, path);
}

export function mountCoverViewer(
  elements: CoverViewerElements,
  /**
   * The card's replaced subtree, listened to by **delegation**.
   *
   * `showCard` calls `replaceChildren` on this element, so the cover button is
   * destroyed and rebuilt on every tap-to-swap — the same fact that put the
   * dismiss control outside it. A listener bound to the button would survive
   * exactly one book.
   */
  body: HTMLElement,
): CoverViewer {
  const { dialog, image } = elements;

  const onBodyClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest(`.${COVER_BUTTON_CLASS}`);
    const thumbnail = button?.querySelector('img');
    if (!(thumbnail instanceof HTMLImageElement)) return;

    // Keyed by the button rather than passed in: one element holds the src,
    // the held copy and the alt text, so the enlarged view cannot drift from
    // what it enlarges. A held copy that fails to load — a browser still
    // holding a `library.json` from before the copy was taken down — falls back
    // to the card's own file once, rather than a broken image.
    const held = button === null ? undefined : heldCopies.get(button);
    image.onerror =
      held === undefined
        ? null
        : () => {
            image.onerror = null;
            image.src = thumbnail.src;
          };
    image.src = held ?? thumbnail.src;
    image.alt = thumbnail.alt;
    // Named for the book, not "Book cover". `showModal` puts focus on the close
    // button, so the dialog's own name is the only thing announced on arrival —
    // a static one would say the same words over every cover on the shelf.
    dialog.setAttribute('aria-label', thumbnail.alt);
    dialog.showModal();
  };

  /**
   * Anywhere on the dialog closes it, including the image.
   *
   * The conventional lightbox gesture, and the one that needs no aiming on a
   * phone. The close button is still there — a surface you can only leave by
   * knowing a convention is a surface some people are stuck on.
   */
  const onDialogClick = (): void => {
    dialog.close();
  };

  body.addEventListener('click', onBodyClick);
  dialog.addEventListener('click', onDialogClick);

  return {
    isOpen: () => dialog.open,
    teardown: () => {
      body.removeEventListener('click', onBodyClick);
      dialog.removeEventListener('click', onDialogClick);
    },
  };
}
