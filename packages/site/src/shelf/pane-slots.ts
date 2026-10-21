/**
 * The debug pane's bookkeeping: which instrument sits in which folder, and how
 * one of them leaves and comes back without the others noticing.
 *
 * No Tweakpane and no DOM, so the ordering is a unit test. `debug-pane.ts` is
 * the one file that owns the real `Pane` and hands it to `createSlots` as the
 * `PaneHost` below; an instrument is a view file that takes a `FolderSlice` and
 * imports nothing from Tweakpane (ADR-0119).
 *
 * The tuning panel's rebuild uses this: it disposes its own folder and adds it
 * again at the same index with the new handle, while the pickup tuner and the
 * black box's readout keep their folders, their timers and their state.
 */

/** At this width or less the pane starts collapsed, as the old tuning panel did. */
export const PANE_NARROW_PX = 700;

export function startsExpanded(viewportWidth: number): boolean {
  return viewportWidth > PANE_NARROW_PX;
}

/**
 * The slice of Tweakpane's API the instruments use, declared (`docs/spec/picking-a-book-up.md` §3.8).
 *
 * `Pane` extends a class from `@tweakpane/core`, which is bundled into
 * `tweakpane` and not resolvable under pnpm's strict layout, so its methods
 * vanish from the type and every call reads as unsafe. Declaring the few
 * methods called keeps a third package off the tree for types alone. The cost:
 * an upgrade can drift from this silently, which the styled-pane gate, running
 * the real code, partly answers.
 */
export interface Changeable<T> {
  on(event: 'change', handler: (event: { readonly value: T }) => void): Changeable<T>;
}
export interface Clickable {
  on(event: 'click', handler: () => void): Clickable;
}
/** A list's option, as `binding.options` takes it. */
export interface ListEntry {
  readonly text: string;
  readonly value: string;
}
/**
 * A binding as the pane hands it back: the properties a view may set after the
 * fact. Every one is public API (`BindingApi`, `SliderInputBindingApi`,
 * `ListInputBindingApi`); `min`, `max` and `options` exist only on the kind of
 * binding the params made, and a view sets them only on that kind.
 */
export interface BindingSlice<T> extends Changeable<T> {
  label: string;
  disabled: boolean;
  hidden: boolean;
  min: number;
  max: number;
  options: readonly ListEntry[];
}
export interface ButtonSlice extends Clickable {
  title: string;
  hidden: boolean;
}
export interface FolderSlice {
  title: string;
  disabled: boolean;
  addBinding<O extends object, K extends keyof O & string>(
    object: O,
    key: K,
    params?: Readonly<Record<string, unknown>>,
  ): BindingSlice<O[K]>;
  addFolder(params: { readonly title: string; readonly expanded?: boolean }): FolderSlice;
  addButton(params: { readonly title: string }): ButtonSlice;
  addBlade(params: Readonly<Record<string, unknown>>): unknown;
  refresh(): void;
}

export interface FolderParams {
  readonly title: string;
  readonly expanded: boolean;
  /** Where among the pane's folders it goes; absent appends. */
  readonly index?: number;
}

/**
 * A folder as the pane hands it back. `dispose` is the shell's to call and not
 * the instrument's: Tweakpane's `remove` only detaches a folder, and a read-only
 * row polls on a timer that only a dispose clears.
 */
export interface PlacedFolder extends FolderSlice {
  dispose(): void;
}

/** The pane as the shell calls it: add a folder at an index, remove one. */
export interface PaneHost {
  addFolder(params: FolderParams): PlacedFolder;
  remove(folder: PlacedFolder): void;
}

/** One instrument: a folder's worth of rows. `mount` returns its dispose. */
export interface Instrument {
  readonly title: string;
  /** Default open. */
  readonly expanded?: boolean;
  mount(folder: FolderSlice): () => void;
}

export interface Slot {
  /** Whether the instrument is mounted now. */
  readonly live: boolean;
  /** Dispose the instrument and remove its folder. A second call does nothing. */
  dispose(): void;
  /**
   * Add the folder again at the index it had, mounting `replacement` if one is
   * given and the instrument it held otherwise. A live slot is left alone
   * unless a replacement is given, which disposes it first.
   */
  remount(replacement?: Instrument): void;
}

export interface Slots {
  add(instrument: Instrument): Slot;
  disposeAll(): void;
}

interface Mounted {
  readonly folder: PlacedFolder;
  readonly dispose: () => void;
}

export function createSlots(host: PaneHost): Slots {
  /** Every slot in the order it was added, gone or not. A slot never moves. */
  const order: SlotState[] = [];

  interface SlotState extends Slot {
    mounted: Mounted | undefined;
  }

  /** Where this slot's folder goes: after the folders of the live slots before it. */
  const indexOf = (state: SlotState): number =>
    order.slice(0, order.indexOf(state)).filter((other) => other.mounted !== undefined).length;

  const slots: Slots = {
    add(first) {
      let instrument = first;
      const state: SlotState = {
        mounted: undefined,
        get live() {
          return state.mounted !== undefined;
        },
        dispose() {
          const mounted = state.mounted;
          if (mounted === undefined) return;
          state.mounted = undefined;
          mounted.dispose();
          host.remove(mounted.folder);
          mounted.folder.dispose();
        },
        remount(replacement) {
          if (replacement !== undefined) {
            state.dispose();
            instrument = replacement;
          }
          if (state.mounted !== undefined) return;
          const folder = host.addFolder({
            title: instrument.title,
            expanded: instrument.expanded ?? true,
            index: indexOf(state),
          });
          state.mounted = { folder, dispose: instrument.mount(folder) };
        },
      };
      order.push(state);
      state.remount();
      return state;
    },
    disposeAll() {
      for (const state of order) state.dispose();
    },
  };
  return slots;
}
