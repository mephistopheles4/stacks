/**
 * The page's modes, as an instrument in the debug pane (#602, spec S2.4): the room, `?shelf` and
 * `?solo`, each a button that opens that page with the rest of the address kept.
 *
 * A view file, like `pickup-tuner.ts`: it takes the folder `debug-pane.ts` made for it and imports
 * nothing from Tweakpane. A mode is a different page load (the room is fetched, or never is; `?solo`
 * returns before a shelf is built), so a button opens an address and does not rebuild in place.
 */
import { addressFor, addressForRoom, type PageMode, type RoomId } from './room-mode.ts';
import type { Instrument } from './pane-slots.ts';

export interface ModeSwitchSources {
  /** The mode this page is in. */
  readonly current: PageMode;
  /** `location.search` now: the panel rewrites the address as it is dialled. */
  readonly search: () => string;
  /** Opens an address. */
  readonly open: (search: string) => void;
  /**
   * The rooms on the list and the one this page draws (spec S15.4): the pane reaches every room, a
   * button each, while there is more than one. Absent or one room, no room buttons.
   */
  readonly rooms?: {
    readonly list: readonly { readonly id: RoomId; readonly label: string }[];
    readonly current: RoomId;
  };
  /** One line about the link this page was opened from, shown above the buttons: absent for none. */
  readonly notice?: string;
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
      if (sources.notice !== undefined) {
        // Read-only text, like the panel's status: the sentence is ours, but a binding shows it as text.
        folder.addBinding({ notice: sources.notice }, 'notice', {
          readonly: true,
          multiline: true,
          rows: 3,
          interval: 0,
          label: 'link',
        });
      }
      for (const mode of ['room', 'shelf', 'solo'] as const) {
        const here = mode === sources.current ? ' — this page' : '';
        folder.addButton({ title: `${LABELS[mode]}${here}` }).on('click', () => {
          sources.open(addressFor(sources.search(), mode));
        });
      }
      const { rooms } = sources;
      if (rooms !== undefined && rooms.list.length > 1) {
        for (const room of rooms.list) {
          const here = room.id === rooms.current ? ' — this room' : '';
          folder.addButton({ title: `Room: ${room.label}${here}` }).on('click', () => {
            sources.open(addressForRoom(sources.search(), room.id));
          });
        }
      }
      return () => undefined;
    },
  };
}
