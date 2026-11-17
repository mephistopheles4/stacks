import type { StoreLike } from './shadow-fallback.ts';
import {
  addressForRoom,
  isRoomId,
  remember,
  roomsListed,
  ROOMS,
  showsPicker,
  type Catalogue,
  type RoomId,
} from './room-mode.ts';

/**
 * The visible room picker (#606, spec S15.2): one labelled `<select>` over the page, so a visitor
 * can choose which room the bookcase stands in.
 *
 * **It builds nothing while the list holds one room** — the page then has no control at all, not a
 * hidden one — and every room's label is set as text, never as markup. A choice is remembered and
 * the page is opened again at the address that asks for it, as a mode switch is: a room is a
 * different page load, so the room that was not chosen is never fetched. What the store holds is the
 * id and nothing else, and it never leaves the browser.
 */

export interface PickerOptions {
  readonly host: HTMLElement;
  /** The list the picker offers; the page's own unless a test hands one in. */
  readonly catalogue?: Catalogue;
  /** The room this page is drawing. */
  readonly current: RoomId;
  /** `localStorage`, or nothing when the page may not have it. */
  readonly store: StoreLike | undefined;
  /** `location.search` now: the panel rewrites the address as it is dialled. */
  readonly search: () => string;
  /** Opens an address. */
  readonly open: (search: string) => void;
}

export interface RoomPicker {
  dispose(): void;
}

const SELECT_ID = 'room-picker-select';

export function mountRoomPicker(options: PickerOptions): RoomPicker | undefined {
  const catalogue = options.catalogue ?? ROOMS;
  if (!showsPicker(catalogue)) return undefined;

  const wrap = document.createElement('div');
  wrap.className = 'room-picker';
  const label = document.createElement('label');
  label.htmlFor = SELECT_ID;
  label.textContent = 'Room';
  const select = document.createElement('select');
  select.id = SELECT_ID;
  for (const { id, label: text } of roomsListed(catalogue)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = text;
    select.append(option);
  }
  select.value = options.current;
  wrap.append(label, select);
  style(wrap, label, select);

  const onChange = (): void => {
    const picked = select.value;
    // An id that is not on the list is not a room: nothing is written and nothing is opened.
    if (!isRoomId(picked, catalogue)) return;
    remember(options.store, picked, catalogue);
    options.open(addressForRoom(options.search(), picked));
  };
  select.addEventListener('change', onChange);
  options.host.append(wrap);

  return {
    dispose: () => {
      select.removeEventListener('change', onChange);
      wrap.remove();
    },
  };
}

/**
 * Set through CSSOM, which the CSP's `style-src` does not govern, as the debug pane styles itself: a
 * `style` attribute written as markup would be refused. The bottom edge's middle is the one place the
 * header, the held controls, the attribution link and the Ask button leave free.
 */
function style(wrap: HTMLElement, label: HTMLElement, select: HTMLElement): void {
  Object.assign(wrap.style, {
    position: 'absolute',
    bottom: 'clamp(1rem, 4vw, 2.5rem)',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    zIndex: '5',
    font: '0.8125rem ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    color: 'var(--ink-dim, #a89684)',
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(label.style, { letterSpacing: '0.04em' } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(select.style, {
    font: 'inherit',
    color: 'var(--ink, #f2e8dc)',
    background: 'rgb(26 22 19 / 0.8)',
    border: '1px solid #4a3323',
    borderRadius: '6px',
    padding: '0.375rem 0.5rem',
    minHeight: '2.25rem',
  } satisfies Partial<CSSStyleDeclaration>);
}
