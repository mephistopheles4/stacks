/**
 * The black box's readout — an instrument in the debug pane, behind `?debug`.
 *
 * A view file, like `pickup-tuner.ts`: it takes the folder `debug-pane.ts` made
 * for it and imports nothing from Tweakpane. It takes only `import type` from
 * `diagnostics.ts`, which imports nothing from the pane, so Tweakpane never
 * reaches the eager bundle the recording lives in (#488).
 *
 * **The recording is not here and never moves.** `diagnostics.ts` records from a
 * static import and shows a plain element whenever nobody holds the port's
 * claim. This folder claims the port on mount and releases it on teardown, so a
 * pane that has not loaded, one that never loads and one a rebuild unmounts are
 * all the plain readout.
 *
 * The text is the port's `text()` whole, live part and record part, the same
 * string `window.__blackbox.text()` returns. A Tweakpane read-only multiline
 * monitor draws into a `<textarea>`, so `pnpm smoke:render` compares its `.value`
 * with the hook rather than reading `textContent`.
 */
import type { DiagnosticsPort } from './diagnostics.ts';
import type { Instrument } from './pane-slots.ts';

/** How often the folder reads the port; the black box itself samples each second. */
const READ_MS = 500;

/** Visible lines before the monitor scrolls. A dead session's record runs to ~40. */
const ROWS = 16;

/**
 * The readout as an instrument. The folder starts open, as the plain readout it
 * replaces was always up (the owner's call on #494); after a death the pane opens
 * itself too (`startsExpanded`), so `PREVIOUS SESSION DIED` is never behind a tap.
 */
export function blackboxReadout(port: DiagnosticsPort): Instrument {
  return {
    title: 'Black box',
    expanded: true,
    mount(folder) {
      const live = { text: port.text() };
      folder.addBinding(live, 'text', { readonly: true, multiline: true, rows: ROWS, label: null });

      const copy = folder.addButton({ title: 'copy' });
      copy.on('click', () => {
        copy.title = port.copy();
      });

      const forget = folder.addButton({ title: 'forget' });
      forget.hidden = !port.canForget();
      forget.on('click', () => {
        forget.title = port.forget();
      });

      port.claim();
      const timer = setInterval(() => {
        live.text = port.text();
        forget.hidden = !port.canForget();
        folder.refresh();
      }, READ_MS);

      return () => {
        clearInterval(timer);
        port.release();
      };
    },
  };
}
