/**
 * The debug pane — one Tweakpane `Pane` for the `?debug` instruments.
 *
 * **The only file that imports `tweakpane`, its essentials plugin and the
 * stylesheet as values**, and the one `boot.ts` reaches, by a single dynamic
 * import. Vite splits it and everything it imports into chunks a visitor
 * without `?debug` never downloads; the tuner-split gate holds that (ADR-0104).
 * Each instrument is a view file that takes a folder and has a `mount` that
 * returns its dispose, plus a pure model file where it has logic; an
 * instrument leaves the pane in one file and one line here (ADR-0119).
 *
 * **Styled under the CSP without loosening it.** Tweakpane injects a runtime
 * `<style>` per bundle unless it finds one already carrying its id. The page
 * pre-seats both, empty (`pages/index.astro`), so nothing is injected, and the
 * CSS arrives as a stylesheet file through the `<link>` below — extracted at
 * build time from the packages' text (`tuner-css.ts`). The styled-pane gate
 * holds the pane to being styled with zero violations.
 *
 * Ordering and re-mounting live in `pane-slots.ts`, where a unit test can reach
 * them.
 */
import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import tunerCss from '../generated/tuner.css?url';
import { createSlots, startsExpanded, type PaneHost, type Slots } from './pane-slots.ts';
import { pickupTuner, type TunablePickup } from './pickup-tuner.ts';

/** What the instruments are given to work on. */
export interface PaneSources {
  readonly tunable: TunablePickup | undefined;
}

export interface DebugPane {
  /** The instruments' slots: dispose one and mount it again in place. */
  readonly slots: Slots;
  dispose(): void;
}

/**
 * The slice of `Pane` the shell calls, declared for `pane-slots.ts`'s reason:
 * `Pane`'s methods come from `@tweakpane/core`, which does not resolve here.
 */
interface PaneSlice extends PaneHost {
  registerPlugin(plugin: unknown): void;
  dispose(): void;
}

export function mountDebugPane(host: HTMLElement, sources: PaneSources): DebugPane {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = tunerCss;
  document.head.append(link);

  const container = document.createElement('div');
  container.className = 'debug-pane';
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

  const pane = new Pane({
    title: 'Debug pane',
    container,
    expanded: startsExpanded(window.innerWidth),
  }) as unknown as PaneSlice;
  pane.registerPlugin(EssentialsPlugin);

  const slots = createSlots(pane);
  slots.add(pickupTuner(sources.tunable));

  return {
    slots,
    dispose: () => {
      slots.disposeAll();
      pane.dispose();
      container.remove();
      link.remove();
    },
  };
}
