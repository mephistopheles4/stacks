/**
 * Which file the gate's static server hands out for a URL.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`. Everything but the socket
 * is tested: the handler answers a stand-in response from folders built in a
 * temp directory, because a real server would need a socket and G21
 * (`no-live-network`) guards `fetch` for the whole suite. `pnpm smoke:render`
 * exercises the socket on every run, since nothing loads without it.
 *
 * ⚠️ **Segments and `/`-joined keys, never a joined path**, so every
 * expectation below is a literal that means the same thing on Windows and on a
 * CI runner — the host-dependent path logic that passes locally is exactly
 * what this shape avoids. The one exception builds the expected path with
 * `join` on purpose: it is the path the walk found on *this* host.
 */

import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  distHandler,
  indexFolder,
  LIBRARY_PATHS,
  resolveServedPath,
  type ServeOptions,
} from './serve-dist.ts';

describe('resolveServedPath — what the build serves', () => {
  it('serves the index for the site root', () => {
    expect(resolveServedPath('/')).toEqual({ from: 'root', segments: ['index.html'] });
  });

  it('serves a bundled file from the build, whatever its query', () => {
    expect(resolveServedPath('/_astro/boot.BX12.js?v=3#x')).toEqual({
      from: 'root',
      segments: ['_astro', 'boot.BX12.js'],
    });
  });

  it('serves a folder index for a trailing slash', () => {
    expect(resolveServedPath('/wood/')).toEqual({ from: 'root', segments: ['wood', 'index.html'] });
  });

  it('decodes an escaped name before deciding anything', () => {
    expect(resolveServedPath('/covers/a%20b.png')?.segments).toEqual(['covers', 'a b.png']);
  });
});

describe('resolveServedPath — the library overlay', () => {
  it('serves library.json and covers from the overlay', () => {
    expect(resolveServedPath('/library.json')).toEqual({
      from: 'overlay',
      segments: ['library.json'],
    });
    expect(resolveServedPath('/covers/tidal.png')).toEqual({
      from: 'overlay',
      segments: ['covers', 'tidal.png'],
    });
  });

  it('serves everything else from the build, even under a name that starts the same', () => {
    expect(resolveServedPath('/covers-old/x.png')?.from).toBe('root');
    expect(resolveServedPath('/library.json.bak')?.from).toBe('root');
  });

  it('serves the library from the build when there is no overlay', () => {
    expect(resolveServedPath('/library.json', [])).toEqual({
      from: 'root',
      segments: ['library.json'],
    });
  });

  it('names exactly the two paths a staged library occupies', () => {
    expect(LIBRARY_PATHS).toEqual(['library.json', 'covers']);
  });
});

describe('resolveServedPath — what it refuses', () => {
  it.each([
    ['a parent segment', '/../package.json'],
    ['an escaped parent segment', '/%2e%2e/package.json'],
    ['a parent segment inside the overlay', '/covers/../../.env'],
    ['a dot segment', '/./index.html'],
    ['an empty segment', '//index.html'],
    ['a backslash', '/covers/..%5C..%5C.env'],
    ['a drive letter', '/C:/Windows/win.ini'],
    ['a NUL byte', '/index.html%00.png'],
    ['a malformed escape', '/%E0%A4%A'],
    ['a path that is not absolute', 'index.html'],
  ])('refuses %s', (_name, url) => {
    expect(resolveServedPath(url)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  the index and the handler, over real folders                               */
/* -------------------------------------------------------------------------- */

/** Writes each `/`-separated path under `folder`, with its own name as the body. */
function plant(folder: string, paths: readonly string[]): void {
  for (const path of paths) {
    const file = join(folder, ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${path} in ${folder === overlay ? 'overlay' : 'root'}`);
  }
}

let scratch = '';
let root = '';
let overlay = '';

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'serve-dist-'));
  root = join(scratch, 'dist');
  overlay = join(scratch, 'staged');
  plant(root, [
    'index.html',
    '_astro/boot.js',
    'wood/index.html',
    'library.json',
    'covers/tidal.png',
    'covers/only-in-build.png',
    'covers-old/x.png',
    'robots',
  ]);
  plant(overlay, ['library.json', 'covers/tidal.png', 'index.html']);
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly text: string | undefined;
}

/** One request through the handler, into a stand-in response. */
function ask(handler: ReturnType<typeof distHandler>, url: string): Answer {
  let status = 0;
  let headers: Readonly<Record<string, string>> | undefined;
  let text: string | undefined;
  handler(
    { url },
    {
      writeHead: (code, sent) => {
        status = code;
        headers = sent;
      },
      end: (body) => {
        text = body?.toString();
      },
    },
  );
  return { status, headers, text };
}

const serve = (options: Partial<ServeOptions> = {}): ReturnType<typeof distHandler> =>
  distHandler({ root, ...options });

describe('indexFolder — what a walk found', () => {
  it('keys every file by its `/`-joined path under the folder, and nothing else', () => {
    expect([...indexFolder(root).keys()].sort()).toEqual([
      '_astro/boot.js',
      'covers-old/x.png',
      'covers/only-in-build.png',
      'covers/tidal.png',
      'index.html',
      'library.json',
      'robots',
      'wood/index.html',
    ]);
  });

  it('values each key with the path the walk found on disk', () => {
    expect(indexFolder(root).get('_astro/boot.js')).toBe(join(root, '_astro', 'boot.js'));
  });

  it('indexes nothing for a folder that is not there, rather than throwing', () => {
    expect(indexFolder(join(scratch, 'never-built')).size).toBe(0);
  });
});

describe('distHandler — what the build serves', () => {
  it('serves the index for the site root, as HTML with the headers it was given', () => {
    const answer = ask(serve({ headers: { 'Cache-Control': 'no-store' } }), '/');
    expect(answer).toEqual({
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      text: 'index.html in root',
    });
  });

  it('serves a bundled file by its extension, whatever its query', () => {
    const answer = ask(serve(), '/_astro/boot.js?v=3');
    expect(answer.status).toBe(200);
    expect(answer.headers?.['Content-Type']).toBe('text/javascript; charset=utf-8');
    expect(answer.text).toBe('_astro/boot.js in root');
  });

  it('serves a folder index for a trailing slash', () => {
    expect(ask(serve(), '/wood/').text).toBe('wood/index.html in root');
  });

  it('serves a file with no known extension as bytes', () => {
    expect(ask(serve(), '/robots').headers?.['Content-Type']).toBe('application/octet-stream');
  });

  it('serves a fixed page before anything on disk, whatever its query', () => {
    const handler = serve({ pages: { '/index.html': '<p>fixed</p>' } });
    expect(ask(handler, '/index.html?x=1')).toEqual({
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      text: '<p>fixed</p>',
    });
  });

  it.each([
    ['a file that is not there', '/nope.html'],
    ['a folder without a trailing slash', '/wood'],
    ['a parent segment', '/../staged/library.json'],
    ['an escaped parent segment', '/%2e%2e/staged/library.json'],
    ['a name only an inherited property has', '/constructor'],
  ])('answers 404 for %s', (_name, url) => {
    expect(ask(serve({ overlay }), url)).toMatchObject({ status: 404, text: 'not found' });
  });
});

describe('distHandler — the library overlay', () => {
  it('serves library.json and covers from the overlay', () => {
    const handler = serve({ overlay });
    expect(ask(handler, '/library.json').text).toBe('library.json in overlay');
    expect(ask(handler, '/covers/tidal.png').text).toBe('covers/tidal.png in overlay');
  });

  it('answers 404 for a cover only the build has, rather than falling through to it', () => {
    // The control: without an overlay the same cover is there to be served, so
    // the 404 below is the overlay's precedence and not a broken walk.
    expect(ask(serve(), '/covers/only-in-build.png').status).toBe(200);
    expect(ask(serve({ overlay }), '/covers/only-in-build.png').status).toBe(404);
  });

  it('serves everything else from the build, even what the overlay also holds', () => {
    const handler = serve({ overlay });
    expect(ask(handler, '/index.html').text).toBe('index.html in root');
    expect(ask(handler, '/covers-old/x.png').text).toBe('covers-old/x.png in root');
  });

  it('serves the library from the build when there is no overlay', () => {
    expect(ask(serve(), '/library.json').text).toBe('library.json in root');
  });
});

describe('distHandler — the index is taken once, at the start', () => {
  it('answers 404 for a file removed after the start, rather than throwing', () => {
    const folder = join(scratch, 'shrinking');
    plant(folder, ['index.html', 'gone.html']);
    const handler = distHandler({ root: folder });
    unlinkSync(join(folder, 'gone.html'));
    expect(ask(handler, '/index.html').status).toBe(200);
    expect(ask(handler, '/gone.html')).toMatchObject({ status: 404, text: 'not found' });
  });

  it('does not serve a file that appeared after the start', () => {
    const folder = join(scratch, 'growing');
    plant(folder, ['index.html']);
    const handler = distHandler({ root: folder });
    plant(folder, ['late.html']);
    expect(ask(handler, '/index.html').status).toBe(200);
    expect(ask(handler, '/late.html').status).toBe(404);
  });
});
