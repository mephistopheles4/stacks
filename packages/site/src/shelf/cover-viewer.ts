/**
 * The cover, larger — a modal `<dialog>` over the page.
 *
 * The shelf shows a cover at a few hundred pixels from a camera you cannot bring
 * closer than `minDistance`, and the held book shows it only until it opens. So
 * this is where the artwork a book actually has is seen whole, opened from a
 * control among the card's lines on the held book's page (spec §3.4).
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
 * §3.3, #377). The held page hands both paths and the alt text over with
 * `offerCover`, keyed by its control and never written into the page, so the
 * larger file is fetched only when someone opens this view. A DOM image costs
 * no GPU memory, so the texture
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
   * Read by the page's Escape handler, which puts the held book back. Both
   * listen on the document, so without this one Escape would close the viewer
   * and put the book down in the same keystroke — the user having asked to leave
   * one surface and been returned two levels.
   */
  isOpen(): boolean;
  teardown(): void;
}

/** The class `held-page.ts` puts on the control that opens this view. */
export const COVER_BUTTON_CLASS = 'card-cover';

/** What a cover control offers the view: the shelf copy, the held copy, and the alt text. */
export interface OfferedCover {
  readonly cover: string;
  readonly held: string | undefined;
  readonly alt: string;
}

/**
 * The cover each control offers, keyed by the control itself.
 *
 * Held in memory, never in the DOM: an attribute the viewer read back would
 * be page text turned into an image address, which is the shape CodeQL's
 * DOM-text rule refuses, and nothing outside this page has a reason to see the
 * paths. Weak, so a held page's control goes with the page on put-back.
 */
const offered = new WeakMap<Element, OfferedCover>();

/** Called by the held page for a book with a cover. */
export function offerCover(control: Element, cover: OfferedCover): void {
  offered.set(control, cover);
}

export function mountCoverViewer(
  elements: CoverViewerElements,
  /**
   * The layer the held book's pages live in, listened to by **delegation**.
   *
   * Each pickup builds its pages anew, so the control is a different element
   * for every book. A listener bound to it would survive exactly one book.
   */
  body: HTMLElement,
): CoverViewer {
  const { dialog, image } = elements;

  const onBodyClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest(`.${COVER_BUTTON_CLASS}`);
    if (button === null) return;
    const offer = offered.get(button);
    if (offer === undefined) return;
    const { cover, held, alt } = offer;

    // Keyed by the control rather than passed in: one entry holds the src,
    // the held copy and the alt text, so the enlarged view cannot drift from
    // what it enlarges. A held copy that fails to load — a browser still
    // holding a `library.json` from before the copy was taken down — falls back
    // to the shelf copy once, rather than a broken image.
    image.onerror =
      held === undefined
        ? null
        : () => {
            image.onerror = null;
            image.src = cover;
          };
    image.src = held ?? cover;
    image.alt = alt;
    // Named for the book, not "Book cover". `showModal` puts focus on the close
    // button, so the dialog's own name is the only thing announced on arrival —
    // a static one would say the same words over every cover on the shelf.
    dialog.setAttribute('aria-label', alt);
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
