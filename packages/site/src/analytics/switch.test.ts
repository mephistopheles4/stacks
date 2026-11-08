import { describe, expect, it } from 'vitest';
import { readSwitch, SWITCH_VARIABLE } from './switch.ts';

describe('readSwitch', () => {
  it.each([undefined, '', '   ', '\t\n'])('is off for %j', (raw) => {
    expect(readSwitch(raw)).toEqual({ on: false });
  });

  it('is on with the trimmed domain', () => {
    expect(readSwitch('  stacks.aymandiab.com ')).toEqual({
      on: true,
      domain: 'stacks.aymandiab.com',
    });
  });

  it.each(['Stacks.com', 'a b', 'https://stacks.com', 'a/b', 'a_b', 'ü.com', '"x"'])(
    'throws on %j, naming the variable and never the value',
    (raw) => {
      let message = '';
      try {
        readSwitch(raw);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(SWITCH_VARIABLE);
      expect(message).not.toContain(raw.trim());
    },
  );
});
