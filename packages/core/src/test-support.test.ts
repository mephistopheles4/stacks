/**
 * `spyOnWarn` — the one piece of `test-support.ts` with behaviour of its own.
 *
 * The rest of this file is fixture plumbing whose specs are the tests that use
 * it. This helper silences a real global and hands back what was said to it, so
 * a mistake here is a test somewhere else passing for the wrong reason: a spy
 * that never restored leaks into the next file, and a `lines` array that
 * records nothing turns `expect(warn.lines).toHaveLength(2)` into an assertion
 * about an empty list.
 */

import { describe, expect, it } from 'vitest';
import { spyOnWarn } from './test-support.ts';

describe('spyOnWarn', () => {
  it('silences console.warn while it is installed', () => {
    // A plain stub rather than a second `vi.spyOn`: spying twice on one method
    // hands back the same mock instance, so the assertion would be about the
    // spy under test and would pass whatever it did.
    const original = console.warn;
    let reached = 0;
    console.warn = () => {
      reached += 1;
    };

    try {
      const warn = spyOnWarn();
      console.warn('nobody should see this');
      warn.restore();

      expect(reached).toBe(0);
    } finally {
      console.warn = original;
    }
  });

  it('records one line per call, with the arguments joined', () => {
    const warn = spyOnWarn();

    console.warn('skipped', 'The Undelivered Manuscript.md');
    console.warn('skipped', 'Untitled Import.md');

    expect(warn.lines).toEqual([
      'skipped The Undelivered Manuscript.md',
      'skipped Untitled Import.md',
    ]);

    warn.restore();
  });

  it('starts empty', () => {
    const warn = spyOnWarn();
    expect(warn.lines).toEqual([]);
    warn.restore();
  });

  it('puts the real console.warn back', () => {
    const before = console.warn;
    const warn = spyOnWarn();

    expect(console.warn).not.toBe(before);
    warn.restore();

    expect(console.warn).toBe(before);
  });

  it('gives each call its own recorder', () => {
    // Two spies in one file must not share an array — the module-level `let`
    // that would cause it is the obvious way to write this wrong.
    const first = spyOnWarn();
    console.warn('one');
    first.restore();

    const second = spyOnWarn();
    console.warn('two');
    second.restore();

    expect(first.lines).toEqual(['one']);
    expect(second.lines).toEqual(['two']);
  });
});
