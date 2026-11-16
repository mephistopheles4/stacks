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
 * set.
 *
 * **A worker that starts and never answers is a failure too.** Where a browser applies the page's
 * policy to the worker and not its own, the transcoder's eval is refused inside the worker: nothing
 * reaches the page, no `error` event fires, and every transcode waits for ever (measured in a real
 * Chrome). So the first worker's first message is waited for `KTX2_STALL_MS`, and silence is a
 * failure, which is how spec S6.10's fallback to WebP happens there.
 */

/** How long the first KTX2 worker may stay silent before KTX2 is given up for this page load. */
export const KTX2_STALL_MS = 15_000;

/** KTX2Loader's own members, which its types leave out. */
export interface Ktx2Members {
  transcoderPending: Promise<void> | null;
  workerConfig: unknown;
  workerPool: { setWorkerCreator(create: () => WorkerLike): void };
  init(): Promise<void>;
  loadAsync(url: string): Promise<THREE.CompressedTexture>;
  dispose(): void;
}

/** The part of a `Worker` this file uses, so a test can stand one in. */
export interface WorkerLike {
  addEventListener(type: 'error' | 'messageerror' | 'message', listener: () => void): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

export interface OwnWorkerOptions {
  readonly workerUrl: string;
  readonly wasmUrl: string;
  readonly fetchWasm: (url: string) => Promise<ArrayBuffer>;
  readonly makeWorker: (url: string) => WorkerLike;
  /** Defaults to `KTX2_STALL_MS`. */
  readonly stallMs?: number;
}

export interface Ktx2Textures {
  /** One KTX2 file as a texture, rejecting if the worker could not start or died. */
  readonly load: (url: string) => Promise<THREE.CompressedTexture>;
  /** Ends the transcoder workers this loader started. */
  readonly dispose: () => void;
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

  // Armed when the first worker starts, and put down by the first message any worker sends. A load
  // settling is not an answer: a 404 on the KTX2 file rejects without a worker having said a word.
  let stall: ReturnType<typeof setTimeout> | undefined;
  let answered = false;
  const answer = (): void => {
    answered = true;
    clearTimeout(stall);
  };

  // Once the room is disposed nothing may start a worker: a load or a wasm fetch still in flight
  // would otherwise start one after `loader.dispose()` ended the others, with no owner to end it.
  let disposed = false;

  loader.init = () => {
    loader.transcoderPending ??= options.fetchWasm(options.wasmUrl).then(
      (binary) => {
        if (disposed) return;
        loader.workerPool.setWorkerCreator(() => {
          if (disposed) throw new Error('the KTX2 loader was disposed');
          const worker = options.makeWorker(options.workerUrl);
          if (!answered) {
            clearTimeout(stall);
            stall = setTimeout(() => {
              fail(new Error('the KTX2 worker did not answer'));
            }, options.stallMs ?? KTX2_STALL_MS);
          }
          worker.addEventListener('message', answer);
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

  return {
    load: (url) =>
      disposed
        ? Promise.reject(new Error('the KTX2 loader was disposed'))
        : Promise.race([loader.loadAsync(url), failed]),
    dispose: () => {
      disposed = true;
      loader.dispose();
    },
  };
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
  return ownWorkerTextures(loader, ktx2Options(manager));
}

/**
 * What the room hands `ownWorkerTextures`: the two same-origin files and a plain `Worker` started
 * from the first, never from a `blob:` URL. Apart from `ktx2Textures` so a test can read it.
 */
export function ktx2Options(manager: THREE.LoadingManager): OwnWorkerOptions {
  return {
    workerUrl: KTX2_WORKER_URL,
    wasmUrl: KTX2_WASM_URL,
    // `setResponseType('arraybuffer')` makes `FileLoader` resolve an ArrayBuffer; its type says
    // `string | ArrayBuffer` for every response type.
    fetchWasm: (url) =>
      new THREE.FileLoader(manager)
        .setResponseType('arraybuffer')
        .loadAsync(url) as Promise<ArrayBuffer>,
    makeWorker: (url) => new Worker(url),
  };
}
