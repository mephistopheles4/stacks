import { describe, expect, it } from 'vitest';
import { resolveSettings, DEFAULT_SETTINGS } from './shelf-settings.ts';
import { bookLimit, readSettings } from './shelf-url.ts';

/**
 * The reading half only.
 *
 * `writeSettings` touches `window.history`, and these run under vitest's node
 * environment. The round trip through a real browser is exercised by hand and
 * recorded in the commit; what is worth pinning here is the *parsing*, because
 * that is where a hand-typed or chat-mangled URL meets the shelf — and every
 * failure mode below is one where the shelf would otherwise look deliberately
 * configured when it had actually mis-read something.
 */

const read = (query: string) => resolveSettings(readSettings(new URLSearchParams(query)));

describe('bookLimit', () => {
  it('is absent when nothing asked', () => {
    expect(bookLimit(new URLSearchParams(''))).toBeUndefined();
  });

  it('allows zero — an empty case still pays the whole fixed cost', () => {
    expect(bookLimit(new URLSearchParams('books=0'))).toBe(0);
  });

  it('ignores a typo rather than showing an empty shelf', () => {
    // The failure this prevents: `?books=fiive` rendering nothing, which looks
    // like a different bug entirely.
    expect(bookLimit(new URLSearchParams('books=fiive'))).toBeUndefined();
    expect(bookLimit(new URLSearchParams('books=-3'))).toBeUndefined();
    expect(bookLimit(new URLSearchParams('books=2.5'))).toBeUndefined();
  });
});

describe('the ten probes', () => {
  it('leaves everything at the defaults for a bare ?debug', () => {
    expect(read('debug')).toEqual(DEFAULT_SETTINGS);
  });

  it('reads a bare flag as on, so ?aa does not silently disable', () => {
    expect(read('aa').renderer.antialias).toBe(true);
  });

  it('treats 0, false and off as off', () => {
    for (const value of ['0', 'false', 'off']) {
      expect(read(`aa=${value}`).renderer.antialias).toBe(false);
    }
  });

  it('maps every probe to its setting', () => {
    const settings = read(
      'aa=0&dpr=1&guard=1&shadows=1&shadowmap=512&shadowtype=vsm&casters=0&shadowfetch=0&painted=0',
    );

    expect(settings.renderer).toMatchObject({
      antialias: false,
      maxPixelRatio: 1,
      guardResize: true,
    });
    expect(settings.shadows).toEqual({
      enabled: true,
      mapSize: 512,
      type: 'vsm',
      casters: false,
      fetch: false,
      painted: false,
    });
  });

  it('refuses a shadow type it does not know', () => {
    // The hazard: `SHADOW_TYPES[type]` would resolve `undefined` and hand it to
    // three without complaint, so a typo would silently change the filter.
    expect(read('shadowtype=fancy').shadows.type).toBe(DEFAULT_SETTINGS.shadows.type);
  });

  it('refuses a nonsense pixel ratio or map size', () => {
    expect(read('dpr=0').renderer.maxPixelRatio).toBe(DEFAULT_SETTINGS.renderer.maxPixelRatio);
    expect(read('dpr=x').renderer.maxPixelRatio).toBe(DEFAULT_SETTINGS.renderer.maxPixelRatio);
    expect(read('shadowmap=1.5').shadows.mapSize).toBe(DEFAULT_SETTINGS.shadows.mapSize);
    expect(read('shadowmap=-1').shadows.mapSize).toBe(DEFAULT_SETTINGS.shadows.mapSize);
  });
});

describe('?tune', () => {
  it('carries a light change through', () => {
    const query = `tune=${encodeURIComponent(JSON.stringify({ lighting: { key: { intensity: 4.5 } } }))}`;

    expect(read(query).lighting.key.intensity).toBe(4.5);
    // and leaves its siblings alone
    expect(read(query).lighting.key.colour).toBe(DEFAULT_SETTINGS.lighting.key.colour);
    expect(read(query).lighting.fill).toEqual(DEFAULT_SETTINGS.lighting.fill);
  });

  it('carries tone mapping and exposure', () => {
    const query = `tune=${encodeURIComponent(JSON.stringify({ toneMapping: 'aces', exposure: 1.4 }))}`;
    expect(read(query).renderer).toMatchObject({ toneMapping: 'aces', exposure: 1.4 });
  });

  it('falls back to the shipped shelf when the value is not JSON', () => {
    // A URL pasted through a chat client that mangled it must not produce a
    // half-applied shelf that looks like somebody's deliberate configuration.
    expect(read('tune=%7Bbroken')).toEqual(DEFAULT_SETTINGS);
    expect(read('tune=null')).toEqual(DEFAULT_SETTINGS);
    expect(read('tune=[1,2]')).toEqual(DEFAULT_SETTINGS);
  });

  it('refuses a tone mapping name it does not know', () => {
    const query = `tune=${encodeURIComponent(JSON.stringify({ toneMapping: 'filmic' }))}`;
    expect(read(query).renderer.toneMapping).toBe(DEFAULT_SETTINGS.renderer.toneMapping);
  });

  it('refuses a non-finite exposure', () => {
    // `JSON.stringify(Infinity)` is `null`, so this is the shape that actually
    // arrives; a NaN exposure would black the shelf out with no explanation.
    const query = `tune=${encodeURIComponent('{"exposure":"1.4"}')}`;
    expect(read(query).renderer.exposure).toBe(DEFAULT_SETTINGS.renderer.exposure);
  });

  it('carries the books category, which is the first new top-level key since this was written', () => {
    // `books` is not one of the ten historic probe spellings, so a URL is the
    // only way to hand a phone a dialled mixture — and `readTune` has to have
    // been taught the key or a pasted URL silently renders the shipped shelf
    // with nothing saying so, which is the failure this file's header describes.
    const query = `tune=${encodeURIComponent(JSON.stringify({ books: { paperbackRatio: 0.2, headCap: 0 } }))}`;

    expect(read(query).books).toEqual({ paperbackRatio: 0.2, headCap: 0 });
  });

  it('carries a nested profile without flattening it or losing its sibling', () => {
    // `spineProfile` is the first *nested object* inside `materials`; every other
    // key there is a flat scalar, so the cast in `readTune` had never been asked
    // to carry one.
    const query = `tune=${encodeURIComponent(
      JSON.stringify({ materials: { spineProfile: { paperback: { roll: 0.5 } } } }),
    )}`;
    const settings = read(query);

    expect(settings.materials.spineProfile.paperback.roll).toBe(0.5);
    expect(settings.materials.spineProfile.paperback.rise).toBe(
      DEFAULT_SETTINGS.materials.spineProfile.paperback.rise,
    );
    expect(settings.materials.spineProfile.hardback).toEqual(
      DEFAULT_SETTINGS.materials.spineProfile.hardback,
    );
    expect(settings.materials.pageStriation).toBe(DEFAULT_SETTINGS.materials.pageStriation);
  });

  it('does not let a tune blob override a probe typed by hand', () => {
    // The two vocabularies never overlap, so a legacy probe is always the last
    // word on the nine settings it owns. Someone appending `&shadows=1` to a
    // dialled URL on a phone must get shadows.
    const tune = encodeURIComponent(JSON.stringify({ lighting: { key: { intensity: 4.5 } } }));
    const settings = read(`tune=${tune}&shadows=1`);

    expect(settings.shadows.enabled).toBe(true);
    expect(settings.lighting.key.intensity).toBe(4.5);
  });
});
