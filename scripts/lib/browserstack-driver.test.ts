import { describe, expect, it } from 'vitest';
import {
  createDriver,
  describeFailure,
  HubError,
  MESSAGE_LIMIT,
  parseCredentials,
  scrub,
  sessionBody,
  swipeActions,
  type Capabilities,
  type Fetcher,
} from './browserstack-driver.ts';

const CREDENTIALS = { user: 'someone', key: 'not-a-real-key' };
const SESSION = 'a'.repeat(40);
const CAPS: Capabilities = {
  deviceName: 'iPhone 16 Pro',
  osVersion: '18',
  browserName: 'safari',
  local: false,
  sessionName: 'test',
};

interface Seen {
  readonly url: string;
  readonly init: RequestInit;
}

/** A hub that answers each call from `answers`, in order, and records what it was sent. */
function hub(answers: readonly { status?: number; body: unknown }[]): {
  send: Fetcher;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  let next = 0;
  const send: Fetcher = (url, init) => {
    seen.push({ url, init });
    const answer = answers[next] ?? { body: { value: null } };
    next += 1;
    const text = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body);
    return Promise.resolve(new Response(text, { status: answer.status ?? 200 }));
  };
  return { send, seen };
}

describe('parseCredentials', () => {
  it('reads the two names, quoted or not, with CRLF endings and an export prefix', () => {
    const text = 'BROWSERSTACK_USERNAME="someone"\r\nexport BROWSERSTACK_ACCESS_KEY=abc123\r\n';
    expect(parseCredentials(text)).toEqual({ user: 'someone', key: 'abc123' });
  });

  it('is undefined when either is missing or empty', () => {
    expect(parseCredentials('BROWSERSTACK_USERNAME=someone')).toBeUndefined();
    expect(
      parseCredentials('BROWSERSTACK_USERNAME=someone\nBROWSERSTACK_ACCESS_KEY='),
    ).toBeUndefined();
    expect(parseCredentials('')).toBeUndefined();
  });
});

describe('what an error prints', () => {
  it('masks a session id and cuts the message', () => {
    expect(scrub(`gone: ${SESSION}`)).toBe('gone: <session>');
    expect(scrub('x'.repeat(500))).toHaveLength(MESSAGE_LIMIT);
  });

  it('is the status and the hub message, never the body that carried the request', () => {
    const body = JSON.stringify({ value: { message: `no such session ${SESSION}` } });
    expect(describeFailure(404, body)).toBe('HTTP 404: no such session <session>');
    expect(describeFailure(500, 'plain text failure')).toBe('HTTP 500: plain text failure');
  });
});

describe('the new-session body', () => {
  it('names the device and the tunnel and carries no credential', () => {
    const body = JSON.stringify(sessionBody({ ...CAPS, local: true }));
    expect(body).toContain('"deviceName":"iPhone 16 Pro"');
    expect(body).toContain('"local":"true"');
    expect(body).toContain('"realMobile":"true"');
    expect(body).not.toMatch(/userName|accessKey|key/i);
  });
});

describe('swipeActions', () => {
  it('is one touch finger: down, a timed drag, up', () => {
    const body = swipeActions({ x: 100.4, y: 500 }, { x: 100, y: 200 }, 600) as {
      actions: { parameters: { pointerType: string }; actions: { type: string; y?: number }[] }[];
    };
    const [finger] = body.actions;
    expect(finger?.parameters.pointerType).toBe('touch');
    expect(finger?.actions.map((step) => step.type)).toEqual([
      'pointerMove',
      'pointerDown',
      'pause',
      'pointerMove',
      'pointerUp',
    ]);
    expect(finger?.actions[3]).toMatchObject({ x: 100, y: 200, duration: 600 });
  });
});

describe('the driver', () => {
  it('signs every call in an Authorization header and puts no credential in a URL', async () => {
    const { send, seen } = hub([
      { body: { value: { sessionId: SESSION } } },
      { body: { value: 7 } },
      { body: { value: null } },
    ]);
    const driver = createDriver(CREDENTIALS, send, 'https://hub.example/wd/hub');
    await driver.start(CAPS);
    expect(await driver.run('return 7')).toBe(7);
    await driver.end();

    expect(seen.map((call) => `${String(call.init.method)} ${call.url}`)).toEqual([
      'POST https://hub.example/wd/hub/session',
      `POST https://hub.example/wd/hub/session/${SESSION}/execute/sync`,
      `DELETE https://hub.example/wd/hub/session/${SESSION}`,
    ]);
    const expected = `Basic ${Buffer.from('someone:not-a-real-key').toString('base64')}`;
    for (const call of seen) {
      expect((call.init.headers as Record<string, string>).Authorization).toBe(expected);
      expect(call.url).not.toContain('not-a-real-key');
      expect(call.url).not.toContain('someone');
    }
  });

  it('reports a failed call with its status and no request in the message', async () => {
    const { send } = hub([{ status: 401, body: { value: { message: 'Authorization required' } } }]);
    const driver = createDriver(CREDENTIALS, send);
    const failure = await driver.start(CAPS).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HubError);
    expect((failure as Error).message).toBe('HTTP 401: Authorization required');
  });

  it('masks the session id out of a transport failure', async () => {
    const driver = createDriver(CREDENTIALS, (url) => {
      if (url.endsWith('/session')) {
        return Promise.resolve(new Response(JSON.stringify({ value: { sessionId: SESSION } })));
      }
      return Promise.reject(new Error(`connect failed for /session/${SESSION}/url`));
    });
    await driver.start(CAPS);
    const failure = await driver.navigate('https://x.example/').catch((error: unknown) => error);
    expect((failure as Error).message).toBe(
      'request failed: connect failed for /session/<redacted>/url',
    );
  });

  it('masks the account, the key and the signed header by value when the hub echoes them', async () => {
    const encoded = Buffer.from('someone:not-a-real-key').toString('base64');
    const echo = `bad login someone / not-a-real-key / Basic ${encoded} / ${'b'.repeat(64)}`;
    const { send } = hub([{ status: 401, body: { value: { message: echo } } }]);
    const failure = await createDriver(CREDENTIALS, send)
      .start(CAPS)
      .catch((error: unknown) => error);
    const message = (failure as Error).message;
    for (const secret of ['someone', 'not-a-real-key', encoded, 'bbbb']) {
      expect(message).not.toContain(secret);
    }
    expect(message).toContain('<redacted>');
  });

  it('masks a session id of a shape it does not know, once it holds one', async () => {
    const odd = 'sess-ion/odd id';
    const driver = createDriver(CREDENTIALS, (url) =>
      url.endsWith('/session')
        ? Promise.resolve(new Response(JSON.stringify({ value: { sessionId: odd } })))
        : Promise.reject(new Error(`failed at ${url}`)),
    );
    await driver.start(CAPS);
    const failure = await driver.navigate('https://x.example/').catch((error: unknown) => error);
    expect((failure as Error).message).not.toContain(odd);
  });

  it('replaces control characters, so a page or hub cannot move the cursor', () => {
    expect(scrub('a\u001b[2Jb\u0007c\u0085d')).toBe('a [2Jb c d');
  });

  it('says only that a 2xx answer was not JSON, never quoting it', async () => {
    const { send } = hub([{ body: 'not json at all, with a snippet' }]);
    const failure = await createDriver(CREDENTIALS, send)
      .start(CAPS)
      .catch((error: unknown) => error);
    expect((failure as Error).message).toBe("HTTP 200: the hub's answer was not JSON");
  });

  it('sets the script timeout through the W3C timeouts call', async () => {
    const { send, seen } = hub([
      { body: { value: { sessionId: SESSION } } },
      { body: { value: null } },
    ]);
    const driver = createDriver(CREDENTIALS, send, 'https://hub.example/wd/hub');
    await driver.start(CAPS);
    await driver.setScriptTimeout(90_000);
    expect(seen[1]?.url).toBe(`https://hub.example/wd/hub/session/${SESSION}/timeouts`);
    expect(seen[1]?.init.body).toBe(JSON.stringify({ script: 90_000 }));
  });

  it('refuses a call before a session is open, and a hub that returns none', async () => {
    const driver = createDriver(CREDENTIALS, hub([{ body: { value: {} } }]).send);
    await expect(driver.run('return 1')).rejects.toThrow('no session is open');
    await expect(driver.start(CAPS)).rejects.toThrow('the hub returned no session');
  });

  it('ends a session once, and swallows a hub that already ended it', async () => {
    const { send, seen } = hub([
      { body: { value: { sessionId: SESSION } } },
      { status: 404, body: { value: { message: 'gone' } } },
    ]);
    const driver = createDriver(CREDENTIALS, send);
    await driver.start(CAPS);
    await driver.end();
    await driver.end();
    expect(seen).toHaveLength(2);
  });
});
