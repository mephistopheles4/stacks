import { describe, expect, it } from 'vitest';
import { createOutsideClick, escapeTakenBy } from './close.ts';

describe('createOutsideClick (C9: outside click closes, a drag does not)', () => {
  it('closes on a press and release outside the panel in place', () => {
    const c = createOutsideClick();
    c.down(100, 100, false);
    expect(c.up(101, 100, false)).toBe(true);
  });

  it('does not close on a drag across the shelf', () => {
    const c = createOutsideClick();
    c.down(100, 100, false);
    expect(c.up(160, 120, false)).toBe(false);
  });

  it('does not close on a press inside the panel, even if released outside', () => {
    const c = createOutsideClick();
    c.down(500, 100, true);
    expect(c.up(100, 100, false)).toBe(false);
  });

  it('does not close on a release inside the panel after a press outside', () => {
    const c = createOutsideClick();
    c.down(100, 100, false);
    expect(c.up(100, 100, true)).toBe(false);
  });

  it('does not close on a release with no press seen', () => {
    expect(createOutsideClick().up(1, 1, false)).toBe(false);
  });

  it('forgets one press after it is released', () => {
    const c = createOutsideClick();
    c.down(0, 0, false);
    c.up(0, 0, false);
    expect(c.up(0, 0, false)).toBe(false);
  });

  it('takes a travel of exactly the threshold as a click', () => {
    const c = createOutsideClick(6);
    c.down(0, 0, false);
    expect(c.up(6, 0, false)).toBe(true);
    c.down(0, 0, false);
    expect(c.up(6.1, 0, false)).toBe(false);
  });
});

describe('escapeTakenBy', () => {
  it('takes Escape only while the drawer is open', () => {
    expect(escapeTakenBy(true, 'Escape')).toBe(true);
    expect(escapeTakenBy(false, 'Escape')).toBe(false);
    expect(escapeTakenBy(true, 'Enter')).toBe(false);
  });
});
