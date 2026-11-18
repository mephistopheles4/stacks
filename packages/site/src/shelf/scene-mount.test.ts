import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROOM_ID, ROOMS } from './room-mode.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';

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
  cameras: [] as { far: number; near: number; position: { set(...at: number[]): void } }[],
  fogs: [] as { near: number; far: number }[],
  refuse: false,
}));

/** What a mount's room load is handed, when a test stages one (spec #637, C16). */
const staged = vi.hoisted(() => ({ room: undefined as (() => unknown) | undefined }));

vi.mock('./room-assets.ts', () => ({
  roomAssets: () => ({ prepare: () => Promise.resolve(staged.room?.()) }),
}));

vi.mock('./room-loading.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./room-loading.ts')>()),
  showLoadingScreen: () => ({ update: () => {}, done: () => {} }),
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

    // what a mount that goes on to draw its first frame asks of it
    render(): void {}

    setSize(): void {}

    getContext(): undefined {
      return undefined;
    }

    dispose(): void {
      this.disposed = true;
    }
  }

  class PerspectiveCamera extends actual.PerspectiveCamera {
    constructor(...parameters: ConstructorParameters<typeof actual.PerspectiveCamera>) {
      super(...parameters);
      three.cameras.push(this);
    }
  }

  class Fog extends actual.Fog {
    constructor(...parameters: ConstructorParameters<typeof actual.Fog>) {
      super(...parameters);
      three.fogs.push(this);
    }
  }

  return { ...actual, WebGLRenderer, PerspectiveCamera, Fog };
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
  three.cameras.length = 0;
  three.fogs.length = 0;
  staged.room = undefined;
  three.refuse = false;
  // the room's keys listen on the window (#637)
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    location: { search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
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

describe('a mount that succeeds, and is disposed', () => {
  it('leaves no listener on the canvas: not the controls’, the walk’s or the picker’s', () => {
    // The walk's wheel and pointer listeners (#626) are attached at mount and used to be let go only on a throw.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    const page = listeningCanvas();
    const shelf = mountShelf(page.canvas);
    expect(page.live().some((key) => key.endsWith(' wheel'))).toBe(true);

    shelf.dispose();

    expect(page.live()).toEqual([]);
  });
});

describe('a mount asked for a room that throws (spec S16)', () => {
  it('starts no room: nothing is fetched, no screen is raised, and no listener is left', () => {
    const fetched: unknown[] = [];
    vi.stubGlobal('fetch', (url: unknown) => {
      fetched.push(url);
      return Promise.reject(new Error('no network here'));
    });
    const page = listeningCanvas();
    expect(() =>
      mountShelf(page.canvas, [], {
        room: { id: DEFAULT_ROOM_ID, entry: ROOMS['reading-corner'] },
      }),
    ).toThrow(LATE);

    expect(fetched).toEqual([]);
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

describe('a room taken down (#637, C16)', () => {
  it('C16: puts the far plane and the fog back after the camera stood 30 units outside it', async () => {
    const THREE = await import('three');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    let drawFrame: (() => void) | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      drawFrame = callback;
      return 0;
    });
    const bounds = { min: [-7.4, 0.5, -0.2] as const, max: [9.4, 10.5, 12.452] as const };
    const seen = { far: 0, near: 0, fogNear: 0, fogFar: 0, outside: 0 };
    const disposed = vi.fn();
    // `ready` reads the lights after the room's orbit is entered: stand the camera outside, draw
    // a frame, and fail, so the room is taken down with the camera still out there
    staged.room = () => ({
      group: new THREE.Group(),
      settled: Promise.resolve(),
      dispose: disposed,
      draws: 0,
      bytes: 0,
      codec: () => '',
      data: {
        view: { position: [0, 0, 0], target: [0, 0, 1] },
        bounds,
        slots: {},
        get lights(): never {
          const camera = three.cameras[0]!;
          camera.position.set(bounds.max[0] + 30, 5, 5);
          drawFrame?.();
          const box = new THREE.Box3(
            new THREE.Vector3(...bounds.min),
            new THREE.Vector3(...bounds.max),
          );
          seen.outside = box.distanceToPoint(camera.position as never);
          Object.assign(seen, {
            far: camera.far,
            fogNear: three.fogs[0]!.near,
            fogFar: three.fogs[0]!.far,
          });
          throw new Error('staged: the room fails after the camera stood outside it');
        },
      },
    });
    const page = listeningCanvas();
    // a fog that reaches far, so that standing outside the room pushes the far plane past 100
    const settings = {
      ...DEFAULT_SETTINGS,
      scene: { ...DEFAULT_SETTINGS.scene, fog: { ...DEFAULT_SETTINGS.scene.fog, far: 20 } },
    };
    const shelf = mountShelf(page.canvas, [], {
      settings,
      room: { id: DEFAULT_ROOM_ID, entry: ROOMS['reading-corner'] },
    });
    const camera = three.cameras[0]!;
    const fog = three.fogs[0]!;
    const plain = { near: fog.near, far: fog.far };
    expect(camera.far).toBe(100);

    await vi.waitFor(() => {
      expect(disposed).toHaveBeenCalled();
    });

    // outside, the plane and the fog had moved out by the distance outside; taken down, they are back
    expect(seen.outside).toBeGreaterThan(25);
    expect(seen.far).toBeGreaterThan(100);
    expect(seen.fogNear).toBeCloseTo(plain.near + seen.outside, 6);
    expect(seen.fogFar).toBeCloseTo(plain.far + seen.outside, 6);
    expect(camera.far).toBe(100);
    expect({ near: fog.near, far: fog.far }).toEqual(plain);
    shelf.dispose();
  });
});
