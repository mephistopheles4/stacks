import type { ApplyReport, ShelfHandle } from './scene.ts';
import {
  BINDINGS,
  DEFAULT_SETTINGS,
  resolveSettings,
  SHADOW_TYPE_NAMES,
  TONE_MAPPING_NAMES,
  type ShelfSettings,
} from './shelf-settings.ts';
import { writeSettings } from './shelf-url.ts';

/**
 * The tuning panel: every setting the shelf has, live, behind `?debug`.
 *
 * The black box next to it (`diagnostics.ts`) is an *instrument* — it records
 * what happened to a page that may be about to die. This is a *tool*: it changes
 * things and shows you the result. They share a query parameter and nothing
 * else, which is why they load differently — the black box eagerly because it is
 * evidence, this lazily because ordinary visitors should not download it.
 *
 * Vanilla DOM, `createElement` and inline styles, following `diagnostics.ts`
 * rather than reaching for lil-gui or tweakpane. Three reasons, in order:
 * no React on the page is a decided constraint; a debug surface that pulls a UI
 * library into the graph makes the lazy-load boundary pointless; and both
 * instruments being removable in one file each is worth keeping.
 *
 * ## The one rule this file exists to keep
 *
 * `docs/progress.md`: *"A probe that silently did nothing would be worse than no
 * probe."* Every one of the ten original probes was verified to have a real
 * measured effect before shipping, because one that appears to work and does not
 * sends you off to rule out the actual cause. A slider is the same hazard with a
 * nicer UI, so:
 *
 * - every control is **labelled with its class** — live, rebuild, or reload;
 * - the shelf **reports back** what it actually applied (`ApplyReport`), and
 *   anything it refused is shown, not swallowed;
 * - the panel never redraws a control as "done" on its own say-so.
 */

export interface PanelOptions {
  readonly handle: ShelfHandle;
  /**
   * Asks the page to remount the shelf with these settings.
   *
   * The panel cannot do it itself: `mountShelf` owns the canvas and the caller
   * owns the card and the notices. Absent means rebuild is unavailable, and the
   * panel says "reload" instead of offering a button that would do nothing.
   */
  readonly onRebuild?: (settings: ShelfSettings) => void;
}

export function mountPanel(host: HTMLElement, options: PanelOptions): () => void {
  const { handle } = options;
  let settings = handle.settings;

  const root = document.createElement('div');
  root.className = 'shelf-panel';
  applyRootStyle(root);

  const readout = document.createElement('pre');
  applyReadoutStyle(readout);

  const status = document.createElement('div');
  applyStatusStyle(status);

  const body = document.createElement('div');
  body.style.display = 'grid';
  body.style.gap = '0.15rem';
  // Grid items also default to `min-width: auto`, so without this the widest row
  // sets the track width and the whole panel overflows again one level up.
  body.style.minWidth = '0';

  /**
   * Collapsed by default on a narrow screen.
   *
   * The panel is used on a 527×962 phone — that is where every finding in the
   * crash investigation was made — and twenty controls plus a black box do not
   * fit beside a shelf you are trying to look at.
   */
  let open = window.innerWidth > 700;

  const toggle = document.createElement('button');
  applyButtonStyle(toggle);
  toggle.style.width = '100%';

  const paint = (): void => {
    toggle.textContent = open ? 'hide controls ▲' : 'show controls ▼';
    body.style.display = open ? 'grid' : 'none';
  };

  toggle.addEventListener('click', () => {
    open = !open;
    paint();
  });

  /* ---------------------------------------------------------------------- */

  /**
   * Controls whose *enabled* state depends on another control's value.
   *
   * Re-run after every apply rather than wired point to point: a dependency
   * graph between sliders is how one ends up stale and lying about itself.
   */
  const afterApply: (() => void)[] = [];

  /**
   * Every control's "put my value back from the settings" hook.
   *
   * Needed because not every change comes from the control itself — pressing
   * *reset* moves all of them at once. Walking them individually at that point
   * is exactly how one gets left showing the old number, which the panel is not
   * allowed to do.
   */
  const resync: (() => void)[] = [];

  /** Every lamp, relit after each apply. See `Lamp`. */
  const lamps: (() => void)[] = [];

  /**
   * Wires one control's lamp.
   *
   * `pending` is a standing comparison against what the scene was *built* with,
   * not against the previous value — the same reasoning as `ApplyReport`'s
   * standing diff. A rebuild-class control you moved five changes ago is still
   * waiting, and its lamp has to keep saying so.
   *
   * `active` is what separates off from inert. It defaults to "yes, this is
   * doing something", and the controls that can be superseded pass their own.
   */
  const lampFor = <T>(
    klass: Klass,
    get: (s: ShelfSettings) => T,
    active: (s: ShelfSettings) => boolean,
  ): { slot: HTMLElement } => {
    const lamp = makeLamp();
    const relight = (): void => {
      const pending = klass !== 'live' && get(settings) !== get(handle.mountedWith);
      lamp.set(pending ? 'pending' : active(settings) ? 'on' : 'off', klass);
    };
    lamps.push(relight);
    relight();
    return { slot: lamp.slot };
  };

  const apply = (next: ShelfSettings): void => {
    const report = handle.applySettings(next);
    settings = next;
    writeSettings(next);
    for (const hook of afterApply) hook();
    for (const relight of lamps) relight();
    showReport(status, report, options.onRebuild !== undefined);
    // Only for things a rebuild actually fixes. `refused` deliberately does not
    // raise it: offering a button that cannot help is its own small lie.
    rebuildButton.hidden = report.needsRebuild.length === 0 || options.onRebuild === undefined;
    pendingRebuild = report.needsRebuild.length > 0 ? next : undefined;
  };

  let pendingRebuild: ShelfSettings | undefined;

  const rebuildButton = document.createElement('button');
  rebuildButton.textContent = 'rebuild shelf to apply';
  applyButtonStyle(rebuildButton);
  rebuildButton.style.width = '100%';
  rebuildButton.style.borderColor = 'rgba(255, 205, 120, 0.6)';
  rebuildButton.hidden = true;
  rebuildButton.addEventListener('click', () => {
    if (pendingRebuild !== undefined) options.onRebuild?.(pendingRebuild);
  });

  /* --- the controls ------------------------------------------------------ */

  const group = (title: string): HTMLElement => {
    const heading = document.createElement('div');
    heading.textContent = title;
    Object.assign(heading.style, {
      marginTop: '0.5rem',
      opacity: '0.55',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      fontSize: '9px',
    } satisfies Partial<CSSStyleDeclaration>);
    body.append(heading);
    return heading;
  };

  const toggleRow = (
    label: string,
    klass: Klass,
    get: (s: ShelfSettings) => boolean,
    set: (s: ShelfSettings, value: boolean) => ShelfSettings,
    active?: (s: ShelfSettings) => boolean,
  ): { input: HTMLInputElement; row: HTMLElement } => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = get(settings);
    input.addEventListener('change', () => {
      apply(set(settings, input.checked));
    });
    resync.push(() => (input.checked = get(settings)));
    const line = row(label, klass, input);
    line.prepend(lampFor(klass, get, active ?? get).slot);
    body.append(line);
    return { input, row: line };
  };

  const slider = (
    label: string,
    klass: Klass,
    min: number,
    max: number,
    step: number,
    get: (s: ShelfSettings) => number,
    set: (s: ShelfSettings, value: number) => ShelfSettings,
    active?: (s: ShelfSettings) => boolean,
  ): { input: HTMLInputElement; row: HTMLElement } => {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get(settings));
    // Fixed, and the label gives way around it. A slider narrower than this is
    // hard to land a value on, especially with a thumb.
    input.style.width = '6.5rem';

    const value = document.createElement('span');
    value.textContent = format(get(settings));
    value.style.minWidth = '2.4rem';
    value.style.textAlign = 'right';
    value.style.opacity = '0.75';

    input.addEventListener('input', () => {
      const parsed = Number(input.value);
      value.textContent = format(parsed);
      apply(set(settings, parsed));
    });

    resync.push(() => {
      input.value = String(get(settings));
      value.textContent = format(get(settings));
    });

    const line = row(label, klass, input, value);
    line.prepend(lampFor(klass, get, active ?? (() => true)).slot);
    body.append(line);
    return { input, row: line };
  };

  const colour = (
    label: string,
    klass: Klass,
    get: (s: ShelfSettings) => number,
    set: (s: ShelfSettings, value: number) => ShelfSettings,
  ): void => {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = `#${get(settings).toString(16).padStart(6, '0')}`;
    input.style.width = '2.5rem';
    input.style.height = '1.1rem';
    input.style.padding = '0';
    input.addEventListener('input', () => {
      apply(set(settings, Number.parseInt(input.value.slice(1), 16)));
    });
    resync.push(() => (input.value = `#${get(settings).toString(16).padStart(6, '0')}`));
    const line = row(label, klass, input);
    line.prepend(lampFor(klass, get, () => true).slot);
    body.append(line);
  };

  const choice = <T extends string>(
    label: string,
    klass: Klass,
    options_: readonly T[],
    get: (s: ShelfSettings) => T,
    set: (s: ShelfSettings, value: T) => ShelfSettings,
    active?: (s: ShelfSettings) => boolean,
  ): void => {
    const select = document.createElement('select');
    applyInputStyle(select);
    for (const option of options_) {
      const node = document.createElement('option');
      node.value = option;
      node.textContent = option;
      select.append(node);
    }
    select.value = get(settings);
    select.addEventListener('change', () => {
      apply(set(settings, select.value as T));
    });
    resync.push(() => (select.value = get(settings)));
    const line = row(label, klass, select);
    line.prepend(lampFor(klass, get, active ?? (() => true)).slot);
    body.append(line);
  };

  /* --- light -------------------------------------------------------------- */

  group('key light');
  colour(
    'colour',
    'live',
    (s) => s.lighting.key.colour,
    (s, v) => resolveSettings({ lighting: { key: { colour: v } } }, s),
  );
  slider(
    'intensity',
    'live',
    0,
    8,
    0.05,
    (s) => s.lighting.key.intensity,
    (s, v) => resolveSettings({ lighting: { key: { intensity: v } } }, s),
  );
  // The three axes separately rather than a gizmo. A gizmo is the nicer control
  // and it is not the one that works on a phone, one-handed, next to the shelf
  // it is moving — which is where this gets used.
  slider(
    'x  (right +)',
    'live',
    -14,
    14,
    0.1,
    (s) => s.lighting.key.position.x,
    (s, v) => resolveSettings({ lighting: { key: { position: { x: v } } } }, s),
  );
  slider(
    'y  (above case)',
    'live',
    -4,
    14,
    0.1,
    (s) => s.lighting.key.position.y.plus,
    (s, v) => resolveSettings({ lighting: { key: { position: { y: { plus: v } } } } }, s),
  );
  slider(
    'z  (toward you +)',
    'live',
    -14,
    14,
    0.1,
    (s) => s.lighting.key.position.z,
    (s, v) => resolveSettings({ lighting: { key: { position: { z: v } } } }, s),
  );
  slider(
    'aim height',
    'live',
    0,
    1,
    0.01,
    (s) => s.lighting.key.aimHeight,
    (s, v) => resolveSettings({ lighting: { key: { aimHeight: v } } }, s),
  );

  group('fill light');
  colour(
    'colour',
    'live',
    (s) => s.lighting.fill.colour,
    (s, v) => resolveSettings({ lighting: { fill: { colour: v } } }, s),
  );
  slider(
    'intensity',
    'live',
    0,
    4,
    0.05,
    (s) => s.lighting.fill.intensity,
    (s, v) => resolveSettings({ lighting: { fill: { intensity: v } } }, s),
  );

  group('lamp');
  colour(
    'colour',
    'live',
    (s) => s.lighting.lamp.colour,
    (s, v) => resolveSettings({ lighting: { lamp: { colour: v } } }, s),
  );
  slider(
    'intensity',
    'live',
    0,
    40,
    0.5,
    (s) => s.lighting.lamp.intensity,
    (s, v) => resolveSettings({ lighting: { lamp: { intensity: v } } }, s),
  );
  slider(
    'reach',
    'live',
    1,
    40,
    0.5,
    (s) => s.lighting.lamp.distance,
    (s, v) => resolveSettings({ lighting: { lamp: { distance: v } } }, s),
  );

  group('ambient');
  slider(
    'intensity',
    'live',
    0,
    3,
    0.05,
    (s) => s.lighting.ambient.intensity,
    (s, v) => resolveSettings({ lighting: { ambient: { intensity: v } } }, s),
  );

  /* --- fidelity ----------------------------------------------------------- */

  group('fidelity');
  choice(
    'tone mapping',
    'live',
    TONE_MAPPING_NAMES,
    (s) => s.renderer.toneMapping,
    (s, v) => resolveSettings({ renderer: { toneMapping: v } }, s),
  );

  /**
   * Disabled while no operator is selected, because it would do nothing.
   *
   * `toneMappingExposure` is a uniform that only exists inside three's
   * `#ifdef TONE_MAPPING`, so under `none` — the shipped default — dragging this
   * changes the number and not the picture. Greying it out is the difference
   * between a control that is off and a control that is broken, and this project
   * has already decided which of those is worse.
   */
  const exposure = slider(
    'exposure',
    'live',
    0.1,
    3,
    0.01,
    (s) => s.renderer.exposure,
    (s, v) => resolveSettings({ renderer: { exposure: v } }, s),
    (s) => s.renderer.toneMapping !== 'none',
  );
  const syncExposure = (): void => {
    const off = settings.renderer.toneMapping === 'none';
    exposure.input.disabled = off;
    exposure.row.style.opacity = off ? '0.55' : '1';
    exposure.row.title = off
      ? 'pick a tone mapping first — exposure has no effect under "none"'
      : '';
  };
  afterApply.push(syncExposure);
  syncExposure();
  slider(
    'cover gloss',
    'rebuild',
    0,
    1,
    0.01,
    (s) => s.materials.coverRoughness,
    (s, v) => resolveSettings({ materials: { coverRoughness: v } }, s),
  );
  // Red at zero, and truthfully: no map is uploaded and no jitter applied, so the
  // page block is the flat cream slab it used to be.
  slider(
    'page edges',
    'rebuild',
    0,
    3,
    0.05,
    (s) => s.materials.pageStriation,
    (s, v) => resolveSettings({ materials: { pageStriation: v } }, s),
    (s) => s.materials.pageStriation > 0,
  );
  slider(
    'cover metal',
    'rebuild',
    0,
    1,
    0.01,
    (s) => s.materials.coverMetalness,
    (s, v) => resolveSettings({ materials: { coverMetalness: v } }, s),
  );

  /* --- the books ---------------------------------------------------------- */

  /**
   * The first group here about a book rather than about the room.
   *
   * Rebuild-class and it cannot be anything else: the mixture decides board,
   * square and height band, which are geometry, and height decides a face-out
   * book's footprint — so honouring a move means packing the rows again. A live
   * slider over an unmoved shelf is the exact thing this panel exists to refuse.
   *
   * Books whose note declares a `binding:` do not move with it, in either
   * direction. That is not a lie the lamp has to report: the control is doing
   * what it says, which is dialling the *hash*, and a declaration is not a vote.
   */
  group('books');
  slider(
    'paperback mix',
    'rebuild',
    0,
    1,
    0.05,
    (s) => s.books.paperbackRatio,
    (s, v) => resolveSettings({ books: { paperbackRatio: v } }, s),
  );
  /**
   * Red at zero, and truthfully: no cap is built at all, so the ~20 draw calls
   * it costs are simply not spent.
   *
   * ⚠️ **It says nothing about the mixture, and a version of it that tried was
   * wrong.** `… && s.books.paperbackRatio < 1` looked like the honest extra
   * clause — no hardbacks, nothing for a cap to be built on — and it is false: a
   * note declaring `binding: hardback` ignores the ratio entirely, because a
   * declaration is not a vote. At a ratio of 1 that book is still capped and the
   * lamp would have read red over a cap that is there. Nothing the panel can see
   * answers "how many hardbacks are on this shelf", so the lamp answers the
   * question it can: is this control doing anything.
   */
  slider(
    'head cap',
    'rebuild',
    0,
    0.3,
    0.01,
    (s) => s.books.headCap,
    (s, v) => resolveSettings({ books: { headCap: v } }, s),
    (s) => s.books.headCap > 0,
  );

  /**
   * The spine's cross-section, per binding.
   *
   * Four numbers rather than one control, because they are two independent
   * shapes: a backed hardback and a perfect-bound paperback are different
   * objects, and #56's lesson is that one knob moving two things at once hides
   * whichever effect is smaller.
   *
   * The lamps go red on a profile of `{ 0, 0 }` — and truthfully, because that
   * short-circuits to no normal map at all rather than to a map scaled by zero.
   * A control that has switched its own effect off says so.
   */
  for (const binding of BINDINGS) {
    const lit = (s: ShelfSettings): boolean =>
      s.materials.spineProfile[binding].rise !== 0 && s.materials.spineProfile[binding].roll !== 0;

    slider(
      `${binding} rise`,
      'rebuild',
      0,
      0.25,
      0.005,
      (s) => s.materials.spineProfile[binding].rise,
      (s, v) => resolveSettings({ materials: { spineProfile: { [binding]: { rise: v } } } }, s),
      lit,
    );
    slider(
      `${binding} roll`,
      'rebuild',
      0,
      1,
      0.01,
      (s) => s.materials.spineProfile[binding].roll,
      (s, v) => resolveSettings({ materials: { spineProfile: { [binding]: { roll: v } } } }, s),
      lit,
    );
    // Cloth against card, as one number each — and the thing #68 measured as
    // carrying everything a grain map in this slot was doing.
    slider(
      `${binding} cloth`,
      'rebuild',
      0,
      1,
      0.01,
      (s) => s.materials.spineRoughness[binding],
      (s, v) => resolveSettings({ materials: { spineRoughness: { [binding]: v } } }, s),
    );
  }

  group('bloom');
  toggleRow(
    'enabled',
    'rebuild',
    (s) => s.effects.bloom.enabled,
    (s, v) => resolveSettings({ effects: { bloom: { enabled: v } } }, s),
  );
  slider(
    'strength',
    'live',
    0,
    2,
    0.01,
    (s) => s.effects.bloom.strength,
    (s, v) => resolveSettings({ effects: { bloom: { strength: v } } }, s),
    (s) => s.effects.bloom.enabled,
  );
  slider(
    'radius',
    'live',
    0,
    1.5,
    0.01,
    (s) => s.effects.bloom.radius,
    (s, v) => resolveSettings({ effects: { bloom: { radius: v } } }, s),
    (s) => s.effects.bloom.enabled,
  );
  slider(
    'threshold',
    'live',
    0,
    1.5,
    0.01,
    (s) => s.effects.bloom.threshold,
    (s, v) => resolveSettings({ effects: { bloom: { threshold: v } } }, s),
    (s) => s.effects.bloom.enabled,
  );

  /* --- shadows ------------------------------------------------------------ */

  group('shadows');
  toggleRow(
    'painted',
    'rebuild',
    (s) => s.shadows.painted,
    (s, v) => resolveSettings({ shadows: { painted: v } }, s),
  );
  toggleRow(
    'real-time',
    'live',
    (s) => s.shadows.enabled,
    (s, v) => resolveSettings({ shadows: { enabled: v } }, s),
  );
  choice(
    'filter',
    'live',
    SHADOW_TYPE_NAMES,
    (s) => s.shadows.type,
    (s, v) => resolveSettings({ shadows: { type: v } }, s),
    (s) => s.shadows.enabled,
  );
  choice(
    'map size',
    'rebuild',
    ['512', '1024', '2048', '4096'] as const,
    (s) => String(s.shadows.mapSize) as '512' | '1024' | '2048' | '4096',
    (s, v) => resolveSettings({ shadows: { mapSize: Number(v) } }, s),
    // No depth target is allocated while real-time shadows are off, so its size
    // is inert — the same as the filter and the casters beside it.
    (s) => s.shadows.enabled,
  );
  toggleRow(
    'casters',
    'rebuild',
    (s) => s.shadows.casters,
    (s, v) => resolveSettings({ shadows: { casters: v } }, s),
    (s) => s.shadows.casters && s.shadows.enabled,
  );
  // The isolator from the crash investigation: draw the map once, then stop
  // *reading* it. It was in the URL vocabulary and had no control, which made
  // the panel silently narrower than the URL it writes.
  toggleRow(
    'sample the map',
    'rebuild',
    (s) => s.shadows.fetch,
    (s, v) => resolveSettings({ shadows: { fetch: v } }, s),
    (s) => s.shadows.fetch && s.shadows.enabled,
  );

  /* --- scene -------------------------------------------------------------- */

  group('case & room');
  colour(
    'background',
    'live',
    (s) => s.scene.background,
    (s, v) => resolveSettings({ scene: { background: v } }, s),
  );
  colour(
    'wood',
    'live',
    (s) => s.materials.wood,
    (s, v) => resolveSettings({ materials: { wood: v } }, s),
  );
  colour(
    'backboard',
    'live',
    (s) => s.materials.woodDark,
    (s, v) => resolveSettings({ materials: { woodDark: v } }, s),
  );
  slider(
    'wood roughness',
    'live',
    0,
    1,
    0.01,
    (s) => s.materials.woodRoughness,
    (s, v) => resolveSettings({ materials: { woodRoughness: v } }, s),
  );
  // Red at zero, and truthfully: no map is bound at all, so the woodwork is the
  // flat photograph it was. `page edges`' range, because it is that knob's twin.
  slider(
    'wood fibre',
    'live',
    0,
    3,
    0.05,
    (s) => s.materials.woodFibre,
    (s, v) => resolveSettings({ materials: { woodFibre: v } }, s),
    (s) => s.materials.woodFibre > 0,
  );
  toggleRow(
    'fog',
    'live',
    (s) => s.scene.fog.enabled,
    (s, v) => resolveSettings({ scene: { fog: { enabled: v } } }, s),
  );
  slider(
    'fog near',
    'live',
    1,
    40,
    0.5,
    (s) => s.scene.fog.near,
    (s, v) => resolveSettings({ scene: { fog: { near: v } } }, s),
  );
  slider(
    'fog far',
    'live',
    2,
    80,
    0.5,
    (s) => s.scene.fog.far,
    (s, v) => resolveSettings({ scene: { fog: { far: v } } }, s),
  );

  /* --- renderer ----------------------------------------------------------- */

  group('renderer');
  slider(
    'pixel ratio cap',
    'live',
    0.5,
    3,
    0.1,
    (s) => s.renderer.maxPixelRatio,
    (s, v) => resolveSettings({ renderer: { maxPixelRatio: v } }, s),
  );
  /**
   * Superseded while bloom is on, because MSAA is not what is running.
   *
   * A composer renders into its own targets and never sets `samples`, so with
   * bloom enabled the context is created without multisampling and
   * antialiasing moves to an SMAA pass — see `post.ts`. The checkbox would
   * otherwise sit there ticked while `getContextAttributes().antialias` is
   * false, which is the eighth instance of the exact fault this panel exists to
   * prevent, and the only one that was in code written for it.
   */
  const aa = toggleRow(
    'antialias',
    'reload',
    (s) => s.renderer.antialias,
    (s, v) => resolveSettings({ renderer: { antialias: v } }, s),
    // Red while bloom is on: the MSAA this asks for is not what is running.
    (s) => s.renderer.antialias && !s.effects.bloom.enabled,
  );
  const syncAntialias = (): void => {
    const superseded = settings.effects.bloom.enabled;
    aa.input.disabled = superseded;
    aa.row.style.opacity = superseded ? '0.55' : '1';
    aa.row.title = superseded
      ? 'bloom is on, so antialiasing is an SMAA pass rather than MSAA'
      : '';
  };
  afterApply.push(syncAntialias);
  syncAntialias();
  toggleRow(
    'resize guard',
    'live',
    (s) => s.renderer.guardResize,
    (s, v) => resolveSettings({ renderer: { guardResize: v } }, s),
  );

  /* --- export ------------------------------------------------------------- */

  const exportButton = document.createElement('button');
  exportButton.textContent = 'copy settings JSON';
  applyButtonStyle(exportButton);
  exportButton.style.width = '100%';
  exportButton.style.marginTop = '0.5rem';
  exportButton.addEventListener('click', () => {
    void navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
    exportButton.textContent = 'copied — paste into shelf-settings.ts';
    window.setTimeout(() => (exportButton.textContent = 'copy settings JSON'), 2500);
  });

  const resetButton = document.createElement('button');
  resetButton.textContent = 'reset to shipped defaults';
  applyButtonStyle(resetButton);
  resetButton.style.width = '100%';
  resetButton.addEventListener('click', () => {
    apply(DEFAULT_SETTINGS);
    // Every control moved at once, so every control re-reads itself. This has to
    // happen whether or not a rebuild is available — `onRebuild` is documented
    // as optional, and without this the sliders would sit at their old positions
    // describing settings the shelf is no longer running.
    for (const hook of resync) hook();
  });

  body.append(exportButton, resetButton);

  root.append(readout, toggle, body, rebuildButton, status);
  host.append(root);
  paint();

  /* --- the readout -------------------------------------------------------- */

  const tick = (): void => {
    const stats = handle.stats();
    readout.textContent = [
      `fps      ${stats.fps === 0 ? '—' : stats.fps.toFixed(0).padStart(2)}   draws ${String(stats.calls)}`,
      `textures ${String(stats.textures)}   tris ${String(stats.triangles)}`,
      `buffer   ${String(stats.bufferWidth)}x${String(stats.bufferHeight)} @${stats.pixelRatio.toFixed(2)}`,
    ].join('\n');
  };

  tick();
  const timer = window.setInterval(tick, 250);

  return () => {
    window.clearInterval(timer);
    root.remove();
  };
}

/* -------------------------------------------------------------------------- */

/**
 * What a control costs to change — and the panel's whole honesty contract.
 *
 * `live` moves the shelf now. `rebuild` needs the scene made again, so the
 * control is marked and a button appears. `reload` needs a new WebGL context and
 * cannot be anything else — `antialias` is a context-creation attribute, and no
 * amount of bookkeeping makes it live.
 */
type Klass = 'live' | 'rebuild' | 'reload';

/**
 * What a lamp says, and it is about **state**, not about category.
 *
 * The dot used to be coloured by class — which of live / rebuild / reload a
 * control belonged to — and that is a property of the control, so it never
 * changed. A row of decorations. What you actually want to know at a glance,
 * standing in front of a shelf, is *which of these is doing something right
 * now*:
 *
 * - **green** — on, and taking effect.
 * - **red** — off, or inert: the setting exists and is currently doing nothing.
 *   Exposure under `NoToneMapping` is red. So is antialias while bloom is on,
 *   because the multisampling it asks for is not what is running.
 * - **amber** — you have changed it and the shelf has not caught up. Only a
 *   rebuild- or reload-class control can show this.
 *
 * Red is the interesting one. It is the panel's honesty contract made visible
 * without a tooltip: a control that cannot affect anything says so in the same
 * place, in the same language, as one that is simply switched off.
 */
type Lamp = 'on' | 'off' | 'pending';

const LAMP: Record<
  Lamp,
  { readonly colour: string; readonly glow: string; readonly help: string }
> = {
  on: {
    colour: '#5ee08a',
    glow: 'rgba(94, 224, 138, 0.75)',
    help: 'on — taking effect now',
  },
  off: {
    colour: '#e05a5a',
    glow: 'rgba(224, 90, 90, 0.6)',
    help: 'off — this setting is doing nothing at the moment',
  },
  pending: {
    colour: '#e8b64c',
    glow: 'rgba(232, 182, 76, 0.8)',
    help: 'changed, and the shelf has not caught up — rebuild or reload to apply',
  },
};

const KLASS_HELP: Record<Klass, string> = {
  live: 'changes the shelf immediately',
  rebuild: 'needs the shelf rebuilt — press the rebuild button',
  reload: 'needs a new WebGL context — reload the page',
};

/** Diameter of the lit part. The slot around it is `LAMP_SLOT`. */
const LAMP_SIZE = 10;
const LAMP_SLOT = 18;

function makeLamp(): { slot: HTMLElement; set: (state: Lamp, klass: Klass) => void } {
  const slot = document.createElement('span');
  Object.assign(slot.style, {
    flex: `0 0 ${String(LAMP_SLOT)}px`,
    height: `${String(LAMP_SLOT)}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } satisfies Partial<CSSStyleDeclaration>);

  const led = document.createElement('span');
  Object.assign(led.style, {
    width: `${String(LAMP_SIZE)}px`,
    height: `${String(LAMP_SIZE)}px`,
    borderRadius: '50%',
    // A little inner highlight, so it reads as a lit lens rather than a flat
    // circle — the difference between an indicator and a bullet point.
    backgroundImage: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), transparent 60%)',
    transition: 'background-color 120ms linear, box-shadow 120ms linear',
  } satisfies Partial<CSSStyleDeclaration>);
  slot.append(led);

  return {
    slot,
    set(state, klass): void {
      const { colour, glow, help } = LAMP[state];
      led.style.backgroundColor = colour;
      led.style.boxShadow = `0 0 6px 1px ${glow}, inset 0 0 3px rgba(0,0,0,0.35)`;
      slot.title = `${help}
(${klass}: ${KLASS_HELP[klass]})`;
    },
  };
}

function row(label: string, _klass: Klass, ...controls: HTMLElement[]): HTMLElement {
  const line = document.createElement('label');
  Object.assign(line.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.05rem 0',
    // Without this a flex item refuses to shrink below its content width, which
    // is what pushed every checkbox off the right-hand edge behind a horizontal
    // scrollbar.
    minWidth: '0',
  } satisfies Partial<CSSStyleDeclaration>);

  const text = document.createElement('span');
  text.textContent = label;
  Object.assign(text.style, {
    flex: '1 1 auto',
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);

  // Controls keep their size; the label is what gives way. A slider that shrank
  // would be unusable long before a truncated word is unreadable.
  for (const control of controls) control.style.flex = '0 0 auto';

  line.append(text, ...controls);
  return line;
}

/**
 * Says what happened, including what did not.
 *
 * The panel deliberately does not decide this for itself: `applySettings`
 * returns what it actually did, and this renders that. A control that moved
 * while the shelf did not is the failure the whole report type exists to make
 * impossible to miss.
 */
function showReport(status: HTMLElement, report: ApplyReport, canRebuild: boolean): void {
  const lines: string[] = [];

  // First, because it is the one no button can fix.
  if (report.refused.length > 0) lines.push(`✗ ${report.refused.join(', ')}`);

  if (report.needsReload.length > 0) {
    lines.push(`⟳ reload to apply: ${report.needsReload.join(', ')}`);
  }
  if (report.needsRebuild.length > 0) {
    lines.push(
      `${canRebuild ? '⃝' : '⚠'} not applied yet: ${report.needsRebuild.join(', ')}${
        canRebuild ? '' : ' (no rebuild available — reload)'
      }`,
    );
  }
  if (report.applied.length > 0) lines.push(`✓ ${report.applied.join(', ')}`);

  status.textContent = lines.join('\n');
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/* --- styling, kept here so the panel is removable in one file -------------- */

function applyRootStyle(root: HTMLElement): void {
  Object.assign(root.style, {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    zIndex: '11',
    width: 'min(19rem, calc(100vw - 1rem))',
    maxHeight: 'calc(100vh - 1rem)',
    overflowY: 'auto',
    /**
     * Never sideways.
     *
     * `overflow-y: auto` alone makes `overflow-x` compute to `auto` as well, so
     * the panel grew a horizontal scrollbar and parked every checkbox behind it
     * — the controls were off-screen on the axis nobody thinks to scroll. The
     * rows shrink their labels instead; see `row`.
     */
    overflowX: 'hidden',
    padding: '0.5rem 0.6rem',
    borderRadius: '0.4rem',
    background: 'rgba(10, 8, 7, 0.86)',
    color: '#e7dccd',
    font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  } satisfies Partial<CSSStyleDeclaration>);
}

function applyReadoutStyle(node: HTMLElement): void {
  Object.assign(node.style, {
    margin: '0 0 0.4rem',
    color: '#9ff0b4',
    whiteSpace: 'pre',
    font: 'inherit',
  } satisfies Partial<CSSStyleDeclaration>);
}

function applyStatusStyle(node: HTMLElement): void {
  Object.assign(node.style, {
    marginTop: '0.4rem',
    whiteSpace: 'pre-wrap',
    opacity: '0.85',
    fontSize: '10px',
  } satisfies Partial<CSSStyleDeclaration>);
}

function applyButtonStyle(button: HTMLElement): void {
  Object.assign(button.style, {
    marginTop: '0.25rem',
    padding: '0.2rem 0.5rem',
    border: '1px solid rgba(231, 220, 205, 0.35)',
    borderRadius: '0.25rem',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
}

function applyInputStyle(node: HTMLElement): void {
  Object.assign(node.style, {
    background: 'rgba(255,255,255,0.06)',
    color: 'inherit',
    border: '1px solid rgba(231, 220, 205, 0.25)',
    borderRadius: '0.2rem',
    font: 'inherit',
  } satisfies Partial<CSSStyleDeclaration>);
}
