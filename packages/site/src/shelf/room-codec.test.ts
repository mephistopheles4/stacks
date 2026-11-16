import { describe, expect, it, vi } from 'vitest';
import {
  chooseCodec,
  codecSession,
  DEFAULT_ROOM_CODEC,
  KTX2_WASM_URL,
  KTX2_WORKER_URL,
  loadWithFallback,
} from './room-codec.ts';

describe('the default set (spec S5.2)', () => {
  it('is WebP until the owner flips it', () => {
    expect(DEFAULT_ROOM_CODEC).toBe('webp');
  });

  it('serves the worker and the wasm from same-origin files, never a blob: URL', () => {
    for (const url of [KTX2_WORKER_URL, KTX2_WASM_URL]) {
      expect(url).toMatch(/^\/rooms\/basis\/[a-z0-9_-]+\.(js|wasm)$/);
    }
  });
});

describe('?tex (spec S5.3)', () => {
  it.each([
    ['?tex=webp', 'webp'],
    ['?tex=etc1s', 'etc1s'],
    ['?debug&tex=etc1s&room=reading-corner', 'etc1s'],
  ])('%s picks %s', (search, expected) => {
    expect(chooseCodec(search, 'webp')).toBe(expected);
  });

  it.each([
    '',
    '?',
    '?tex',
    '?tex=',
    '?tex=ETC1S',
    '?tex=ktx2',
    '?tex=uastc',
    '?tex=webp%00',
    '?text=etc1s',
  ])('ignores %j and keeps the default', (search) => {
    expect(chooseCodec(search, 'webp')).toBe('webp');
    expect(chooseCodec(search, 'etc1s')).toBe('etc1s');
  });

  it('reads the default constant when no fallback is passed', () => {
    expect(chooseCodec('')).toBe(DEFAULT_ROOM_CODEC);
  });
});

describe('the codec session (spec S5.4)', () => {
  it('drops KTX2 to WebP once and warns once, however many loads fail', () => {
    const warn = vi.fn();
    const session = codecSession('etc1s', warn);
    expect(session.codec()).toBe('etc1s');

    session.fail('worker error');
    session.fail('transcode failed');

    expect(session.codec()).toBe('webp');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('worker error');
  });

  it('has nothing to drop to, and says nothing, when it started on WebP', () => {
    const warn = vi.fn();
    const session = codecSession('webp', warn);
    session.fail('anything');
    expect(session.codec()).toBe('webp');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('loadWithFallback (spec S5.4)', () => {
  it('reads the set the session names and touches nothing else', async () => {
    const load = vi.fn((codec: string) => Promise.resolve(`texture-${codec}`));
    const warn = vi.fn();
    await expect(loadWithFallback(codecSession('etc1s', warn), load)).resolves.toBe(
      'texture-etc1s',
    );
    expect(load.mock.calls).toEqual([['etc1s']]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('retries on WebP when a KTX2 load fails, and warns once for the page load', async () => {
    const warn = vi.fn();
    const session = codecSession('etc1s', warn);
    const load = (codec: string): Promise<string> =>
      codec === 'etc1s' ? Promise.reject(new Error('no worker')) : Promise.resolve('webp texture');

    await expect(loadWithFallback(session, load)).resolves.toBe('webp texture');
    await expect(loadWithFallback(session, load)).resolves.toBe('webp texture');

    expect(session.codec()).toBe('webp');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns once when two loads that began on KTX2 both fail', async () => {
    const warn = vi.fn();
    const session = codecSession('etc1s', warn);
    const load = (codec: string): Promise<string> =>
      codec === 'etc1s' ? Promise.reject(new Error('late')) : Promise.resolve('ok');
    await expect(
      Promise.all([loadWithFallback(session, load), loadWithFallback(session, load)]),
    ).resolves.toEqual(['ok', 'ok']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects with a WebP failure, which is the caller to settle and warn for', async () => {
    const session = codecSession('webp', vi.fn());
    await expect(loadWithFallback(session, () => Promise.reject(new Error('404')))).rejects.toThrow(
      '404',
    );
  });

  it('rejects when the WebP retry fails too, without trying a third time', async () => {
    const load = vi.fn((codec: string) => Promise.reject(new Error(`${codec} failed`)));
    await expect(loadWithFallback(codecSession('etc1s', vi.fn()), load)).rejects.toThrow(
      'webp failed',
    );
    expect(load).toHaveBeenCalledTimes(2);
  });
});
