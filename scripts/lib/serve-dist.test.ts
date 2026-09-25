/**
 * Which file the gate's static server hands out for a URL.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`. Only the pure half is
 * tested: the server itself would need a socket, and G21 (`no-live-network`)
 * guards `fetch` for the whole suite. `pnpm smoke:render` exercises the rest on
 * every run, since nothing loads without it.
 *
 * ⚠️ **Segments, never a joined path**, so every expectation below is a literal
 * that means the same thing on Windows and on a CI runner — the host-dependent
 * path logic that passes locally is exactly what this shape avoids.
 */

import { describe, expect, it } from 'vitest';
import { LIBRARY_PATHS, resolveServedPath } from './serve-dist.ts';

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
