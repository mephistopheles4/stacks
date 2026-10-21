import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { panelView, type PanelView, type RowView } from './panel-model.ts';
import type { BindingSlice, ButtonSlice, FolderSlice, ListEntry } from './pane-slots.ts';
import type { ApplyReport } from './scene.ts';
import { DEFAULT_SETTINGS, resolveSettings, type ShelfSettings } from './shelf-settings.ts';
import { mountTuningPanel, tuningPanel, type TuningHandle } from './tuning-panel.ts';

/**
 * The tuning panel's view, against a fake of the slice of Tweakpane it calls.
 *
 * The fake keeps the three behaviours the panel's honesty depends on, each one
 * measured in a real browser on Tweakpane 4.0.5 (#487, #490): `refresh()` writes
 * a clamp back into the bound object and fires `change` for it, `refresh()` fires
 * `change` for any value that differs from the one the control last showed, and
 * a range that narrows leaves the next refresh a float step off. A real pane is
 * checked by `pnpm smoke:render`; this file is the part Node can run.
 */

const EPSILON_STEP = 2 ** -50;

class FakeBinding implements BindingSlice<unknown> {
  label = '';
  disabled = false;
  hidden = false;
  options: readonly ListEntry[] = [];
  private lo: number | undefined;
  private hi: number | undefined;
  private shown: unknown;
  private drift = false;
  private readonly handlers: ((event: { readonly value: unknown }) => void)[] = [];
  readonly monitor: boolean;

  constructor(
    readonly object: Record<string, unknown>,
    readonly key: string,
    readonly params: Readonly<Record<string, unknown>>,
    readonly log: string[],
  ) {
    this.lo = params['min'] as number | undefined;
    this.hi = params['max'] as number | undefined;
    this.options = (params['options'] as ListEntry[] | undefined) ?? [];
    this.monitor = params['readonly'] === true;
    this.shown = object[key];
  }

  get min(): number {
    return this.lo as number;
  }
  set min(value: number) {
    this.log.push(`min ${this.key}`);
    if (this.lo !== undefined && value > this.lo) this.drift = true;
    this.lo = value;
  }
  get max(): number {
    return this.hi as number;
  }
  set max(value: number) {
    this.log.push(`max ${this.key}`);
    if (this.hi !== undefined && value < this.hi) this.drift = true;
    this.hi = value;
  }

  on(_event: 'change', handler: (event: { readonly value: unknown }) => void): this {
    this.handlers.push(handler);
    return this;
  }

  /** The visitor moves the control. */
  edit(value: unknown): void {
    this.object[this.key] = value;
    this.shown = value;
    this.fire(value);
  }

  /** What `pane.refresh()` does to one binding. */
  refresh(): void {
    if (this.monitor) return;
    let value = this.object[this.key];
    if (typeof value === 'number' && this.lo !== undefined && this.hi !== undefined) {
      const clamped = Math.min(this.hi, Math.max(this.lo, value));
      if (clamped !== value) {
        this.log.push(`clamp ${this.key}`);
        value = clamped;
        this.object[this.key] = clamped;
      }
      if (this.drift) {
        this.drift = false;
        value = clamped - EPSILON_STEP;
        this.object[this.key] = value;
      }
    }
    if (this.options.length > 0 && !this.options.some((entry) => entry.value === value)) {
      this.log.push(`rewrite ${this.key}`);
      value = this.options[0]?.value;
      this.object[this.key] = value;
    }
    if (value !== this.shown) {
      this.shown = value;
      this.fire(value);
    }
  }

  private fire(value: unknown): void {
    for (const handler of this.handlers) handler({ value });
  }
}

class FakeButton implements ButtonSlice {
  hidden = false;
  private readonly handlers: (() => void)[] = [];
  constructor(public title: string) {}
  on(_event: 'click', handler: () => void): this {
    this.handlers.push(handler);
    return this;
  }
  click(): void {
    for (const handler of this.handlers) handler();
  }
}

class FakeFolder {
  disabled = false;
  readonly bindings: FakeBinding[] = [];
  readonly buttons: FakeButton[] = [];
  readonly folders: FakeFolder[] = [];
  constructor(
    public title: string,
    readonly log: string[],
  ) {}
  addBinding(object: object, key: string, params: Readonly<Record<string, unknown>> = {}) {
    const binding = new FakeBinding(object as Record<string, unknown>, key, params, this.log);
    this.bindings.push(binding);
    return binding;
  }
  addFolder(params: { readonly title: string }): FakeFolder {
    const folder = new FakeFolder(params.title, this.log);
    this.folders.push(folder);
    return folder;
  }
  addButton(params: { readonly title: string }): FakeButton {
    const button = new FakeButton(params.title);
    this.buttons.push(button);
    return button;
  }
  addBlade(): unknown {
    return undefined;
  }
  refresh(): void {
    this.log.push('refresh');
    for (const binding of this.all()) binding.refresh();
  }
  all(): FakeBinding[] {
    return [...this.bindings, ...this.folders.flatMap((folder) => folder.all())];
  }
  allFolders(): FakeFolder[] {
    return [...this.folders, ...this.folders.flatMap((folder) => folder.allFolders())];
  }
  byKey(key: string): FakeBinding {
    const found = this.all().find((binding) => binding.key === key);
    if (found === undefined) throw new Error(`no binding ${key}`);
    return found;
  }
  button(title: string): FakeButton {
    const all = [this, ...this.allFolders()].flatMap((folder) => folder.buttons);
    const found = all.find((button) => button.title === title);
    if (found === undefined) throw new Error(`no button ${title}`);
    return found;
  }
}

const REPORT: ApplyReport = {
  applied: [],
  needsRebuild: [],
  needsReload: [],
  refused: [],
  resolved: [],
};

function fakeHandle(
  settings: ShelfSettings = DEFAULT_SETTINGS,
  reports: Partial<ApplyReport> = {},
) {
  const applied: ShelfSettings[] = [];
  const handle: TuningHandle = {
    settings,
    mountedWith: settings,
    applySettings: (next) => {
      applied.push(next);
      return { ...REPORT, applied: ['applied'], ...reports };
    },
    stats: () => ({
      textures: 7,
      geometries: 0,
      programs: 0,
      calls: 33,
      triangles: 4400,
      bufferWidth: 1440,
      bufferHeight: 900,
      pixelRatio: 1,
      fps: 0,
    }),
  };
  return { handle, applied };
}

const rows = (view: PanelView): RowView[] =>
  view.groups.flatMap((group) => [...group.rows, ...(group.folder?.rows ?? [])]);

const writes: string[] = [];

beforeEach(() => {
  writes.length = 0;
  vi.stubGlobal('window', {
    location: { search: '?debug' },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) => writes.push(url),
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mount(
  settings?: ShelfSettings,
  reports?: Partial<ApplyReport>,
  onRebuild?: (s: ShelfSettings) => void,
) {
  const log: string[] = [];
  const folder = new FakeFolder('Tuning panel', log);
  const { handle, applied } = fakeHandle(settings, reports);
  const dispose = mountTuningPanel(folder as unknown as FolderSlice, {
    handle,
    ...(onRebuild === undefined ? {} : { onRebuild }),
  });
  return { folder, log, handle, applied, dispose };
}

describe('the tuning panel view (claims 1, 5)', () => {
  it('is an instrument named for its folder', () => {
    const { handle } = fakeHandle();
    expect(tuningPanel({ handle }).title).toBe('Tuning panel');
  });

  it("draws every row the model gives, with the model's label, and no more", () => {
    const { folder, handle } = mount();
    const view = panelView({
      settings: handle.settings,
      mountedWith: handle.mountedWith,
      canRebuild: false,
    });
    const expected = rows(view);
    expect(expected.length).toBeGreaterThan(40);
    for (const row of expected) {
      const binding = folder.byKey(row.id);
      expect(binding.label, row.id).toBe(row.labelText);
      expect(binding.disabled, row.id).toBe(row.disabled);
    }
    const drawn = folder.all().filter((binding) => !binding.monitor);
    expect(drawn.map((binding) => binding.key).sort()).toEqual(
      expected.map((row) => row.id).sort(),
    );
  });

  it('draws the shadows folder with its reason in the title when real-time is off', () => {
    const off = resolveSettings({ shadows: { enabled: false } }, DEFAULT_SETTINGS);
    const { folder } = mount(off);
    const shadow = folder
      .allFolders()
      .find((candidate) => candidate.title.includes('real-time shadows are off'));
    expect(shadow?.disabled).toBe(true);
    expect(folder.byKey('shadows/real-time').disabled).toBe(false);
    expect(folder.byKey('shadows/filter').disabled).toBe(true);
  });

  it('shows the fps, draws, textures and tris readout as monitors read off the handle', () => {
    const { folder } = mount();
    const monitors = folder.all().filter((binding) => binding.monitor);
    const read = (key: string): unknown => {
      const monitor = monitors.find((candidate) => candidate.key === key);
      if (monitor === undefined) throw new Error(`no monitor ${key}`);
      return monitor.object[key];
    };
    expect(read('draws')).toBe(33);
    expect(read('textures')).toBe(7);
    expect(read('tris')).toBe(4400);
    expect(read('fps')).toBe(0);
    for (const key of ['fps', 'draws', 'textures', 'tris']) {
      expect(monitors.find((candidate) => candidate.key === key)?.params['interval']).toBe(250);
    }
  });
});

describe('an edit (claims 2, 6)', () => {
  it('applies the new value once, copies the report onto the pane and writes the address', () => {
    const { folder, applied } = mount();
    folder.byKey('key light/intensity').edit(3);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.lighting.key.intensity).toBe(3);
    expect(folder.byKey('text').object['text']).toContain('✓ applied');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('debug=');
  });

  it('writes nothing to the address before the first edit', () => {
    mount();
    expect(writes).toEqual([]);
  });

  it('does not apply what its own refresh reports (the re-entry guard)', () => {
    const { folder, applied } = mount();
    folder.byKey('key light/intensity').edit(3);
    const before = applied.length;
    folder.refresh();
    folder.refresh();
    expect(applied).toHaveLength(before);
  });

  it("writes the applied state back to the bound object, not the event's value", () => {
    const { folder } = mount();
    // The shelf applies a different number than the one the control gave.
    const binding = folder.byKey('key light/intensity');
    binding.edit(3);
    expect(binding.object['key light/intensity']).toBe(3);
  });

  it('absorbs the float step when a stretched range shrinks back', () => {
    const stretched = resolveSettings({ renderer: { exposure: 5 } }, DEFAULT_SETTINGS);
    const { folder, applied } = mount(stretched);
    const exposure = folder.byKey('fidelity/exposure');
    expect(exposure.max).toBe(5);
    folder.button('reset to shipped defaults').click();
    // One apply, for the reset: the step the narrowing left behind was not one.
    expect(applied).toHaveLength(1);
    expect(exposure.max).toBe(3);
    expect(applied.at(-1)).toBe(DEFAULT_SETTINGS);
  });
});

describe('a stretched range (claim 3)', () => {
  it('is in place before the first refresh, so nothing is clamped or written back', () => {
    const stretched = resolveSettings({ renderer: { exposure: 5 } }, DEFAULT_SETTINGS);
    const { folder, log, applied } = mount(stretched);
    const exposure = folder.byKey('fidelity/exposure');
    expect(exposure.params['max']).toBe(5);
    folder.refresh();
    expect(log.filter((entry) => entry.startsWith('clamp'))).toEqual([]);
    expect(exposure.object['fidelity/exposure']).toBe(5);
    expect(exposure.label).toContain('5 is beyond the usual 0.1–3');
    expect(applied).toEqual([]);
  });

  it('widens before it writes and narrows after, inside the guard', () => {
    const { folder, log, applied } = mount();
    const at = folder.button('reset to shipped defaults');
    // Plant an out-of-range value through the model, as a row edit would.
    folder.byKey('key light/intensity').edit(20);
    expect(folder.byKey('key light/intensity').max).toBe(20);
    expect(log.filter((entry) => entry.startsWith('clamp'))).toEqual([]);
    at.click();
    expect(folder.byKey('key light/intensity').max).toBe(8);
    expect(applied.at(-1)).toBe(DEFAULT_SETTINGS);
    expect(applied).toHaveLength(2);
  });
});

describe('a list holding a value it does not offer (claim 1)', () => {
  it('offers the stray as an option, so the first refresh keeps it', () => {
    const stray = resolveSettings({ materials: { woodSpecies: 'walnut' } }, DEFAULT_SETTINGS);
    const { folder, log } = mount(stray);
    const sheet = folder.byKey('bookcase & room/woodwork sheet');
    expect(sheet.options.map((entry) => entry.text)).toContain('walnut — not on the list');
    folder.refresh();
    expect(log.filter((entry) => entry.startsWith('rewrite'))).toEqual([]);
    expect(sheet.object['bookcase & room/woodwork sheet']).toBe('walnut');
  });

  it('drops the stray once a real value is picked', () => {
    const stray = resolveSettings({ materials: { woodSpecies: 'walnut' } }, DEFAULT_SETTINGS);
    const { folder } = mount(stray);
    const sheet = folder.byKey('bookcase & room/woodwork sheet');
    sheet.edit('rosewood');
    expect(sheet.options.map((entry) => entry.value)).not.toContain('walnut');
  });
});

describe('the rebuild button, status and buttons (claims 4, 5)', () => {
  it('is hidden at rest and shown once something waits on a rebuild', () => {
    const { folder } = mount(undefined, { needsRebuild: ['coverRoughness'] }, () => undefined);
    const rebuild = folder.button('rebuild shelf to apply');
    expect(rebuild.hidden).toBe(true);
    folder.byKey('fidelity/cover gloss').edit(0.5);
    expect(rebuild.hidden).toBe(false);
  });

  it('stays hidden when the page cannot rebuild', () => {
    const { folder } = mount(undefined, { needsRebuild: ['coverRoughness'] });
    folder.byKey('fidelity/cover gloss').edit(0.5);
    expect(folder.button('rebuild shelf to apply').hidden).toBe(true);
  });

  it('hands the pending settings to onRebuild', () => {
    const onRebuild = vi.fn();
    const { folder } = mount(undefined, { needsRebuild: ['coverRoughness'] }, onRebuild);
    folder.byKey('fidelity/cover gloss').edit(0.5);
    folder.button('rebuild shelf to apply').click();
    expect(onRebuild).toHaveBeenCalledOnce();
    expect(onRebuild.mock.calls[0]?.[0]).toMatchObject({ materials: { coverRoughness: 0.5 } });
  });

  it('lights a rebuild-class row pending until the scene catches up', () => {
    const { folder } = mount(undefined, { needsRebuild: ['coverRoughness'] }, () => undefined);
    folder.byKey('fidelity/cover gloss').edit(0.5);
    expect(folder.byKey('fidelity/cover gloss').label).toContain('🟡');
  });

  it('copies the settings JSON, and says so for a moment', () => {
    vi.useFakeTimers();
    const { folder } = mount();
    const copy = folder.button('copy settings JSON');
    copy.click();
    expect(copy.title).toBe('copied — paste into shelf-settings.ts');
    vi.advanceTimersByTime(2500);
    expect(copy.title).toBe('copy settings JSON');
  });

  it('resets every control to the shipped defaults and writes the address', () => {
    const { folder, applied } = mount();
    folder.byKey('key light/intensity').edit(3);
    folder.button('reset to shipped defaults').click();
    expect(applied.at(-1)).toBe(DEFAULT_SETTINGS);
    expect(folder.byKey('key light/intensity').object['key light/intensity']).toBe(
      DEFAULT_SETTINGS.lighting.key.intensity,
    );
    expect(writes).toHaveLength(2);
  });
});

describe('dispose (claim 4)', () => {
  it('stops the history listener the panel added', () => {
    const removed: string[] = [];
    const { dispose } = mount();
    vi.stubGlobal('window', {
      ...window,
      removeEventListener: (name: string) => removed.push(name),
    });
    dispose();
    expect(removed).toContain('popstate');
  });
});
