import { describe, expect, it } from 'vitest';
import { clearNotice, NOTICE_CLASS, showNotice } from './shelf-notice.ts';

/**
 * The notice and the canvas it stands in for, on a hand-built page.
 *
 * Three members of the DOM and no shim: the host's `querySelector` and
 * `append`, the document's `createElement`, and the canvas's inline style. What
 * none of this can show is Chrome painting a lost canvas white — that is the
 * phone's, and G59's refused case holds the page's half of it in a browser.
 */

interface FakeNotice {
  className: string;
  textContent: string | null;
  readonly attributes: Map<string, string>;
  setAttribute(name: string, value: string): void;
  remove(): void;
}

interface FakePage {
  readonly canvas: HTMLCanvasElement;
  /** The notices in the shelf's host, in order. */
  readonly notices: FakeNotice[];
  /** The canvas's inline `visibility`, `''` when none is set. */
  visibility(): string;
}

function page(options: { attached?: boolean } = {}): FakePage {
  const notices: FakeNotice[] = [];
  const style = new Map<string, string>();

  const host = {
    querySelector: (selector: string): FakeNotice | null =>
      notices.find((notice) => `.${notice.className}` === selector) ?? null,
    append: (notice: FakeNotice): void => {
      notices.push(notice);
    },
  };

  const createElement = (): FakeNotice => {
    const notice: FakeNotice = {
      className: '',
      textContent: null,
      attributes: new Map(),
      setAttribute(name, value) {
        notice.attributes.set(name, value);
      },
      remove() {
        const at = notices.indexOf(notice);
        if (at !== -1) notices.splice(at, 1);
      },
    };
    return notice;
  };

  const canvas = {
    parentElement: options.attached === false ? null : host,
    ownerDocument: { createElement },
    style: {
      set visibility(value: string) {
        style.set('visibility', value);
      },
      get visibility(): string {
        return style.get('visibility') ?? '';
      },
      removeProperty(name: string): string {
        const was = style.get(name) ?? '';
        style.delete(name);
        return was;
      },
    },
  };

  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    notices,
    visibility: () => canvas.style.visibility,
  };
}

describe('a notice replaces the canvas', () => {
  it('hides the canvas while a notice is up, so a lost one Chrome paints white is never seen', () => {
    // The refused state on the Pixel: the new canvas denied a context, the old
    // one kept for the sentence — and left visible, the whole page read white.
    const p = page();
    showNotice(p.canvas, 'would not give it another');

    expect(p.visibility()).toBe('hidden');
    expect(p.notices).toHaveLength(1);
  });

  it('shows the canvas again when the notice clears', () => {
    // A restore that resumes in place, or a rebuild that drew: a live shelf
    // hidden behind no notice at all would be worse than the white.
    const p = page();
    showNotice(p.canvas, 'lost');
    clearNotice(p.canvas);

    expect(p.visibility()).toBe('');
    expect(p.notices).toHaveLength(0);
  });

  it('keeps the canvas hidden when one notice replaces another', () => {
    // `redrawing` then `failed`: the second is shown by clearing the first,
    // which shows the canvas for an instant, and it must not stay shown.
    const p = page();
    showNotice(p.canvas, 'redrawing');
    showNotice(p.canvas, 'failed');

    expect(p.visibility()).toBe('hidden');
    expect(p.notices.map((notice) => notice.textContent)).toEqual(['failed']);
  });

  it('leaves the stylesheet to decide once cleared, rather than writing `visible`', () => {
    const p = page();
    clearNotice(p.canvas);

    expect(p.visibility()).toBe('');
  });

  it('builds the notice the stylesheet and a screen reader expect', () => {
    const p = page();
    showNotice(p.canvas, 'This browser wouldn’t give the page a 3D canvas.');

    const [notice] = p.notices;
    expect(notice?.className).toBe(NOTICE_CLASS);
    expect(notice?.textContent).toBe('This browser wouldn’t give the page a 3D canvas.');
    expect(notice?.attributes.get('role')).toBe('status');
  });

  it('shows nothing, and throws nothing, against a canvas that is not in the page', () => {
    // The fallback's old element after a swap: a notice shown against it is
    // shown nowhere, which is why `boot.ts` reads `surface` and never this.
    const p = page({ attached: false });

    expect(() => {
      showNotice(p.canvas, 'lost');
    }).not.toThrow();
    expect(p.notices).toHaveLength(0);
  });
});
