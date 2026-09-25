import type { FallbackState, Remembered } from './shadow-fallback.ts';

/**
 * What one page does when its WebGL context is lost while it samples the
 * shadow map: remember, redraw painted, and never try real-time again.
 *
 * A state machine with every effect injected — the timer, the clock, the
 * storage write, the rebuild and the notice — so vitest drives it with fakes
 * and `boot.ts` only wires it up. It holds no DOM and no `three`.
 *
 * ## Why the old restore path could not stay
 *
 * On a restore, three re-runs `initGLContext()` and keeps `shadowMap.enabled`
 * (`WebGLRenderer.js:1111-1131`), so the same sampling programs link again and
 * the page resumes exactly what killed it. On the Pixel that is measured: in two
 * runs the context came back about 1.15 s after the loss and died again after
 * 3,088 and 3,474 more sampling draws. So a restore now rebuilds **painted**.
 *
 * ## Why there is a timer
 *
 * A restore is the rare path — 2 of about 30 runs on that device — because it
 * applies `exit_on_context_lost` and takes the whole GPU process down. A lost
 * canvas hands back the same lost context forever, so when no restore arrives
 * the only way to draw again is a **new** canvas.
 *
 * ## One attempt a page
 *
 * Chrome blocks an origin from WebGL after repeated losses, so the budget is one
 * loss. Once a fallback has started, any further loss only says so.
 *
 * ## A probe redraws and does not remember
 *
 * Redrawing painted and writing the record are two decisions. A loss under a
 * shadow probe — `?shadows=1&receivers=all` above all, the reproduction that
 * dies on the Pixel where the shipped shelf survives — still takes the whole
 * fallback above, because a restore would otherwise resume every book reading
 * the map. It only skips the write, so the probe does not paint the device's
 * plain page for 30 days.
 *
 * ## A program that will not link falls back the same way
 *
 * The default page links the bookcase's PCF program, and on 1 August a painted
 * plane on the Pixel "compiles clean and will not link" under `?shadows=1`. A
 * shelf that samples the map and halts on a link failure is taken exactly like
 * a loss — the record first, unless a probe, then a painted redraw, once — but
 * **at once and on the same canvas**, because nothing was lost: the context is
 * there to draw on, and a restore will never come. A link failure on a painted
 * shelf keeps its halt and its sentence, as does one after a fallback has run.
 */

export type Notice = 'lost' | 'redrawing' | 'clear' | 'failed';

/** Which canvas a rebuild draws on: the restored one, or a new element. */
export type Surface = 'same' | 'fresh';

/** What the page knew at the moment of the loss. */
export interface Loss {
  /** Whether the shelf was sampling the shadow map, from its live settings. */
  readonly sampling: boolean;
  /** A hidden tab makes no draws, so the sampling fault cannot have caused it. */
  readonly visible: boolean;
  /**
   * The lost shelf had halted on a program that would not link, which on some
   * hardware takes the context with it a moment later. `shaderFailed` has
   * already decided that failure, so the loss says nothing of its own.
   */
  readonly shaderFailed: boolean;
  /**
   * The live settings are a shadow probe rather than the shipped shadows
   * (`runsShippedShadows`), so the loss is that probe's answer: the page falls
   * back as it would, and the record is not written.
   */
  readonly probe: boolean;
}

/** What the page knew when a program would not link: the same two facts a loss carries. */
export type ShaderFailure = Pick<Loss, 'sampling' | 'probe'>;

export interface RecoveryOptions {
  readonly waitMs: number;
  /** Milliseconds since the page started — `performance.now()` in the page. */
  readonly now: () => number;
  readonly setTimer: (run: () => void, ms: number) => number;
  readonly clearTimer: (timer: number) => void;
  /** Writes the record. `false`, or a throw, means it was not written. */
  readonly remember: () => boolean;
  /** Disposes the lost shelf and mounts a painted one. `false`, or a throw, means it could not. */
  readonly remount: (surface: Surface) => boolean;
  /** Puts up, or clears, the sentence under the shelf. */
  readonly notify: (notice: Notice, state: FallbackState) => void;
  readonly initial: FallbackState;
}

export interface Recovery {
  /** The shelf's context was lost. */
  lost(loss: Loss): void;
  /**
   * The browser restored the context.
   *
   * `'handled'` means the lost shelf was replaced and must not resume.
   * `'resume'` is the old in-place resume, and it is only ever returned where it
   * is safe: nothing about this page's loss involved the shadow map.
   */
  restored(): 'handled' | 'resume';
  /**
   * A program would not link, and the shelf has halted.
   *
   * ⚠️ **Never from inside three's render**: the redraw disposes the halted
   * renderer, and the failure is reported while that renderer is still walking
   * its render list. `boot.ts` calls this from a microtask.
   */
  shaderFailed(failure: ShaderFailure): void;
  state(): FallbackState;
}

/**
 * The states a fallback has already started from. A loss or a link failure in
 * any of them is not a second chance.
 */
const ATTEMPTED: ReadonlySet<FallbackState['kind']> = new Set([
  'waiting',
  'restored',
  'fresh-canvas',
  'link-failed',
  'refused',
]);

export function createRecovery(options: RecoveryOptions): Recovery {
  let state = options.initial;
  let timer: number | undefined;

  const attempt = <T>(effect: () => T, failed: T): T => {
    try {
      return effect();
    } catch {
      return failed;
    }
  };

  const settle = (next: FallbackState, drawn: boolean): void => {
    state = next;
    options.notify(drawn ? 'clear' : 'failed', state);
  };

  // ⚠️ **The record first, synchronously, before anything else.** On the Pixel
  // the whole GPU process exits with the context, and whatever the page does
  // next may not get to run. A probe asks nothing of storage.
  const rememberUnless = (probe: boolean): Remembered =>
    probe ? 'probe' : attempt(() => options.remember(), false) ? 'yes' : 'refused';

  const timedOut = (): void => {
    if (state.kind !== 'waiting') return;
    const { lostAt, remembered } = state;
    const drawn = attempt(() => options.remount('fresh'), false);
    settle(
      drawn
        ? { kind: 'fresh-canvas', lostAt, waited: options.waitMs, remembered }
        : { kind: 'refused', via: 'fresh', lostAt, remembered },
      drawn,
    );
  };

  return {
    lost(loss: Loss): void {
      // A halted shelf's loss follows its link failure, which `shaderFailed`
      // has already decided — and whatever sentence that left up, the more
      // specific one, is not buried under the generic loss. Before the loop
      // guard, because a painted redraw can halt too.
      if (loss.shaderFailed) return;

      // The loop guard. A page gets one fallback: a second loss after it, or a
      // loss of the painted shelf it drew, only says so.
      if (ATTEMPTED.has(state.kind)) {
        options.notify('lost', state);
        return;
      }

      // Not this fault. Today's behaviour: a notice and nothing written.
      if (!loss.sampling || !loss.visible) {
        options.notify('lost', state);
        return;
      }

      // A probe's loss falls back all the same.
      const remembered = rememberUnless(loss.probe);
      state = { kind: 'waiting', lostAt: options.now(), remembered };
      options.notify('redrawing', state);
      timer = options.setTimer(timedOut, options.waitMs);
    },

    restored(): 'handled' | 'resume' {
      if (state.kind !== 'waiting') return 'resume';

      if (timer !== undefined) options.clearTimer(timer);
      const { lostAt, remembered } = state;
      const restoredAfter = options.now() - lostAt;
      const drawn = attempt(() => options.remount('same'), false);
      settle(
        drawn
          ? { kind: 'restored', lostAt, restoredAfter, remembered }
          : { kind: 'refused', via: 'same', lostAt, remembered },
        drawn,
      );
      return 'handled';
    },

    shaderFailed(failure: ShaderFailure): void {
      // One attempt a page, and a painted shelf's link failure is not this
      // fault: both keep the halt and the shader's sentence.
      if (ATTEMPTED.has(state.kind) || !failure.sampling) return;

      const remembered = rememberUnless(failure.probe);
      const failedAt = options.now();
      // The same canvas, now: the context was not lost, so there is nothing to
      // wait for and no reason to ask the browser for another.
      const drawn = attempt(() => options.remount('same'), false);
      settle(
        drawn
          ? { kind: 'link-failed', failedAt, remembered }
          : { kind: 'refused', via: 'link-failed', lostAt: failedAt, remembered },
        drawn,
      );
    },

    state(): FallbackState {
      return state;
    },
  };
}
