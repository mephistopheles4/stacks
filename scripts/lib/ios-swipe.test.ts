import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  ARM_SCROLL_COUNT,
  DEFAULT_PORT,
  FIND_AND_OPEN,
  judge,
  LIVE_URL,
  MOVE_CLONE_TO_FLAT,
  parseSwipeArgs,
  READ_AFTER,
  swipePath,
  type After,
  type Armed,
  type SwipeOptions,
} from './ios-swipe.ts';

const ARMED: Armed = {
  left: 20,
  width: 350,
  top: 100,
  bottom: 700,
  scrollTop: 0,
  scrollHeight: 1500,
  clientHeight: 700,
};

const RESTING = { title: 'A', phase: 'held', opened: true, yaw: 0, pitch: 0 };
const AFTER: After = {
  scrollTop: 280,
  events: 9,
  parent: 'probe-flat',
  held: RESTING,
  fallback: '',
};

function options(argv: readonly string[]): SwipeOptions {
  const parsed = parseSwipeArgs(argv);
  if (typeof parsed === 'string') throw new Error(parsed);
  return parsed;
}

describe('parseSwipeArgs', () => {
  it('defaults to the iPhone 16 Pro on iOS 18 in Safari, against the live site', () => {
    expect(options(['--premise'])).toEqual({
      device: 'iPhone 16 Pro',
      os: '18',
      browser: 'safari',
      url: LIVE_URL,
      local: false,
      premise: true,
      checkServed: false,
      port: DEFAULT_PORT,
    });
  });

  it('points --local at the tunnel host and the one port, unless --url says otherwise', () => {
    expect(options(['--local', '--port', '9000']).url).toBe('http://bs-local.com:9000/');
    expect(options(['--local', '--url', 'http://bs-local.com:9001/x']).url).toBe(
      'http://bs-local.com:9001/x',
    );
  });

  it('refuses what it does not know, a flag with no value, and a bad port or address', () => {
    expect(parseSwipeArgs(['--nope'])).toBe('unknown argument --nope');
    expect(parseSwipeArgs(['--device'])).toBe('--device needs a value');
    expect(parseSwipeArgs(['--device', '--local'])).toBe('--device needs a value');
    expect(parseSwipeArgs(['--port', '80'])).toBe('--port is not a usable port');
    expect(parseSwipeArgs(['--url', 'file:///x'])).toBe('--url is not an http(s) address');
  });

  it('refuses the premise through a tunnel, which the live site does not need', () => {
    expect(parseSwipeArgs(['--premise', '--local'])).toMatch(/needs no tunnel/);
  });
});

describe('swipePath', () => {
  it('goes up the middle of the visible page, from low to high', () => {
    expect(swipePath(ARMED)).toEqual({ from: { x: 195, y: 580 }, to: { x: 195, y: 220 } });
  });
});

describe('judge', () => {
  it('counts a rise of 100 px or more as a scroll, and no less', () => {
    expect(judge(ARMED, { ...AFTER, scrollTop: 100 }, true).scrolled).toBe(true);
    expect(judge(ARMED, { ...AFTER, scrollTop: 99 }, true).scrolled).toBe(false);
  });

  it('reports the numbers and the parent the page was in, and nothing else', () => {
    const verdict = judge(ARMED, AFTER, true);
    expect(verdict.line).toBe(
      'scrolled: yes; scrollTop 0 -> 280; scroll events 9; box 1500/700; parent .probe-flat',
    );
  });

  it('for the build, also needs scroll events and a book still held, open and unturned', () => {
    expect(judge(ARMED, AFTER, false).scrolled).toBe(true);
    expect(judge(ARMED, { ...AFTER, events: 0 }, false).scrolled).toBe(false);
    expect(judge(ARMED, { ...AFTER, held: null }, false).scrolled).toBe(false);
    expect(judge(ARMED, { ...AFTER, held: { ...RESTING, opened: false } }, false).scrolled).toBe(
      false,
    );
    expect(judge(ARMED, { ...AFTER, held: { ...RESTING, yaw: 3 } }, false).line).toContain(
      'NOT held open and unturned',
    );
  });

  it('does not ask the premise for scroll events or a held book', () => {
    expect(judge(ARMED, { ...AFTER, events: 0, held: null }, true).scrolled).toBe(true);
  });

  it('says which fallback the shelf reports when it reports one', () => {
    expect(judge(ARMED, { ...AFTER, fallback: 'lost' }, true).line).toContain('fallback lost');
  });
});

describe('the scripts it runs in the page', () => {
  it.each([
    ['FIND_AND_OPEN', FIND_AND_OPEN],
    ['MOVE_CLONE_TO_FLAT', MOVE_CLONE_TO_FLAT],
    ['ARM_SCROLL_COUNT', ARM_SCROLL_COUNT],
    ['READ_AFTER', READ_AFTER],
  ])('%s parses as a function body', (_name, script) => {
    // Wrapped as the driver wraps it: a function body, which may `return`.
    expect(
      () =>
        new Script(`(function () {${script}
})`),
    ).not.toThrow();
  });

  it('puts the clone in a flat layer with no transform of its own and no pointer events', () => {
    expect(MOVE_CLONE_TO_FLAT).toContain("flat.style.pointerEvents = 'none'");
    expect(MOVE_CLONE_TO_FLAT).toContain("flat.style.inset = '0'");
    expect(MOVE_CLONE_TO_FLAT).not.toMatch(/flat\.style\.transform/);
  });
});
