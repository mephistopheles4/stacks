import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const track = vi.fn();

const working = () => ({ init, track });

type Events = typeof import('./events.ts');
const prod = { hostname: 'stacks.aymandiab.com' } as Location;

async function load(): Promise<Events> {
  vi.resetModules();
  return import('./events.ts');
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  init.mockReset();
  track.mockReset();
  vi.doMock('@plausible-analytics/tracker', working);
});

describe('scrubUrl', () => {
  it('keeps exactly the seven campaign parameters', async () => {
    const { scrubUrl } = await load();
    const kept = 'ref=a&source=b&utm_source=c&utm_medium=d&utm_campaign=e&utm_content=f&utm_term=g';
    expect(scrubUrl(`https://stacks.aymandiab.com/?${kept}`)).toBe(
      `https://stacks.aymandiab.com/?${kept}`,
    );
  });

  it('drops every other parameter and the fragment', async () => {
    const { scrubUrl } = await load();
    expect(
      scrubUrl(
        'https://stacks.aymandiab.com/privacy?debug={"a":1}&solo&woodSeed=x&utm_term=t&q=1#frag',
      ),
    ).toBe('https://stacks.aymandiab.com/privacy?utm_term=t');
  });

  it('leaves a bare path alone, and strips a query from a string that is not a URL', async () => {
    const { scrubUrl } = await load();
    expect(scrubUrl('https://stacks.aymandiab.com/')).toBe('https://stacks.aymandiab.com/');
    expect(scrubUrl('not a url?secret=1#x')).toBe('not a url');
  });
});

describe('startAnalytics', () => {
  it('never imports the tracker with the build literal empty', async () => {
    const { startAnalytics, startWith } = await load();
    startAnalytics(prod);
    await settle();
    expect(init).not.toHaveBeenCalled();
    startWith(prod, '');
    await settle();
    expect(init).not.toHaveBeenCalled();
  });

  it.each([
    'localhost',
    'stacks-abc.pages.dev',
    'stacks.aymandiab.com.evil.test',
    'x.stacks.aymandiab.com',
  ])('never imports the tracker on %s', async (hostname) => {
    const { startWith } = await load();
    startWith({ hostname } as Location, 'stacks.aymandiab.com');
    await settle();
    expect(init).not.toHaveBeenCalled();
  });

  it('starts once on the production host with every option named', async () => {
    const { startWith } = await load();
    startWith(prod, 'stacks.aymandiab.com');
    startWith(prod, 'stacks.aymandiab.com');
    await settle();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0]?.[0]).toMatchObject({
      domain: 'stacks.aymandiab.com',
      autoCapturePageviews: true,
      bindToWindow: false,
      fileDownloads: false,
      hashBasedRouting: false,
      outboundLinks: false,
      formSubmissions: false,
      captureOnLocalhost: false,
      logging: false,
      endpoint: 'https://plausible.io/api/event',
    });
  });

  it('hands the tracker a transform that scrubs u and r', async () => {
    const { startWith } = await load();
    startWith(prod, 'stacks.aymandiab.com');
    await settle();
    const config = init.mock.calls[0]?.[0] as {
      transformRequest: (p: object) => { u: string; r?: string | null };
    };
    const out = config.transformRequest({
      n: 'pageview',
      d: 'stacks.aymandiab.com',
      u: 'https://stacks.aymandiab.com/?solo&utm_source=x#h',
      r: 'https://news.example/a?token=1',
    });
    expect(out.u).toBe('https://stacks.aymandiab.com/?utm_source=x');
    expect(out.r).toBe('https://news.example/a');
    expect(config.transformRequest({ n: 'x', d: 'd', u: 'https://s/?a=1', r: null }).r).toBeNull();
  });

  it('survives a failed import: unstarted, events are no-ops, no unhandled rejection', async () => {
    vi.doMock('@plausible-analytics/tracker', () => {
      throw new Error('blocked');
    });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const { startWith, trackBook, trackAsk } = await load();
    startWith(prod, 'stacks.aymandiab.com');
    await settle();
    trackBook('Book Opened', 'dune-abc123');
    trackAsk('Ask Opened');
    await settle();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});

describe('events', () => {
  it('drops events before the tracker is ready, but records the attempt', async () => {
    const { startWith, trackBook, attempted } = await load();
    trackBook('Book Picked Up', 'dune-abc123');
    expect(track).not.toHaveBeenCalled();
    expect(attempted()).toEqual([{ name: 'Book Picked Up', book: 'dune-abc123' }]);
    // Starting afterwards does not replay it: an event before the tracker is
    // ready is dropped, not queued (S10).
    startWith(prod, 'stacks.aymandiab.com');
    await settle();
    expect(track).not.toHaveBeenCalled();
  });

  it('sends a well-formed id as the only property, and drops a malformed one', async () => {
    const { startWith, trackBook, trackAsk, attempted } = await load();
    startWith(prod, 'stacks.aymandiab.com');
    await settle();
    trackBook('Book Opened', 'dune-abc123');
    trackBook('Book Opened', 'Dune Title?!');
    trackAsk('Ask Opened');
    expect(track.mock.calls).toEqual([
      ['Book Opened', { props: { book: 'dune-abc123' } }],
      ['Book Opened', {}],
      ['Ask Opened', {}],
    ]);
    expect(attempted()).toEqual([
      { name: 'Book Opened', book: 'dune-abc123' },
      { name: 'Book Opened' },
      { name: 'Ask Opened' },
    ]);
  });

  it('caps what attempted() remembers at 200', async () => {
    const { trackAsk, attempted } = await load();
    for (let i = 0; i < 250; i++) trackAsk('Ask Opened');
    expect(attempted()).toHaveLength(200);
  });
});
