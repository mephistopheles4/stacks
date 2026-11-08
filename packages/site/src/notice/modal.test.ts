// @vitest-environment happy-dom
//
// The two decisions `modal.ts` keeps that nothing else reads: a click is only taken once the
// dialog is really open (N4), and a press that began in the text does not close the modal when
// it ends on the backdrop (N9, the backdrop clause of C3). `// @vitest-environment` selects the
// DOM for this file alone; every other test keeps `node`.
//
// One mount for the whole file, because `mountNotices` adds its listeners to the document and
// a second mount would leave the first one's dialog answering the same clicks.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountNotices } from './modal.ts';

let dialog: HTMLDialogElement;
let link: HTMLAnchorElement;

/** An element with an id, optional text and its children: the site builds every node from text. */
function node(
  tag: string,
  id: string,
  text = '',
  children: readonly Node[] = [],
  attributes: Readonly<Record<string, string>> = {},
): HTMLElement {
  const element = document.createElement(tag);
  element.id = id;
  element.textContent = text;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

beforeAll(() => {
  const heading = (id: string, text: string): HTMLElement =>
    node('h1', id, text, [], { tabindex: '-1' });
  link = node('a', 'shelf-link', 'Attribution', [], { href: '/attribution' }) as HTMLAnchorElement;
  dialog = node(
    'dialog',
    'notice-dialog',
    '',
    [
      node('div', 'sheet', '', [
        node('button', 'notice-close', 'Close', [], { type: 'button' }),
        node('section', 'notice-attribution', '', [
          heading('notice-attribution-title', 'Attribution'),
          node('p', 'text', 'Text.'),
        ]),
        node('section', 'notice-privacy', '', [heading('notice-privacy-title', 'Privacy')], {
          hidden: '',
        }),
      ]),
    ],
    { 'aria-labelledby': 'notice-attribution-title' },
  ) as HTMLDialogElement;
  document.body.append(link, dialog);
  mountNotices(document, window);
});

beforeEach(() => {
  if (dialog.open) dialog.close();
});

/** A plain left-click on `target`, as the page receives it, and whether something cancelled it. */
function click(target: Element): boolean {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('mountNotices: a click is taken only once the dialog is open (N4)', () => {
  it('opens the dialog and cancels the click that opened it', () => {
    expect(click(link)).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it('leaves the click to the browser when the dialog will not open, so the link navigates', () => {
    const refuse = vi.spyOn(dialog, 'showModal').mockImplementation(() => {
      throw new Error('a dialog that will not open');
    });
    try {
      expect(click(link)).toBe(false);
      expect(dialog.open).toBe(false);
    } finally {
      refuse.mockRestore();
    }
  });
});

describe('mountNotices: the backdrop closes the modal only for a press that began on it (N9)', () => {
  const press = (target: Element): void => {
    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  };

  it('stays open when the press began in the text and the click lands on the dialog', () => {
    click(link);
    press(document.getElementById('text') as HTMLElement);
    click(dialog);
    expect(dialog.open).toBe(true);
  });

  it('closes when the press and the click are both on the backdrop', () => {
    click(link);
    press(dialog);
    click(dialog);
    expect(dialog.open).toBe(false);
  });
});
