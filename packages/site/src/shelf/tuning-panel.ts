/**
 * The tuning panel — the debug pane's second instrument, behind `?debug`: every
 * setting the shelf has, live.
 *
 * **A view over `panel-model.ts`, and only that.** The model gives each row's
 * lamp, label, disabled reason, list options, range and the rebuild button's
 * hidden flag as plain values; this file is a loop that copies them onto
 * Tweakpane's bindings, folders and buttons (#496). It takes the folder
 * `debug-pane.ts` made for it and imports nothing from Tweakpane, not even as a
 * type (`FolderSlice`, ADR-0119). A behaviour that gets view code of its own
 * here needs a browser check of its own in `pnpm smoke:render`, which reads the
 * rendered state once for each field this file writes.
 *
 * "Removable in one file" is now **two files and the shell's wiring**: this view
 * and `panel-model.ts`, and in the shell the tuning panel is not one `slots.add`
 * line but `adopt` (which `boot.ts` calls after every rebuild or fallback) with the
 * `base` and `rebuild` sources `boot.ts` hands over.
 *
 * ## The one rule this exists to keep
 *
 * `docs/progress.md`: *"A probe that silently did nothing would be worse than no
 * probe."* Every control says its class, whether it is doing anything and why
 * not, in its label, because Tweakpane has no tooltip and a disabled row takes no
 * pointer events. The shelf reports back what it applied (`ApplyReport`), the
 * pane shows that report, and **no control shows a value the shelf is not running**.
 * Two things in Tweakpane would break that, both measured in a browser (#487,
 * #490), and both are handled by the order `draw` does things in:
 *
 * - **`refresh()` fires `change` for a value that differs from the one a control
 *   showed**, so a programmatic write would re-enter `apply`. Everything `draw`
 *   does is inside a guard. The guard also absorbs the float step a narrowing
 *   range leaves behind (`1.9999999999999998` for a 2).
 * - **A constrained control rewrites a value it does not allow** — a slider
 *   clamps into its range, a list falls back to its first option — and writes
 *   that back into the object, which is the silent default #300 forbids. So a
 *   range is stretched and the stray option added *before* the value is written
 *   and before any `refresh()`, and put back after.
 */
import { createPanelModel, type PanelView, type RowView } from './panel-model.ts';
import type { BindingSlice, FolderSlice, Instrument } from './pane-slots.ts';
import type { ShelfHandle } from './scene.ts';
import type { ShelfSettings } from './shelf-settings.ts';
import { keepSettingsInAddress, writeSettings } from './shelf-url.ts';

/** What the panel reads and drives of the shelf. */
export type TuningHandle = Pick<
  ShelfHandle,
  'settings' | 'mountedWith' | 'applySettings' | 'stats'
>;

export interface TuningOptions {
  readonly handle: TuningHandle;
  /**
   * Asks the page to remount the shelf with these settings. The panel cannot do
   * it itself: `mountShelf` owns the canvas and the caller owns the notices.
   * Absent means rebuild is unavailable, and the panel says "reload" instead of
   * offering a button that would do nothing.
   */
  readonly onRebuild?: (settings: ShelfSettings) => void;
  /**
   * The settings this page started from, which the address is written as a diff
   * of. A getter, because a fallback during the session moves it.
   */
  readonly base?: () => ShelfSettings;
}

/** How often the fps, draws, textures and tris monitors are read. */
const READOUT_MS = 250;
/** How long *copied* stays on the copy button. */
const COPIED_MS = 2500;

/**
 * Whether any tuning panel on this page has written the address yet.
 *
 * ⚠️ **The module's, not a panel's.** A rebuild while a book is held mounts a
 * fresh panel and puts the book down, and that put-back's history step reaches
 * the new panel, not the one that wrote — so a flag per panel read `false` there
 * and lost the setting from the address once more (#426, behaviour-lens on
 * #448). This module loads once per page, with the shell that imports it.
 */
let written = false;

/** The panel as an instrument for the pane: one folder, `Tuning panel`. */
export function tuningPanel(options: TuningOptions): Instrument {
  return { title: 'Tuning panel', mount: (folder) => mountTuningPanel(folder, options) };
}

type Value = number | boolean | string;

const rowsOf = (view: PanelView): RowView[] =>
  view.groups.flatMap((group) => [...group.rows, ...(group.folder?.rows ?? [])]);

/** The params a row's binding is made with: its range and options already honest. */
function paramsFor(row: RowView): Record<string, unknown> {
  const params: Record<string, unknown> = { label: row.labelText };
  if (row.kind === 'slider') {
    params['min'] = row.min;
    params['max'] = row.max;
    params['step'] = row.step;
  } else if (row.kind === 'colour') {
    params['view'] = 'color';
  } else if (row.kind === 'choice') {
    params['options'] = row.options;
  }
  return params;
}

/** Fill `folder`; the returned function lets go of the address and the copy timer. */
export function mountTuningPanel(folder: FolderSlice, options: TuningOptions): () => void {
  const { handle, onRebuild } = options;
  const model = createPanelModel({
    handle,
    canRebuild: onRebuild !== undefined,
    ...(options.base === undefined ? {} : { base: options.base }),
  });
  const first = model.view();

  // What each control is bound to, one entry per row. Tweakpane writes a visitor's
  // edit here and reads every redraw from here; `draw` is the only other writer.
  const mirror: Record<string, Value> = {};
  const bindings = new Map<string, BindingSlice<Value>>();
  const ranges = new Map<string, { min: number; max: number }>();
  const listed = new Map<string, string>();

  /** Set while `draw` writes, so what it makes Tweakpane report is not applied. */
  let drawing = false;

  const persist = (): void => {
    written = true;
    const { settings, base } = model.address();
    writeSettings(settings, base);
  };

  const edit = (id: string, value: Value): void => {
    if (drawing) return;
    draw(model.set(id, value));
    persist();
  };

  /* --- the readout --------------------------------------------------------- */

  const readout = {
    get fps(): number {
      return handle.stats().fps;
    },
    get draws(): number {
      return handle.stats().calls;
    },
    get textures(): number {
      return handle.stats().textures;
    },
    get tris(): number {
      return handle.stats().triangles;
    },
    get buffer(): string {
      const stats = handle.stats();
      return `${String(stats.bufferWidth)}x${String(stats.bufferHeight)} @${stats.pixelRatio.toFixed(2)}`;
    },
  };
  const whole = (value: number): string => value.toFixed(0);
  const monitor = { readonly: true, interval: READOUT_MS };
  folder.addBinding(readout, 'fps', {
    ...monitor,
    format: (value: number) => (value === 0 ? '—' : whole(value)),
  });
  folder.addBinding(readout, 'draws', { ...monitor, format: whole });
  folder.addBinding(readout, 'textures', { ...monitor, format: whole });
  folder.addBinding(readout, 'tris', { ...monitor, format: whole });
  folder.addBinding(readout, 'buffer', monitor);

  /* --- the status, and the rebuild button ---------------------------------- */

  const statusBox = { text: first.statusText };
  folder.addBinding(statusBox, 'text', {
    readonly: true,
    multiline: true,
    rows: 4,
    interval: 0,
    label: 'status',
  });
  const rebuild = folder.addButton({ title: 'rebuild shelf to apply' });
  rebuild.on('click', () => {
    const pending = model.pendingRebuild();
    if (pending !== undefined) onRebuild?.(pending);
  });

  /* --- the rows ------------------------------------------------------------ */

  const place = (target: FolderSlice, rows: readonly RowView[]): void => {
    for (const row of rows) {
      mirror[row.id] = row.value;
      const binding = target.addBinding(mirror, row.id, paramsFor(row));
      binding.on('change', (event) => {
        edit(row.id, event.value);
      });
      bindings.set(row.id, binding);
      if (row.kind === 'slider') ranges.set(row.id, { min: row.min ?? 0, max: row.max ?? 0 });
      if (row.kind === 'choice') listed.set(row.id, JSON.stringify(row.options));
    }
  };

  const shadowFolders = new Map<string, FolderSlice>();
  first.groups.forEach((group, index) => {
    const section = folder.addFolder({ title: group.title, expanded: index === 0 });
    place(section, group.rows);
    if (group.folder !== undefined) {
      const inner = section.addFolder({ title: group.folder.title, expanded: true });
      place(inner, group.folder.rows);
      shadowFolders.set(group.title, inner);
    }
  });

  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const copy = folder.addButton({ title: 'copy settings JSON' });
  copy.on('click', () => {
    void navigator.clipboard
      .writeText(JSON.stringify(model.address().settings, null, 2))
      .catch(() => undefined);
    copy.title = 'copied — paste into shelf-settings.ts';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copy.title = 'copy settings JSON';
    }, COPIED_MS);
  });
  folder.addButton({ title: 'reset to shipped defaults' }).on('click', () => {
    // The view carries every row's value, so copying it resyncs every control at
    // once, with no hook per control to leave one showing the old number.
    draw(model.reset());
    persist();
  });

  /* --- the one copy -------------------------------------------------------- */

  /**
   * Copies the model's view onto the pane, in the order that keeps Tweakpane from
   * rewriting anything: widen ranges and options, write the mirror from what the
   * shelf applied (never from the event's value), set the text, `refresh()`,
   * and only then narrow what widened and `refresh()` again.
   */
  function draw(view: PanelView): void {
    drawing = true;
    try {
      const rows = rowsOf(view);

      for (const row of rows) {
        const binding = bindings.get(row.id);
        const range = ranges.get(row.id);
        if (binding === undefined) continue;
        if (range !== undefined && row.min !== undefined && row.max !== undefined) {
          if (row.min < range.min) {
            binding.min = row.min;
            range.min = row.min;
          }
          if (row.max > range.max) {
            binding.max = row.max;
            range.max = row.max;
          }
        }
        if (row.options !== undefined) {
          const next = JSON.stringify(row.options);
          if (listed.get(row.id) !== next) {
            binding.options = row.options;
            listed.set(row.id, next);
          }
        }
      }

      for (const row of rows) {
        const binding = bindings.get(row.id);
        if (binding === undefined) continue;
        mirror[row.id] = row.value;
        binding.label = row.labelText;
        binding.disabled = row.disabled;
      }
      for (const group of view.groups) {
        const inner = shadowFolders.get(group.title);
        if (inner === undefined || group.folder === undefined) continue;
        inner.title = group.folder.title;
        inner.disabled = group.folder.disabled;
      }
      statusBox.text = view.statusText;
      rebuild.hidden = view.rebuildHidden;

      folder.refresh();

      let narrowed = false;
      for (const row of rows) {
        const binding = bindings.get(row.id);
        const range = ranges.get(row.id);
        if (binding === undefined || range === undefined) continue;
        if (row.min !== undefined && row.min !== range.min) {
          binding.min = row.min;
          range.min = row.min;
          narrowed = true;
        }
        if (row.max !== undefined && row.max !== range.max) {
          binding.max = row.max;
          range.max = row.max;
          narrowed = true;
        }
      }
      if (narrowed) folder.refresh();
    } finally {
      drawing = false;
    }
  }

  draw(first);

  // A put-back steps the history back to an entry from before the change, so the
  // address is written again after it; see `keepSettingsInAddress`.
  const forgetAddress = keepSettingsInAddress(() => (written ? model.address() : undefined));

  return () => {
    clearTimeout(copyTimer);
    forgetAddress();
  };
}
