import type { LoadState } from './room-loading.ts';

/**
 * How a room's load ends (#602, spec S3): the screen lifts onto the room, or onto the plain shelf,
 * and **no failure or stall leaves it up**.
 *
 * No `three` and no DOM, so vitest's node environment runs the rules. `room-assets.ts` is the half
 * that fetches and parses; this is the half that decides what a failure means.
 *
 * - The screen lifts only once every texture the room asked for is applied (S3.2): `ready` is called
 *   after `settled`, and the screen lifts after that.
 * - A texture that fails to load settles, and warns, in the assets half (S3.3): it never reaches here.
 * - A GLB that fails to fetch or parse, a decoder that fails, a room missing data the page needs, and
 *   a load that has not settled `ROOM_STALL_MS` after it began are one failure (S3.4): one warning,
 *   the room taken back out of the scene, and the screen lifted onto the plain shelf (S2.5).
 */

/** A load that has not settled this long after it began counts as failed (spec S3.4). */
export const ROOM_STALL_MS = 60_000;

/** What the assets half hands back once the GLB is parsed and every texture has been asked for. */
export interface PreparedRoom {
  /** Resolves when every texture asked for is applied or has failed; the room is then dressed. */
  readonly settled: Promise<void>;
  /** Lets go of the room's geometry, materials and textures. */
  readonly dispose: () => void;
}

export interface RoomSource<R extends PreparedRoom> {
  /** Fetches and parses the room, reporting progress for the screen's bar. */
  readonly prepare: (report: (state: Partial<LoadState>) => void) => Promise<R>;
}

/** The scene's side of a load. */
export interface RoomHooks<R extends PreparedRoom> {
  /** The room is parsed: it goes into the scene, so its textures upload under the screen. */
  readonly add: (room: R) => void;
  /** Every texture is on: the room's lights, camera and ground are put in, and the screen lifts. */
  readonly ready: (room: R) => void;
  /** The load failed: the room, if it was added, comes out. */
  readonly abandon: (room: R | undefined) => void;
}

/** What the loading screen offers a load. */
export interface ScreenPort {
  update(state: LoadState): void;
  done(): void;
}

export interface RoomLoadOptions {
  readonly stallMs?: number;
  /**
   * The page let go of the shelf this load belongs to (a lost context, a rebuild): the load ends at
   * once, the screen lifts, and nothing is warned, since nothing failed.
   */
  readonly signal?: AbortSignal;
  readonly warn: (message: string) => void;
}

class Left extends Error {}

const BLANK: LoadState = { glbLoaded: 0, glbTotal: 0, glbDone: false, texLoaded: 0, texTotal: 0 };

/** A rejection after `ms`, which `cancel` ends. */
function deadline(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`it had not settled after ${String(Math.round(ms / 1000))} seconds`));
    }, ms);
  });
  promise.catch(() => undefined); // nobody may be waiting when it fires
  return { promise, cancel: () => clearTimeout(timer) };
}

/**
 * Runs one load to its end and says how it ended: true when the room is dressed, false when the page
 * is drawing the plain shelf. It never throws and never leaves the screen up.
 */
export async function runRoomLoad<R extends PreparedRoom>(
  source: RoomSource<R>,
  hooks: RoomHooks<R>,
  screen: ScreenPort,
  options: RoomLoadOptions,
): Promise<boolean> {
  const stall = deadline(options.stallMs ?? ROOM_STALL_MS);
  const state = { ...BLANK };
  const report = (patch: Partial<LoadState>): void => {
    Object.assign(state, patch);
    screen.update({ ...state });
  };
  let room: R | undefined;
  let added = false;
  const preparing = source.prepare(report);
  const left = new Promise<never>((_resolve, reject) => {
    if (options.signal?.aborted === true) reject(new Left());
    options.signal?.addEventListener('abort', () => {
      reject(new Left());
    });
  });
  left.catch(() => undefined);
  try {
    room = await Promise.race([preparing, stall.promise, left]);
    hooks.add(room);
    added = true;
    await Promise.race([room.settled, stall.promise, left]);
    hooks.ready(room);
    return true;
  } catch (error) {
    // Once, whichever failed first; anything that fails later is the plain shelf's business, not ours.
    const reason = error instanceof Error ? error.message : 'unknown failure';
    if (!(error instanceof Left)) options.warn(`room: ${reason}; drawing the plain shelf`);
    try {
      hooks.abandon(added ? room : undefined);
    } finally {
      room?.dispose();
      // A room that arrives after the stall is let go of too, never kept by a load that gave up.
      preparing.then(
        (late) => {
          if (late !== room) late.dispose();
        },
        () => undefined,
      );
    }
    return false;
  } finally {
    stall.cancel();
    screen.done();
  }
}
