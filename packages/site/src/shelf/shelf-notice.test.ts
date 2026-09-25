import { describe, expect, it, vi } from 'vitest';
import {
  BROKEN_MESSAGE,
  clearNotice,
  ContextRefused,
  mountFailed,
  NOTICE_CLASS,
  settleNotice,
  SHADER_MESSAGE,
  showNotice,
  UNAVAILABLE_MESSAGE,
} from './shelf-notice.ts';

/**
 * The notice and the canvas it stands in for, on a hand-built page.
 *
 * Three members of the DOM and no shim: the host's `querySelector` and
 * `append`, the document's `createElement`, and the canvas's inline style. What
 * none of this can show is Chrome painting a lost canvas white — that is the
 * phone's, and G60's refused case holds the page's half of it in a browser.
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

describe('settling the notice for the live shelf', () => {
  const DRAWING = { shaderErrors: [] };
  const HALTED = { shaderErrors: ['link log:  staged'] };

  it('clears it and shows the canvas for a shelf that draws', () => {
    const p = page();
    showNotice(p.canvas, 'redrawing');
    settleNotice(p.canvas, DRAWING);

    expect(p.notices).toHaveLength(0);
    expect(p.visibility()).toBe('');
  });

  it('keeps the shader sentence, and the canvas hidden, for a shelf that halted', () => {
    // A panel rebuild whose program would not link: the sentence goes up inside
    // `mountShelf`, and adopting the shelf used to take it straight down again —
    // a frozen, half-drawn canvas with nothing saying why.
    const p = page();
    showNotice(p.canvas, SHADER_MESSAGE);
    settleNotice(p.canvas, HALTED);

    expect(p.notices.map((notice) => notice.textContent)).toEqual([SHADER_MESSAGE]);
    expect(p.visibility()).toBe('hidden');
  });

  it('puts the shader sentence up over any other for a shelf that halted', () => {
    // The fallback's redraw that also would not link: the recovery counts it
    // drawn and settles, and what the page shows is the shelf's, not the word's.
    const p = page();
    showNotice(p.canvas, 'redrawing');
    settleNotice(p.canvas, HALTED);

    expect(p.notices.map((notice) => notice.textContent)).toEqual([SHADER_MESSAGE]);
    expect(p.visibility()).toBe('hidden');
  });

  it('leaves the notice alone when there is no shelf at all', () => {
    const p = page();
    showNotice(p.canvas, 'would not give it another');
    settleNotice(p.canvas, undefined);

    expect(p.notices.map((notice) => notice.textContent)).toEqual(['would not give it another']);
    expect(p.visibility()).toBe('hidden');
  });
});

describe('a mount that threw', () => {
  it('blames the browser only for a context it refused, and logs nothing three has not', () => {
    const log = vi.fn();
    const refused = new ContextRefused(
      new Error('THREE.WebGLRenderer: Error creating WebGL context.'),
    );

    expect(mountFailed(refused, log)).toBe(UNAVAILABLE_MESSAGE);
    // three has logged its own line already, and G60's `refused` case allows
    // that line and no other.
    expect(log).not.toHaveBeenCalled();
  });

  it("says the site's own code failed, and logs the original error, for any other throw", () => {
    // The woodwork join refuses rather than fall back; the page's `catch` used
    // to swallow it and tell every visitor their browser had refused a canvas.
    const log = vi.fn();
    const thrown = new Error('joinWoodwork: mergeGeometries returned null');
    const sentence = mountFailed(thrown, log);

    expect(sentence).toBe(BROKEN_MESSAGE);
    expect(sentence).not.toContain('browser wouldn');
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]).toContain(thrown);
  });

  it('keeps three’s error as the cause of a refusal', () => {
    const three = new Error('THREE.WebGLRenderer: Error creating WebGL context.');
    const refused = new ContextRefused(three);

    expect(refused.cause).toBe(three);
    expect(refused.name).toBe('ContextRefused');
  });
});
