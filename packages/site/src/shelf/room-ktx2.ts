import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { KTX2_WASM_URL, KTX2_WORKER_URL } from './room-codec.ts';

/**
 * three's KTX2Loader, with its transcoder worker started from a file of its own (#601, spec S6).
 *
 * `KTX2Loader.init()` builds the worker from a `blob:` URL, and a `blob:` worker takes the page's
 * Content-Security-Policy. The transcoder's glue builds functions with `new Function`, which that
 * policy refuses, so the room would draw white. This starts the worker from
 * `public/rooms/basis/ktx2-worker.js`, a same-origin file (`make_ktx2_worker.mjs` writes it), whose
 * policy comes from its own response: `public/_headers` allows eval to that path alone, with
 * `default-src 'none'` so the worker can reach nothing. **That is why the page fetches the wasm and
 * posts the bytes in**: the worker may fetch no file itself. The page keeps no `'unsafe-eval'`.
 *
 * **A failure here must not hang a texture.** three's `WorkerPool.postMessage` promise never
 * rejects, so a worker that will not start, or dies, leaves every transcode pending for ever; it is
 * turned into a rejection here, and `loadWithFallback` (`room-codec.ts`) answers it with the WebP
 * set. A transcoder that starts and never answers is the loading screen's 60 seconds (S3.4).
 */

/** KTX2Loader's own members, which its types leave out. */
export interface Ktx2Members {
  transcoderPending: Promise<void> | null;
  workerConfig: unknown;
  workerPool: { setWorkerCreator(create: () => WorkerLike): void };
  init(): Promise<void>;
  loadAsync(url: string): Promise<THREE.CompressedTexture>;
}

/** The part of a `Worker` this file uses, so a test can stand one in. */
export interface WorkerLike {
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

export interface OwnWorkerOptions {
  readonly workerUrl: string;
  readonly wasmUrl: string;
  readonly fetchWasm: (url: string) => Promise<ArrayBuffer>;
  readonly makeWorker: (url: string) => WorkerLike;
}

export interface Ktx2Textures {
  /** One KTX2 file as a texture, rejecting if the worker could not start or died. */
  readonly load: (url: string) => Promise<THREE.CompressedTexture>;
}

/**
 * Points `loader` at the worker file and returns the loader's `load`, raced against the worker's
 * failure. The wasm is fetched once, on the first load, and a fresh copy of the bytes is posted to
 * each worker the pool starts.
 */
export function ownWorkerTextures(loader: Ktx2Members, options: OwnWorkerOptions): Ktx2Textures {
  let fail!: (error: Error) => void;
  const failed = new Promise<never>((_resolve, reject) => {
    fail = reject;
  });
  // Nobody may be loading when the worker dies, and a rejection nobody awaits is not an error.
  failed.catch(() => undefined);

  loader.init = () => {
    loader.transcoderPending ??= options.fetchWasm(options.wasmUrl).then(
      (binary) => {
        loader.workerPool.setWorkerCreator(() => {
          const worker = options.makeWorker(options.workerUrl);
          worker.addEventListener('error', () => {
            fail(new Error('the KTX2 worker failed'));
          });
          worker.addEventListener('messageerror', () => {
            fail(new Error('the KTX2 worker sent a message that could not be read'));
          });
          const transcoderBinary = binary.slice(0);
          worker.postMessage({ type: 'init', config: loader.workerConfig, transcoderBinary }, [
            transcoderBinary,
          ]);
          return worker;
        });
      },
      (error: unknown) => {
        fail(new Error('the transcoder wasm did not load'));
        throw error instanceof Error ? error : new Error('the transcoder wasm did not load');
      },
    );
    return loader.transcoderPending;
  };

  return { load: (url) => Promise.race([loader.loadAsync(url), failed]) };
}

/**
 * The room's KTX2 loader for `renderer`, reading which compressed format the GPU knows from it
 * (`detectSupport`); a GPU that knows none gets plain RGBA from the transcoder.
 */
export function ktx2Textures(
  manager: THREE.LoadingManager,
  renderer: THREE.WebGLRenderer,
): Ktx2Textures {
  const loader = new KTX2Loader(manager).detectSupport(renderer);
  return ownWorkerTextures(loader, {
    workerUrl: KTX2_WORKER_URL,
    wasmUrl: KTX2_WASM_URL,
    // `setResponseType('arraybuffer')` makes `FileLoader` resolve an ArrayBuffer; its type says
    // `string | ArrayBuffer` for every response type.
    fetchWasm: (url) =>
      new THREE.FileLoader(manager)
        .setResponseType('arraybuffer')
        .loadAsync(url) as Promise<ArrayBuffer>,
    makeWorker: (url) => new Worker(url),
  });
}
