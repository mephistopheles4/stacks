/**
 * What `pnpm gate:public` and `pnpm smoke:render` share about analytics, as pure
 * functions: what a gate's build child may inherit (both gates), and how
 * `smoke:render` judges the events the shelf asked for
 * (docs/spec/optional-plausible.md S5, S10, C8).
 *
 * The browser steps stay in `smoke-render.ts`; this holds the judgement, so a
 * wrong call count is a failure a test has watched.
 */
import { PRODUCTION_HOST, type Attempt } from '../../packages/site/src/analytics/events.ts';
import { SWITCH_VARIABLE } from '../../packages/site/src/analytics/switch.ts';
import { BOOK_ID } from '../../packages/site/src/shelf/notes.ts';

export type { Attempt };

/**
 * The environment a gate hands its build child.
 *
 * `runShell` inherits `process.env`, so a `PUBLIC_PLAUSIBLE_DOMAIN` set where
 * `deploy:site` runs would otherwise reach a gate's build and turn it into an
 * on build. The gates check the shape they were asked to, so the variable is
 * removed, and `smoke:render --analytics-on` is the one way in: it sets the
 * variable to the production host for its own child and nothing else (S5, X6).
 */
export function gateBuildEnv(parent: NodeJS.ProcessEnv, analyticsOn = false): NodeJS.ProcessEnv {
  const { [SWITCH_VARIABLE]: _removed, ...rest } = parent;
  return analyticsOn ? { ...rest, [SWITCH_VARIABLE]: PRODUCTION_HOST } : rest;
}

/** `window.__shelf.attempted()` after each step of the browser walk, cumulative. */
export interface AnalyticsWalk {
  /** After the drawer was opened, shut and opened again, with nothing held. */
  readonly drawer: readonly Attempt[];
  /** After a real click on a book landed it in the hand. */
  readonly clicked: readonly Attempt[];
  /** After a `stacks:pick-up` for another book; `chatId` is that book's id. */
  readonly chat: readonly Attempt[];
  readonly chatId: string;
  /** After a second `stacks:pick-up` for the book already in the hand. */
  readonly chatAgain: readonly Attempt[];
  /** After the held book was opened. */
  readonly opened: readonly Attempt[];
}

const same = (a: Attempt, b: Attempt): boolean => a.name === b.name && a.book === b.book;

/** What a step added to the record, or the whole record if it no longer starts with the old one. */
function added(before: readonly Attempt[], after: readonly Attempt[]): readonly Attempt[] {
  const kept = before.every((entry, at) => after[at] !== undefined && same(entry, after[at]));
  return kept ? after.slice(before.length) : after;
}

/** Each event fired as S6 says, once per action; the only property is a book id. */
export function judgeAnalyticsCalls(walk: AnalyticsWalk): string[] {
  const failures: string[] = [];
  const drawer = walk.drawer;
  if (
    drawer.length !== 2 ||
    drawer.some((entry) => entry.name !== 'Ask Opened' || 'book' in entry)
  ) {
    failures.push(
      `analytics: opening the drawer twice from shut should record two "Ask Opened" and nothing else, got ${JSON.stringify(drawer)}`,
    );
  }

  const click = added(walk.drawer, walk.clicked);
  const clicked = click[0];
  if (
    click.length !== 1 ||
    clicked?.name !== 'Book Picked Up' ||
    clicked.book === undefined ||
    !BOOK_ID.test(clicked.book)
  ) {
    failures.push(
      `analytics: a click that lands a book should record one "Book Picked Up" with that book id, got ${JSON.stringify(click)}`,
    );
  }

  const chat = added(walk.clicked, walk.chat);
  if (chat.length !== 1 || chat[0]?.name !== 'Book Picked Up' || chat[0].book !== walk.chatId) {
    failures.push(
      `analytics: a chat link to another book should record one "Book Picked Up" for ${walk.chatId}, got ${JSON.stringify(chat)}`,
    );
  }

  const again = added(walk.chat, walk.chatAgain);
  if (again.length !== 0) {
    failures.push(
      `analytics: a chat link to the book already in the hand should record nothing, got ${JSON.stringify(again)}`,
    );
  }

  const opened = added(walk.chatAgain, walk.opened);
  if (opened.length !== 1 || opened[0]?.name !== 'Book Opened' || opened[0].book !== walk.chatId) {
    failures.push(
      `analytics: opening the held book should record one "Book Opened" for ${walk.chatId}, got ${JSON.stringify(opened)}`,
    );
  }
  return failures;
}

/**
 * The Ask drawer's Turnstile script host. A build with `PUBLIC_TURNSTILE_SITE_KEY`
 * set loads it whatever analytics says, and `deploy:site` builds the gates with
 * the real `.env`, so counting it failed every deploy since #562. C11 asks
 * whether analytics adds a host; this one predates analytics. Matched as the
 * exact host, so a subdomain, a look-alike or another port still counts.
 */
const TURNSTILE_HOST = 'challenges.cloudflare.com';

/** Requests to any host other than the page itself and Turnstile's, for C11's count of zero. */
export function foreignRequests(urls: readonly string[], pageOrigin: string): string[] {
  const home = new URL(pageOrigin).host;
  return urls.filter((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:'))
      return false;
    const { host } = new URL(url);
    return host !== home && host !== TURNSTILE_HOST;
  });
}

/**
 * The text of every call to `opener` in `source` (its parenthesised arguments)
 * that does not contain `marker`. Used to hold the two gate scripts to stripping
 * the switch from the build they start (S5, C13): those scripts run on import,
 * so a test cannot call them, and reads their source instead.
 */
export function callsMissing(source: string, opener: string, marker: string): string[] {
  const missing: string[] = [];
  let from = source.indexOf(opener);
  while (from !== -1) {
    let depth = 1;
    let at = from + opener.length;
    while (at < source.length && depth > 0) {
      const ch = source[at];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      at += 1;
    }
    const call = source.slice(from, at);
    if (!call.includes(marker)) missing.push(call);
    from = source.indexOf(opener, at);
  }
  return missing;
}
