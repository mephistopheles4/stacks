/**
 * The seam between the markup, the modal and the code that must stand down while a notice is
 * open (docs/spec/notice-modals.md N8). Ids only, and one question: is a notice open.
 *
 * The drawer asks it before it acts on a key or a pointer, and the shelf before it acts on a
 * key; the modal's inert background stops the shelf's pointers. So a click or an arrow behind the
 * modal reaches nothing. It reads the dialog itself rather than a flag the modal keeps, so there
 * is no second copy of the state to drift.
 */

export const NOTICE_DIALOG_ID = 'notice-dialog';
export const NOTICE_CLOSE_ID = 'notice-close';
export const NOTICE_PANEL_IDS = {
  attribution: 'notice-attribution',
  privacy: 'notice-privacy',
} as const;
export const NOTICE_TITLE_IDS = {
  attribution: 'notice-attribution-title',
  privacy: 'notice-privacy-title',
} as const;

/** True while the notice modal is shown. */
export function noticeIsOpen(doc: Document): boolean {
  const dialog = doc.getElementById(NOTICE_DIALOG_ID);
  return dialog instanceof HTMLDialogElement && dialog.open;
}
