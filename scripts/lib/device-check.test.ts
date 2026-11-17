/**
 * `READY_AND_FIND`'s tap guard (#618): the page script is a string a hub runs, so the test runs
 * that string the way a hub does, against a fake page, and reads what it answers.
 */
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { PROBE_READ, READY_AND_FIND, probeLost } from './device-check.ts';

interface Book {
  readonly y: number;
}

/** Runs the script as a hub would: the given arguments, then the callback it answers through. */
async function find(books: readonly Book[], args: readonly number[]): Promise<unknown> {
  const canvas = {};
  const page = {
    __shelf: {
      ready: true,
      bookCount: books.length,
      projectBook: (i: number) => ({ x: 100, y: books[i]?.y ?? 0 }),
      bookAt: (_x: number, y: number) => `id-${String(y)}`,
    },
    innerWidth: 402,
    innerHeight: 678,
  };
  const document = {
    getElementById: () => canvas,
    elementFromPoint: () => canvas,
  };
  const library = {
    books: books.map((b) => ({ id: `id-${String(b.y)}`, title: `Book ${String(b.y)}` })),
  };
  const fetchLibrary = () => Promise.resolve({ json: () => Promise.resolve(library) });
  const script = runInNewContext(`(function () { ${READY_AND_FIND} })`, {
    window: page,
    document,
    fetch: fetchLibrary,
    location: { href: 'http://page.test/' },
    setTimeout,
  }) as (...call: unknown[]) => void;
  return new Promise((resolve) => {
    script(...args, resolve);
  });
}

describe('READY_AND_FIND', () => {
  it('skips a book whose shifted tap point falls below the viewport', async () => {
    // y=650 shifted by 62 is 712, past a 678 px viewport, so the book at y=100 is the one chosen.
    const answer = await find([{ y: 650 }, { y: 100 }], [0, 62]);
    expect(answer).toMatchObject({ y: 100, title: 'Book 100' });
  });

  it('takes the first book in view when the shift is zero', async () => {
    const answer = await find([{ y: 650 }, { y: 100 }], [0, 0]);
    expect(answer).toMatchObject({ y: 650 });
  });
});

/** Runs the probe's read script the way a hub does, on a page whose window is `page`. */
function readProbe(page: Record<string, unknown>): unknown {
  const script = runInNewContext(`(function () { ${PROBE_READ} })`, {
    window: page,
  }) as () => unknown;
  return script();
}

describe('PROBE_READ', () => {
  it('answers that the page was lost when it reloaded after the probe was armed', () => {
    // A reloaded page has a fresh window: no probe state at all. Today's main threw on this.
    const answer = readProbe({});
    expect(probeLost(answer)).toBe(true);
  });

  it('answers where the tap landed, and disarms, on the page that was armed', () => {
    let stopped = 0;
    const answer = readProbe({ __probe: { x: 2, y: 135 }, __probeStop: [() => (stopped += 1)] });
    expect(answer).toMatchObject({ x: 2, y: 135 });
    expect(probeLost(answer)).toBe(false);
    expect(stopped).toBe(1);
  });

  it('answers null when the page was armed and nothing landed', () => {
    const answer = readProbe({ __probeStop: [] });
    expect(answer).toBeNull();
    expect(probeLost(answer)).toBe(false);
  });
});
