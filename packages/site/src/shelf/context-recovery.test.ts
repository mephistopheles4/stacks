import { describe, expect, it } from 'vitest';
import {
  createRecovery,
  type Loss,
  type Notice,
  type Recovery,
  type ShaderFailure,
  type Surface,
} from './context-recovery.ts';
import type { FallbackState } from './shadow-fallback.ts';

/**
 * One page's lost context, driven with fakes.
 *
 * The real losses these stand in for cannot run here: a `WEBGL_lose_context`
 * loss never exits a GPU process and never blocks an origin, and a real driver
 * loss happens on one phone. What a unit test can hold is the page's side — the
 * order of the effects, the one attempt, and what a loss that is not this fault
 * leaves alone — and each of those is a line whose removal still draws a shelf.
 */

const WAIT = 2500;
const SAMPLING: Loss = { sampling: true, visible: true, shaderFailed: false, probe: false };

interface Harness {
  readonly recovery: Recovery;
  /** Every effect, in the order it happened. */
  readonly calls: string[];
  /** Runs the pending timer, as if `ms` had passed. */
  advance(ms: number): void;
  pendingTimers(): number;
  /** Moves the page clock. */
  tick(ms: number): void;
}

function harness(
  options: {
    remember?: () => boolean;
    remount?: (surface: Surface) => boolean;
    initial?: FallbackState;
  } = {},
): Harness {
  const calls: string[] = [];
  let clock = 10_000;
  let nextId = 1;
  const timers = new Map<number, { run: () => void; at: number }>();

  const recovery = createRecovery({
    waitMs: WAIT,
    now: () => clock,
    setTimer: (run, ms) => {
      const id = nextId++;
      timers.set(id, { run, at: clock + ms });
      calls.push(`setTimer ${String(ms)}`);
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
      calls.push('clearTimer');
    },
    remember: () => {
      calls.push('remember');
      return options.remember === undefined ? true : options.remember();
    },
    remount: (surface) => {
      calls.push(`remount ${surface}`);
      return options.remount === undefined ? true : options.remount(surface);
    },
    notify: (notice: Notice, state: FallbackState) => {
      calls.push(`notify ${notice} (${state.kind})`);
    },
    initial: options.initial ?? { kind: 'none' },
  });

  return {
    recovery,
    calls,
    advance(ms) {
      clock += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at > clock) continue;
        timers.delete(id);
        timer.run();
      }
    },
    pendingTimers: () => timers.size,
    tick(ms) {
      clock += ms;
    },
  };
}

const remounts = (calls: readonly string[]): string[] =>
  calls.filter((call) => call.startsWith('remount'));

describe('a loss while the shelf samples the shadow map', () => {
  it('remembers first, then says so, then waits — before any rebuild', () => {
    const h = harness();
    h.recovery.lost(SAMPLING);

    expect(h.calls).toEqual(['remember', 'notify redrawing (waiting)', `setTimer ${String(WAIT)}`]);
    expect(h.recovery.state()).toEqual({ kind: 'waiting', lostAt: 10_000, remembered: 'yes' });
  });

  it('rebuilds on the same canvas once, when the browser restores within the wait', () => {
    const h = harness();
    h.recovery.lost(SAMPLING);
    h.tick(1150);

    expect(h.recovery.restored()).toBe('handled');
    expect(h.calls.slice(3)).toEqual(['clearTimer', 'remount same', 'notify clear (restored)']);
    expect(h.recovery.state()).toEqual({
      kind: 'restored',
      lostAt: 10_000,
      restoredAfter: 1150,
      remembered: 'yes',
    });
    expect(h.pendingTimers()).toBe(0);

    // The timer was cleared, so the wait running out changes nothing.
    h.advance(WAIT);
    expect(remounts(h.calls)).toEqual(['remount same']);
  });

  it('rebuilds on a new canvas once the wait runs out, and ignores a late restore', () => {
    const h = harness();
    h.recovery.lost(SAMPLING);

    h.advance(WAIT - 1);
    expect(remounts(h.calls)).toEqual([]);

    h.advance(1);
    expect(remounts(h.calls)).toEqual(['remount fresh']);
    expect(h.calls.at(-1)).toBe('notify clear (fresh-canvas)');
    expect(h.recovery.state()).toEqual({
      kind: 'fresh-canvas',
      lostAt: 10_000,
      waited: WAIT,
      remembered: 'yes',
    });

    // A restore after the swap: the painted shelf is what is running now, so
    // resuming it in place is safe, and nothing is rebuilt again.
    expect(h.recovery.restored()).toBe('resume');
    expect(remounts(h.calls)).toEqual(['remount fresh']);
  });

  it('says it failed when the new canvas gets no context, and never tries again', () => {
    const h = harness({ remount: () => false });
    h.recovery.lost(SAMPLING);
    h.advance(WAIT);

    expect(h.calls.at(-1)).toBe('notify failed (refused)');
    expect(h.recovery.state()).toEqual({
      kind: 'refused',
      via: 'fresh',
      lostAt: 10_000,
      remembered: 'yes',
    });

    h.recovery.lost(SAMPLING);
    expect(h.recovery.restored()).toBe('resume');
    h.advance(WAIT * 2);
    expect(remounts(h.calls)).toEqual(['remount fresh']);
  });

  it('turns a throw inside the restored rebuild into a failure notice', () => {
    const h = harness({
      remount: () => {
        throw new Error('Error creating WebGL context.');
      },
    });
    h.recovery.lost(SAMPLING);

    expect(h.recovery.restored()).toBe('handled');
    expect(h.calls.at(-1)).toBe('notify failed (refused)');
    expect(h.recovery.state()).toMatchObject({ kind: 'refused', via: 'same' });
  });

  it('still rebuilds when the record could not be written, and says it is not remembered', () => {
    const h = harness({
      remember: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    h.recovery.lost(SAMPLING);
    h.advance(WAIT);

    expect(remounts(h.calls)).toEqual(['remount fresh']);
    expect(h.recovery.state()).toMatchObject({ kind: 'fresh-canvas', remembered: 'refused' });
  });

  it('carries a refused write the same way', () => {
    const h = harness({ remember: () => false });
    h.recovery.lost(SAMPLING);
    expect(h.recovery.state()).toMatchObject({ kind: 'waiting', remembered: 'refused' });
  });
});

describe('a loss under a shadow probe', () => {
  // `?shadows=1&receivers=all`, the upstream reproduction, dies on the Pixel
  // where the shipped shelf survives. Its loss is the probe's answer: the page
  // falls back exactly as it would, and the device's plain page is not painted
  // for 30 days on the strength of it.
  const PROBE: Loss = { ...SAMPLING, probe: true };

  it('says so and waits, and never asks storage', () => {
    const h = harness();
    h.recovery.lost(PROBE);

    expect(h.calls).toEqual(['notify redrawing (waiting)', `setTimer ${String(WAIT)}`]);
    expect(h.recovery.state()).toEqual({ kind: 'waiting', lostAt: 10_000, remembered: 'probe' });
  });

  it('still rebuilds painted on a restore, rather than resuming every book reading the map', () => {
    const h = harness();
    h.recovery.lost(PROBE);
    h.tick(1150);

    expect(h.recovery.restored()).toBe('handled');
    expect(remounts(h.calls)).toEqual(['remount same']);
    expect(h.recovery.state()).toEqual({
      kind: 'restored',
      lostAt: 10_000,
      restoredAfter: 1150,
      remembered: 'probe',
    });
  });

  it('keeps the one attempt when the new canvas is refused', () => {
    const h = harness({ remount: () => false });
    h.recovery.lost(PROBE);
    h.advance(WAIT);

    expect(h.recovery.state()).toEqual({
      kind: 'refused',
      via: 'fresh',
      lostAt: 10_000,
      remembered: 'probe',
    });

    h.recovery.lost(PROBE);
    expect(h.recovery.restored()).toBe('resume');
    h.advance(WAIT * 2);
    expect(remounts(h.calls)).toEqual(['remount fresh']);
    expect(h.calls).not.toContain('remember');
    expect(h.calls.at(-1)).toBe('notify lost (refused)');
  });
});

describe('one attempt a page', () => {
  it('meets a second loss after the fallback with a notice and nothing else', () => {
    const h = harness();
    h.recovery.lost(SAMPLING);
    h.recovery.restored();
    const before = h.calls.length;

    h.recovery.lost(SAMPLING);
    expect(h.calls.slice(before)).toEqual(['notify lost (restored)']);
    expect(remounts(h.calls)).toEqual(['remount same']);
    expect(h.calls.filter((call) => call === 'remember')).toHaveLength(1);
    expect(h.pendingTimers()).toBe(0);

    // ...and the painted shelf's own restore resumes in place.
    expect(h.recovery.restored()).toBe('resume');
    expect(remounts(h.calls)).toEqual(['remount same']);
  });

  it('meets a second loss after a new canvas the same way', () => {
    const h = harness();
    h.recovery.lost(SAMPLING);
    h.advance(WAIT);
    h.recovery.lost(SAMPLING);
    h.advance(WAIT);

    expect(remounts(h.calls)).toEqual(['remount fresh']);
    expect(h.calls.filter((call) => call === 'remember')).toHaveLength(1);
    expect(h.calls.at(-1)).toBe('notify lost (fresh-canvas)');
  });
});

describe('a program that will not link while the shelf samples the map', () => {
  // The default page links the bookcase's PCF program, and on 1 August a
  // painted plane on the Pixel "compiles clean and will not link" under
  // `?shadows=1`. Halting there wrote nothing, so every load died the same way.
  const SHIPPED: ShaderFailure = { sampling: true, probe: false };

  it('remembers first, then redraws painted on the same canvas at once', () => {
    // The context is alive: nothing was lost, so there is no restore to wait for.
    const h = harness();
    h.recovery.shaderFailed(SHIPPED);

    expect(h.calls).toEqual(['remember', 'remount same', 'notify clear (link-failed)']);
    expect(h.recovery.state()).toEqual({
      kind: 'link-failed',
      failedAt: 10_000,
      remembered: 'yes',
    });
    expect(h.pendingTimers()).toBe(0);
  });

  it('redraws a probe painted too, and asks nothing of storage', () => {
    const h = harness();
    h.recovery.shaderFailed({ ...SHIPPED, probe: true });

    expect(h.calls).toEqual(['remount same', 'notify clear (link-failed)']);
    expect(h.recovery.state()).toMatchObject({ kind: 'link-failed', remembered: 'probe' });
  });

  it('says it failed when the painted redraw gets no shelf, and never tries again', () => {
    const h = harness({ remount: () => false });
    h.recovery.shaderFailed(SHIPPED);

    expect(h.calls.at(-1)).toBe('notify failed (refused)');
    expect(h.recovery.state()).toEqual({
      kind: 'refused',
      via: 'link-failed',
      lostAt: 10_000,
      remembered: 'yes',
    });

    h.recovery.shaderFailed(SHIPPED);
    expect(remounts(h.calls)).toEqual(['remount same']);
  });

  it('keeps the halt and its sentence for a painted shelf: no record, no redraw', () => {
    const h = harness();
    h.recovery.shaderFailed({ ...SHIPPED, sampling: false });

    expect(h.calls).toEqual([]);
    expect(h.recovery.state()).toEqual({ kind: 'none' });
  });

  it('keeps the halt after a fallback has run: one attempt a page', () => {
    const h = harness();
    h.recovery.lost(SAMPLING);
    h.recovery.restored();
    const before = h.calls.length;

    h.recovery.shaderFailed(SHIPPED);
    expect(h.calls.slice(before)).toEqual([]);
  });

  it('meets a loss of the painted redraw with a notice and nothing else', () => {
    const h = harness();
    h.recovery.shaderFailed(SHIPPED);
    const before = h.calls.length;

    h.recovery.lost({ ...SAMPLING, sampling: false });
    expect(h.calls.slice(before)).toEqual(['notify lost (link-failed)']);
    expect(h.recovery.restored()).toBe('resume');
  });

  it('lets a halted shelf’s loss keep the shader’s sentence, even after a fallback', () => {
    // The painted redraw halting too, then taking its context with it: the
    // generic loss sentence would bury the only useful one.
    const h = harness();
    h.recovery.lost(SAMPLING);
    h.recovery.restored();
    const before = h.calls.length;

    h.recovery.lost({ ...SAMPLING, sampling: false, shaderFailed: true });
    expect(h.calls.slice(before)).toEqual([]);
  });
});

describe('a loss that is not this fault', () => {
  it('writes nothing for a painted shelf, and lets its restore resume in place', () => {
    const h = harness();
    h.recovery.lost({ ...SAMPLING, sampling: false });

    expect(h.calls).toEqual(['notify lost (none)']);
    expect(h.recovery.restored()).toBe('resume');
    expect(h.calls).toEqual(['notify lost (none)']);
    expect(h.recovery.state()).toEqual({ kind: 'none' });
  });

  it('writes nothing and rebuilds nothing for a hidden page', () => {
    const h = harness();
    h.recovery.lost({ ...SAMPLING, visible: false });
    h.advance(WAIT * 2);

    expect(h.calls).toEqual(['notify lost (none)']);
    expect(h.recovery.restored()).toBe('resume');
  });

  it('keeps the shader message: no record, no rebuild and no lost notice', () => {
    const h = harness();
    h.recovery.lost({ ...SAMPLING, shaderFailed: true });
    h.advance(WAIT * 2);

    expect(h.calls).toEqual([]);
    expect(h.recovery.restored()).toBe('resume');
  });

  it('keeps the state it was given at load', () => {
    const h = harness({ initial: { kind: 'remembered', at: 1 } });
    h.recovery.lost({ ...SAMPLING, sampling: false });
    expect(h.recovery.state()).toEqual({ kind: 'remembered', at: 1 });
  });
});
