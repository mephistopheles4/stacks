import type { ApplyReport, ShelfHandle } from './scene.ts';
import {
  BINDINGS,
  DEFAULT_SETTINGS,
  resolveSettings,
  SHADOW_RECEIVER_NAMES,
  SHADOW_TYPE_NAMES,
  TONE_MAPPING_NAMES,
  type ShelfSettings,
} from './shelf-settings.ts';
import { WOOD_SPECIES, speciesPending } from './woodwork.ts';

/**
 * The tuning panel's honesty logic, with nothing drawn.
 *
 * Settings, the mounted state and an `ApplyReport` go in; each row's lamp, label,
 * disabled reason, list options and range, the rebuild button's hidden flag and
 * the status lines come out. Pure and DOM-free so Node can run it on every pull
 * request (#489), and so a view is a loop that copies this into whatever draws
 * the rows (#496). **A behaviour that gets view code of its own needs a browser
 * check of its own**; this file is where it should have lived instead.
 *
 * The panel's one rule, from `docs/progress.md`: *"A probe that silently did
 * nothing would be worse than no probe."* Every control says its class, whether
 * it is doing anything, and why not. Tweakpane has no tooltip, and a disabled
 * row takes no pointer events, so **every reason is text in the label** (#487).
 */

/**
 * What a control costs to change. `live` moves the shelf now; `rebuild` needs the
 * scene made again; `reload` needs a new WebGL context, which no bookkeeping
 * makes live (`antialias` is a context-creation attribute).
 */
export type Klass = 'live' | 'rebuild' | 'reload';

/**
 * What a lamp says, about **state** and not category: `on` is taking effect,
 * `off` is switched off or inert (exposure under `none`, antialias under bloom),
 * `pending` is changed and not yet caught up — only rebuild- and reload-class
 * rows can be.
 */
export type Lamp = 'on' | 'off' | 'pending';

export type RowKind = 'slider' | 'toggle' | 'colour' | 'choice';

export interface ListOption {
  readonly value: string;
  readonly text: string;
}

const LAMP_GLYPH: Record<Lamp, string> = { on: '🟢', off: '🔴', pending: '🟡' };

/** One row, as a view reads it. */
export interface RowView {
  /** `<group>/<label>`: labels repeat across groups, this does not. */
  readonly id: string;
  readonly kind: RowKind;
  readonly klass: Klass;
  readonly lamp: Lamp;
  /** The row's own name, without the lamp or the class. */
  readonly label: string;
  /** What the view shows as the row's label: lamp, class and any reason. See `rowLabel`. */
  readonly labelText: string;
  /** Effective: true inside a disabled folder too, which `binding.disabled` would not say. */
  readonly disabled: boolean;
  /** Why it is disabled; present exactly when `disabled` is. */
  readonly reason?: string;
  /** A number for sliders and colours, a boolean for toggles, a string for choices. */
  readonly value: number | boolean | string;
  /** Sliders only: the usual bounds, stretched to hold a value outside them. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Choices only, with a stray value appended and labelled. */
  readonly options?: readonly ListOption[];
}

/** The shadows group's second half: everything that needs real-time shadows. */
export interface FolderView {
  readonly title: string;
  readonly disabled: boolean;
  readonly rows: readonly RowView[];
}

export interface GroupView {
  readonly title: string;
  /** Rows beside the folder, never inside it: `real-time` is how you get back. */
  readonly rows: readonly RowView[];
  readonly folder?: FolderView;
}

export interface PanelView {
  readonly groups: readonly GroupView[];
  readonly status: readonly string[];
  /** `status` as the one multiline text a readonly monitor shows. */
  readonly statusText: string;
  readonly rebuildHidden: boolean;
}

export interface PanelInputs {
  readonly settings: ShelfSettings;
  /** What the scene was built with; see `ShelfHandle.mountedWith`. */
  readonly mountedWith: ShelfSettings;
  readonly canRebuild: boolean;
  /** The last apply's report, when there has been one. */
  readonly report?: ApplyReport;
}

/* -------------------------------------------------------------------------- */
/*  pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A list's options, plus the value it does not offer (#300).
 *
 * Tweakpane renders a list holding such a value blank and its first `refresh()`
 * writes the first option back, so the stray value is added as an option of its
 * own, naming itself. It is labelled and not greyed: Tweakpane's public API has
 * no way to grey one option (#487).
 */
export function listOptions(options: readonly string[], current: string): readonly ListOption[] {
  const listed = options.map((value) => ({ value, text: value }));
  if (options.includes(current)) return listed;
  return [...listed, { value: current, text: `${current} — not on the list` }];
}

/**
 * A slider's bounds, stretched to hold a value outside the usual range (#490).
 *
 * Tweakpane clamps a slider's value into its range and writes the clamp back, so
 * a value that arrived outside it (`?debug={"renderer":{"exposure":5}}` reaches
 * a 0.1–3 slider) would be rewritten on the first refresh. Stretching the range
 * first keeps the value and keeps the control honest; the bounds return once the
 * value is inside again. A value that is not a finite number keeps the usual
 * bounds: a wrong type is out of scope here.
 */
export function stretchRange(
  min: number,
  max: number,
  value: number,
): { readonly min: number; readonly max: number; readonly beyond: boolean } {
  if (!Number.isFinite(value) || (value >= min && value <= max)) {
    return { min, max, beyond: false };
  }
  return { min: Math.min(min, value), max: Math.max(max, value), beyond: true };
}

/**
 * A slider's value rounded to its step's decimals.
 *
 * Tweakpane lands a slider on its step grid in floating point, so a drag to 0.3
 * arrives as 0.29999999999999993 and a narrowed range leaves 1.9999999999999998.
 * Applied as it comes, that noise reaches the shelf, the address, the status line
 * and the JSON copy hands you to paste into the settings file; the native range
 * input it replaces gave 0.3. Not a number, or a step with no decimals to speak
 * of, passes through.
 */
export function onStep(value: Value, step: number): Value {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(value.toFixed(decimals));
}

/**
 * What a row's label says: the lamp, the name, the class, and then whatever has
 * to be said — the real value of a number beyond the range, or why the row is
 * disabled. In label text because Tweakpane has no tooltip.
 */
export function rowLabel(parts: {
  readonly lamp: Lamp;
  readonly label: string;
  readonly klass: Klass;
  readonly beyond?: string;
  readonly reason?: string;
}): string {
  let text = `${LAMP_GLYPH[parts.lamp]} ${parts.label} · ${parts.klass}`;
  if (parts.beyond !== undefined) text += ` — ${parts.beyond}`;
  if (parts.reason !== undefined) text += ` — ${parts.reason}`;
  return text;
}

/**
 * Says what happened, including what did not: `applySettings` returns what it
 * actually did, and this renders every field of it. `resolved` goes last, always
 * — the shelf's read-back of what it is running, a *state* rather than any of the
 * four transitions above it, and the only line that can describe a configuration
 * that was wrong from the first frame (G54, map #280).
 */
export function statusLines(report: ApplyReport, canRebuild: boolean): string[] {
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
  if (report.resolved.length > 0) lines.push(`= ${report.resolved.join(', ')}`);
  return lines;
}

/**
 * Offered only for things a rebuild actually fixes. `refused` deliberately does
 * not raise it: a button that cannot help is its own small lie.
 */
function rebuildHidden(report: ApplyReport | undefined, canRebuild: boolean): boolean {
  return report === undefined || report.needsRebuild.length === 0 || !canRebuild;
}

/* -------------------------------------------------------------------------- */
/*  the rows                                                                   */
/* -------------------------------------------------------------------------- */

type Value = number | boolean | string;

interface RowDef {
  readonly group: string;
  readonly label: string;
  readonly klass: Klass;
  readonly kind: RowKind;
  readonly get: (s: ShelfSettings) => Value;
  readonly set: (s: ShelfSettings, value: Value) => ShelfSettings;
  /** Doing something, as opposed to inert. Defaults to "yes". */
  readonly active: (s: ShelfSettings) => boolean;
  /** Pending, against what the scene was built with. Defaults to raw inequality. */
  readonly stale: (built: ShelfSettings, now: ShelfSettings) => boolean;
  /** Why the row would do nothing, when it would. */
  readonly disabledReason?: (s: ShelfSettings) => string | undefined;
  readonly range?: { readonly min: number; readonly max: number; readonly step: number };
  readonly options?: readonly string[];
  /** In the shadows folder, behind the group's own disabled state. */
  readonly folder?: true;
}

interface Extras {
  readonly active?: (s: ShelfSettings) => boolean;
  readonly stale?: (built: ShelfSettings, now: ShelfSettings) => boolean;
  readonly disabledReason?: (s: ShelfSettings) => string | undefined;
  readonly folder?: true;
}

const SHADOWS_OFF = 'real-time shadows are off — nothing here has an effect';

function rowDef(
  group: string,
  label: string,
  klass: Klass,
  kind: RowKind,
  get: (s: ShelfSettings) => Value,
  set: (s: ShelfSettings, value: Value) => ShelfSettings,
  more: Extras & Pick<RowDef, 'range' | 'options'>,
): RowDef {
  return {
    group,
    label,
    klass,
    kind,
    get,
    set,
    active: more.active ?? (kind === 'toggle' ? (s) => get(s) === true : () => true),
    stale: more.stale ?? ((built, now) => get(built) !== get(now)),
    ...(more.disabledReason === undefined ? {} : { disabledReason: more.disabledReason }),
    ...(more.range === undefined ? {} : { range: more.range }),
    ...(more.options === undefined ? {} : { options: more.options }),
    ...(more.folder === undefined ? {} : { folder: more.folder }),
  };
}

const slider = (
  group: string,
  label: string,
  klass: Klass,
  min: number,
  max: number,
  step: number,
  get: (s: ShelfSettings) => number,
  set: (s: ShelfSettings, value: number) => ShelfSettings,
  more: Extras = {},
): RowDef =>
  rowDef(group, label, klass, 'slider', get, (s, v) => set(s, v as number), {
    ...more,
    range: { min, max, step },
  });

const toggle = (
  group: string,
  label: string,
  klass: Klass,
  get: (s: ShelfSettings) => boolean,
  set: (s: ShelfSettings, value: boolean) => ShelfSettings,
  more: Extras = {},
): RowDef => rowDef(group, label, klass, 'toggle', get, (s, v) => set(s, v as boolean), more);

const colour = (
  group: string,
  label: string,
  klass: Klass,
  get: (s: ShelfSettings) => number,
  set: (s: ShelfSettings, value: number) => ShelfSettings,
): RowDef => rowDef(group, label, klass, 'colour', get, (s, v) => set(s, v as number), {});

const choice = <T extends string>(
  group: string,
  label: string,
  klass: Klass,
  options: readonly T[],
  get: (s: ShelfSettings) => string,
  set: (s: ShelfSettings, value: T) => ShelfSettings,
  more: Extras = {},
): RowDef =>
  rowDef(group, label, klass, 'choice', get, (s, v) => set(s, v as T), { ...more, options });

const KEY = 'key light';
const FILL = 'fill light';
const LAMP = 'lamp';
const AMBIENT = 'ambient';
const FIDELITY = 'fidelity';
const BOOKS = 'books';
const BLOOM = 'bloom';
const SHADOWS = 'shadows';
const ROOM = 'bookcase & room';
const RENDERER = 'renderer';

/** Every row of the panel, in the order it is drawn. One source for the view and the tests. */
const ROWS: readonly RowDef[] = [
  colour(
    KEY,
    'colour',
    'live',
    (s) => s.lighting.key.colour,
    (s, v) => resolveSettings({ lighting: { key: { colour: v } } }, s),
  ),
  slider(
    KEY,
    'intensity',
    'live',
    0,
    8,
    0.05,
    (s) => s.lighting.key.intensity,
    (s, v) => resolveSettings({ lighting: { key: { intensity: v } } }, s),
  ),
  // The three axes separately rather than a gizmo: a gizmo is not the control
  // that works on a phone, one-handed, next to the shelf it is moving.
  slider(
    KEY,
    'x  (right +)',
    'live',
    -14,
    14,
    0.1,
    (s) => s.lighting.key.position.x,
    (s, v) => resolveSettings({ lighting: { key: { position: { x: v } } } }, s),
  ),
  slider(
    KEY,
    'y  (above bookcase)',
    'live',
    -4,
    14,
    0.1,
    (s) => s.lighting.key.position.y.plus,
    (s, v) => resolveSettings({ lighting: { key: { position: { y: { plus: v } } } } }, s),
  ),
  slider(
    KEY,
    'z  (toward you +)',
    'live',
    -14,
    14,
    0.1,
    (s) => s.lighting.key.position.z,
    (s, v) => resolveSettings({ lighting: { key: { position: { z: v } } } }, s),
  ),
  slider(
    KEY,
    'aim height',
    'live',
    0,
    1,
    0.01,
    (s) => s.lighting.key.aimHeight,
    (s, v) => resolveSettings({ lighting: { key: { aimHeight: v } } }, s),
  ),

  colour(
    FILL,
    'colour',
    'live',
    (s) => s.lighting.fill.colour,
    (s, v) => resolveSettings({ lighting: { fill: { colour: v } } }, s),
  ),
  slider(
    FILL,
    'intensity',
    'live',
    0,
    4,
    0.05,
    (s) => s.lighting.fill.intensity,
    (s, v) => resolveSettings({ lighting: { fill: { intensity: v } } }, s),
  ),

  colour(
    LAMP,
    'colour',
    'live',
    (s) => s.lighting.lamp.colour,
    (s, v) => resolveSettings({ lighting: { lamp: { colour: v } } }, s),
  ),
  slider(
    LAMP,
    'intensity',
    'live',
    0,
    40,
    0.5,
    (s) => s.lighting.lamp.intensity,
    (s, v) => resolveSettings({ lighting: { lamp: { intensity: v } } }, s),
  ),
  slider(
    LAMP,
    'reach',
    'live',
    1,
    40,
    0.5,
    (s) => s.lighting.lamp.distance,
    (s, v) => resolveSettings({ lighting: { lamp: { distance: v } } }, s),
  ),

  slider(
    AMBIENT,
    'intensity',
    'live',
    0,
    3,
    0.05,
    (s) => s.lighting.ambient.intensity,
    (s, v) => resolveSettings({ lighting: { ambient: { intensity: v } } }, s),
  ),

  choice(
    FIDELITY,
    'tone mapping',
    'live',
    TONE_MAPPING_NAMES,
    (s) => s.renderer.toneMapping,
    (s, v) => resolveSettings({ renderer: { toneMapping: v } }, s),
  ),
  // `toneMappingExposure` is a uniform that only exists inside three's
  // `#ifdef TONE_MAPPING`, so under `none` — the shipped default — dragging this
  // changes the number and not the picture. Greying it out is the difference
  // between a control that is off and one that is broken.
  slider(
    FIDELITY,
    'exposure',
    'live',
    0.1,
    3,
    0.01,
    (s) => s.renderer.exposure,
    (s, v) => resolveSettings({ renderer: { exposure: v } }, s),
    {
      active: (s) => s.renderer.toneMapping !== 'none',
      disabledReason: (s) =>
        s.renderer.toneMapping === 'none'
          ? 'pick a tone mapping first — exposure has no effect under "none"'
          : undefined,
    },
  ),
  slider(
    FIDELITY,
    'cover gloss',
    'rebuild',
    0,
    1,
    0.01,
    (s) => s.materials.coverRoughness,
    (s, v) => resolveSettings({ materials: { coverRoughness: v } }, s),
  ),
  // Red at zero, and truthfully: no map is uploaded and no jitter applied.
  slider(
    FIDELITY,
    'page edges',
    'rebuild',
    0,
    3,
    0.05,
    (s) => s.materials.pageStriation,
    (s, v) => resolveSettings({ materials: { pageStriation: v } }, s),
    { active: (s) => s.materials.pageStriation > 0 },
  ),
  slider(
    FIDELITY,
    'cover metal',
    'rebuild',
    0,
    1,
    0.01,
    (s) => s.materials.coverMetalness,
    (s, v) => resolveSettings({ materials: { coverMetalness: v } }, s),
  ),

  // Rebuild-class and it cannot be anything else: the mixture decides board,
  // square and height band, which are geometry.
  slider(
    BOOKS,
    'paperback mix',
    'rebuild',
    0,
    1,
    0.05,
    (s) => s.books.paperbackRatio,
    (s, v) => resolveSettings({ books: { paperbackRatio: v } }, s),
  ),
  // ⚠️ Says nothing about the mixture: a note declaring `binding: hardback`
  // ignores the ratio, so "no hardbacks" is not something the panel can see.
  slider(
    BOOKS,
    'head cap',
    'rebuild',
    0,
    0.3,
    0.01,
    (s) => s.books.headCap,
    (s, v) => resolveSettings({ books: { headCap: v } }, s),
    { active: (s) => s.books.headCap > 0 },
  ),
  ...BINDINGS.flatMap((binding) => {
    // A profile of `{ 0, 0 }` short-circuits to no normal map at all.
    const lit = (s: ShelfSettings): boolean =>
      s.materials.spineProfile[binding].rise !== 0 && s.materials.spineProfile[binding].roll !== 0;
    return [
      slider(
        BOOKS,
        `${binding} rise`,
        'rebuild',
        0,
        0.25,
        0.005,
        (s) => s.materials.spineProfile[binding].rise,
        (s, v) => resolveSettings({ materials: { spineProfile: { [binding]: { rise: v } } } }, s),
        { active: lit },
      ),
      slider(
        BOOKS,
        `${binding} roll`,
        'rebuild',
        0,
        1,
        0.01,
        (s) => s.materials.spineProfile[binding].roll,
        (s, v) => resolveSettings({ materials: { spineProfile: { [binding]: { roll: v } } } }, s),
        { active: lit },
      ),
      slider(
        BOOKS,
        `${binding} cloth`,
        'rebuild',
        0,
        1,
        0.01,
        (s) => s.materials.spineRoughness[binding],
        (s, v) => resolveSettings({ materials: { spineRoughness: { [binding]: v } } }, s),
      ),
    ];
  }),

  toggle(
    BLOOM,
    'enabled',
    'rebuild',
    (s) => s.effects.bloom.enabled,
    (s, v) => resolveSettings({ effects: { bloom: { enabled: v } } }, s),
  ),
  slider(
    BLOOM,
    'strength',
    'live',
    0,
    2,
    0.01,
    (s) => s.effects.bloom.strength,
    (s, v) => resolveSettings({ effects: { bloom: { strength: v } } }, s),
    { active: (s) => s.effects.bloom.enabled },
  ),
  slider(
    BLOOM,
    'radius',
    'live',
    0,
    1.5,
    0.01,
    (s) => s.effects.bloom.radius,
    (s, v) => resolveSettings({ effects: { bloom: { radius: v } } }, s),
    { active: (s) => s.effects.bloom.enabled },
  ),
  slider(
    BLOOM,
    'threshold',
    'live',
    0,
    1.5,
    0.01,
    (s) => s.effects.bloom.threshold,
    (s, v) => resolveSettings({ effects: { bloom: { threshold: v } } }, s),
    { active: (s) => s.effects.bloom.enabled },
  ),

  // `painted` and `real-time` sit outside the folder: painted is the fallback
  // for exactly the state where real-time is off, and `real-time` is the switch
  // that re-enables the rest.
  toggle(
    SHADOWS,
    'painted',
    'rebuild',
    (s) => s.shadows.painted,
    (s, v) => resolveSettings({ shadows: { painted: v } }, s),
  ),
  toggle(
    SHADOWS,
    'real-time',
    'live',
    (s) => s.shadows.enabled,
    (s, v) => resolveSettings({ shadows: { enabled: v } }, s),
  ),
  choice(
    SHADOWS,
    'filter',
    'live',
    SHADOW_TYPE_NAMES,
    (s) => s.shadows.type,
    (s, v) => resolveSettings({ shadows: { type: v } }, s),
    { active: (s) => s.shadows.enabled, folder: true },
  ),
  // No depth target is allocated while real-time shadows are off, so its size is inert.
  choice(
    SHADOWS,
    'map size',
    'rebuild',
    ['512', '1024', '2048', '4096'] as const,
    (s) => String(s.shadows.mapSize),
    (s, v) => resolveSettings({ shadows: { mapSize: Number(v) } }, s),
    { active: (s) => s.shadows.enabled, folder: true },
  ),
  toggle(
    SHADOWS,
    'casters',
    'rebuild',
    (s) => s.shadows.casters,
    (s, v) => resolveSettings({ shadows: { casters: v } }, s),
    { active: (s) => s.shadows.casters && s.shadows.enabled, folder: true },
  ),
  // `all` is the configuration that loses the context on the Pixel 10 Pro XL,
  // offered so it can be re-tested rather than as a look.
  choice(
    SHADOWS,
    'receivers',
    'rebuild',
    SHADOW_RECEIVER_NAMES,
    (s) => s.shadows.receivers,
    (s, v) => resolveSettings({ shadows: { receivers: v } }, s),
    { active: (s) => s.shadows.enabled, folder: true },
  ),
  // The isolator from the crash investigation: draw the map once, stop reading it.
  toggle(
    SHADOWS,
    'sample the map',
    'rebuild',
    (s) => s.shadows.fetch,
    (s, v) => resolveSettings({ shadows: { fetch: v } }, s),
    { active: (s) => s.shadows.fetch && s.shadows.enabled, folder: true },
  ),

  colour(
    ROOM,
    'background',
    'live',
    (s) => s.scene.background,
    (s, v) => resolveSettings({ scene: { background: v } }, s),
  ),
  // ⚠️ Labelled *woodwork sheet* and not *wood species*, deliberately: it governs
  // the planks and uprights and cannot move the backboard. Compared through
  // `speciesPending`, **resolved, not raw**: `walnut` and `rosewood` are one
  // bookcase, so comparing the requests lights this amber over a shelf that
  // already shows what was asked for.
  choice(
    ROOM,
    'woodwork sheet',
    'rebuild',
    WOOD_SPECIES,
    (s) => s.materials.woodSpecies,
    (s, v) => resolveSettings({ materials: { woodSpecies: v } }, s),
    {
      stale: (built, now) => speciesPending(built.materials.woodSpecies, now.materials.woodSpecies),
    },
  ),
  colour(
    ROOM,
    'wood',
    'live',
    (s) => s.materials.wood,
    (s, v) => resolveSettings({ materials: { wood: v } }, s),
  ),
  colour(
    ROOM,
    'backboard',
    'live',
    (s) => s.materials.woodDark,
    (s, v) => resolveSettings({ materials: { woodDark: v } }, s),
  ),
  slider(
    ROOM,
    'wood roughness',
    'live',
    0,
    1,
    0.01,
    (s) => s.materials.woodRoughness,
    (s, v) => resolveSettings({ materials: { woodRoughness: v } }, s),
  ),
  slider(
    ROOM,
    'wood fibre',
    'live',
    0,
    3,
    0.05,
    (s) => s.materials.woodFibre,
    (s, v) => resolveSettings({ materials: { woodFibre: v } }, s),
    { active: (s) => s.materials.woodFibre > 0 },
  ),
  toggle(
    ROOM,
    'fog',
    'live',
    (s) => s.scene.fog.enabled,
    (s, v) => resolveSettings({ scene: { fog: { enabled: v } } }, s),
  ),
  // In framing distances, not world units; the labels say so.
  slider(
    ROOM,
    'fog near ×framing',
    'live',
    0.5,
    5,
    0.05,
    (s) => s.scene.fog.near,
    (s, v) => resolveSettings({ scene: { fog: { near: v } } }, s),
  ),
  slider(
    ROOM,
    'fog far ×framing',
    'live',
    1,
    10,
    0.05,
    (s) => s.scene.fog.far,
    (s, v) => resolveSettings({ scene: { fog: { far: v } } }, s),
  ),

  slider(
    RENDERER,
    'pixel ratio cap',
    'live',
    0.5,
    3,
    0.1,
    (s) => s.renderer.maxPixelRatio,
    (s, v) => resolveSettings({ renderer: { maxPixelRatio: v } }, s),
  ),
  // Superseded while bloom is on: a composer renders into its own targets and
  // never sets `samples`, so antialiasing moves to an SMAA pass (`post.ts`).
  toggle(
    RENDERER,
    'antialias',
    'reload',
    (s) => s.renderer.antialias,
    (s, v) => resolveSettings({ renderer: { antialias: v } }, s),
    {
      active: (s) => s.renderer.antialias && !s.effects.bloom.enabled,
      disabledReason: (s) =>
        s.effects.bloom.enabled
          ? 'bloom is on, so antialiasing is an SMAA pass rather than MSAA'
          : undefined,
    },
  ),
  toggle(
    RENDERER,
    'resize guard',
    'live',
    (s) => s.renderer.guardResize,
    (s, v) => resolveSettings({ renderer: { guardResize: v } }, s),
  ),
];

const idOf = (def: RowDef): string => `${def.group}/${def.label}`;

/** A row's new settings for a value the control gave. Throws on an unknown id. */
export function setRow(id: string, settings: ShelfSettings, value: Value): ShelfSettings {
  const def = ROWS.find((candidate) => idOf(candidate) === id);
  if (def === undefined) throw new Error(`panel-model: no row ${id}`);
  return def.set(settings, def.range === undefined ? value : onStep(value, def.range.step));
}

function rowView(def: RowDef, inputs: PanelInputs, folderReason: string | undefined): RowView {
  const { settings, mountedWith } = inputs;
  const value = def.get(settings);
  const pending = def.klass !== 'live' && def.stale(mountedWith, settings);
  const lamp: Lamp = pending ? 'pending' : def.active(settings) ? 'on' : 'off';
  const reason = def.disabledReason?.(settings) ?? folderReason;

  const stretched =
    def.range !== undefined && typeof value === 'number'
      ? stretchRange(def.range.min, def.range.max, value)
      : undefined;
  const beyond =
    stretched?.beyond === true && def.range !== undefined
      ? `${String(value)} is beyond the usual ${String(def.range.min)}–${String(def.range.max)}`
      : undefined;

  return {
    id: idOf(def),
    kind: def.kind,
    klass: def.klass,
    lamp,
    label: def.label,
    labelText: rowLabel({
      lamp,
      label: def.label,
      klass: def.klass,
      ...(beyond === undefined ? {} : { beyond }),
      ...(reason === undefined ? {} : { reason }),
    }),
    disabled: reason !== undefined,
    ...(reason === undefined ? {} : { reason }),
    value,
    ...(def.range === undefined
      ? {}
      : {
          min: stretched?.min ?? def.range.min,
          max: stretched?.max ?? def.range.max,
          step: def.range.step,
        }),
    ...(def.options === undefined ? {} : { options: listOptions(def.options, String(value)) }),
  };
}

/** The whole panel as a view reads it: the rows, the status lines and the rebuild button. */
export function panelView(inputs: PanelInputs): PanelView {
  const titles = [...new Set(ROWS.map((def) => def.group))];
  const groups = titles.map((title): GroupView => {
    const defs = ROWS.filter((def) => def.group === title);
    const outside = defs.filter((def) => def.folder !== true);
    const inside = defs.filter((def) => def.folder === true);
    const base = { title, rows: outside.map((def) => rowView(def, inputs, undefined)) };
    if (inside.length === 0) return base;
    const off = !inputs.settings.shadows.enabled;
    return {
      ...base,
      folder: {
        title: off ? SHADOWS_OFF : 'real-time shadow controls',
        disabled: off,
        rows: inside.map((def) => rowView(def, inputs, off ? SHADOWS_OFF : undefined)),
      },
    };
  });
  const status = inputs.report === undefined ? [] : statusLines(inputs.report, inputs.canRebuild);
  return {
    groups,
    status,
    statusText: status.join('\n'),
    rebuildHidden: rebuildHidden(inputs.report, inputs.canRebuild),
  };
}

/* -------------------------------------------------------------------------- */
/*  the model a view drives                                                    */
/* -------------------------------------------------------------------------- */

export interface PanelModelOptions {
  readonly handle: Pick<ShelfHandle, 'settings' | 'mountedWith' | 'applySettings'>;
  /** Whether the page can remount the shelf. Absent `onRebuild` means no. */
  readonly canRebuild: boolean;
  /**
   * The settings this page started from, which the address is written as a diff
   * of. A getter, because a fallback during the session moves it. Absent means
   * the shipped defaults.
   */
  readonly base?: () => ShelfSettings;
}

export interface PanelModel {
  view(): PanelView;
  /** Moves the shelf to `next` and returns the view over what it reported. */
  apply(next: ShelfSettings): PanelView;
  /** One row's value changed by its control. */
  set(id: string, value: Value): PanelView;
  /**
   * Back to the shipped defaults. The returned view carries every row's value,
   * so a view that copies it has resynced every control at once, with no hook per
   * control to leave one showing the old number.
   */
  reset(): PanelView;
  /** The settings to rebuild with, while something waits on a rebuild. */
  pendingRebuild(): ShelfSettings | undefined;
  /**
   * What the address is written from: the settings and the base they are a diff
   * against. The base is read fresh on every call, and a page carrying a
   * lost-context record has the painted one, so a remembered fallback never
   * becomes `?shadows=0` in a link somebody shares (`writeSettings`).
   */
  address(): { readonly settings: ShelfSettings; readonly base: ShelfSettings };
}

export function createPanelModel(options: PanelModelOptions): PanelModel {
  const { handle, canRebuild } = options;
  let settings = handle.settings;
  let report: ApplyReport | undefined;
  let pending: ShelfSettings | undefined;

  const view = (): PanelView =>
    panelView({
      settings,
      mountedWith: handle.mountedWith,
      canRebuild,
      ...(report === undefined ? {} : { report }),
    });

  const apply = (next: ShelfSettings): PanelView => {
    report = handle.applySettings(next);
    settings = next;
    pending = report.needsRebuild.length > 0 ? next : undefined;
    return view();
  };

  return {
    view,
    apply,
    set: (id, value) => apply(setRow(id, settings, value)),
    reset: () => apply(DEFAULT_SETTINGS),
    pendingRebuild: () => pending,
    address: () => ({ settings, base: options.base?.() ?? DEFAULT_SETTINGS }),
  };
}
