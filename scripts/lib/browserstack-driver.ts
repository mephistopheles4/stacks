/**
 * A WebDriver client for BrowserStack Automate, over `fetch`, for
 * `scripts/ios-swipe-check.ts` (docs/spec — #599, S8). **No dependency**: the
 * W3C protocol is a handful of JSON calls, and a client library would be one
 * more package that reads the owner's credential.
 *
 * **The credential's whole path is in this file and the script's entry point.**
 * It is read from a file the owner keeps outside the repository, held in the
 * closure that signs requests, and sent in an `Authorization` header and
 * nowhere else: never in a URL, never on a command line, never in a log or an
 * error. A failed call reaches the screen as a `HubError`, whose message is the
 * HTTP status and the hub's own message cut short, with every control
 * character dropped, every secret this driver holds masked **by value** (the
 * account name, the key, the signed header, the session id) and every session
 * id masked by shape — never the request, which carries the capabilities.
 *
 * Pure of the network: `fetch` is passed in, so a test drives it with a stub.
 */

/** The W3C hub BrowserStack Automate serves. */
export const HUB = 'https://hub-cloud.browserstack.com/wd/hub';

/** The longest hub message an error prints. */
export const MESSAGE_LIMIT = 200;

export interface Credentials {
  readonly user: string;
  readonly key: string;
}

/**
 * The two values out of `~/.config/browserstack.env`: `BROWSERSTACK_USERNAME`
 * and `BROWSERSTACK_ACCESS_KEY`, one `NAME=value` per line, a value optionally
 * quoted. `undefined` when either is missing or empty; never a value in a
 * message, so a caller that reports it can say only which name was absent.
 */
export function parseCredentials(text: string): Credentials | undefined {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match === null) continue;
    const [, name, raw] = match;
    if (name === undefined || raw === undefined) continue;
    values.set(name, raw.replace(/^(["'])(.*)\1$/, '$2'));
  }
  const user = values.get('BROWSERSTACK_USERNAME');
  const key = values.get('BROWSERSTACK_ACCESS_KEY');
  if (user === undefined || user === '' || key === undefined || key === '') return undefined;
  return { user, key };
}

/** Hex session ids, which a hub's message and a path both carry. */
const SESSION_ID = /[0-9a-f]{40,}/gi;

/** C0 and C1 controls: outside text must not reach a terminal as an escape sequence. */
// eslint-disable-next-line no-control-regex -- the controls are the point of the expression
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * `text` as it may be printed: each of `secrets` masked wherever it occurs,
 * every session id masked by shape, control characters replaced by a space,
 * and the whole cut to `MESSAGE_LIMIT` characters.
 */
export function scrub(text: string, secrets: readonly string[] = []): string {
  let masked = text;
  for (const secret of secrets) {
    if (secret !== '') masked = masked.split(secret).join('<redacted>');
  }
  return masked.replace(SESSION_ID, '<session>').replace(CONTROLS, ' ').slice(0, MESSAGE_LIMIT);
}

/** What a failed call prints: the status and the hub's message, scrubbed. Never the request. */
export function describeFailure(
  status: number,
  body: string,
  secrets: readonly string[] = [],
): string {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { value?: { message?: unknown }; message?: unknown };
    const found = parsed.value?.message ?? parsed.message;
    if (typeof found === 'string') message = found;
  } catch {
    // Not JSON: the text itself, cut short.
  }
  return `HTTP ${String(status)}: ${scrub(message, secrets)}`;
}

export interface Capabilities {
  readonly deviceName: string;
  readonly osVersion: string;
  readonly browserName: string;
  /** Whether the device reaches the owner's machine through BrowserStack Local. */
  readonly local: boolean;
  readonly sessionName: string;
}

/** The W3C new-session body: BrowserStack's own `bstack:options` carries the device. */
export function sessionBody(caps: Capabilities): unknown {
  return {
    capabilities: {
      alwaysMatch: {
        browserName: caps.browserName,
        'bstack:options': {
          deviceName: caps.deviceName,
          osVersion: caps.osVersion,
          realMobile: 'true',
          local: caps.local ? 'true' : 'false',
          projectName: 'stacks',
          buildName: 'ios-swipe-check',
          sessionName: caps.sessionName,
        },
      },
    },
  };
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A W3C `actions` body for one finger: down at `from`, drag to `to` over
 * `dragMs`, up. A `touch` pointer, so the page sees touch events and iOS starts
 * (or does not start) its native scroll as it would for a thumb.
 */
export function swipeActions(from: Point, to: Point, dragMs: number): unknown {
  return {
    actions: [
      {
        type: 'pointer',
        id: 'finger',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: Math.round(from.x), y: Math.round(from.y) },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 100 },
          { type: 'pointerMove', duration: dragMs, x: Math.round(to.x), y: Math.round(to.y) },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  };
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface Driver {
  /** Opens a session on the hub and returns nothing the caller may print. */
  start(caps: Capabilities): Promise<void>;
  navigate(url: string): Promise<void>;
  /** How long a script may run, in ms: the longest one here outlasts WebDriver's 30 s default. */
  setScriptTimeout(ms: number): Promise<void>;
  /** Runs `script` in the page and returns what it returns. */
  run(script: string, args?: readonly unknown[]): Promise<unknown>;
  /** The same, for a script that calls its last argument with the result. */
  runAsync(script: string, args?: readonly unknown[]): Promise<unknown>;
  swipe(from: Point, to: Point, dragMs: number): Promise<void>;
  /** Ends the session. Never throws: it runs in a `finally`. */
  end(): Promise<void>;
}

/** One failed hub call, carrying only what `describeFailure` allows. */
export class HubError extends Error {}

/**
 * A driver that signs every request with `credentials` in an `Authorization`
 * header. The session id lives in the closure and is used to build request
 * paths; it never reaches a message.
 */
export function createDriver(credentials: Credentials, send: Fetcher, hub = HUB): Driver {
  const encoded = Buffer.from(`${credentials.user}:${credentials.key}`).toString('base64');
  const authorization = `Basic ${encoded}`;
  let session: string | undefined;
  /** Every value that must never print, however the hub or the transport words it. */
  const secrets = (): string[] => [
    authorization,
    encoded,
    credentials.key,
    credentials.user,
    ...(session === undefined ? [] : [session]),
  ];

  const call = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await send(`${hub}${path}`, {
        method,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      // A transport error can name the URL, and the URL carries the session id.
      throw new HubError(
        `request failed: ${scrub(error instanceof Error ? error.message : '', secrets())}`,
      );
    }
    const text = await response.text();
    if (!response.ok) throw new HubError(describeFailure(response.status, text, secrets()));
    if (text === '') return undefined;
    try {
      return (JSON.parse(text) as { value?: unknown }).value;
    } catch {
      // A parse error quotes the body, and the hub's answer is not printed.
      throw new HubError(`HTTP ${String(response.status)}: the hub's answer was not JSON`);
    }
  };

  const sessionPath = (tail: string): string => {
    if (session === undefined) throw new HubError('no session is open');
    return `/session/${session}${tail}`;
  };

  return {
    async start(caps) {
      const value = (await call('POST', '/session', sessionBody(caps))) as
        { sessionId?: unknown } | undefined;
      const id = value?.sessionId;
      if (typeof id !== 'string' || id === '') throw new HubError('the hub returned no session');
      session = id;
    },
    async navigate(url) {
      await call('POST', sessionPath('/url'), { url });
    },
    async setScriptTimeout(ms) {
      await call('POST', sessionPath('/timeouts'), { script: ms });
    },
    async run(script, args = []) {
      return call('POST', sessionPath('/execute/sync'), { script, args });
    },
    async runAsync(script, args = []) {
      return call('POST', sessionPath('/execute/async'), { script, args });
    },
    async swipe(from, to, dragMs) {
      await call('POST', sessionPath('/actions'), swipeActions(from, to, dragMs));
    },
    async end() {
      if (session === undefined) return;
      const id = session;
      session = undefined;
      try {
        await call('DELETE', `/session/${id}`);
      } catch {
        // The run is over; a session the hub already ended is not a failure.
      }
    },
  };
}
