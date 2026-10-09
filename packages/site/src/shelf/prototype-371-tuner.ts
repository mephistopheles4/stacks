/**
 * PROTOTYPE — #371, throwaway, never merges. The pickup tuner.
 *
 * Tweakpane + essentials, loaded lazily behind `?debug` (#375). It edits the
 * live `PICKUP_MOTION` copy and exports it as the constant to paste back into
 * `shelf-settings.ts`; it never becomes where the values live. Every read-back
 * — the scrub, the phase line — is read off the timeline, not off what was asked.
 */
import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { PICKUP_MOTION, type Bezier, type PickupMotion } from './shelf-settings.ts';
import { CHOICES, type Pickup } from './prototype-371-pickup.ts';

/**
 * The slice of Tweakpane's API used here. Its `Pane` type extends a class from
 * `@tweakpane/core`, which is bundled into `tweakpane` and not resolvable as a
 * package under pnpm's strict layout — so the methods vanish from the type.
 * Declared rather than adding a third package for types alone.
 */
interface Changeable<T> {
  on(event: 'change', handler: (ev: { readonly value: T }) => void): Changeable<T>;
}
interface Clickable {
  on(event: 'click', handler: () => void): Clickable;
}
interface Folder {
  addBinding<O extends object, K extends keyof O & string>(
    object: O,
    key: K,
    params?: Record<string, unknown>,
  ): Changeable<O[K]>;
  addFolder(params: { title: string; expanded?: boolean }): Folder;
  addButton(params: { title: string }): Clickable;
  addBlade(params: Record<string, unknown>): unknown;
}
interface PaneLike extends Folder {
  registerPlugin(plugin: unknown): void;
  refresh(): void;
}

interface BezierChange {
  readonly value: { toObject(): [number, number, number, number] };
}
interface BezierBlade {
  on(event: 'change', handler: (ev: BezierChange) => void): void;
}

export function mountTuner(pickup: Pickup): void {
  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    width: '300px',
    maxHeight: 'calc(100vh - 16px)',
    overflowY: 'auto',
    zIndex: '40',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(container);

  const pane = new Pane({ title: 'Pickup tuner (#371)', container }) as unknown as PaneLike;
  pane.registerPlugin(EssentialsPlugin);
  const motion = pickup.motion;

  // ---- read-back -------------------------------------------------------------
  const live = { scrub: 0, phase: 'none' };
  let syncing = false;
  const scrub = pane.addBinding(live, 'scrub', { min: 0, max: 1, step: 0.001, label: 'scrub' });
  scrub.on('change', (ev) => {
    if (syncing) return;
    const h = pickup.current();
    if (h === undefined) return;
    h.tl.pause();
    h.tl.progress(ev.value);
  });
  pane.addBinding(live, 'phase', { readonly: true, label: 'held' });
  const row = pane.addFolder({ title: 'Drive' });
  const drive = { book: 3 };
  row.addBinding(drive, 'book', { min: 0, max: 60, step: 1 });
  row.addButton({ title: 'Pick this book' }).on('click', () => {
    pickup.pickIndex(drive.book);
  });
  row.addButton({ title: 'Play' }).on('click', () => {
    pickup.current()?.tl.timeScale(1).play();
  });
  row.addButton({ title: 'Put back' }).on('click', () => {
    pickup.putBack();
  });

  setInterval(() => {
    const h = pickup.current();
    syncing = true;
    live.scrub = h === undefined ? 0 : h.tl.progress();
    live.phase =
      h === undefined
        ? 'none'
        : `${h.phase} · ${h.tl.duration().toFixed(2)} s · ${h.book.title.slice(0, 24)}`;
    pane.refresh();
    syncing = false;
  }, 100);

  // ---- choices ------------------------------------------------------------------
  const choices = pane.addFolder({ title: 'Choices' });
  for (const key of Object.keys(CHOICES) as (keyof typeof CHOICES)[]) {
    const options = Object.fromEntries(CHOICES[key].map((v) => [v, v]));
    choices.addBinding(pickup.choices, key, { options }).on('change', (ev) => {
      pickup.setChoice(key, ev.value);
      writeChoice(key === 'mover' ? 'pickup' : key, String(ev.value));
    });
  }

  // ---- timing ---------------------------------------------------------------------
  const timing = pane.addFolder({ title: 'Timing (seconds)' });
  const seconds = { min: 0, max: 2, step: 0.01 };
  for (const key of ['slide', 'turn', 'open', 'overlapSlideTurn', 'overlapTurnOpen'] as const)
    timing.addBinding(motion, key, seconds).on('change', () => {
      pickup.retime();
    });
  timing.addBinding(motion, 'returnSpeed', { min: 0.25, max: 4, step: 0.05 }).on('change', () => {
    pickup.retime();
  });
  timing.addButton({ title: 'Sequential (no overlap)' }).on('click', () => {
    motion.overlapSlideTurn = 0;
    motion.overlapTurnOpen = 0;
    pane.refresh();
    pickup.retime();
  });
  timing.addButton({ title: 'Overlapping (defaults)' }).on('click', () => {
    motion.overlapSlideTurn = PICKUP_MOTION.overlapSlideTurn;
    motion.overlapTurnOpen = PICKUP_MOTION.overlapTurnOpen;
    pane.refresh();
    pickup.retime();
  });

  // ---- shape ------------------------------------------------------------------------
  const shape = pane.addFolder({ title: 'Shape', expanded: false });
  shape.addBinding(motion, 'slideOut', { min: 0, max: 0.4, step: 0.005 });
  shape.addBinding(motion, 'lift', { min: 0, max: 0.1, step: 0.002 });
  shape.addBinding(motion, 'pullOut', { min: 0, max: 1, step: 0.01 });
  shape.addBinding(motion, 'openDegrees', { min: 90, max: 180, step: 1 });
  shape.addBinding(motion, 'margin', { min: 1, max: 1.6, step: 0.01 });
  shape.addBinding(motion, 'dim', { min: 0, max: 0.95, step: 0.01 });
  shape.addBinding(motion, 'textFadeFrom', { min: 60, max: 170, step: 1 });

  // ---- eases --------------------------------------------------------------------------
  const eases = pane.addFolder({ title: 'Eases', expanded: false });
  for (const key of ['easeSlide', 'easeTurn', 'easeOpen'] as const) {
    const blade = eases.addBlade({
      view: 'cubicbezier',
      value: [...motion[key]],
      expanded: true,
      label: key.slice(4).toLowerCase(),
      picker: 'inline',
    }) as BezierBlade;
    blade.on('change', (ev) => {
      (motion as { [K in typeof key]: Bezier })[key] = ev.value.toObject();
      pickup.retime();
    });
  }

  // ---- export -----------------------------------------------------------------------------
  const out = { constant: '' };
  pane.addButton({ title: 'Export PICKUP_MOTION' }).on('click', () => {
    out.constant = exportConstant(motion);
    console.info(out.constant);
    void navigator.clipboard?.writeText(out.constant).catch(() => undefined);
    pane.refresh();
  });
  pane.addBinding(out, 'constant', { readonly: true, multiline: true, rows: 6, label: 'copied' });
}

function writeChoice(name: string, value: string): void {
  const url = new URL(location.href);
  url.searchParams.set(name, value);
  history.replaceState(history.state, '', url);
}

function exportConstant(m: PickupMotion): string {
  const fmt = (v: number): string => String(Math.round(v * 1000) / 1000);
  const lines = Object.entries(m).map(([k, v]) =>
    Array.isArray(v)
      ? `  ${k}: [${(v as number[]).map(fmt).join(', ')}],`
      : `  ${k}: ${fmt(v as number)},`,
  );
  return `export const PICKUP_MOTION: PickupMotion = {\n${lines.join('\n')}\n};`;
}
