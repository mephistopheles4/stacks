/**
 * The page's modes, as an instrument in the debug pane (#602, spec S2.4): the room, `?shelf` and
 * `?solo`, each a button that opens that page with the rest of the address kept.
 *
 * A view file, like `pickup-tuner.ts`: it takes the folder `debug-pane.ts` made for it and imports
 * nothing from Tweakpane. A mode is a different page load (the room is fetched, or never is; `?solo`
 * returns before a shelf is built), so a button opens an address and does not rebuild in place.
 */
import { addressFor, type PageMode } from './room-mode.ts';
import type { Instrument } from './pane-slots.ts';

export interface ModeSwitchSources {
  /** The mode this page is in. */
  readonly current: PageMode;
  /** `location.search` now: the panel rewrites the address as it is dialled. */
  readonly search: () => string;
  /** Opens an address. */
  readonly open: (search: string) => void;
}

const LABELS: Readonly<Record<PageMode, string>> = {
  room: 'Room',
  shelf: '?shelf (the bookcase alone)',
  solo: '?solo (one book)',
};

export function modeSwitch(sources: ModeSwitchSources): Instrument {
  return {
    title: 'Page mode',
    expanded: true,
    mount(folder) {
      for (const mode of ['room', 'shelf', 'solo'] as const) {
        const here = mode === sources.current ? ' — this page' : '';
        folder.addButton({ title: `${LABELS[mode]}${here}` }).on('click', () => {
          sources.open(addressFor(sources.search(), mode));
        });
      }
      return () => undefined;
    },
  };
}
