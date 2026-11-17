/**
 * Which notice, if any, a click opens (docs/spec/notice-modals.md N4, claim C7), as a decision
 * with no DOM in it so it can be tested and the glue stays thin.
 *
 * The links stay plain links: the `href` is the page's own address, and only a plain left-click
 * on one is taken. A modified or non-primary click is the browser's, as it was before the
 * modal existed.
 */

export type NoticeName = 'attribution' | 'privacy' | 'credits';

/**
 * The exact `href` attributes that name a notice. Read with `getAttribute`, never `.href`.
 *
 * The 3D credits (#621) are a third panel of the same modal, not a page of their own: their link
 * is the attribution page's `#credits` anchor, which is also where a visitor with scripts off
 * finds them (`attribution.astro`).
 */
const NOTICE_HREFS: Readonly<Record<string, NoticeName>> = {
  '/attribution': 'attribution',
  '/privacy': 'privacy',
  '/attribution#credits': 'credits',
};

/**
 * The links `noticeFor` can answer for, as a selector: what the drawer counts as inside itself
 * (N9), so opening a notice from the shelf with the drawer open does not close the drawer.
 */
export const NOTICE_LINK_SELECTOR =
  'a[href="/attribution"], a[href="/privacy"], a[href="/attribution#credits"]';

/** The parts of a click this decision reads. */
export interface ClickRead {
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

/** The notice a plain left-click on a link with this `href` attribute opens, or `undefined`. */
export function noticeFor(href: string | null, click: ClickRead): NoticeName | undefined {
  if (href === null) return undefined;
  if (click.defaultPrevented || click.button !== 0) return undefined;
  if (click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return undefined;
  return Object.hasOwn(NOTICE_HREFS, href) ? NOTICE_HREFS[href] : undefined;
}
