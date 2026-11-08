import { tabTarget } from './focus.ts';
import { noticeFor, type NoticeName } from './links.ts';
import { NOTICE_CLOSE_ID, NOTICE_DIALOG_ID, NOTICE_PANEL_IDS, NOTICE_TITLE_IDS } from './open.ts';

const NAMES: readonly NoticeName[] = ['attribution', 'privacy'];

/** What can take focus inside the modal: the close button and the links of the shown panel. */
const FOCUSABLE = 'button:not([disabled]), a[href]';

/**
 * The notice modal (docs/spec/notice-modals.md N1, N4, N5, N7, N8, N9): one native `<dialog>`
 * holding both notices as panels, opened by a plain click on a link to either page.
 *
 * Browser-only glue, reached by no in-process spec; `focus.ts` and `links.ts` hold the decisions
 * and `smoke-render`'s notice cells hold this. Every failure here is the same safe state: the
 * link is left alone and navigates, as it did before the modal existed.
 */
export function mountNotices(doc: Document, win: Window): void {
  const dialog = doc.getElementById(NOTICE_DIALOG_ID);
  const close = doc.getElementById(NOTICE_CLOSE_ID);
  if (!(dialog instanceof HTMLDialogElement) || !(close instanceof HTMLButtonElement)) return;

  const panels = new Map<NoticeName, HTMLElement>();
  for (const name of NAMES) {
    const panel = doc.getElementById(NOTICE_PANEL_IDS[name]);
    if (!(panel instanceof HTMLElement)) return;
    panels.set(name, panel);
  }

  // Which link opened the modal first, and so where focus goes back to.
  let opener: HTMLElement | undefined;

  const show = (name: NoticeName): void => {
    for (const [other, panel] of panels) panel.hidden = other !== name;
    dialog.setAttribute('aria-labelledby', NOTICE_TITLE_IDS[name]);
    dialog.scrollTop = 0;
  };

  const heading = (name: NoticeName): HTMLElement | null =>
    doc.getElementById(NOTICE_TITLE_IDS[name]);

  const controls = (): HTMLElement[] =>
    [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => element.closest('[hidden]') === null,
    );

  // A plain left-click on a link to either page. Capture, so it runs before any listener of the
  // page's own, and `preventDefault` only once the dialog is really open (N4).
  doc.addEventListener(
    'click',
    (event) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (link === null) return;
      const name = noticeFor(link.getAttribute('href'), event);
      if (name === undefined) return;
      try {
        if (dialog.open) {
          // The in-notice link: swap the panel, and move focus off the link that just hid.
          show(name);
          heading(name)?.focus();
        } else {
          show(name);
          opener = link;
          dialog.showModal();
          close.focus();
        }
      } catch {
        // A dialog that will not open leaves the link to navigate.
        if (!dialog.open) opener = undefined;
        return;
      }
      event.preventDefault();
    },
    true,
  );

  close.addEventListener('click', () => {
    dialog.close();
  });

  // The backdrop: a click whose press began on the backdrop too, so a text selection that ends
  // outside does not close it. The dialog has no padding of its own, so its own box is the sheet.
  let pressedOnBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    pressedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    const hit = event.target === dialog && pressedOnBackdrop;
    pressedOnBackdrop = false;
    if (hit) dialog.close();
  });

  // Keys while a notice is open belong to the modal (N8). Escape is taken here, with
  // `preventDefault`, and closes the dialog itself, so the drawer and the shelf, which stand
  // down on `defaultPrevented`, never see an Escape that was meant for this.
  win.addEventListener(
    'keydown',
    (event) => {
      if (!dialog.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        dialog.close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = controls();
      const active = doc.activeElement;
      const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
      const next = tabTarget(items.length, index, event.shiftKey);
      if (next === undefined) return;
      event.preventDefault();
      items[next]?.focus();
    },
    true,
  );

  // Whatever closed it - the button, Escape, the backdrop, the Android back gesture - ends here.
  dialog.addEventListener('close', () => {
    const back = opener;
    opener = undefined;
    if (back?.isConnected === true) back.focus();
  });
}
