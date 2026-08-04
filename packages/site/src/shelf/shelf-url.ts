import {
  DEFAULT_SETTINGS,
  SHADOW_TYPE_NAMES,
  TONE_MAPPING_NAMES,
  type SettingsPatch,
  type ShadowTypeName,
  type ShelfSettings,
  type ToneMappingName,
} from './shelf-settings.ts';

/**
 * The query string, in both directions, in one place.
 *
 * It was three places: a reader in `boot.ts`, a translation in `scene.ts`, and a
 * writer in `debug-panel.ts`. The tell that this was wrong is that `shadowfetch`
 * appeared in the writer's table and had no control — it had been copied from
 * the reader rather than derived from anything. Two tables describing one
 * vocabulary is the shape G10 and G23 both caught, and the failure is silent in
 * both directions: a setting the writer forgets vanishes on reload, and one the
 * reader forgets is a URL that quietly does nothing.
 *
 * ## Two vocabularies, deliberately
 *
 * **The ten probes keep their own flat spellings** — `?aa=0`, `?shadows=1`,
 * `?shadowtype=vsm`, `?books=5`. They are documented in `docs/progress.md` with
 * measured results attached, they are typed by hand on a phone, and every one of
 * them has to keep meaning what it meant. They are the reason this is not simply
 * a blob.
 *
 * **Everything else rides in `?tune=`**, a URI-encoded JSON *diff from the
 * defaults*. Lights, colours, fog, tone mapping and materials have no historic
 * spelling, there are thirty of them, and inventing thirty more parameters would
 * produce a URL nobody could read anyway. A diff rather than the whole object so
 * a shelf running defaults has a clean address, and so the parameter stays short
 * enough to paste.
 *
 * The two never overlap, so neither has to win.
 */

/* -------------------------------------------------------------------------- */
/*  reading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `?books=N` — render only the first N, so a crash can be bisected on the device
 * that crashes.
 *
 * Ignored unless it parses to a whole number, so a typo shows the whole shelf
 * rather than an empty case that looks like a different bug. `?books=0` is
 * meaningful and allowed: an empty case still pays the entire fixed cost — the
 * framebuffer, the shadow map, the pixel ratio — so if *that* loses the context,
 * nothing about the books is involved at all.
 */
export function bookLimit(params: URLSearchParams): number | undefined {
  const raw = params.get('books');
  if (raw === null) return undefined;

  const requested = Number(raw);
  if (!Number.isInteger(requested) || requested < 0) return undefined;
  return requested;
}

/**
 * Everything the URL asks for, as a partial.
 *
 * Partial, not total: absent means "no opinion", which is not the same as "asked
 * for the default". A typo therefore shows the shipped shelf rather than a
 * silently defaulted one.
 */
export function readSettings(params: URLSearchParams): SettingsPatch {
  const patch = readTune(params);

  /**
   * `?aa=0` — MSAA resolve is the expensive path on a tile-based GPU, and a
   * 1054×1926 buffer with 4× MSAA colour and depth is ~65 MB, by far the largest
   * allocation in this scene. It is still not what kills the Pixel 10.
   *
   * `?dpr=1.5` — caps `devicePixelRatio`; the default cap is 2. It sets the size
   * everything else is a multiple of.
   *
   * `?guard=1` — skips `setSize` when the canvas has not actually changed size.
   * Assigning `canvas.width` reallocates the drawing buffer even when the value
   * is identical, so an unguarded `ResizeObserver` churns the whole multisampled
   * framebuffer on every layout event. Off by default so the probe measures a
   * change rather than smuggling in a fix.
   */
  // Inline conditional spreads rather than a helper: `keyIfPresent` lives in
  // `@stacks/core`, and the site may only `import type` from there — a value
  // import drags `node:fs` and sharp into the browser bundle and the shelf
  // silently never boots. Writing a local copy is what G23 exists to stop (it
  // caught this file doing exactly that), and G23's own record left the
  // seventeen inline spreads alone for this reason: each is one decision at one
  // call site, not a copy of anything.
  const antialias = flag(params, 'aa');
  const maxPixelRatio = positive(params, 'dpr');
  const guardResize = flag(params, 'guard');
  const renderer: Partial<ShelfSettings['renderer']> = {
    ...patch.renderer,
    ...(antialias === undefined ? {} : { antialias }),
    ...(maxPixelRatio === undefined ? {} : { maxPixelRatio }),
    ...(guardResize === undefined ? {} : { guardResize }),
  };

  /**
   * `?shadows=0` — turns off the shadow map and the light that casts it. The
   * shadow pass is what loses the context on a Pixel 10 Pro; it stays on by
   * default anyway, because shadows are most of what makes the shelf read as
   * furniture and the owner's call is that losing them is not the price.
   *
   * `?shadowmap=1024` — edge of the depth target; the default is 2048 (16 MB).
   *
   * `?shadowtype=basic|pcf|soft|vsm` — `soft` is `pcf` since three 0.185
   * deprecated `PCFSoftShadowMap`. `vsm` is the only one that reads the map with
   * a plain `sampler2D` rather than a hardware depth comparison, which is why it
   * was the last hope and why its death settled the investigation.
   *
   * `?casters=0` — nothing casts, but the map is still allocated and the pass
   * still runs. The one switch that *discriminates* rather than just reducing.
   *
   * `?shadowfetch=0` — draws the map once, then stops *reading* it. Separates
   * holding a depth attachment from sampling one.
   *
   * `?painted=0` — leaves out the painted shading entirely, which is the only
   * place a `MeshBasicMaterial` appears in this scene.
   */
  const enabled = flag(params, 'shadows');
  const mapSize = wholePositive(params, 'shadowmap');
  const type = oneOf(params, 'shadowtype', SHADOW_TYPE_NAMES);
  const casters = flag(params, 'casters');
  const fetch = flag(params, 'shadowfetch');
  const painted = flag(params, 'painted');
  const shadows: Partial<ShelfSettings['shadows']> = {
    ...patch.shadows,
    ...(enabled === undefined ? {} : { enabled }),
    ...(mapSize === undefined ? {} : { mapSize }),
    ...(type === undefined ? {} : { type }),
    ...(casters === undefined ? {} : { casters }),
    ...(fetch === undefined ? {} : { fetch }),
    ...(painted === undefined ? {} : { painted }),
  };

  return { ...patch, renderer, shadows };
}

/* -------------------------------------------------------------------------- */
/*  writing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Puts the whole configuration back into the address bar.
 *
 * `replaceState`, not `pushState`: dragging a slider would otherwise write a
 * hundred history entries and make the back button useless.
 *
 * Only differences from the shipped defaults are written, so a shelf running
 * defaults has a clean address and a dialled one has a URL you can read, paste
 * into an issue, or send to a phone.
 */
export function writeSettings(settings: ShelfSettings): void {
  const params = new URLSearchParams(window.location.search);
  const d = DEFAULT_SETTINGS;

  const probe = (name: string, differs: boolean, value: string): void => {
    if (differs) params.set(name, value);
    else params.delete(name);
  };

  const r = settings.renderer;
  const s = settings.shadows;
  probe('aa', r.antialias !== d.renderer.antialias, r.antialias ? '1' : '0');
  probe('dpr', r.maxPixelRatio !== d.renderer.maxPixelRatio, String(r.maxPixelRatio));
  probe('guard', r.guardResize !== d.renderer.guardResize, r.guardResize ? '1' : '0');
  probe('shadows', s.enabled !== d.shadows.enabled, s.enabled ? '1' : '0');
  probe('shadowmap', s.mapSize !== d.shadows.mapSize, String(s.mapSize));
  probe('shadowtype', s.type !== d.shadows.type, s.type);
  probe('casters', s.casters !== d.shadows.casters, s.casters ? '1' : '0');
  probe('shadowfetch', s.fetch !== d.shadows.fetch, s.fetch ? '1' : '0');
  probe('painted', s.painted !== d.shadows.painted, s.painted ? '1' : '0');

  const tune = tuneDiff(settings);
  if (tune === undefined) params.delete('tune');
  else params.set('tune', tune);

  /**
   * `?debug` is written back without a value.
   *
   * `URLSearchParams.toString()` renders a valueless parameter as `debug=`, and
   * `?debug=&aa=0` reads as broken to anyone about to paste it into an issue.
   * The parameter is a switch, not a value, and the URL should say so.
   */
  const query = params.toString().replace(/(^|&)debug=(&|$)/, '$1debug$2');
  window.history.replaceState(null, '', query === '' ? window.location.pathname : `?${query}`);
}

/* -------------------------------------------------------------------------- */

/** The half of the settings with no historic spelling, as a diff from defaults. */
interface Tune {
  effects?: unknown;
  lighting?: unknown;
  scene?: unknown;
  materials?: unknown;
  toneMapping?: ToneMappingName;
  exposure?: number;
}

function tuneDiff(settings: ShelfSettings): string | undefined {
  const d = DEFAULT_SETTINGS;
  const tune: Tune = {
    ...(same(settings.lighting, d.lighting) ? {} : { lighting: settings.lighting }),
    ...(same(settings.scene, d.scene) ? {} : { scene: settings.scene }),
    ...(same(settings.materials, d.materials) ? {} : { materials: settings.materials }),
    ...(same(settings.effects, d.effects) ? {} : { effects: settings.effects }),
    ...(settings.renderer.toneMapping === d.renderer.toneMapping
      ? {}
      : { toneMapping: settings.renderer.toneMapping }),
    ...(settings.renderer.exposure === d.renderer.exposure ? {} : { exposure: settings.renderer.exposure }),
  };

  return Object.keys(tune).length === 0 ? undefined : JSON.stringify(tune);
}

/**
 * Reads `?tune=`, and refuses anything it does not recognise.
 *
 * The parameter is hand-editable and survives a paste through chat clients that
 * mangle characters, so it is validated rather than trusted: a malformed value
 * yields the shipped shelf instead of a half-applied one. Failing to defaults is
 * right here for the same reason a malformed `?books=` shows the whole shelf —
 * an unreadable setting must not look like a deliberate one.
 */
function readTune(params: URLSearchParams): SettingsPatch {
  const raw = params.get('tune');
  if (raw === null) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};

  const tune = parsed as Tune;
  const renderer: Partial<ShelfSettings['renderer']> = {
    ...(tune.toneMapping !== undefined && TONE_MAPPING_NAMES.includes(tune.toneMapping)
      ? { toneMapping: tune.toneMapping }
      : {}),
    ...(typeof tune.exposure === 'number' && Number.isFinite(tune.exposure)
      ? { exposure: tune.exposure }
      : {}),
  };

  return {
    renderer,
    ...(isRecord(tune.lighting) ? { lighting: tune.lighting as SettingsPatch['lighting'] } : {}),
    ...(isRecord(tune.scene) ? { scene: tune.scene as SettingsPatch['scene'] } : {}),
    ...(isRecord(tune.materials) ? { materials: tune.materials as SettingsPatch['materials'] } : {}),
    ...(isRecord(tune.effects) ? { effects: tune.effects as SettingsPatch['effects'] } : {}),
  };
}

function isRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Anything other than `0`, `false` or `off` reads as on, so a bare `?aa` enables
 * rather than silently disabling.
 */
function flag(params: URLSearchParams, name: string): boolean | undefined {
  const raw = params.get(name);
  if (raw === null) return undefined;
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function positive(params: URLSearchParams, name: string): number | undefined {
  const value = Number(params.get(name));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function wholePositive(params: URLSearchParams, name: string): number | undefined {
  const value = Number(params.get(name));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function oneOf<T extends string>(
  params: URLSearchParams,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const raw = params.get(name);
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

export type { ShadowTypeName };
