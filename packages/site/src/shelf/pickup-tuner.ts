/**
 * The pickup tuner — Tweakpane with its essentials plugin, behind `?debug`.
 *
 * Loaded only by a dynamic import from `boot.ts`, so Vite splits it, both
 * libraries and its stylesheet into chunks a visitor without `?debug` never
 * downloads; the tuner-split gate holds that. It works on the live site and on
 * the phone, against the deployed shelf (#375, ADR-0104).
 *
 * **Styled under the CSP without loosening it.** Tweakpane injects a runtime
 * `<style>` per bundle unless it finds one already carrying its id. The page
 * pre-seats both, empty (`Shelf.astro`), so nothing is injected, and the CSS
 * arrives as a stylesheet file through the `<link>` below — extracted at build
 * time from the packages' text (`tuner-css.ts`). The styled-pane gate holds the
 * pane to being styled with zero violations.
 *
 * **The honesty floor (ADR-0104):** a control shows what the shelf applied,
 * never only what was asked. Tweakpane binds to an object and redraws from it,
 * so every read-back below is written from the pickup's own state — the scrub
 * from the timeline's progress — and `pane.refresh()` is called after. Public
 * API only; nothing here patches Tweakpane's DOM.
 *
 * The layout is the owner's to shape in use (#375). What is fixed is the scrub,
 * the curve editors and the export.
 */
import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import tunerCss from '../generated/tuner.css?url';
import { exportMotion } from './pickup-motion.ts';
import { PICKUP_MOTION, type PickupMotion } from './shelf-settings.ts';

/**
 * The slice of Tweakpane's API used here, declared (spec §3.8).
 *
 * `Pane` extends a class from `@tweakpane/core`, which is bundled into
 * `tweakpane` and not resolvable under pnpm's strict layout, so its methods
 * vanish from the type and every call reads as unsafe. Declaring the few
 * methods called keeps a third package off the tree for types alone. The cost:
 * an upgrade can drift from this silently, which the styled-pane gate, running
 * the real code, partly answers.
 */
interface Changeable<T> {
  on(event: 'change', handler: (event: { readonly value: T }) => void): Changeable<T>;
}
interface Clickable {
  on(event: 'click', handler: () => void): Clickable;
}
interface Folder {
  addBinding<O extends object, K extends keyof O & string>(
    object: O,
    key: K,
    params?: Readonly<Record<string, unknown>>,
  ): Changeable<O[K]>;
  addFolder(params: { readonly title: string; readonly expanded?: boolean }): Folder;
  addButton(params: { readonly title: string }): Clickable;
  addBlade(params: Readonly<Record<string, unknown>>): unknown;
}
interface PaneSlice extends Folder {
  registerPlugin(plugin: unknown): void;
  refresh(): void;
  dispose(): void;
}
/** The `cubicbezier` blade's change event, from the essentials plugin. */
interface CurveBlade {
  on(
    event: 'change',
    handler: (event: { readonly value: { toObject(): [number, number, number, number] } }) => void,
  ): void;
}

/** What the tuner reads and drives. `pickup.ts` implements it. */
export interface TunablePickup {
  /** The live copy the motion is built from. The tuner edits it in place. */
  readonly motion: Mutable<PickupMotion>;
  /** Rebuild the held book's timeline from `motion`, keeping where it is. */
  retime(): void;
  /** The book in hand and its timeline, read back — or nothing held. */
  state(): PickupState | undefined;
  /** Pause the timeline at `progress`, 0..1. */
  scrub(progress: number): void;
  /** Play the held book's timeline forward from where it is. */
  play(): void;
  putBack(): void;
}

export interface PickupState {
  readonly title: string;
  readonly phase: string;
  /** The timeline's own progress, 0..1 — never the slider's. */
  readonly progress: number;
  readonly duration: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** How often the read-backs are refreshed from the pickup. */
const READ_BACK_MS = 100;

export interface PickupTuner {
  dispose(): void;
}

export function mountPickupTuner(
  host: HTMLElement,
  pickup: TunablePickup | undefined,
): PickupTuner {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = tunerCss;
  document.head.append(link);

  const container = document.createElement('div');
  container.className = 'pickup-tuner';
  // CSSOM, which `style-src` does not govern, as the `?debug` panel styles
  // itself. A `style` attribute set as markup would be refused.
  Object.assign(container.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    width: '300px',
    maxHeight: 'calc(100vh - 16px)',
    overflowY: 'auto',
    zIndex: '40',
  } satisfies Partial<CSSStyleDeclaration>);
  host.append(container);

  const pane = new Pane({ title: 'Pickup tuner', container }) as unknown as PaneSlice;
  pane.registerPlugin(EssentialsPlugin);

  const live = { scrub: 0, held: 'nothing held' };
  // Set while the read-back writes `live`, so the write does not echo as a scrub.
  let reading = false;

  const motion = pickup?.motion;
  if (pickup !== undefined && motion !== undefined) {
    pane.addBinding(live, 'scrub', { min: 0, max: 1, step: 0.001 }).on('change', (event) => {
      if (!reading) pickup.scrub(event.value);
    });
  }
  pane.addBinding(live, 'held', { readonly: true });

  if (pickup !== undefined && motion !== undefined) {
    const drive = pane.addFolder({ title: 'Drive' });
    drive.addButton({ title: 'Play' }).on('click', () => {
      pickup.play();
    });
    drive.addButton({ title: 'Put back' }).on('click', () => {
      pickup.putBack();
    });

    const timing = pane.addFolder({ title: 'Timing (seconds)' });
    for (const key of ['slide', 'turn', 'open', 'overlapSlideTurn', 'overlapTurnOpen'] as const) {
      timing.addBinding(motion, key, { min: 0, max: 2, step: 0.01 }).on('change', () => {
        pickup.retime();
      });
    }
    timing.addBinding(motion, 'returnSpeed', { min: 0.25, max: 4, step: 0.05 }).on('change', () => {
      pickup.retime();
    });

    const shape = pane.addFolder({ title: 'Shape', expanded: false });
    shape.addBinding(motion, 'slideOut', { min: 0, max: 0.4, step: 0.005 });
    shape.addBinding(motion, 'lift', { min: 0, max: 0.1, step: 0.002 });
    shape.addBinding(motion, 'margin', { min: 1, max: 1.6, step: 0.01 });
    shape.addBinding(motion, 'dim', { min: 0, max: 0.95, step: 0.01 });
    shape.addBinding(motion, 'textFadeFrom', { min: 60, max: 170, step: 1 });

    const eases = pane.addFolder({ title: 'Eases', expanded: false });
    for (const key of ['easeSlide', 'easeTurn', 'easeOpen'] as const) {
      const blade = eases.addBlade({
        view: 'cubicbezier',
        value: [...motion[key]],
        expanded: true,
        label: key.slice('ease'.length).toLowerCase(),
        picker: 'inline',
      }) as CurveBlade;
      blade.on('change', (event) => {
        motion[key] = event.value.toObject();
        pickup.retime();
      });
    }
  }

  // The export names what the shelf is running, which is the live copy when
  // there is one and the shipped constant when there is not.
  const out = { constant: '' };
  pane.addButton({ title: 'Export PICKUP_MOTION' }).on('click', () => {
    out.constant = exportMotion(motion ?? PICKUP_MOTION);
    void navigator.clipboard.writeText(out.constant).catch(() => undefined);
    pane.refresh();
  });
  pane.addBinding(out, 'constant', { readonly: true, multiline: true, rows: 6 });

  const timer = window.setInterval(() => {
    const state = pickup?.state();
    reading = true;
    live.scrub = state?.progress ?? 0;
    live.held =
      state === undefined
        ? 'nothing held'
        : `${state.phase} · ${state.duration.toFixed(2)} s · ${state.title.slice(0, 24)}`;
    pane.refresh();
    reading = false;
  }, READ_BACK_MS);

  return {
    dispose: () => {
      window.clearInterval(timer);
      pane.dispose();
      container.remove();
      link.remove();
    },
  };
}
