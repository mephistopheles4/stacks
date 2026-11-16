import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KTX2_WASM_URL, KTX2_WORKER_URL } from './room-codec.ts';
import {
  ktx2Options,
  KTX2_STALL_MS,
  ownWorkerTextures,
  type Ktx2Members,
  type WorkerLike,
} from './room-ktx2.ts';

type Listener = () => void;

/** A worker that records what the page told it and lets a test make it fail. */
class FakeWorker implements WorkerLike {
  readonly listeners: Record<string, Listener[]> = {};
  readonly posted: { message: unknown; transfer: Transferable[] }[] = [];
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: Listener): void {
    (this.listeners[type] ??= []).push(listener);
  }
  postMessage(message: unknown, transfer: Transferable[]): void {
    this.posted.push({ message, transfer });
  }
  emit(type: string): void {
    for (const listener of this.listeners[type] ?? []) listener();
  }
}

function harness(options: { wasm?: () => Promise<ArrayBuffer> } = {}) {
  const workers: FakeWorker[] = [];
  const loadAsync = vi.fn<(url: string) => Promise<THREE.CompressedTexture>>();
  let create: (() => WorkerLike) | undefined;
  const wasm = new Uint8Array([0, 97, 115, 109]).buffer;
  const loader: Ktx2Members = {
    transcoderPending: null,
    workerConfig: { astcSupported: true },
    workerPool: {
      setWorkerCreator: (creator) => {
        create = creator;
      },
    },
    init: () => Promise.reject(new Error("three's own init, which builds a blob: worker")),
    loadAsync,
    dispose: () => undefined,
  };
  const fetchWasm = vi.fn(options.wasm ?? (() => Promise.resolve(wasm)));
  const makeWorker = vi.fn((url: string) => {
    const worker = new FakeWorker(url);
    workers.push(worker);
    return worker;
  });
  const textures = ownWorkerTextures(loader, {
    workerUrl: KTX2_WORKER_URL,
    wasmUrl: KTX2_WASM_URL,
    fetchWasm,
    makeWorker,
  });
  return {
    loader,
    loadAsync,
    textures,
    fetchWasm,
    makeWorker,
    workers,
    wasm,
    startWorker: (): WorkerLike => {
      if (create === undefined) throw new Error('the pool has no worker creator yet');
      return create();
    },
  };
}

describe('the room’s own wiring (spec S6.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts a plain Worker from the same-origin file and fetches the wasm from the same-origin constant', () => {
    const started: string[] = [];
    vi.stubGlobal(
      'Worker',
      class {
        constructor(url: string) {
          started.push(url);
        }
      },
    );
    const options = ktx2Options(new THREE.LoadingManager());

    options.makeWorker(options.workerUrl);

    expect(options.workerUrl).toBe(KTX2_WORKER_URL);
    expect(options.wasmUrl).toBe(KTX2_WASM_URL);
    expect(started).toEqual([KTX2_WORKER_URL]);
    expect(started[0]).not.toMatch(/^blob:/);
  });
});

describe('the KTX2 worker is a file of its own (spec S6.2)', () => {
  it('replaces three’s init, which would start a blob: worker', async () => {
    const h = harness();
    await expect(h.loader.init()).resolves.toBeUndefined();
    expect(h.fetchWasm).toHaveBeenCalledWith(KTX2_WASM_URL);
  });

  it('fetches the wasm once however many loads and workers follow', async () => {
    const h = harness();
    await Promise.all([h.loader.init(), h.loader.init()]);
    h.startWorker();
    h.startWorker();
    expect(h.fetchWasm).toHaveBeenCalledTimes(1);
  });

  it('starts each worker from the same-origin file and posts it the wasm, because it may fetch nothing', async () => {
    const h = harness();
    await h.loader.init();
    const first = h.startWorker() as FakeWorker;
    const second = h.startWorker() as FakeWorker;

    expect(h.makeWorker.mock.calls).toEqual([[KTX2_WORKER_URL], [KTX2_WORKER_URL]]);
    for (const worker of [first, second]) {
      const [init] = worker.posted;
      expect(init?.message).toMatchObject({
        type: 'init',
        config: { astcSupported: true },
      });
      const bytes = (init?.message as { transcoderBinary: ArrayBuffer }).transcoderBinary;
      expect([...new Uint8Array(bytes)]).toEqual([0, 97, 115, 109]);
      expect(init?.transfer).toEqual([bytes]);
    }
    // Each worker gets a copy of its own: transferring one buffer would empty it for the next.
    const a = (first.posted[0]?.message as { transcoderBinary: ArrayBuffer }).transcoderBinary;
    const b = (second.posted[0]?.message as { transcoderBinary: ArrayBuffer }).transcoderBinary;
    expect(a).not.toBe(b);
  });
});

describe('a failure rejects the load and never leaves it pending (spec S5.4)', () => {
  it.each(['error', 'messageerror'])(
    'rejects every pending load when a worker fires %s',
    async (type) => {
      const h = harness();
      const texture = {} as THREE.CompressedTexture;
      h.loadAsync.mockImplementation((url) =>
        url === 'fine.ktx2' ? Promise.resolve(texture) : new Promise(() => undefined),
      );
      await h.loader.init();
      const worker = h.startWorker() as FakeWorker;

      await expect(h.textures.load('fine.ktx2')).resolves.toBe(texture);

      const pending = h.textures.load('stuck.ktx2');
      worker.emit(type);
      await expect(pending).rejects.toThrow(/KTX2 worker/);
    },
  );

  it('rejects a load that starts after the worker died', async () => {
    const h = harness();
    h.loadAsync.mockReturnValue(new Promise(() => undefined));
    await h.loader.init();
    (h.startWorker() as FakeWorker).emit('error');
    await expect(h.textures.load('late.ktx2')).rejects.toThrow(/KTX2 worker/);
  });

  it('rejects when the wasm does not load, for the load that asked and every later one', async () => {
    const h = harness({ wasm: () => Promise.reject(new Error('404')) });
    h.loadAsync.mockImplementation(() => h.loader.init() as never);

    await expect(h.textures.load('a.ktx2')).rejects.toThrow(/wasm did not load/);
    expect(h.fetchWasm).toHaveBeenCalledTimes(1);

    // A load that never reaches the transcoder is still answered, by the failure itself.
    h.loadAsync.mockReturnValue(new Promise(() => undefined));
    await expect(h.textures.load('b.ktx2')).rejects.toThrow(/wasm did not load/);
    expect(h.fetchWasm).toHaveBeenCalledTimes(1);
  });

  describe('a worker that starts and never answers (spec S6.10)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('is a failure once the first worker has been silent for the stall time', async () => {
      vi.useFakeTimers();
      const h = harness();
      h.loadAsync.mockReturnValue(new Promise(() => undefined));
      await h.loader.init();
      h.startWorker();

      let state = 'pending';
      const pending = h.textures.load('stuck.ktx2').catch((error: unknown) => {
        state = error instanceof Error ? error.message : 'other';
      });
      await vi.advanceTimersByTimeAsync(KTX2_STALL_MS - 1);
      expect(state).toBe('pending');
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(state).toMatch(/did not answer/);
    });

    it('is put down by the first message from a worker, so a slow later texture is not a failure', async () => {
      vi.useFakeTimers();
      const h = harness();
      h.loadAsync.mockResolvedValueOnce({} as THREE.CompressedTexture);
      await h.loader.init();
      const worker = h.startWorker() as FakeWorker;
      worker.emit('message');
      await h.textures.load('first.ktx2');

      h.loadAsync.mockReturnValue(new Promise(() => undefined));
      let state = 'pending';
      h.textures.load('slow.ktx2').then(
        () => (state = 'resolved'),
        () => (state = 'rejected'),
      );
      await vi.advanceTimersByTimeAsync(KTX2_STALL_MS * 4);
      expect(state).toBe('pending');
    });

    it('does not count a rejected load as an answer: a 404 says nothing of the worker', async () => {
      vi.useFakeTimers();
      const h = harness();
      h.loadAsync.mockRejectedValueOnce('http 404');
      await h.loader.init();
      h.startWorker();
      await expect(h.textures.load('missing.ktx2')).rejects.toBe('http 404');

      h.loadAsync.mockReturnValue(new Promise(() => undefined));
      let state = 'pending';
      const next = h.textures.load('next.ktx2').catch((error: unknown) => {
        state = error instanceof Error ? error.message : 'other';
      });
      await vi.advanceTimersByTimeAsync(KTX2_STALL_MS);
      await next;
      expect(state).toMatch(/did not answer/);
    });
  });

  it('gives a load its own failure when three rejects it, a transcode that failed', async () => {
    const h = harness();
    h.loadAsync.mockRejectedValue('transcode: bad file');
    await expect(h.textures.load('bad.ktx2')).rejects.toBe('transcode: bad file');
  });
});
