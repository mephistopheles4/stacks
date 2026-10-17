/**
 * The pure half of `smoke:render`'s settle helper: "the shelf has finished
 * loading" is two things, and this is the second.
 *
 * 1. No image request for a cover or a woodwork sheet is in flight. The gate
 *    counts that from the node side, off puppeteer's request events.
 * 2. The renderer's texture and program counts have held still for
 *    `SETTLE_FRAMES` consecutive frames. The page records one reading per
 *    animation frame (`RECORD_SETTLE_READINGS`) and the gate hands the list here.
 *
 * Kept free of puppeteer and of the page so it can be specced in Node.
 */

/** Frames the readings must hold still. A local probe found them final by the first. */
export const SETTLE_FRAMES = 10;

/**
 * The length of the run of equal readings a list ends in: 3 for
 * `['a', 'b', 'b', 'b']`. A reading that moved restarts the run, even back to a
 * value seen before, because "unchanged" is about consecutive frames.
 */
export function framesUnchanged(readings: readonly string[]): number {
  const last = readings.at(-1);
  if (last === undefined) return 0;
  let run = 0;
  for (let i = readings.length - 1; i >= 0 && readings[i] === last; i -= 1) run += 1;
  return run;
}

/** Whether the readings have held still for `SETTLE_FRAMES` frames. */
export function hasSettled(readings: readonly string[]): boolean {
  return framesUnchanged(readings) >= SETTLE_FRAMES;
}

/**
 * Installed once per page: records `textures|programs` on every animation frame,
 * keeping the newest `SETTLE_FRAMES` readings only. A string, never a function,
 * for the reason `sampling-hook.ts` records about `__name`.
 */
export const RECORD_SETTLE_READINGS = `(() => {
  if (window.__settleReadings) return;
  const readings = [];
  window.__settleReadings = readings;
  // G60 wraps requestAnimationFrame to count callbacks per frame, and a callback
  // of ours would read there as a second render loop: it keeps the unwrapped one.
  const raf = window.__rawRaf ?? window.requestAnimationFrame.bind(window);
  const tick = () => {
    // G60 loses contexts on purpose, and a throw here would be a page error.
    try {
      const s = window.__shelf?.stats();
      if (s) {
        readings.push(s.textures + '|' + s.programs);
        if (readings.length > ${String(SETTLE_FRAMES)}) readings.shift();
      }
    } catch {
      readings.length = 0;
    }
    raf(tick);
  };
  raf(tick);
})()`;
