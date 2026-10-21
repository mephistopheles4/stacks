/**
 * The pickup tuner — the first instrument in the debug pane, behind `?debug`.
 *
 * A view file: it takes the folder `debug-pane.ts` made for it and fills it,
 * and imports nothing from Tweakpane as a value. The pane, the essentials
 * plugin and the stylesheet belong to the shell, which is loaded by one dynamic
 * import from `boot.ts`, so a visitor without `?debug` downloads none of it; the
 * tuner-split gate holds that (ADR-0104, ADR-0118). The tuner's logic is in
 * `pickup-motion.ts`.
 *
 * **The honesty floor (ADR-0104):** a control shows what the shelf applied,
 * never only what was asked. Tweakpane binds to an object and redraws from it,
 * so every read-back below is written from the pickup's own state — the scrub
 * from the timeline's progress — and `refresh()` is called after. Public
 * API only; nothing here patches Tweakpane's DOM.
 *
 * The layout is the owner's to shape in use (#375). What is fixed is the scrub,
 * the curve editors and the export.
 */
import { exportMotion } from './pickup-motion.ts';
import type { FolderSlice, Instrument } from './pane-slots.ts';
import { PICKUP_MOTION, type PickupMotion } from './shelf-settings.ts';

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
  state(): TunerReading | undefined;
  /** Pause the timeline at `progress`, 0..1. */
  scrub(progress: number): void;
  /** Play the held book's timeline forward from where it is. */
  play(): void;
  putBack(): void;
}

export interface TunerReading {
  readonly title: string;
  readonly phase: string;
  /** The timeline's own progress, 0..1 — never the slider's. */
  readonly progress: number;
  readonly duration: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** How often the read-backs are refreshed from the pickup. */
const READ_BACK_MS = 100;

/** The tuner as an instrument for the pane: one folder, `Pickup tuner`. */
export function pickupTuner(pickup: TunablePickup | undefined): Instrument {
  return { title: 'Pickup tuner', mount: (folder) => mountPickupTuner(folder, pickup) };
}

/** Fill `folder`; the returned function stops the read-back timer. */
export function mountPickupTuner(pane: FolderSlice, pickup: TunablePickup | undefined): () => void {
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
    // At most 140°: the fade takes 40° (`pickup-motion.ts`), so a later start
    // would leave the page part-faded at rest, open at 180° — a setting the tuner
    // must not be able to export (ADR-0104's floor).
    shape.addBinding(motion, 'textFadeFrom', { min: 60, max: 140, step: 1 });

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

  return () => {
    window.clearInterval(timer);
  };
}
