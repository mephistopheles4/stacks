import type { ApplyReport, ShelfHandle } from './scene.ts';
import {
  DEFAULT_SETTINGS,
  resolveSettings,
  SHADOW_TYPE_NAMES,
  TONE_MAPPING_NAMES,
  type ShelfSettings,
} from './shelf-settings.ts';

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

/** Which URL parameter each setting round-trips through, so the URL stays the state. */
const PARAM: Record<string, string> = {
  antialias: 'aa',
  maxPixelRatio: 'dpr',
  guardResize: 'guard',
  shadowsEnabled: 'shadows',
  shadowMapSize: 'shadowmap',
  shadowType: 'shadowtype',
  shadowCasters: 'casters',
  shadowFetch: 'shadowfetch',
  painted: 'painted',
};

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

  const apply = (next: ShelfSettings): void => {
    const report = handle.applySettings(next);
    settings = next;
    writeUrl(next);
    for (const resync of afterApply) resync();
    showReport(status, report, options.onRebuild !== undefined);
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
  ): void => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = get(settings);
    input.addEventListener('change', () => {
      apply(set(settings, input.checked));
    });
    body.append(row(label, klass, input));
  };

  const slider = (
    label: string,
    klass: Klass,
    min: number,
    max: number,
    step: number,
    get: (s: ShelfSettings) => number,
    set: (s: ShelfSettings, value: number) => ShelfSettings,
  ): { input: HTMLInputElement; row: HTMLElement } => {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get(settings));
    input.style.width = '7rem';

    const value = document.createElement('span');
    value.textContent = format(get(settings));
    value.style.minWidth = '2.6rem';
    value.style.textAlign = 'right';

    input.addEventListener('input', () => {
      const parsed = Number(input.value);
      value.textContent = format(parsed);
      apply(set(settings, parsed));
    });

    const line = row(label, klass, input, value);
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
    body.append(row(label, klass, input));
  };

  const choice = <T extends string>(
    label: string,
    klass: Klass,
    options_: readonly T[],
    get: (s: ShelfSettings) => T,
    set: (s: ShelfSettings, value: T) => ShelfSettings,
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
    body.append(row(label, klass, select));
  };

  /* --- light -------------------------------------------------------------- */

  group('key light');
  colour('colour', 'live', (s) => s.lighting.key.colour, (s, v) =>
    resolveSettings({ lighting: { key: { colour: v } } }, s),
  );
  slider('intensity', 'live', 0, 8, 0.05, (s) => s.lighting.key.intensity, (s, v) =>
    resolveSettings({ lighting: { key: { intensity: v } } }, s),
  );
  // The three axes separately rather than a gizmo. A gizmo is the nicer control
  // and it is not the one that works on a phone, one-handed, next to the shelf
  // it is moving — which is where this gets used.
  slider('x  (right +)', 'live', -14, 14, 0.1, (s) => s.lighting.key.position.x, (s, v) =>
    resolveSettings({ lighting: { key: { position: { x: v } } } }, s),
  );
  slider('y  (above case)', 'live', -4, 14, 0.1, (s) => s.lighting.key.position.y.plus, (s, v) =>
    resolveSettings({ lighting: { key: { position: { y: { plus: v } } } } }, s),
  );
  slider('z  (toward you +)', 'live', -14, 14, 0.1, (s) => s.lighting.key.position.z, (s, v) =>
    resolveSettings({ lighting: { key: { position: { z: v } } } }, s),
  );
  slider('aim height', 'live', 0, 1, 0.01, (s) => s.lighting.key.aimHeight, (s, v) =>
    resolveSettings({ lighting: { key: { aimHeight: v } } }, s),
  );

  group('fill light');
  colour('colour', 'live', (s) => s.lighting.fill.colour, (s, v) =>
    resolveSettings({ lighting: { fill: { colour: v } } }, s),
  );
  slider('intensity', 'live', 0, 4, 0.05, (s) => s.lighting.fill.intensity, (s, v) =>
    resolveSettings({ lighting: { fill: { intensity: v } } }, s),
  );

  group('lamp');
  colour('colour', 'live', (s) => s.lighting.lamp.colour, (s, v) =>
    resolveSettings({ lighting: { lamp: { colour: v } } }, s),
  );
  slider('intensity', 'live', 0, 40, 0.5, (s) => s.lighting.lamp.intensity, (s, v) =>
    resolveSettings({ lighting: { lamp: { intensity: v } } }, s),
  );
  slider('reach', 'live', 1, 40, 0.5, (s) => s.lighting.lamp.distance, (s, v) =>
    resolveSettings({ lighting: { lamp: { distance: v } } }, s),
  );

  group('ambient');
  slider('intensity', 'live', 0, 3, 0.05, (s) => s.lighting.ambient.intensity, (s, v) =>
    resolveSettings({ lighting: { ambient: { intensity: v } } }, s),
  );

  /* --- fidelity ----------------------------------------------------------- */

  group('fidelity');
  choice('tone mapping', 'live', TONE_MAPPING_NAMES, (s) => s.renderer.toneMapping, (s, v) =>
    resolveSettings({ renderer: { toneMapping: v } }, s),
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
  const exposure = slider('exposure', 'live', 0.1, 3, 0.01, (s) => s.renderer.exposure, (s, v) =>
    resolveSettings({ renderer: { exposure: v } }, s),
  );
  const syncExposure = (): void => {
    const off = settings.renderer.toneMapping === 'none';
    exposure.input.disabled = off;
    exposure.row.style.opacity = off ? '0.4' : '1';
    exposure.row.title = off ? 'pick a tone mapping first — exposure has no effect under "none"' : '';
  };
  afterApply.push(syncExposure);
  syncExposure();
  slider('cover gloss', 'rebuild', 0, 1, 0.01, (s) => s.materials.coverRoughness, (s, v) =>
    resolveSettings({ materials: { coverRoughness: v } }, s),
  );
  slider('cover metal', 'rebuild', 0, 1, 0.01, (s) => s.materials.coverMetalness, (s, v) =>
    resolveSettings({ materials: { coverMetalness: v } }, s),
  );

  /* --- shadows ------------------------------------------------------------ */

  group('shadows');
  toggleRow('painted', 'rebuild', (s) => s.shadows.painted, (s, v) =>
    resolveSettings({ shadows: { painted: v } }, s),
  );
  toggleRow('real-time', 'live', (s) => s.shadows.enabled, (s, v) =>
    resolveSettings({ shadows: { enabled: v } }, s),
  );
  choice('filter', 'live', SHADOW_TYPE_NAMES, (s) => s.shadows.type, (s, v) =>
    resolveSettings({ shadows: { type: v } }, s),
  );
  choice('map size', 'rebuild', ['512', '1024', '2048', '4096'] as const, (s) =>
    String(s.shadows.mapSize) as '512' | '1024' | '2048' | '4096',
    (s, v) => resolveSettings({ shadows: { mapSize: Number(v) } }, s),
  );
  toggleRow('casters', 'rebuild', (s) => s.shadows.casters, (s, v) =>
    resolveSettings({ shadows: { casters: v } }, s),
  );

  /* --- scene -------------------------------------------------------------- */

  group('case & room');
  colour('background', 'live', (s) => s.scene.background, (s, v) =>
    resolveSettings({ scene: { background: v } }, s),
  );
  colour('wood', 'live', (s) => s.materials.wood, (s, v) =>
    resolveSettings({ materials: { wood: v } }, s),
  );
  colour('backboard', 'live', (s) => s.materials.woodDark, (s, v) =>
    resolveSettings({ materials: { woodDark: v } }, s),
  );
  slider('wood roughness', 'live', 0, 1, 0.01, (s) => s.materials.woodRoughness, (s, v) =>
    resolveSettings({ materials: { woodRoughness: v } }, s),
  );
  toggleRow('fog', 'live', (s) => s.scene.fog.enabled, (s, v) =>
    resolveSettings({ scene: { fog: { enabled: v } } }, s),
  );
  slider('fog near', 'live', 1, 40, 0.5, (s) => s.scene.fog.near, (s, v) =>
    resolveSettings({ scene: { fog: { near: v } } }, s),
  );
  slider('fog far', 'live', 2, 80, 0.5, (s) => s.scene.fog.far, (s, v) =>
    resolveSettings({ scene: { fog: { far: v } } }, s),
  );

  /* --- renderer ----------------------------------------------------------- */

  group('renderer');
  slider('pixel ratio cap', 'live', 0.5, 3, 0.1, (s) => s.renderer.maxPixelRatio, (s, v) =>
    resolveSettings({ renderer: { maxPixelRatio: v } }, s),
  );
  toggleRow('antialias', 'reload', (s) => s.renderer.antialias, (s, v) =>
    resolveSettings({ renderer: { antialias: v } }, s),
  );
  toggleRow('resize guard', 'live', (s) => s.renderer.guardResize, (s, v) =>
    resolveSettings({ renderer: { guardResize: v } }, s),
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
    // Rebuilt rather than patched: every control's value changed at once, and
    // walking them individually is how one gets left showing the old number.
    remount();
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

  const remount = (): void => {
    // Nothing to rebind: `mountPanel` is called again by the caller after a
    // remount, because the handle it closes over is dead.
    options.onRebuild?.(settings);
  };

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

const KLASS_COLOUR: Record<Klass, string> = {
  live: 'rgba(159, 240, 180, 0.85)',
  rebuild: 'rgba(255, 205, 120, 0.9)',
  reload: 'rgba(255, 145, 145, 0.9)',
};

function row(label: string, klass: Klass, ...controls: HTMLElement[]): HTMLElement {
  const line = document.createElement('label');
  Object.assign(line.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.05rem 0',
  } satisfies Partial<CSSStyleDeclaration>);

  const dot = document.createElement('span');
  dot.textContent = '●';
  dot.title = `${klass}: ${KLASS_HELP[klass]}`;
  dot.style.color = KLASS_COLOUR[klass];
  dot.style.fontSize = '8px';

  const text = document.createElement('span');
  text.textContent = label;
  text.style.flex = '1';
  text.style.whiteSpace = 'nowrap';

  line.append(dot, text, ...controls);
  return line;
}

const KLASS_HELP: Record<Klass, string> = {
  live: 'changes the shelf immediately',
  rebuild: 'needs the shelf rebuilt — press the rebuild button',
  reload: 'needs a new WebGL context — reload the page',
};

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

/**
 * The URL is the state, so every change goes back into it.
 *
 * `replaceState`, not `pushState`: dragging a slider would otherwise write a
 * hundred history entries and make the back button useless. Only the parameters
 * that differ from the shipped defaults are written, so a URL stays readable and
 * a shelf running defaults has a clean address — and every bisect URL recorded
 * in `docs/progress.md` still means what it meant.
 */
function writeUrl(settings: ShelfSettings): void {
  const params = new URLSearchParams(window.location.search);

  const set = (key: string, value: string | undefined): void => {
    const name = PARAM[key];
    if (name === undefined) return;
    if (value === undefined) params.delete(name);
    else params.set(name, value);
  };

  const d = DEFAULT_SETTINGS;
  set('antialias', settings.renderer.antialias === d.renderer.antialias ? undefined : '0');
  set(
    'maxPixelRatio',
    settings.renderer.maxPixelRatio === d.renderer.maxPixelRatio
      ? undefined
      : String(settings.renderer.maxPixelRatio),
  );
  set('guardResize', settings.renderer.guardResize === d.renderer.guardResize ? undefined : '1');
  set(
    'shadowsEnabled',
    settings.shadows.enabled === d.shadows.enabled ? undefined : settings.shadows.enabled ? '1' : '0',
  );
  set('shadowType', settings.shadows.type === d.shadows.type ? undefined : settings.shadows.type);
  set(
    'shadowMapSize',
    settings.shadows.mapSize === d.shadows.mapSize ? undefined : String(settings.shadows.mapSize),
  );
  set('shadowCasters', settings.shadows.casters === d.shadows.casters ? undefined : '0');
  set('shadowFetch', settings.shadows.fetch === d.shadows.fetch ? undefined : '0');
  set('painted', settings.shadows.painted === d.shadows.painted ? undefined : '0');

  const query = params.toString();
  window.history.replaceState(null, '', query === '' ? window.location.pathname : `?${query}`);
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
    width: 'min(17rem, calc(100vw - 1rem))',
    maxHeight: 'calc(100vh - 1rem)',
    overflowY: 'auto',
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
