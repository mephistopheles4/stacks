import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplyReport, ShelfHandle } from './scene.ts';
import { PAINTED_BASE } from './shadow-fallback.ts';
import { DEFAULT_SETTINGS, resolveSettings, type ShelfSettings } from './shelf-settings.ts';
import { writeSettings } from './shelf-url.ts';
import {
  createPanelModel,
  listOptions,
  panelView,
  rowLabel,
  statusLines,
  stretchRange,
  type PanelView,
  type RowView,
} from './panel-model.ts';

/**
 * The tuning panel's honesty logic, with no DOM and no Tweakpane: settings, the
 * mounted state and an `ApplyReport` in, each row's lamp, label, reason and
 * options out. See #495 and the checks ticket, #489.
 */

const settle = (settings: ShelfSettings): ShelfSettings => settings;
const view = (
  settings: ShelfSettings = DEFAULT_SETTINGS,
  mountedWith: ShelfSettings = settings,
  canRebuild = true,
): PanelView => panelView({ settings, mountedWith, canRebuild });

const rows = (v: PanelView): RowView[] =>
  v.groups.flatMap((g) => [...g.rows, ...(g.folder?.rows ?? [])]);
const rowOf = (v: PanelView, id: string): RowView => {
  const found = rows(v).find((r) => r.id === id);
  if (found === undefined)
    throw new Error(
      `no row ${id}; have ${rows(v)
        .map((r) => r.id)
        .join(', ')}`,
    );
  return found;
};

const NO_REPORT: ApplyReport = {
  applied: [],
  needsRebuild: [],
  needsReload: [],
  refused: [],
  resolved: [],
};

describe('claim 1 — every row of the panel has an entry and a class', () => {
  // Written out by hand from `debug-panel.ts` as it stood, so a row dropped or
  // reclassified in the model is a disagreement and not a recount of itself.
  const EXPECTED: readonly (readonly [group: string, label: string, klass: string])[] = [
    ['key light', 'colour', 'live'],
    ['key light', 'intensity', 'live'],
    ['key light', 'x  (right +)', 'live'],
    ['key light', 'y  (above bookcase)', 'live'],
    ['key light', 'z  (toward you +)', 'live'],
    ['key light', 'aim height', 'live'],
    ['fill light', 'colour', 'live'],
    ['fill light', 'intensity', 'live'],
    ['lamp', 'colour', 'live'],
    ['lamp', 'intensity', 'live'],
    ['lamp', 'reach', 'live'],
    ['ambient', 'intensity', 'live'],
    ['fidelity', 'tone mapping', 'live'],
    ['fidelity', 'exposure', 'live'],
    ['fidelity', 'cover gloss', 'rebuild'],
    ['fidelity', 'page edges', 'rebuild'],
    ['fidelity', 'cover metal', 'rebuild'],
    ['books', 'paperback mix', 'rebuild'],
    ['books', 'head cap', 'rebuild'],
    ['books', 'hardback rise', 'rebuild'],
    ['books', 'hardback roll', 'rebuild'],
    ['books', 'hardback cloth', 'rebuild'],
    ['books', 'paperback rise', 'rebuild'],
    ['books', 'paperback roll', 'rebuild'],
    ['books', 'paperback cloth', 'rebuild'],
    ['bloom', 'enabled', 'rebuild'],
    ['bloom', 'strength', 'live'],
    ['bloom', 'radius', 'live'],
    ['bloom', 'threshold', 'live'],
    ['shadows', 'painted', 'rebuild'],
    ['shadows', 'real-time', 'live'],
    ['shadows', 'filter', 'live'],
    ['shadows', 'map size', 'rebuild'],
    ['shadows', 'casters', 'rebuild'],
    ['shadows', 'receivers', 'rebuild'],
    ['shadows', 'sample the map', 'rebuild'],
    ['bookcase & room', 'background', 'live'],
    ['bookcase & room', 'woodwork sheet', 'rebuild'],
    ['bookcase & room', 'wood', 'live'],
    ['bookcase & room', 'backboard', 'live'],
    ['bookcase & room', 'wood roughness', 'live'],
    ['bookcase & room', 'wood fibre', 'live'],
    ['bookcase & room', 'fog', 'live'],
    ['bookcase & room', 'fog near ×framing', 'live'],
    ['bookcase & room', 'fog far ×framing', 'live'],
    ['renderer', 'pixel ratio cap', 'live'],
    ['renderer', 'antialias', 'reload'],
    ['renderer', 'resize guard', 'live'],
  ];

  it('lists every row, in order, with its group and class', () => {
    const got = view().groups.flatMap((g) =>
      [...g.rows, ...(g.folder?.rows ?? [])].map((r) => [g.title, r.label, r.klass] as const),
    );
    expect(got.map(([g, l, k]) => [g, l, k])).toEqual(EXPECTED.map(([g, l, k]) => [g, l, k]));

    // A view picks the control by `kind`, so a wrong one is a wrong control.
    const kinds = Object.fromEntries(rows(view()).map((r) => [r.id, r.kind]));
    expect(kinds['key light/colour']).toBe('colour');
    expect(kinds['key light/x  (right +)']).toBe('slider');
    expect(kinds['bloom/enabled']).toBe('toggle');
    expect(kinds['shadows/filter']).toBe('choice');
    expect(Object.values(kinds).filter((k) => k === 'toggle')).toHaveLength(8);
    expect(Object.values(kinds).filter((k) => k === 'choice')).toHaveLength(5);
    expect(Object.values(kinds).filter((k) => k === 'colour')).toHaveLength(6);
  });

  it('gives every row a unique id', () => {
    const ids = rows(view()).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('claim 2 — the lamp, from the mounted state', () => {
  it('is on for a row doing something and off for one that is inert', () => {
    expect(rowOf(view(), 'books/head cap').lamp).toBe('on');
    const noCap = resolveSettings({ books: { headCap: 0 } });
    expect(rowOf(view(noCap), 'books/head cap').lamp).toBe('off');
    // A toggle is on exactly when it is set; inert rows read off, not on.
    const bloom = resolveSettings({ effects: { bloom: { enabled: true } } });
    expect(rowOf(view(bloom), 'bloom/enabled').lamp).toBe('on');
    expect(rowOf(view(), 'bloom/enabled').lamp).toBe('off');
    expect(rowOf(view(), 'fidelity/exposure').lamp).toBe('off');
    expect(rowOf(view(bloom), 'renderer/antialias').lamp).toBe('off');
    expect(rowOf(view(), 'renderer/antialias').lamp).toBe('on');
  });

  it('is pending for a rebuild row that has moved off what was built, and stays so', () => {
    const now = resolveSettings({ materials: { coverMetalness: 0.7 } });
    expect(rowOf(view(now, DEFAULT_SETTINGS), 'fidelity/cover metal').lamp).toBe('pending');
    // A standing comparison against the build, not against the previous value.
    expect(rowOf(view(now, now), 'fidelity/cover metal').lamp).toBe('on');
    // The default comparison reads each row's own getter.
    const glossy = resolveSettings({ materials: { coverRoughness: 0.9 } });
    expect(rowOf(view(glossy, DEFAULT_SETTINGS), 'fidelity/cover gloss').lamp).toBe('pending');
  });

  it('never says pending for a live row, however far it has moved', () => {
    const now = resolveSettings({ lighting: { key: { intensity: 5 } } });
    expect(rowOf(view(now, DEFAULT_SETTINGS), 'key light/intensity').lamp).toBe('on');
  });

  it('is pending for a reload row that has moved', () => {
    const now = resolveSettings({ renderer: { antialias: !DEFAULT_SETTINGS.renderer.antialias } });
    expect(rowOf(view(now, DEFAULT_SETTINGS), 'renderer/antialias').lamp).toBe('pending');
  });

  it('compares the woodwork sheet through speciesPending, not raw inequality', () => {
    // `walnut` is not on the roster and resolves to the default sheet, so a shelf
    // built with `rosewood` already shows what `walnut` asked for.
    const unknown = resolveSettings({ materials: { woodSpecies: 'walnut' } });
    expect(rowOf(view(unknown, DEFAULT_SETTINGS), 'bookcase & room/woodwork sheet').lamp).not.toBe(
      'pending',
    );
    const sapele = resolveSettings({ materials: { woodSpecies: 'sapele' } });
    expect(rowOf(view(sapele, DEFAULT_SETTINGS), 'bookcase & room/woodwork sheet').lamp).toBe(
      'pending',
    );
  });

  it('puts the lamp and the class in the label text', () => {
    const v = view();
    expect(rowOf(v, 'key light/intensity').labelText).toBe('🟢 intensity · live');
    expect(rowOf(v, 'renderer/antialias').labelText).toContain('reload');
    const off = view(resolveSettings({ books: { headCap: 0 } }));
    expect(rowOf(off, 'books/head cap').labelText.startsWith('🔴')).toBe(true);
    const moved = view(resolveSettings({ materials: { coverMetalness: 0.7 } }), DEFAULT_SETTINGS);
    expect(rowOf(moved, 'fidelity/cover metal').labelText.startsWith('🟡')).toBe(true);
  });
});

describe('claim 3 — a row that would do nothing is disabled, with the reason in view', () => {
  const withTone = resolveSettings({ renderer: { toneMapping: 'aces' } });

  it('disables exposure under `none`, and enables it under an operator', () => {
    expect(DEFAULT_SETTINGS.renderer.toneMapping).toBe('none');
    const off = rowOf(view(), 'fidelity/exposure');
    expect(off.disabled).toBe(true);
    expect(off.reason).toContain('tone mapping');
    expect(off.labelText).toContain(off.reason);
    const on = rowOf(view(withTone), 'fidelity/exposure');
    expect(on.disabled).toBe(false);
    expect(on.reason).toBeUndefined();
    expect(on.labelText).not.toContain('tone mapping first');
  });

  it('disables antialias while bloom is on', () => {
    const bloom = resolveSettings({ effects: { bloom: { enabled: true } } });
    const aa = rowOf(view(bloom), 'renderer/antialias');
    expect(aa.disabled).toBe(true);
    expect(aa.reason).toContain('SMAA');
    expect(rowOf(view(), 'renderer/antialias').disabled).toBe(false);
  });

  it('disables the shadows group when real-time is off, and keeps real-time outside it', () => {
    const painted = resolveSettings({ shadows: { enabled: false } });
    const group = view(painted).groups.find((g) => g.title === 'shadows');
    expect(group?.folder?.disabled).toBe(true);
    expect(group?.folder?.title).toContain('real-time shadows are off');
    const inside = (group?.folder?.rows ?? []).map((r) => r.label);
    expect(inside).toEqual(['filter', 'map size', 'casters', 'receivers', 'sample the map']);
    for (const r of group?.folder?.rows ?? []) {
      expect(r.disabled, r.label).toBe(true);
      expect(r.reason, r.label).toContain('real-time shadows are off');
    }
    // Outside the folder, and so still usable: they are how you get back.
    const outside = group?.rows ?? [];
    expect(outside.map((r) => r.label)).toEqual(['painted', 'real-time']);
    for (const r of outside) expect(r.disabled, r.label).toBe(false);
    // Only the shadows group has a folder.
    expect(
      view(painted)
        .groups.filter((g) => g.folder !== undefined)
        .map((g) => g.title),
    ).toEqual(['shadows']);
  });

  it('enables the group again when real-time is on', () => {
    const group = view().groups.find((g) => g.title === 'shadows');
    expect(group?.folder?.disabled).toBe(false);
    expect(group?.folder?.title).toBe('real-time shadow controls');
    for (const r of group?.folder?.rows ?? []) expect(r.disabled, r.label).toBe(false);
  });
});

describe('claim 4 — a list value the list does not offer is added, labelled (#300)', () => {
  it('offers only the list when the value is on it', () => {
    expect(listOptions(['rosewood', 'sapele', 'flat'], 'sapele')).toEqual([
      { value: 'rosewood', text: 'rosewood' },
      { value: 'sapele', text: 'sapele' },
      { value: 'flat', text: 'flat' },
    ]);
  });

  it('appends the stray value, labelled with its own name', () => {
    expect(listOptions(['rosewood', 'sapele', 'flat'], 'walnut')).toEqual([
      { value: 'rosewood', text: 'rosewood' },
      { value: 'sapele', text: 'sapele' },
      { value: 'flat', text: 'flat' },
      { value: 'walnut', text: 'walnut — not on the list' },
    ]);
  });

  it('reaches the woodwork row, and goes again once a real one is picked', () => {
    const stray = resolveSettings({ materials: { woodSpecies: 'walnut' } });
    const row = rowOf(view(stray), 'bookcase & room/woodwork sheet');
    expect(row.value).toBe('walnut');
    expect(row.options?.at(-1)).toEqual({ value: 'walnut', text: 'walnut — not on the list' });
    const picked = resolveSettings({ materials: { woodSpecies: 'flat' } });
    expect(rowOf(view(picked), 'bookcase & room/woodwork sheet').options).toHaveLength(3);
  });

  it('serves map size as the strings it is listed in', () => {
    const row = rowOf(view(), 'shadows/map size');
    expect(row.value).toBe(String(DEFAULT_SETTINGS.shadows.mapSize));
    expect(row.options?.map((o) => o.value)).toEqual(['512', '1024', '2048', '4096']);
  });
});

describe('claim 5 — an out-of-range number stretches the slider and says so (#490)', () => {
  it('returns the usual bounds for a value inside them, ends included', () => {
    expect(stretchRange(0.1, 3, 1)).toEqual({ min: 0.1, max: 3, beyond: false });
    expect(stretchRange(0.1, 3, 0.1)).toEqual({ min: 0.1, max: 3, beyond: false });
    expect(stretchRange(0.1, 3, 3)).toEqual({ min: 0.1, max: 3, beyond: false });
  });

  it('widens max to hold a value above it, and min for one below', () => {
    expect(stretchRange(0.1, 3, 5)).toEqual({ min: 0.1, max: 5, beyond: true });
    expect(stretchRange(0.1, 3, -2)).toEqual({ min: -2, max: 3, beyond: true });
  });

  it('keeps the usual bounds for a value that is not a finite number', () => {
    expect(stretchRange(0, 1, Number.NaN)).toEqual({ min: 0, max: 1, beyond: false });
  });

  it('reaches the row: widened bounds and a label naming the real value', () => {
    const wild = resolveSettings({ renderer: { toneMapping: 'aces', exposure: 5 } });
    const row = rowOf(view(wild), 'fidelity/exposure');
    expect(row.min).toBe(0.1);
    expect(row.max).toBe(5);
    expect(row.labelText).toContain('5');
    expect(row.labelText).toContain('beyond the usual 0.1–3');
    expect(row.disabled).toBe(false);
    // And below: the minimum widens at the row too, not only in stretchRange.
    const low = rowOf(
      view(resolveSettings({ renderer: { toneMapping: 'aces', exposure: 0.05 } })),
      'fidelity/exposure',
    );
    expect(low.min).toBe(0.05);
    expect(low.max).toBe(3);
    expect(low.labelText).toContain('beyond the usual 0.1–3');
  });

  it('shrinks back, and drops the label, once the value is inside again', () => {
    const inside = rowOf(
      view(resolveSettings({ renderer: { toneMapping: 'aces', exposure: 2 } })),
      'fidelity/exposure',
    );
    expect(inside.max).toBe(3);
    expect(inside.labelText).not.toContain('beyond');
  });

  it('leaves a slider without a stretch when the control has no range', () => {
    expect(rowOf(view(), 'key light/colour').min).toBeUndefined();
  });
});

describe('claim 6 — the rebuild button', () => {
  const needing: ApplyReport = { ...NO_REPORT, needsRebuild: ['cover metal'] };

  it('is hidden until something needs a rebuild', () => {
    const model = createPanelModel({ handle: fakeHandle(), canRebuild: true });
    expect(model.view().rebuildHidden).toBe(true);
    // Nothing applied yet, so nothing to report.
    expect(model.view().statusText).toBe('');
    expect(model.view().status).toEqual([]);
  });

  it('shows when the report asks for a rebuild and rebuild is available', () => {
    const model = createPanelModel({ handle: fakeHandle(needing), canRebuild: true });
    expect(model.apply(DEFAULT_SETTINGS).rebuildHidden).toBe(false);
  });

  it('stays hidden when rebuild is unavailable', () => {
    const model = createPanelModel({ handle: fakeHandle(needing), canRebuild: false });
    expect(model.apply(DEFAULT_SETTINGS).rebuildHidden).toBe(true);
  });

  it('is not raised by a refusal or a reload, which no rebuild fixes', () => {
    const model = createPanelModel({
      handle: fakeHandle({ ...NO_REPORT, refused: ['x'], needsReload: ['y'] }),
      canRebuild: true,
    });
    expect(model.apply(DEFAULT_SETTINGS).rebuildHidden).toBe(true);
  });

  it('hands back the settings to rebuild with, and forgets them once nothing waits', () => {
    const next = resolveSettings({ materials: { coverMetalness: 0.7 } });
    const handle = fakeHandle(needing);
    const model = createPanelModel({ handle, canRebuild: true });
    model.apply(next);
    expect(model.pendingRebuild()).toBe(next);
    handle.report = NO_REPORT;
    model.apply(DEFAULT_SETTINGS);
    expect(model.pendingRebuild()).toBeUndefined();
  });
});

describe('claim 7 — the status lines render every ApplyReport field', () => {
  const full: ApplyReport = {
    applied: ['a1', 'a2'],
    needsRebuild: ['b1', 'b2'],
    needsReload: ['c1', 'c2'],
    refused: ['d1', 'd2'],
    resolved: ['woodwork sheet: rosewood (x)', 'wood fibre: 1'],
  };

  it('renders refused, reload, rebuild, applied, then resolved last', () => {
    expect(statusLines(full, true)).toEqual([
      '✗ d1, d2',
      '⟳ reload to apply: c1, c2',
      '⃝ not applied yet: b1, b2',
      '✓ a1, a2',
      '= woodwork sheet: rosewood (x), wood fibre: 1',
    ]);
  });

  it('says plainly when there is no rebuild to press', () => {
    expect(statusLines(full, false)).toContain(
      '⚠ not applied yet: b1, b2 (no rebuild available — reload)',
    );
  });

  it('renders nothing for an empty report, and resolved alone when that is all it holds', () => {
    expect(statusLines(NO_REPORT, true)).toEqual([]);
    expect(statusLines({ ...NO_REPORT, resolved: ['r'] }, true)).toEqual(['= r']);
  });

  it('puts the lines in the view as text, one per line', () => {
    const model = createPanelModel({ handle: fakeHandle(full), canRebuild: true });
    const v = model.apply(DEFAULT_SETTINGS);
    expect(v.statusText).toBe(statusLines(full, true).join('\n'));
  });
});

describe('claim 8 — resync after a reset, and the base() rule', () => {
  it('puts every value back to the shipped defaults, the stray option gone', () => {
    const stray = resolveSettings({
      materials: { woodSpecies: 'walnut' },
      lighting: { key: { intensity: 5 } },
    });
    const handle = fakeHandle(NO_REPORT, stray);
    const model = createPanelModel({ handle, canRebuild: true });
    expect(rowOf(model.view(), 'bookcase & room/woodwork sheet').value).toBe('walnut');
    const after = model.reset();
    expect(rowOf(after, 'bookcase & room/woodwork sheet').value).toBe(
      DEFAULT_SETTINGS.materials.woodSpecies,
    );
    expect(rowOf(after, 'bookcase & room/woodwork sheet').options).toHaveLength(3);
    expect(rowOf(after, 'key light/intensity').value).toBe(DEFAULT_SETTINGS.lighting.key.intensity);
    expect(handle.applied.at(-1)).toBe(DEFAULT_SETTINGS);
    // Every row, not two: each reads a value, and it is the default's.
    const defaults = rows(view(DEFAULT_SETTINGS)).map((r) => [r.id, r.value]);
    expect(defaults.filter(([, value]) => value === undefined)).toEqual([]);
    expect(rows(after).map((r) => [r.id, r.value])).toEqual(defaults);
  });

  it('applies a row change through the settings it came from', () => {
    const handle = fakeHandle();
    const model = createPanelModel({ handle, canRebuild: true });
    const v = model.set('key light/intensity', 4);
    expect(handle.applied.at(-1)?.lighting.key.intensity).toBe(4);
    expect(rowOf(v, 'key light/intensity').value).toBe(4);
    // Every row's setter writes the path its getter reads: feeding each row its
    // own value back leaves the settings as they were.
    for (const r of rows(view())) {
      const own = createPanelModel({ handle: fakeHandle(), canRebuild: true });
      own.set(r.id, r.value);
      expect(own.address().settings, r.id).toEqual(DEFAULT_SETTINGS);
    }
    expect(() => model.set('no/such row', 1)).toThrow('no row no/such row');
  });

  describe('the address is a diff against base(), read fresh each time', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });
    const written = (settings: ShelfSettings, base: ShelfSettings): string => {
      let url = '';
      vi.stubGlobal('window', {
        location: { search: '?debug', pathname: '/' },
        history: {
          replaceState: (_: unknown, __: string, next: string) => {
            url = next;
          },
        },
      });
      writeSettings(settings, base);
      return url;
    };

    it('never writes a remembered lost context as ?shadows=0', () => {
      const handle = fakeHandle(NO_REPORT, PAINTED_BASE);
      const model = createPanelModel({ handle, canRebuild: true, base: () => PAINTED_BASE });
      const { settings, base } = model.address();
      expect(base).toBe(PAINTED_BASE);
      expect(written(settings, base)).toBe('?debug');
    });

    it('is what the shipped defaults would have got wrong', () => {
      // The positive control: same settings, the wrong base, writes the leak.
      expect(written(PAINTED_BASE, DEFAULT_SETTINGS)).toContain('shadows=0');
    });

    it('reads a base that moves during the session (a fallback mid-page)', () => {
      let current = DEFAULT_SETTINGS;
      const handle = fakeHandle(NO_REPORT, PAINTED_BASE);
      const model = createPanelModel({ handle, canRebuild: true, base: () => current });
      expect(model.address().base).toBe(DEFAULT_SETTINGS);
      current = PAINTED_BASE;
      expect(model.address().base).toBe(PAINTED_BASE);
    });

    it('falls back to the shipped defaults when there is no base', () => {
      const model = createPanelModel({ handle: fakeHandle(), canRebuild: true });
      expect(model.address().base).toBe(DEFAULT_SETTINGS);
    });
  });
});

describe('rowLabel — what a view puts beside a row', () => {
  it('joins lamp, label, class, and then any beyond-range or reason text', () => {
    expect(rowLabel({ lamp: 'on', label: 'x', klass: 'live' })).toBe('🟢 x · live');
    expect(rowLabel({ lamp: 'off', label: 'x', klass: 'rebuild', reason: 'because' })).toBe(
      '🔴 x · rebuild — because',
    );
    expect(rowLabel({ lamp: 'pending', label: 'x', klass: 'reload', beyond: '9 is beyond' })).toBe(
      '🟡 x · reload — 9 is beyond',
    );
  });
});

/** The slice of a `ShelfHandle` the model reads, with `applySettings` scripted. */
function fakeHandle(
  report: ApplyReport = NO_REPORT,
  settings: ShelfSettings = DEFAULT_SETTINGS,
): Pick<ShelfHandle, 'settings' | 'mountedWith' | 'applySettings'> & {
  report: ApplyReport;
  applied: ShelfSettings[];
} {
  const handle = {
    report,
    applied: [] as ShelfSettings[],
    settings,
    mountedWith: DEFAULT_SETTINGS,
    applySettings(next: ShelfSettings): ApplyReport {
      handle.applied.push(settle(next));
      handle.settings = next;
      return handle.report;
    },
  };
  return handle;
}
