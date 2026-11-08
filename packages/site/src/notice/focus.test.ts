import { describe, expect, it } from 'vitest';
import { tabTarget } from './focus.ts';

// C2: focus cycles inside the modal, at both ends, and is pulled in from anywhere else.
describe('tabTarget: where Tab sends focus inside the modal', () => {
  it('leaves a Tab in the middle to the browser', () => {
    expect(tabTarget(4, 1, false)).toBeUndefined();
    expect(tabTarget(4, 2, true)).toBeUndefined();
    // The ends in the other direction are the browser's too: Tab off the first control, and
    // Shift+Tab off the last, stay inside the ring on their own.
    expect(tabTarget(4, 0, false)).toBeUndefined();
    expect(tabTarget(4, 3, true)).toBeUndefined();
  });

  it('wraps Tab on the last control to the first', () => {
    expect(tabTarget(4, 3, false)).toBe(0);
  });

  it('wraps Shift+Tab on the first control to the last', () => {
    expect(tabTarget(4, 0, true)).toBe(3);
  });

  it('pulls focus in when it is on none of the controls, such as a heading', () => {
    expect(tabTarget(4, -1, false)).toBe(0);
    expect(tabTarget(4, -1, true)).toBe(3);
  });

  it('keeps a lone control where it is', () => {
    expect(tabTarget(1, 0, false)).toBe(0);
    expect(tabTarget(1, 0, true)).toBe(0);
  });

  it('has nothing to send focus to when there is no control', () => {
    expect(tabTarget(0, -1, false)).toBeUndefined();
  });
});
