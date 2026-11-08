// @vitest-environment happy-dom
//
// C7: the real, pinned tracker, with only the network stubbed. A tracker update
// that changes what it sends turns this red (docs/spec/optional-plausible.md
// S10). `// @vitest-environment` selects the DOM for this file alone; every
// other test keeps `node`.
import { afterEach, describe, expect, it, vi } from 'vitest';

const ALLOWED = [
  'ref',
  'source',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
];
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

interface Captured {
  n: string;
  u: string;
  r?: string | null;
  p?: Record<string, unknown>;
  [key: string]: unknown;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the real tracker, behind the module', () => {
  it('scrubs u and r on every request and sends nothing for an outbound click', async () => {
    const fetchStub = vi.fn().mockResolvedValue({ status: 202 });
    const beaconStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beaconStub });
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(
      'https://stacks.aymandiab.com/?debug={"a":1}&solo&woodSeed=x&utm_source=x#frag',
    );
    Object.defineProperty(document, 'referrer', {
      value: 'https://news.example/post?token=secret&utm_campaign=c#top',
      configurable: true,
    });

    const events = await import('./events.ts');
    events.startWith(window.location, 'stacks.aymandiab.com');
    await settle();

    events.trackBook('Book Opened', 'dune-abc123');
    events.trackAsk('Ask Opened');
    // An engagement flush: the tab is hidden.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();

    const bodies = fetchStub.mock.calls.map(
      (call) => JSON.parse((call[1] as { body: string }).body) as Captured,
    );
    const names = bodies.map((body) => body.n);
    expect(names).toContain('pageview');
    expect(names).toContain('Book Opened');
    expect(names).toContain('Ask Opened');
    expect(names).toContain('engagement');

    for (const body of bodies) {
      const url = new URL(body.u);
      expect(url.hash).toBe('');
      for (const key of url.searchParams.keys()) expect(ALLOWED).toContain(key);
      if (typeof body.r === 'string') {
        const referrer = new URL(body.r);
        expect(referrer.hash).toBe('');
        for (const key of referrer.searchParams.keys()) expect(ALLOWED).toContain(key);
      }
    }
    const pageview = bodies.find((body) => body.n === 'pageview');
    expect(pageview?.u).toBe('https://stacks.aymandiab.com/?utm_source=x');
    expect(pageview?.r).toBe('https://news.example/post?utm_campaign=c');

    // No property outside C8's: the book id, and only on the book event.
    expect(bodies.find((body) => body.n === 'Book Opened')?.p).toEqual({ book: 'dune-abc123' });
    expect(bodies.find((body) => body.n === 'Ask Opened')?.p).toBeUndefined();
    expect(pageview?.p).toBeUndefined();

    // A pickup's pushState to the same path sends no page view.
    const before = fetchStub.mock.calls.length;
    history.pushState({}, '', '/');
    await settle();
    expect(fetchStub.mock.calls.length).toBe(before);

    // An outbound link sends nothing: the option is off.
    const link = document.createElement('a');
    link.href = 'https://books.example/title?isbn=9780000000002';
    document.body.append(link);
    link.addEventListener('click', (event) => event.preventDefault());
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
    expect(fetchStub.mock.calls.length).toBe(before);
    expect(beaconStub).not.toHaveBeenCalled();

    // The tracker did not bind itself to the window.
    expect((window as unknown as { plausible?: unknown }).plausible).toBeUndefined();
  });
});
