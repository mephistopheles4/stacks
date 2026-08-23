/**
 * The bottom sheet: one breakpoint, one control, and a drag that really drags.
 *
 * Below the breakpoint the card is a full-bleed sheet with no scrim, capped at
 * 40vh so the top ~60% of the screen is always live shelf. Above it, the corner
 * card, unchanged. **Non-modal on both**: tapping empty shelf dismisses, tapping
 * another book *swaps* the contents.
 *
 * ⚠️ **The presentation switch is CSS-only; the drag is not.** Dragging the
 * desktop `×` must do nothing, so the drag has to know which side of the
 * breakpoint it is on — which makes the breakpoint **a fact two languages
 * hold**. The rule, stated once so it cannot be read two ways: *the drag is
 * inert above the breakpoint, and the breakpoint is expressed once and read by
 * both.* `SHEET_QUERY` is that one expression; `Shelf.astro`'s media query
 * points at it by comment, and `card-sheet.test.ts` asserts the two spellings
 * match. **Do not add a third holder** — the attribution surface was placed to
 * avoid becoming one.
 *
 * See docs/spec/enhanced-card.md §5 and §6.
 */

/**
 * Width **and** height, because width alone is a bad proxy and the numbers say
 * so: a landscape phone at 812×375 gets a 320×343 corner card — 91% of the
 * viewport height, which is the defect this work opened against. 700 reuses the
 * threshold already in `debug-panel.ts`; 500 clears every landscape phone and
 * leaves real desktop windows alone. A short desktop window getting the sheet is
 * intended: a 448px card in a 450px window is the same swallowing.
 */
export const SHEET_QUERY = "(max-width: 700px), (max-height: 500px)";

/** 220ms in, 180ms out — arriving wants to be seen, leaving wants to be gone. */
export const ENTER_MS = 220;
export const EXIT_MS = 180;

/**
 * 30% of the sheet's height, capped at 80px.
 *
 * Proportional so a short sheet needs a short drag — 45px in landscape, 80px on
 * a full portrait one. A flat 64px is 43% of a 150px landscape sheet: a long
 * drag on the viewport with the least room to make it.
 */
const DISMISS_FRACTION = 0.3;
const DISMISS_CAP_PX = 80;

export function dismissThreshold(sheetHeight: number): number {
  return Math.min(sheetHeight * DISMISS_FRACTION, DISMISS_CAP_PX);
}

export interface SheetOptions {
  readonly card: HTMLElement;
  /** The grabber pill below the breakpoint, the `×` above it. One control. */
  readonly control: HTMLElement;
  readonly onDismiss: () => void;
  /** Injected so a test can drive the breakpoint without a viewport. */
  readonly isSheet?: () => boolean;
}

/**
 * Wires the one dismiss control: a click anywhere, a drag only below the
 * breakpoint.
 *
 * The drag starts **on the pill only**. The sheet body scrolls, always, with no
 * arbitration — the conventional "dismiss only when scrolled to top" rule
 * reintroduces the ambiguity *intermittently*, because with a content-capped
 * sheet most books do not scroll at all and the same gesture would mean
 * different things on different books. Intermittent is harder to learn than
 * either consistent rule.
 *
 * Cost, accepted: swiping the sheet's *body* out of habit does nothing, with the
 * working control an inch above the thumb and clickable.
 */
/**
 * Pointer capture, which is an enhancement and not a requirement.
 *
 * `setPointerCapture` **throws** when the id names no active pointer — a pointer
 * that ended between the event and the handler, a synthetic one, an input the
 * browser has already released. Uncaught, that takes the whole `pointerdown`
 * handler down and the sheet becomes undraggable for the rest of the session,
 * on a control whose entire job is being dragged.
 *
 * What capture buys is a drag that keeps tracking when the finger leaves the
 * pill. Losing it costs a drag that stops early; losing the handler costs the
 * gesture. So it is attempted and never depended on.
 */
function capture(control: HTMLElement, pointerId: number): void {
  try {
    control.setPointerCapture(pointerId);
  } catch {
    // No active pointer. The drag still works, it simply stops at the edge.
  }
}

function release(control: HTMLElement, pointerId: number): void {
  try {
    if (control.hasPointerCapture(pointerId))
      control.releasePointerCapture(pointerId);
  } catch {
    // Already released, which is the state this wanted anyway.
  }
}

export function mountSheet(options: SheetOptions): () => void {
  const { card, control, onDismiss } = options;
  const isSheet = options.isSheet ?? (() => matchMedia(SHEET_QUERY).matches);

  let startY: number | undefined;
  let dragged = 0;
  /**
   * Set when a drag moved at all, and cleared by the `click` that follows it.
   *
   * ⚠️ **Without this, every short drag dismissed the sheet.** The event order
   * is `pointerdown → pointermove* → pointerup → click`, and the first version
   * reset `dragged` to 0 at the end of `pointerup` — so the `click` that
   * browsers synthesise afterwards saw 0, read it as a tap, and dismissed a
   * sheet that had just correctly decided to snap back. A drag *past* the
   * threshold dismissed twice.
   *
   * A tap was unaffected, which is why nothing caught it: `dragged` is 0 for the
   * whole of a tap either way.
   */
  let dragging = false;

  const setOffset = (px: number): void => {
    card.style.transform = px === 0 ? "" : `translateY(${String(px)}px)`;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!isSheet()) return;
    startY = event.clientY;
    dragged = 0;
    capture(control, event.pointerId);
    // Follow-the-finger is JS writing `transform` directly, so it is not a
    // transition and `prefers-reduced-motion` cannot remove it — which is the
    // whole reason the reduced-motion rule is one scoped `transition: none`.
    card.classList.add("dragging");
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (startY === undefined) return;
    // Downward only: dragging a sheet up toward an edge it is not anchored to
    // depicts a gesture that does not exist.
    dragged = Math.max(0, event.clientY - startY);
    if (dragged > 0) dragging = true;
    setOffset(dragged);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (startY === undefined) return;
    startY = undefined;
    card.classList.remove("dragging");
    release(control, event.pointerId);

    if (dragged >= dismissThreshold(card.offsetHeight)) {
      onDismiss();
    }
    // Snap back is the absence of an offset plus the transition the class
    // removal restores; below the reduced-motion query it is instant.
    setOffset(0);
    dragged = 0;
  };

  // A real `<button>` with an accessible name, not a decorative `<div>`: a
  // grabber only a gesture can reach is invisible to a keyboard and a screen
  // reader. It drags *and* clicks, so one control serves the finger and the
  // pointer — and the drag has already had its say by the time this runs.
  const onClick = (): void => {
    if (dragging) {
      dragging = false;
      return;
    }
    onDismiss();
  };

  control.addEventListener("pointerdown", onPointerDown);
  control.addEventListener("pointermove", onPointerMove);
  control.addEventListener("pointerup", onPointerUp);
  control.addEventListener("pointercancel", onPointerUp);
  control.addEventListener("click", onClick);

  return () => {
    control.removeEventListener("pointerdown", onPointerDown);
    control.removeEventListener("pointermove", onPointerMove);
    control.removeEventListener("pointerup", onPointerUp);
    control.removeEventListener("pointercancel", onPointerUp);
    control.removeEventListener("click", onClick);
  };
}
