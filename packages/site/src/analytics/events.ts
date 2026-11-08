/**
 * The analytics module: the only code in this repo that starts the tracker or
 * sends an event (docs/spec/optional-plausible.md S4, ADR-0138).
 *
 * **The name is vendor-neutral on purpose.** A shared chunk named after the
 * vendor can be matched by an ad blocker's filter list, which would stop the
 * shelf booting in an off build too. The tracker's own lazy chunk may carry the
 * vendor's name: only an on build loads it, and a blocked import leaves every
 * event a no-op.
 *
 * **Off means absent.** `startAnalytics` branches on the build literal, which
 * Rollup folds, so in an off build `startWith` is unreferenced and the dynamic
 * `import()` of the tracker goes with it (C2). `startWith` is exported for the
 * tests, which pass a domain because the test build's literal is empty.
 */
import { BOOK_ID } from '../shelf/notes.ts';

declare const __PLAUSIBLE_DOMAIN__: string;

export const PRODUCTION_HOST = 'stacks.aymandiab.com';

/** The query parameters Plausible reads. Every other parameter is dropped. */
const CAMPAIGN = new Set([
  'ref',
  'source',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
]);

export type BookEvent = 'Book Picked Up' | 'Book Opened';
export type AskEvent = 'Ask Opened';

type Track = (name: string, options: { props?: { book: string } }) => void;

/** One event the shelf asked for, sent or not. */
export interface Attempt {
  name: string;
  book?: string;
}

let track: Track | undefined;
let started = false;
const attempts: Attempt[] = [];
const LOG_CAP = 200;

/** The page URL or referrer with only the campaign parameters, and no fragment. */
export function scrubUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href.split(/[?#]/, 1)[0] ?? '';
  }
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (CAMPAIGN.has(key)) kept.append(key, value);
  }
  const query = kept.toString();
  return `${url.origin}${url.pathname}${query === '' ? '' : `?${query}`}`;
}

/** Start the tracker once, if the switch is on and the host is production. */
export function startAnalytics(where: Location): void {
  if (__PLAUSIBLE_DOMAIN__ === '') return;
  startWith(where, __PLAUSIBLE_DOMAIN__);
}

export function startWith(where: Location, domain: string): void {
  if (domain === '' || started || where.hostname !== PRODUCTION_HOST) return;
  started = true;
  import('@plausible-analytics/tracker').then(
    (tracker) => {
      tracker.init({
        domain,
        endpoint: 'https://plausible.io/api/event',
        autoCapturePageviews: true,
        bindToWindow: false,
        fileDownloads: false,
        formSubmissions: false,
        hashBasedRouting: false,
        outboundLinks: false,
        captureOnLocalhost: false,
        logging: false,
        transformRequest: (payload) => ({
          ...payload,
          u: scrubUrl(payload.u),
          ...(typeof payload.r === 'string' ? { r: scrubUrl(payload.r) } : {}),
        }),
      });
      track = tracker.track;
    },
    () => {
      // Blocked or offline: stay unstarted, and every event stays a no-op.
    },
  );
}

function remember(entry: Attempt): void {
  if (attempts.length < LOG_CAP) attempts.push(entry);
}

/** Send one book event. A property is the id and nothing else. */
export function trackBook(name: BookEvent, id: string): void {
  const valid = BOOK_ID.test(id);
  remember(valid ? { name, book: id } : { name });
  track?.(name, valid ? { props: { book: id } } : {});
}

export function trackAsk(name: AskEvent): void {
  remember({ name });
  track?.(name, {});
}

/** Every event asked for since load, sent or not, for `window.__shelf`. */
export function attempted(): readonly Attempt[] {
  return attempts;
}
