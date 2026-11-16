import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PreparedRoom, ROOM_STALL_MS, type RoomHooks, runRoomLoad } from './room-load.ts';

interface Fake extends PreparedRoom {
  readonly disposed: () => number;
  readonly settle: () => void;
}

function fakeRoom(): Fake {
  let resolve: () => void = () => undefined;
  const settled = new Promise<void>((r) => {
    resolve = r;
  });
  let disposed = 0;
  return {
    settled,
    settle: resolve,
    dispose: () => {
      disposed += 1;
    },
    disposed: () => disposed,
  };
}

function harness(): {
  events: string[];
  hooks: RoomHooks<Fake>;
  screen: { update: (s: unknown) => void; done: () => void };
  warn: (m: string) => void;
  warnings: string[];
} {
  const events: string[] = [];
  const warnings: string[] = [];
  return {
    events,
    warnings,
    hooks: {
      add: () => events.push('add'),
      ready: () => events.push('ready'),
      abandon: (room) => events.push(room === undefined ? 'abandon-none' : 'abandon-room'),
    },
    screen: { update: () => events.push('update'), done: () => events.push('lift') },
    warn: (message) => warnings.push(message),
  };
}

describe('runRoomLoad (spec S3, S2.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('puts the room in, dresses it when every texture is on, and only then lifts the screen', async () => {
    const h = harness();
    const room = fakeRoom();
    const run = runRoomLoad({ prepare: () => Promise.resolve(room) }, h.hooks, h.screen, {
      warn: h.warn,
    });
    await vi.advanceTimersByTimeAsync(10);
    // parsed and added, but a texture is still to come: no dressing, no lift
    expect(h.events).toEqual(['add']);
    room.settle();
    await expect(run).resolves.toBe(true);
    expect(h.events).toEqual(['add', 'ready', 'lift']);
    expect(h.warnings).toEqual([]);
  });

  it('draws the plain shelf, with one warning, when the GLB fails to fetch or parse', async () => {
    const h = harness();
    const run = runRoomLoad(
      { prepare: () => Promise.reject(new Error('the GLB did not load: HTTP 404')) },
      h.hooks,
      h.screen,
      { warn: h.warn },
    );
    await expect(run).resolves.toBe(false);
    expect(h.warnings).toEqual(['room: the GLB did not load: HTTP 404; drawing the plain shelf']);
    expect(h.events).toEqual(['abandon-none', 'lift']);
  });

  it('draws the plain shelf when the room is dressed wrongly, and takes the room out', async () => {
    const h = harness();
    const room = fakeRoom();
    room.settle();
    const run = runRoomLoad(
      { prepare: () => Promise.resolve(room) },
      {
        ...h.hooks,
        ready: () => {
          throw new Error('the room has no "view_open" empty');
        },
      },
      h.screen,
      { warn: h.warn },
    );
    await expect(run).resolves.toBe(false);
    expect(h.warnings).toHaveLength(1);
    expect(h.events).toEqual(['add', 'abandon-room', 'lift']);
    expect(room.disposed()).toBe(1);
  });

  it('counts a load that never settled as failed after 60 seconds, however far it got', async () => {
    const h = harness();
    const room = fakeRoom(); // its textures never settle
    const run = runRoomLoad({ prepare: () => Promise.resolve(room) }, h.hooks, h.screen, {
      warn: h.warn,
    });
    await vi.advanceTimersByTimeAsync(ROOM_STALL_MS - 1);
    expect(h.events).toEqual(['add']);
    await vi.advanceTimersByTimeAsync(2);
    await expect(run).resolves.toBe(false);
    expect(h.warnings).toEqual([
      'room: it had not settled after 60 seconds; drawing the plain shelf',
    ]);
    expect(h.events).toEqual(['add', 'abandon-room', 'lift']);
    expect(room.disposed()).toBe(1);
  });

  it('counts a GLB that stalls the same way, and lets go of the room if it ever arrives', async () => {
    const h = harness();
    const late = fakeRoom();
    let arrive: (room: Fake) => void = () => undefined;
    const run = runRoomLoad(
      { prepare: () => new Promise<Fake>((resolve) => (arrive = resolve)) },
      h.hooks,
      h.screen,
      { warn: h.warn },
    );
    await vi.advanceTimersByTimeAsync(ROOM_STALL_MS + 1);
    await expect(run).resolves.toBe(false);
    expect(h.events).toEqual(['abandon-none', 'lift']);
    arrive(late);
    await vi.advanceTimersByTimeAsync(1);
    expect(late.disposed()).toBe(1);
    expect(h.events).not.toContain('add');
  });

  it('ends at once, with no warning, when the page lets go of the shelf mid-load', async () => {
    const h = harness();
    const room = fakeRoom();
    const controller = new AbortController();
    const run = runRoomLoad({ prepare: () => Promise.resolve(room) }, h.hooks, h.screen, {
      warn: h.warn,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await expect(run).resolves.toBe(false);
    expect(h.warnings).toEqual([]);
    expect(h.events).toEqual(['add', 'abandon-room', 'lift']);
    expect(room.disposed()).toBe(1);
  });

  it('warns once, not once per failure, and the stall timer does not outlive the load', async () => {
    const h = harness();
    const room = fakeRoom();
    room.settle();
    const run = runRoomLoad({ prepare: () => Promise.resolve(room) }, h.hooks, h.screen, {
      warn: h.warn,
    });
    await expect(run).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(ROOM_STALL_MS * 2);
    expect(h.warnings).toEqual([]);
    expect(h.events.filter((e) => e === 'lift')).toHaveLength(1);
  });

  it('reports the load’s progress to the screen as it comes', async () => {
    const seen: unknown[] = [];
    const room = fakeRoom();
    room.settle();
    await runRoomLoad(
      {
        prepare: (report) => {
          report({ glbLoaded: 10, glbTotal: 40 });
          return Promise.resolve(room);
        },
      },
      harness().hooks,
      { update: (s) => seen.push(s), done: () => undefined },
      { warn: () => undefined },
    );
    expect(seen).toEqual([
      { glbLoaded: 10, glbTotal: 40, glbDone: false, texLoaded: 0, texTotal: 0 },
    ]);
  });
});
