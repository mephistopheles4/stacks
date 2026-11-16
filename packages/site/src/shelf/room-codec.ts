/**
 * Which texture set the room reads, and what happens when the compressed one fails (#601, spec S5).
 *
 * Every baked atlas and light map ships twice, as WebP and as KTX2 ETC1S, and a visitor downloads
 * one. KTX2 is the target: about 190 MB of GPU memory against about 1.5 GB for the WebPs unpacked,
 * for 8 MB more download. **WebP stays the default until the owner flips the constant below** to
 * `'etc1s'`, by a typed word, in a commit of its own, after the device matrix passes (S5.2, S13).
 *
 * No `three` import and no DOM, so vitest's node environment runs every rule here. The room loader
 * (#593's T3) wires it; `room-ktx2.ts` holds the three half.
 */

/** The two texture sets. `etc1s` is KTX2, ETC1S-compressed, transcoded on the device. */
export type RoomCodec = 'webp' | 'etc1s';

/**
 * The default set, and the one rollback lever for KTX2 (spec S19): setting it back to `'webp'`
 * puts every visitor on the WebPs without a revert.
 */
export const DEFAULT_ROOM_CODEC: RoomCodec = 'webp';

/**
 * The worker and the wasm the page hands it, served from `public/rooms/basis/`. **Same-origin files
 * and never `blob:` URLs**: a worker loaded from a URL takes its policy from its own response
 * (`public/_headers`), where a `blob:` worker takes the page's. G20 holds these two paths equal to
 * the ones `scripts/lib/public-build.ts` pins in `_headers`.
 */
export const KTX2_WORKER_URL = '/rooms/basis/ktx2-worker.js';
export const KTX2_WASM_URL = '/rooms/basis/basis_transcoder.wasm';

/**
 * `?tex=webp` and `?tex=etc1s` choose the set for one page load. Any other value, an absent one
 * and an empty one are ignored, and nothing persists (spec S5.3).
 */
export function chooseCodec(search: string, fallback: RoomCodec = DEFAULT_ROOM_CODEC): RoomCodec {
  const asked = new URLSearchParams(search).get('tex');
  return asked === 'webp' || asked === 'etc1s' ? asked : fallback;
}

/** One page load's codec, which can only move from KTX2 to WebP, once, with one warning. */
export interface CodecSession {
  /** The set to read now. */
  readonly codec: () => RoomCodec;
  /** KTX2 failed on this device: drop to WebP for the rest of the page load and warn once. */
  readonly fail: (reason: string) => void;
}

export function codecSession(initial: RoomCodec, warn: (message: string) => void): CodecSession {
  let current = initial;
  return {
    codec: () => current,
    fail: (reason) => {
      if (current === 'webp') return;
      current = 'webp';
      warn(`room: KTX2 textures failed (${reason}); using the WebP set for this page load`);
    },
  };
}

/**
 * Loads one thing through the session's codec. A KTX2 failure, whether the worker would not start
 * or a transcode failed, drops the session to WebP and tries the WebP set once; a WebP failure is
 * the caller's (S3.3 counts it settled and warns). A load that started on KTX2 and fails after
 * another has already dropped the session goes straight to WebP, without a second warning.
 */
export async function loadWithFallback<T>(
  session: CodecSession,
  load: (codec: RoomCodec) => Promise<T>,
): Promise<T> {
  const first = session.codec();
  try {
    return await load(first);
  } catch (error) {
    if (first === 'webp') throw error;
    session.fail(error instanceof Error ? error.message : 'transcode failed');
    return load('webp');
  }
}
