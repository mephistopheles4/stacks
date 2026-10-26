import { describe, expect, it } from 'vitest';
import { parseState, serializeState, type StoreState } from './trend-state.ts';

describe('the trend store state file (#522)', () => {
  it('round-trips every field writeState writes', () => {
    const state: StoreState = {
      tip: 'abc123',
      imported: ['1-a.prom', '2-b.prom'],
      renovations: ['d1', 'd2'],
      asksDigest: 'asks',
    };
    expect(parseState(serializeState(state))).toEqual(state);
  });

  it('reads a state file written before markers and asks existed', () => {
    expect(parseState('{"tip":"abc","imported":["1-a.prom"]}')).toEqual({
      tip: 'abc',
      imported: ['1-a.prom'],
    });
  });

  it('is undefined on a file that does not parse', () => {
    expect(parseState('{not json')).toBeUndefined();
  });
});
