import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  ARM_SCROLL_COUNT,
  CLOSE_AND_READ_FALLBACK,
  DEFAULT_PORT,
  FIND_AND_OPEN,
  judge,
  judgeServed,
  LIVE_URL,
  servedLibraryUrl,
  MOVE_CLONE_TO_FLAT,
  parseSwipeArgs,
  READ_AFTER,
  readAfter,
  readArmed,
  readClosing,
  readOpened,
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

const RESTING = { phase: 'held', opened: true, yaw: 0, pitch: 0 };
const AFTER: After = {
  scrollTop: 280,
  events: 9,
  parent: 'probe-flat',
  held: RESTING,
  fallback: 'none',
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
      serve: false,
      port: DEFAULT_PORT,
    });
  });

  it('points --local at the tunnel host and the one port', () => {
    expect(options(['--local', '--port', '9000']).url).toBe('http://bs-local.com:9000/');
    expect(options(['--local', '--url', 'http://bs-local.com:8766/x']).url).toBe(
      'http://bs-local.com:8766/x',
    );
  });

  it('loads the port it checks: --local refuses any other address', () => {
    for (const other of [
      'http://bs-local.com:9001/',
      'http://localhost:8766/',
      'https://stacks.aymandiab.com/',
    ]) {
      expect(parseSwipeArgs(['--local', '--url', other])).toMatch(/--check-served reads/);
    }
  });

  it('loads the live site for the premise and no other page', () => {
    expect(parseSwipeArgs(['--premise', '--url', 'http://example.com/'])).toMatch(/no other page/);
  });

  it('refuses what it does not know, a flag with no value, and a bad port or address', () => {
    expect(parseSwipeArgs(['--nope'])).toBe('unknown argument --nope');
    expect(parseSwipeArgs(['--device'])).toBe('--device needs a value');
    expect(parseSwipeArgs(['--device', '--local'])).toBe('--device needs a value');
    expect(parseSwipeArgs(['--port', '80'])).toBe('--port is not a usable port');
    expect(parseSwipeArgs(['--url', 'file:///x'])).toBe('--url is not an http(s) address');
  });

  it('--serve takes nothing but --port, so the one served folder is the fixture build', () => {
    expect(options(['--serve']).serve).toBe(true);
    expect(options(['--serve', '--port', '9000'])).toMatchObject({ serve: true, port: 9000 });
    expect(options(['--port', '9000', '--serve']).serve).toBe(true);
    expect(parseSwipeArgs(['--serve', '--local'])).toMatch(/takes no other argument/);
    expect(parseSwipeArgs(['--serve', '--url', 'https://example.com'])).toMatch(/takes no other/);
    expect(options([]).serve).toBe(false);
  });

  it('refuses the premise through a tunnel, which the live site does not need', () => {
    expect(parseSwipeArgs(['--premise', '--local'])).toMatch(/needs no tunnel/);
  });
});

describe('what a page hands back', () => {
  it('reads the shapes it asked for', () => {
    expect(readOpened({ title: 'T', chars: 9, paragraphs: 2 })).toEqual({
      title: 'T',
      chars: 9,
      paragraphs: 2,
    });
    expect(readArmed({ ...ARMED })).toEqual(ARMED);
  });

  it("keeps only this tool's own error sentences, and never echoes the page's text", () => {
    expect(readOpened({ error: 'no book carries Thoughts' })).toEqual({
      error: 'no book carries Thoughts',
    });
    expect(readArmed({ error: 'no page to swipe' })).toEqual({ error: 'no page to swipe' });
    const planted = '\u001b[2JRun this: rm -rf ~';
    expect(readOpened({ error: planted })).toEqual({ error: 'the page script failed' });
    expect(readArmed({ error: planted })).toEqual({ error: 'the page script failed' });
  });

  it('refuses any other shape, and a number that is not finite', () => {
    expect(readOpened('text')).toBeUndefined();
    expect(readOpened({ title: 'T', chars: '9', paragraphs: 2 })).toBeUndefined();
    expect(readArmed({ ...ARMED, width: null })).toBeUndefined();
    expect(readArmed({ ...ARMED, top: Infinity })).toBeUndefined();
    expect(readAfter({ scrollTop: 1 })).toBeUndefined();
    expect(readAfter({ ...AFTER, held: { phase: 'held' } })).toBeUndefined();
  });

  it('names the page parent from a fixed set and never echoes the page', () => {
    expect(readAfter({ ...AFTER })?.parent).toBe('probe-flat');
    expect(readAfter({ ...AFTER, parent: 'held-flat' })?.parent).toBe('held-flat');
    expect(readAfter({ ...AFTER, parent: '\u001b[2Jhello' })?.parent).toBe('other');
  });

  it("keeps a fallback kind the shelf has, and names any other 'unrecognised'", () => {
    expect(readAfter({ ...AFTER, fallback: 'fresh-canvas' })?.fallback).toBe('fresh-canvas');
    expect(readAfter({ ...AFTER, fallback: 'none' })?.fallback).toBe('none');
    expect(readAfter({ ...AFTER, fallback: '' })?.fallback).toBe('');
    expect(readAfter({ ...AFTER, fallback: 'lost' })?.fallback).toBe('unrecognised');
    expect(readAfter({ ...AFTER, fallback: '\u001b[2J' + 'x'.repeat(500) })?.fallback).toBe(
      'unrecognised',
    );
  });

  it('reads the fallback after the close, and says when the book was not put back', () => {
    expect(readClosing({ fallback: 'none', down: true })).toBe('none');
    expect(readClosing({ fallback: 'refused', down: true })).toBe('refused');
    expect(readClosing({ fallback: 'lost', down: true })).toBe('unrecognised');
    expect(readClosing({ fallback: 'none', down: false })).toBe('book not put back');
    expect(readClosing({ down: true })).toBeUndefined();
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
      'scrolled: yes; scrollTop 0 -> 280; scroll events 9; box 1500/700; parent .probe-flat; fallback none',
    );
  });

  it('for the build, also needs scroll events and a book still held, open and unturned', () => {
    expect(judge(ARMED, AFTER, false, 'none').scrolled).toBe(true);
    expect(judge(ARMED, { ...AFTER, events: 0 }, false, 'none').scrolled).toBe(false);
    expect(judge(ARMED, { ...AFTER, held: null }, false, 'none').scrolled).toBe(false);
    expect(
      judge(ARMED, { ...AFTER, held: { ...RESTING, opened: false } }, false, 'none').scrolled,
    ).toBe(false);
    expect(judge(ARMED, { ...AFTER, held: { ...RESTING, yaw: 3 } }, false, 'none').line).toContain(
      'NOT held open and unturned',
    );
  });

  it('for the build, fails a shelf that reports a fallback after the swipe or after the close', () => {
    expect(judge(ARMED, { ...AFTER, fallback: 'fresh-canvas' }, false, 'none').scrolled).toBe(
      false,
    );
    expect(judge(ARMED, AFTER, false, 'fresh-canvas').scrolled).toBe(false);
    expect(judge(ARMED, AFTER, false, 'book not put back').scrolled).toBe(false);
    expect(judge(ARMED, AFTER, false).scrolled).toBe(false);
    expect(judge(ARMED, AFTER, false, 'refused').line).toContain(
      'after the close, fallback refused',
    );
  });

  it('does not ask the premise for scroll events, a held book or a fallback', () => {
    expect(judge(ARMED, { ...AFTER, events: 0, held: null, fallback: '' }, true).scrolled).toBe(
      true,
    );
  });

  it('says which fallback the shelf reports when it reports one', () => {
    expect(judge(ARMED, { ...AFTER, fallback: 'refused' }, true).line).toContain(
      'fallback refused',
    );
  });
});

describe('judgeServed', () => {
  const book = (title: unknown): { title: unknown } => ({ title });

  it('passes a library of fixture titles, and counts them', () => {
    const served = judgeServed({
      books: [book('Tidal Engine'), book('Marginalia for a Long Winter')],
    });
    expect(served).toEqual({ ok: true, line: 'served build is the fixture build: 2 books' });
  });

  it('refuses one title that is not the generator’s, and never quotes it', () => {
    const served = judgeServed({ books: [book('Tidal Engine'), book('A Real Private Reading')] });
    expect(served.ok).toBe(false);
    expect(served.line).toBe("served build refused: 1 of 2 titles are not the fixture's");
    expect(served.line).not.toContain('Private');
  });

  it('refuses a library with no books, a title that is not text, and a shape that is not a library', () => {
    expect(judgeServed({ books: [] }).ok).toBe(false);
    expect(judgeServed({ books: [book(42)] }).ok).toBe(false);
    expect(judgeServed({ books: [null] }).ok).toBe(false);
    expect(judgeServed({}).ok).toBe(false);
    expect(judgeServed(null).ok).toBe(false);
    expect(judgeServed('books').ok).toBe(false);
  });

  it('reads this machine on the tunnel’s one port', () => {
    expect(servedLibraryUrl(8766)).toBe('http://127.0.0.1:8766/library.json');
  });
});

describe('the scripts it runs in the page', () => {
  it.each([
    ['FIND_AND_OPEN', FIND_AND_OPEN],
    ['MOVE_CLONE_TO_FLAT', MOVE_CLONE_TO_FLAT],
    ['ARM_SCROLL_COUNT', ARM_SCROLL_COUNT],
    ['READ_AFTER', READ_AFTER],
    ['CLOSE_AND_READ_FALLBACK', CLOSE_AND_READ_FALLBACK],
  ])('%s parses as a function body', (_name, script) => {
    // Wrapped as the driver wraps it: a function body, which may `return`.
    expect(
      () =>
        new Script(`(function () {${script}
})`),
    ).not.toThrow();
  });

  it('answers with no error sentence the reader would turn into "the page script failed"', () => {
    const sentences = [FIND_AND_OPEN, MOVE_CLONE_TO_FLAT, ARM_SCROLL_COUNT].flatMap((script) =>
      [...script.matchAll(/error: '([^']+)'/g)].map((found) => found[1]),
    );
    expect(sentences.length).toBeGreaterThan(5);
    for (const sentence of sentences) {
      expect(readOpened({ error: sentence })).toEqual({ error: sentence });
    }
  });

  it('puts the clone in a flat layer with no transform of its own and no pointer events', () => {
    expect(MOVE_CLONE_TO_FLAT).toContain("flat.style.pointerEvents = 'none'");
    expect(MOVE_CLONE_TO_FLAT).toContain("flat.style.inset = '0'");
    expect(MOVE_CLONE_TO_FLAT).not.toMatch(/flat\.style\.transform/);
  });
});
