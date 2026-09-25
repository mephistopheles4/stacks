import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A mount that throws halfway lets go of what it made.
 *
 * `mountShelf` runs in node here with one stand-in — the renderer, since there
 * is no WebGL — and everything else real: the scene, the woodwork, the orbit
 * controls and the picker. A `ResizeObserver` that throws on construction
 * stops it late, after every listener but its own is on the canvas, so the
 * canvas's own listener count says whether anything was left behind. What this
 * cannot see is GPU memory; the renderer's `dispose` being called is the part
 * of that the page owns.
 */

const three = vi.hoisted(() => ({
  renderers: [] as { disposed: boolean }[],
  refuse: false,
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class WebGLRenderer {
    readonly domElement: unknown;
    readonly shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false };
    readonly debug: { checkShaderErrors: boolean; onShaderError: unknown } = {
      checkShaderErrors: true,
      onShaderError: null,
    };
    readonly info = { autoReset: true, reset: (): void => {} };
    readonly capabilities = { getMaxAnisotropy: (): number => 1 };
    toneMapping = 0;
    toneMappingExposure = 1;
    disposed = false;

    constructor(parameters: { canvas: unknown }) {
      if (three.refuse) throw new Error('THREE.WebGLRenderer: Error creating WebGL context.');
      this.domElement = parameters.canvas;
      three.renderers.push(this);
    }

    setPixelRatio(): void {}

    getContext(): undefined {
      return undefined;
    }

    dispose(): void {
      this.disposed = true;
    }
  }

  return { ...actual, WebGLRenderer };
});

const { mountShelf } = await import('./scene.ts');
const { ContextRefused } = await import('./shelf-notice.ts');

/** The error the stand-in `ResizeObserver` throws, late in the mount. */
const LATE = new Error('staged: the mount throws after every other part is made');

interface Listening {
  readonly canvas: HTMLCanvasElement;
  /** Listeners still attached to the canvas and the document it sits in. */
  live(): string[];
}

function listeningCanvas(): Listening {
  const listeners = new Map<string, Set<unknown>>();
  const target = (where: string): object => ({
    addEventListener: (type: string, listener: unknown): void => {
      const key = `${where} ${type}`;
      listeners.set(key, (listeners.get(key) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: unknown): void => {
      listeners.get(`${where} ${type}`)?.delete(listener);
    },
  });
  const root = target('document');
  const canvas = {
    ...target('canvas'),
    style: {},
    clientWidth: 0,
    clientHeight: 0,
    ownerDocument: root,
    getRootNode: () => root,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  };
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    live: () => [...listeners].filter(([, set]) => set.size > 0).map(([key]) => key),
  };
}

beforeEach(() => {
  three.renderers.length = 0;
  three.refuse = false;
  vi.stubGlobal('window', { devicePixelRatio: 1, location: { search: '' } });
  // The painted textures ask for a 2D canvas, and each does without one; an
  // image a loader asks for never arrives.
  const element = (): object => ({
    width: 0,
    height: 0,
    style: {},
    getContext: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('document', { createElement: element, createElementNS: element });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor() {
        throw LATE;
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a mount that throws', () => {
  it('rethrows the original error', () => {
    const { canvas } = listeningCanvas();
    let thrown: unknown;
    try {
      mountShelf(canvas);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(LATE);
  });

  it('disposes the renderer it made', () => {
    const { canvas } = listeningCanvas();
    expect(() => mountShelf(canvas)).toThrow(LATE);

    expect(three.renderers).toHaveLength(1);
    expect(three.renderers[0]?.disposed).toBe(true);
  });

  it('leaves no listener on the canvas: not the controls’, the picker’s or its own', () => {
    // The picker left behind would still answer clicks, for a scene nobody sees.
    const page = listeningCanvas();
    expect(() => mountShelf(page.canvas)).toThrow(LATE);

    expect(page.live()).toEqual([]);
  });
});

describe('a context the browser refused', () => {
  it('is thrown as `ContextRefused`, with three’s error as its cause', () => {
    three.refuse = true;
    const { canvas } = listeningCanvas();
    let thrown: unknown;
    try {
      mountShelf(canvas);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContextRefused);
    expect((thrown as Error).cause).toBeInstanceOf(Error);
    expect(((thrown as Error).cause as Error).message).toContain('Error creating WebGL context');
  });
});
