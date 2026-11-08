/**
 * Where Tab sends focus while a notice is open (docs/spec/notice-modals.md N7, claim C2), as a
 * decision with no DOM in it so it can be tested and the glue stays thin.
 *
 * A native modal dialog lets Tab leave for the browser's own chrome, which does not meet "focus
 * stays in the modal". The modal wraps it by hand: this says which control takes focus, or
 * `undefined` when the browser's own move is right.
 *
 * `count` is how many controls the modal holds, `index` is where focus is among them (`-1` when
 * it is on none, such as a heading that took focus after a panel swap).
 */
export function tabTarget(count: number, index: number, backwards: boolean): number | undefined {
  if (count === 0) return undefined;
  if (index === -1) return backwards ? count - 1 : 0;
  if (!backwards && index === count - 1) return 0;
  if (backwards && index === 0) return count - 1;
  return undefined;
}
