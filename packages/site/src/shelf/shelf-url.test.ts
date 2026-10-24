import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAINTED_BASE } from './shadow-fallback.ts';
import { resolveSettings, DEFAULT_SETTINGS, type ShelfSettings } from './shelf-settings.ts';
import {
  bookLimit,
  carriesSettings,
  keepSettingsInAddress,
  readSettings,
  retiredTuneHint,
  woodSeed,
  writeSettings,
} from './shelf-url.ts';

/**
 * Mostly the reading half.
 *
 * `writeSettings` touches `window.history`, and these run under vitest's node
 * environment. The round trip through a real browser is exercised by hand and
 * recorded in the commit; what is worth pinning here is the *parsing*, because
 * that is where a hand-typed or chat-mangled URL meets the shelf — and every
 * failure mode below is one where the shelf would otherwise look deliberately
 * configured when it had actually mis-read something. The one writing rule
 * pinned, against a stubbed `window`, is that a device's lost-context record
 * never reaches a URL.
 */

const read = (query: string) => resolveSettings(readSettings(new URLSearchParams(query)));

describe('bookLimit', () => {
  it('is absent when nothing asked', () => {
    expect(bookLimit(new URLSearchParams(''))).toBeUndefined();
  });

  it('allows zero — an empty bookcase still pays the whole fixed cost', () => {
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

describe('the probes', () => {
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
      'aa=0&dpr=1&guard=1&shadows=1&shadowmap=512&shadowtype=vsm&casters=0&receivers=all&shadowfetch=0&painted=0',
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
      receivers: 'all',
      fetch: false,
      painted: false,
    });
  });

  it('refuses a shadow type it does not know', () => {
    // The hazard: `SHADOW_TYPES[type]` would resolve `undefined` and hand it to
    // three without complaint, so a typo would silently change the filter.
    expect(read('shadowtype=fancy').shadows.type).toBe(DEFAULT_SETTINGS.shadows.type);
  });

  it('refuses a receiver set it does not know', () => {
    // `?receivers=books` is not a configuration anybody measured. Falling back
    // to the default keeps a typo from quietly re-arming the one that crashes.
    expect(read('receivers=books').shadows.receivers).toBe('bookcase');
    expect(read('receivers=').shadows.receivers).toBe('bookcase');
  });

  it('keeps ?shadows=1 to the bookcase unless ?receivers=all asks for more', () => {
    expect(read('shadows=1').shadows.receivers).toBe('bookcase');
    expect(read('shadows=1&receivers=all').shadows.receivers).toBe('all');
  });

  it('gives a bare page real-time shadows with only the bookcase reading them', () => {
    // ADR-0090: the default for every visitor, with no probe typed at all.
    expect(read('').shadows).toMatchObject({ enabled: true, receivers: 'bookcase' });
  });

  it('turns real-time shadows off for ?shadows=0, which is the painted fallback', () => {
    expect(read('shadows=0').shadows.enabled).toBe(false);
    expect(read('shadows=0').shadows.painted).toBe(true);
  });

  it('refuses a nonsense pixel ratio or map size', () => {
    expect(read('dpr=0').renderer.maxPixelRatio).toBe(DEFAULT_SETTINGS.renderer.maxPixelRatio);
    expect(read('dpr=x').renderer.maxPixelRatio).toBe(DEFAULT_SETTINGS.renderer.maxPixelRatio);
    expect(read('shadowmap=1.5').shadows.mapSize).toBe(DEFAULT_SETTINGS.shadows.mapSize);
    expect(read('shadowmap=-1').shadows.mapSize).toBe(DEFAULT_SETTINGS.shadows.mapSize);
  });
});

describe('?debug=<json>', () => {
  it('carries a light change through', () => {
    const query = `debug=${encodeURIComponent(JSON.stringify({ lighting: { key: { intensity: 4.5 } } }))}`;

    expect(read(query).lighting.key.intensity).toBe(4.5);
    // and leaves its siblings alone
    expect(read(query).lighting.key.colour).toBe(DEFAULT_SETTINGS.lighting.key.colour);
    expect(read(query).lighting.fill).toEqual(DEFAULT_SETTINGS.lighting.fill);
  });

  it('carries tone mapping and exposure', () => {
    const query = `debug=${encodeURIComponent(JSON.stringify({ toneMapping: 'aces', exposure: 1.4 }))}`;
    expect(read(query).renderer).toMatchObject({ toneMapping: 'aces', exposure: 1.4 });
  });

  it('falls back to the shipped shelf when the value is not JSON', () => {
    // A URL pasted through a chat client that mangled it must not produce a
    // half-applied shelf that looks like somebody's deliberate configuration.
    expect(read('debug=%7Bbroken')).toEqual(DEFAULT_SETTINGS);
    expect(read('debug=null')).toEqual(DEFAULT_SETTINGS);
    expect(read('debug=[1,2]')).toEqual(DEFAULT_SETTINGS);
  });

  it('refuses a tone mapping name it does not know', () => {
    const query = `debug=${encodeURIComponent(JSON.stringify({ toneMapping: 'filmic' }))}`;
    expect(read(query).renderer.toneMapping).toBe(DEFAULT_SETTINGS.renderer.toneMapping);
  });

  it('refuses a non-finite exposure', () => {
    // `JSON.stringify(Infinity)` is `null`, so this is the shape that actually
    // arrives; a NaN exposure would black the shelf out with no explanation.
    const query = `debug=${encodeURIComponent('{"exposure":"1.4"}')}`;
    expect(read(query).renderer.exposure).toBe(DEFAULT_SETTINGS.renderer.exposure);
  });

  describe('a value of the wrong type (#491)', () => {
    afterEach(() => vi.restoreAllMocks());
    const debug = (diff: unknown) => `debug=${encodeURIComponent(JSON.stringify(diff))}`;

    it.each([
      ['a null number', 'lighting.key.intensity', { lighting: { key: { intensity: null } } }],
      ['a string number', 'scene.fog.near', { scene: { fog: { near: '3' } } }],
      [
        'an object for a colour',
        'lighting.lamp.colour',
        { lighting: { lamp: { colour: { r: 1 } } } },
      ],
      ['a string boolean', 'effects.bloom.enabled', { effects: { bloom: { enabled: 'yes' } } }],
      ['a number for an object', 'materials.spineProfile', { materials: { spineProfile: 4 } }],
      [
        'an array for an object',
        'lighting.key.position',
        { lighting: { key: { position: [1, 2] } } },
      ],
      ['a null for an object', 'lighting.key', { lighting: { key: null } }],
    ])('falls back to the default for %s, and warns naming the key', (_, path, diff) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(read(debug(diff))).toEqual(DEFAULT_SETTINGS);
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain(`?debug: "${path}"`);
    });

    it('keeps the well-typed siblings of a refused value', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const settings = read(debug({ lighting: { key: { intensity: null, colour: 0x123456 } } }));
      expect(settings.lighting.key.intensity).toBe(DEFAULT_SETTINGS.lighting.key.intensity);
      expect(settings.lighting.key.colour).toBe(0x123456);
    });

    it('names the refused key in the warning, and stays quiet for a well-typed diff', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      read(debug({ lighting: { key: { intensity: 2 } } }));
      // and for every key a whole diff carries, as the panel's own links do
      const { renderer, effects, lighting, scene, materials, books } = DEFAULT_SETTINGS;
      read(
        debug({
          toneMapping: renderer.toneMapping,
          exposure: renderer.exposure,
          effects,
          lighting,
          scene,
          materials,
          books,
        }),
      );
      expect(warn).not.toHaveBeenCalled();
      read(debug({ lighting: { key: { intensity: null } } }));
      expect(String(warn.mock.calls[0]?.[0])).toContain('lighting.key.intensity');
    });

    it('refuses a wrong-typed value hidden under a key named __proto__', () => {
      // JSON.parse makes `__proto__` an own key; assigning it to a plain object
      // would swap that object's prototype and carry the null past the check.
      // Doubled, because one level down the template is `Object.prototype`, whose
      // own prototype is `null`: only the own-key read keeps that off the chain.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const raw = '{"lighting":{"__proto__":{"__proto__":{"key":{"intensity":null}}}}}';
      const patch = readSettings(new URLSearchParams(`debug=${encodeURIComponent(raw)}`));
      expect(Object.getPrototypeOf(patch.lighting)).toBe(Object.prototype);
      expect(resolveSettings(patch).lighting.key.intensity).toBe(
        DEFAULT_SETTINGS.lighting.key.intensity,
      );
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain('"lighting.__proto__"');
    });

    it('refuses a number that parses to Infinity', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const query = `debug=${encodeURIComponent('{"scene":{"fog":{"near":1e999}}}')}`;
      expect(read(query).scene.fog.near).toBe(DEFAULT_SETTINGS.scene.fog.near);
      expect(warn).toHaveBeenCalledOnce();
    });

    it('refuses a key named like an Object member, as a key the defaults lack', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const patch = readSettings(
        new URLSearchParams(debug({ lighting: { constructor: { a: 1 } } })),
      );
      expect(Object.hasOwn(patch.lighting ?? {}, 'constructor')).toBe(false);
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain('lighting.constructor');
    });

    it('warns when a whole section has the wrong type', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(read(debug({ effects: null, lighting: 4 }))).toEqual(DEFAULT_SETTINGS);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(String(warn.mock.calls[0]?.[0])).toContain('lighting');
    });

    it('refuses a key the defaults do not have, with a warning, and keeps its siblings', () => {
      // An allowlist, as the Thoughts extractor is: a key nothing binds is not
      // carried into the live settings, at any size or depth.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const patch = readSettings(
        new URLSearchParams(debug({ lighting: { key: { later: [[1]], intensity: 2 } } })),
      );
      expect(patch.lighting?.key).toEqual({ intensity: 2 });
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain('lighting.key.later');
    });

    it('escapes a refused key in the warning, so a link cannot forge a console line', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      readSettings(new URLSearchParams(debug({ scene: { 'x\nforged line': 1 } })));
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).not.toContain('\n');
      expect(line).toContain('\\n');
    });

    it('escapes line separators and format characters too', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const hidden = [0x2028, 0x2029, 0x202e, 0xad].map((c) => String.fromCodePoint(c)).join('');
      readSettings(new URLSearchParams(debug({ scene: { [`x${hidden}`]: 1 } })));
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).not.toMatch(/[\u2028\u2029\p{Cf}]/u);
      expect(line).toContain('\\u2028');
      expect(line).toContain('\\u00ad');
    });

    it('refuses a top-level key ?debug does not read, with a warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      readSettings(new URLSearchParams(debug({ lightning: { a: 1 }, shadows: {} })));
      expect(warn).toHaveBeenCalledTimes(2);
      expect(String(warn.mock.calls[0]?.[0])).toContain('"lightning"');
    });
  });

  it('carries the books category, which is the first new top-level key since this was written', () => {
    // `books` is not one of the ten historic probe spellings, so a URL is the
    // only way to hand a phone a dialled mixture — and `readDiff` has to have
    // been taught the key or a pasted URL silently renders the shipped shelf
    // with nothing saying so, which is the failure this file's header describes.
    const query = `debug=${encodeURIComponent(JSON.stringify({ books: { paperbackRatio: 0.2, headCap: 0 } }))}`;

    expect(read(query).books).toEqual({ paperbackRatio: 0.2, headCap: 0 });
  });

  it('carries a nested profile without flattening it or losing its sibling', () => {
    // `spineProfile` is the first *nested object* inside `materials`; every other
    // key there is a flat scalar, so the cast in `readDiff` had never been asked
    // to carry one.
    const query = `debug=${encodeURIComponent(
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

  it('carries the wood fibre, which has no historic spelling of its own', () => {
    // `materials.woodFibre` is the map's second knob and it rides `?debug=` like
    // the rest of `materials` — there is no `?woodFibre=`, deliberately, because
    // the ten flat probes exist for things typed on a phone against a crash. A
    // key `readDiff` had not been taught would render the shipped shelf with
    // nothing saying so, which is this file's own header complaint.
    const query = `debug=${encodeURIComponent(JSON.stringify({ materials: { woodFibre: 0 } }))}`;
    const settings = read(query);

    expect(settings.materials.woodFibre).toBe(0);
    // And it does not take its neighbours with it: the sheet's fallback colour
    // and the page striation are untouched.
    expect(settings.materials.wood).toBe(DEFAULT_SETTINGS.materials.wood);
    expect(settings.materials.pageStriation).toBe(DEFAULT_SETTINGS.materials.pageStriation);
  });

  it('carries the woodwork sheet, and merges it without disturbing its neighbours', () => {
    // `materials.woodSpecies` rides `?debug=` like the rest of `materials`. There
    // is no `?woodSpecies=` flat spelling: the ten flat probes exist for things
    // typed on a phone against a crash, and a sheet menu is not one of those.
    const query = `debug=${encodeURIComponent(JSON.stringify({ materials: { woodSpecies: 'sapele' } }))}`;
    const settings = read(query);

    expect(settings.materials.woodSpecies).toBe('sapele');
    // The fallback colour is a separate key and stays put — `woodSpecies` moves
    // which sheet is bound, never what shows before it decodes.
    expect(settings.materials.wood).toBe(DEFAULT_SETTINGS.materials.wood);
    expect(settings.materials.woodFibre).toBe(DEFAULT_SETTINGS.materials.woodFibre);
  });

  it('lets a `?debug=` carry a species nobody has rendered, so the shelf can refuse it', () => {
    // ⚠️ **Not dropped at parse.** `resolveSettings` merges whatever arrives;
    // the refusal belongs to `resolveWoodwork`, which names it in the report.
    // Dropping it here would silently render the default and look exactly like a
    // value that was applied — the failure `ApplyReport` exists to prevent, and
    // the reason `cover_source`'s drop-on-mismatch rule does *not* transfer to a
    // control somebody just moved.
    const query = `debug=${encodeURIComponent(JSON.stringify({ materials: { woodSpecies: 'walnut' } }))}`;

    expect(read(query).materials.woodSpecies).toBe('walnut');
  });

  it('resolves to the default species when no diff says otherwise', () => {
    // The absent case, stated rather than assumed — #298's `woodVary` resolved
    // an *absent* parameter to `0` against its own documented default of `1`,
    // because `Number(null)` is `0` and not `NaN`, and every render that branch
    // took was unvaried with nothing saying so.
    expect(read('').materials.woodSpecies).toBe(DEFAULT_SETTINGS.materials.woodSpecies);
    expect(read('solo=1').materials.woodSpecies).toBe('rosewood');
  });

  it('does not let a diff override a probe typed by hand', () => {
    // The two vocabularies never overlap, so a legacy probe is always the last
    // word on the nine settings it owns. Someone appending `&shadows=0` to a
    // dialled URL on a phone must get the painted shelf. ⚠️ It appended
    // `&shadows=1` until real-time shadows became the default, and then passed
    // with the probe deleted: a probe that asks for the default proves nothing.
    const diff = encodeURIComponent(JSON.stringify({ lighting: { key: { intensity: 4.5 } } }));
    const settings = read(`debug=${diff}&shadows=0`);

    expect(settings.shadows.enabled).toBe(false);
    expect(settings.lighting.key.intensity).toBe(4.5);
  });
});

describe('the diff rides in ?debug, and only there', () => {
  const diff = encodeURIComponent(JSON.stringify({ lighting: { key: { intensity: 4.5 } } }));

  it('reads ?debug with no value, or an empty one, as no diff', () => {
    expect(read('debug')).toEqual(DEFAULT_SETTINGS);
    expect(read('debug=')).toEqual(DEFAULT_SETTINGS);
  });

  it('applies a diff added by hand after a bare ?debug', () => {
    expect(read(`debug&debug=${diff}`).lighting.key.intensity).toBe(4.5);
    expect(read(`debug=${diff}&debug`).lighting.key.intensity).toBe(4.5);
  });

  it('does not read the diff from ?tune= any more', () => {
    expect(read(`tune=${diff}`)).toEqual(DEFAULT_SETTINGS);
    expect(read(`tune=${diff}&debug`)).toEqual(DEFAULT_SETTINGS);
  });

  it('names the new spelling once for a retired ?tune= link, and is silent without one', () => {
    const hint = retiredTuneHint(new URLSearchParams(`tune=${diff}`));
    expect(hint).toContain('?debug=');
    expect(hint).toContain('?tune=');
    expect(retiredTuneHint(new URLSearchParams('debug'))).toBeUndefined();
    expect(retiredTuneHint(new URLSearchParams(`debug=${diff}`))).toBeUndefined();
  });
});

describe('carriesSettings', () => {
  const diff = encodeURIComponent(JSON.stringify({ exposure: 1.4 }));

  it('is false for a bare ?debug, however it is spelled', () => {
    expect(carriesSettings('?debug')).toBe(false);
    expect(carriesSettings('debug=')).toBe(false);
  });

  it('is true for ?debug=<json> with a non-empty diff', () => {
    expect(carriesSettings(`?debug=${diff}`)).toBe(true);
  });

  it('is false for a ?debug value that reads as no diff', () => {
    expect(carriesSettings('?debug=%7B%7D')).toBe(false);
    expect(carriesSettings('?debug=%7Bbroken')).toBe(false);
  });

  it('is false for a retired ?tune= link, which changes nothing', () => {
    expect(carriesSettings(`?debug&tune=${diff}`)).toBe(false);
  });

  it('is true for any probe beside ?debug', () => {
    expect(carriesSettings('?debug&shadows=0')).toBe(true);
  });
});

describe('writeSettings writes the diff into ?debug', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const write = (settings: ShelfSettings, search: string): string => {
    let url = '';
    vi.stubGlobal('window', {
      location: { search, pathname: '/' },
      history: {
        replaceState: (_: unknown, __: string, next: string) => {
          url = next;
        },
      },
    });
    writeSettings(settings);
    return url;
  };

  const dialled: ShelfSettings = {
    ...DEFAULT_SETTINGS,
    renderer: { ...DEFAULT_SETTINGS.renderer, exposure: 1.4 },
  };

  it('puts the diff in the value of ?debug and never writes tune', () => {
    const url = write(dialled, `?debug&tune=${encodeURIComponent('{"exposure":2}')}`);
    expect(url).toBe(`?debug=${encodeURIComponent('{"exposure":1.4}')}`);
    expect(url).not.toContain('tune');
  });

  it('writes bare debug when the diff is empty', () => {
    expect(write(DEFAULT_SETTINGS, '?debug=%7B%22exposure%22%3A1.4%7D')).toBe('?debug');
  });

  it('keeps the flat probes and ?woodSeed beside it', () => {
    const painted = { ...dialled, shadows: { ...dialled.shadows, enabled: false } };
    const url = write(painted, '?debug&woodSeed=k3f9');
    expect(url).toContain('woodSeed=k3f9');
    expect(url).toContain('shadows=0');
    expect(url).toContain(`debug=${encodeURIComponent('{"exposure":1.4}')}`);
  });

  it('round-trips through readSettings', () => {
    const url = write(dialled, '?debug');
    expect(read(url.slice(1)).renderer.exposure).toBe(1.4);
  });
});

describe('woodSeed', () => {
  it('is absent when nothing asked', () => {
    // ⚠️ **No default, and the guard tests for the absent value rather than
    // running a number check.** A missing key reads back as `undefined` here
    // (`getAll(...).at(-1)`) and as `null` through `get` — and `Number(null)` is
    // `0`, not `NaN`, so a guard shaped `Number.isFinite(raw) && raw >= 0`
    // *passes* on an absent parameter. That is exactly what #298's `?woodVary=`
    // did: it resolved a missing key to `0`, against its own documented default
    // of `1`, and silently disarmed the variation in every render that branch
    // ever took. A seed is a token and never goes near `Number`, and the two
    // numeric readers in this file (`positive`, `wholePositive`) are safe only
    // because `0 > 0` is false — which is luck, so it is asserted below.
    expect(woodSeed(new URLSearchParams(''))).toBeUndefined();
  });

  it('reads absence as undefined, which is not the null its neighbours see', () => {
    // The two spellings, side by side. `getAll(...).at(-1)` answers `undefined`
    // on a missing key and `get` answers `null`, so a guard copied from
    // `bookLimit` would never fire here — it would read as a guard while
    // guarding nothing. Pinned because a doc comment claiming the wrong one of
    // these is exactly the drift this parameter exists to instrument.
    const empty = new URLSearchParams('');
    expect(empty.getAll('woodSeed').at(-1)).toBeUndefined();
    expect(empty.get('woodSeed')).toBeNull();
    expect(woodSeed(empty)).toBeUndefined();
  });

  it('pins the root the harness passes', () => {
    expect(woodSeed(new URLSearchParams('woodSeed=k3f9'))).toBe('k3f9');
  });

  it('treats an empty seed as absent, not as the empty string', () => {
    // A seed that dropped out of a query must not silently agree with another
    // shot whose seed also dropped out — two frames that differ by nothing look
    // exactly like a treatment that changes nothing.
    expect(woodSeed(new URLSearchParams('woodSeed='))).toBeUndefined();
  });

  it('takes the last of a repeated seed, not the first', () => {
    // The harness builds every URL as a fixed base plus a per-shot tail, so a
    // duplicated key is the normal case rather than a typo. `get` returns the
    // *first*, which is how #284's resolution control rendered 1024 for the arm
    // that asked for 512 and differenced to a perfect 0.000%.
    expect(woodSeed(new URLSearchParams('woodSeed=one&woodSeed=two'))).toBe('two');
  });

  it('draws fresh when the last of a repeat is empty, rather than reaching back', () => {
    // ⚠️ **The two rules compose in this order on purpose.** The tail is what a
    // shot intends, so a tail whose seed dropped out is a shot that meant to
    // force something and lost it. Reaching back for `fixed` would make it
    // silently agree with the shot before it — a false zero, which is exactly
    // what this parameter exists to instrument and is the one failure it cannot
    // detect in itself. Absent is visible; a wrong agreement is not.
    expect(woodSeed(new URLSearchParams('woodSeed=fixed&woodSeed='))).toBeUndefined();
    // The other order still resolves, because there the tail carries a seed.
    expect(woodSeed(new URLSearchParams('woodSeed=&woodSeed=fixed'))).toBe('fixed');
  });

  it('is not a setting, so it can never reach the settings diff', () => {
    // The instrument/setting line: a `?debug=` link that froze the dice would be
    // a control that lies about a shelf which is supposed to be alive.
    expect(readSettings(new URLSearchParams('woodSeed=k3f9'))).toEqual(
      readSettings(new URLSearchParams('')),
    );
  });

  it('has nowhere in ShelfSettings to hide', () => {
    // `diffText` writes whatever `ShelfSettings` holds, so the structural half
    // of the promise is that the seed is not in there at any depth. This is what
    // would go red the day somebody added `materials.woodSeed`.
    expect(JSON.stringify(DEFAULT_SETTINGS).toLowerCase()).not.toContain('seed');
  });

  it('leaves the numeric readers safe on an absent key', () => {
    // The `Number(null) === 0` case, run rather than reasoned about: `?dpr=` and
    // `?shadowmap=` both read through a bare `Number(params.get(...))`, and both
    // survive only because `0` fails their `> 0` test.
    const absent = resolveSettings(readSettings(new URLSearchParams('')));
    expect(absent.renderer.maxPixelRatio).toBe(DEFAULT_SETTINGS.renderer.maxPixelRatio);
    expect(absent.shadows.mapSize).toBe(DEFAULT_SETTINGS.shadows.mapSize);
  });
});

describe('writeSettings against the base the page started from', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The query `writeSettings` would put in the address bar, starting from `search`. */
  const written = (settings: ShelfSettings, base?: ShelfSettings, search = '?debug'): string => {
    let url = '';
    vi.stubGlobal('window', {
      location: { search, pathname: '/' },
      history: {
        replaceState: (_: unknown, __: string, next: string) => {
          url = next;
        },
      },
    });
    writeSettings(settings, base);
    return url;
  };

  const realTime = resolveSettings({ shadows: { enabled: true } });
  const painted = resolveSettings({ shadows: { enabled: false } });

  it('keeps a remembered device out of the URL', () => {
    // A page that started painted from a lost-context record, still painted:
    // nothing the visitor dialled, so nothing to write — not `?shadows=0`.
    expect(written(painted, PAINTED_BASE)).toBe('?debug');
  });

  it('writes ?shadows=1 when the visitor turns shadows on over a record', () => {
    // Which is also what reproduces the page: on this device, a URL without it
    // starts painted.
    expect(written(realTime, PAINTED_BASE)).toBe('?debug&shadows=1');
  });

  it('keeps a ?shadows=0 the visitor typed, even where it equals the base', () => {
    // On a remembered device painted is the base, so a typed `?shadows=0` is no
    // difference from it — and dropping it would make the copied link open
    // real-time on every other device.
    expect(written(painted, PAINTED_BASE, '?debug&shadows=0')).toBe('?debug&shadows=0');
  });

  it('still drops a probe once its setting has moved off what was typed', () => {
    // Shadows turned on over a record and then off again: the address bar holds
    // the panel's own `?shadows=1`, and painted is the base, so nothing is left
    // to write — the remembered device stays out of the URL.
    expect(written(painted, PAINTED_BASE, '?debug&shadows=1')).toBe('?debug');
  });

  it('writes the difference from whatever base it is given', () => {
    // The control: the same painted settings against a real-time base are a
    // difference, and are written. Without the base argument this is what a
    // remembered device would have leaked.
    expect(written(painted, realTime)).toBe('?debug&shadows=0');
  });

  it('diffs against the shipped defaults when no base is given', () => {
    expect(written(DEFAULT_SETTINGS)).toBe('?debug');
  });

  it('writes nothing for real-time shadows and ?shadows=0 for painted, now real-time is shipped', () => {
    // ADR-0090 moved which of the two is the difference.
    expect(written(realTime)).toBe('?debug');
    expect(written(painted)).toBe('?debug&shadows=0');
  });
});

describe('writeSettings and the pickup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the held book's history state through, so dialling never erases it (spec §3.9)", () => {
    const held = { pickup: 'the-quiet-orchard-1k2j3h' };
    let kept: unknown = 'not written';
    vi.stubGlobal('window', {
      location: { search: '?debug', pathname: '/' },
      history: {
        state: held,
        replaceState: (state: unknown) => {
          kept = state;
        },
      },
    });

    writeSettings(DEFAULT_SETTINGS);
    expect(kept).toBe(held);
  });
});

describe('keepSettingsInAddress, across a put-back (#426)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const dialled: ShelfSettings = {
    ...DEFAULT_SETTINGS,
    renderer: { ...DEFAULT_SETTINGS.renderer, antialias: !DEFAULT_SETTINGS.renderer.antialias },
  };
  const AA = `aa=${dialled.renderer.antialias ? '1' : '0'}`;

  /** A window whose address is the entry from before the pickup, as put-back leaves it. */
  function afterPutBack() {
    const listeners = new Set<() => void>();
    const writes: string[] = [];
    vi.stubGlobal('window', {
      location: { search: '?debug', pathname: '/' },
      history: {
        state: null,
        replaceState: (_state: unknown, _title: string, url: string) => {
          writes.push(url);
        },
      },
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'popstate') listeners.add(listener);
      },
      removeEventListener: (type: string, listener: () => void) => {
        if (type === 'popstate') listeners.delete(listener);
      },
    });
    const pop = (): void => {
      for (const listener of listeners) listener();
    };
    return { writes, pop, listeners };
  }

  it('writes a setting dialled while held back into the address put-back returns to', () => {
    const { writes, pop } = afterPutBack();
    keepSettingsInAddress(() => ({ settings: dialled }));

    pop();
    expect(writes).toEqual([`?debug&${AA}`]);
  });

  it('asks what to write on every step, not once when it is installed', () => {
    // The panel has written nothing when it installs this, so a helper that
    // read `current` once would never write — the #426 symptom back again.
    const { writes, pop } = afterPutBack();
    const panel: { now?: { settings: ShelfSettings } } = {};
    keepSettingsInAddress(() => panel.now);

    panel.now = { settings: dialled };
    pop();
    expect(writes).toEqual([`?debug&${AA}`]);
  });

  it("diffs against the page's own base, so a painted device's fallback stays out of the link", () => {
    const { writes, pop } = afterPutBack();
    keepSettingsInAddress(() => ({ settings: PAINTED_BASE, base: PAINTED_BASE }));

    pop();
    // Against the shipped defaults the same settings would write `shadows=0`.
    expect(writes).toEqual(['?debug']);
  });

  it('leaves the address alone until the panel has written once', () => {
    const { writes, pop } = afterPutBack();
    keepSettingsInAddress(() => undefined);

    pop();
    expect(writes).toEqual([]);
  });

  it('stops listening when the panel is taken down', () => {
    const { listeners } = afterPutBack();
    const forget = keepSettingsInAddress(() => ({ settings: dialled }));
    expect(listeners.size).toBe(1);

    forget();
    expect(listeners.size).toBe(0);
  });
});
