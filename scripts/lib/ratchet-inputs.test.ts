import { describe, expect, it } from 'vitest';
import { parseFloors } from './floors.ts';
import { windowStamps } from './ratchet-inputs.ts';
import type { Renovation } from './renovations.ts';

describe('windowStamps — the stamps both of the ratchet’s readers read a window under', () => {
  const entry = (over: Partial<Renovation>): Renovation => ({
    date: '2026-09-12',
    stamp: 'configHash',
    value: 'sha256:config-now',
    reason: 'a renovation',
    pr: 1,
    preserves: false,
    ...over,
  });

  it('keeps each stamp’s accepted values to that stamp', () => {
    const floors = parseFloors({
      configHash: 'sha256:config-now',
      fixtureHash: 'sha256:counting-now',
      scopes: {},
    });
    const stamps = windowStamps(floors, [
      entry({ date: '2026-08-01', value: 'sha256:config-then' }),
      entry({ date: '2026-09-12', value: 'sha256:config-now', preserves: true }),
      entry({ date: '2026-09-13', stamp: 'fixtureHash', value: 'sha256:counting-now' }),
    ]);

    expect(stamps).toEqual({
      configHash: 'sha256:config-now',
      configAccepted: ['sha256:config-now', 'sha256:config-then'],
      fixtureHash: 'sha256:counting-now',
      fixtureAccepted: ['sha256:counting-now'],
    });
  });
});
