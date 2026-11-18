import type { StoreLike } from './shadow-fallback.ts';
import { debugRoom, soloBook } from './shelf-url.ts';

/**
 * Which page this is: the room around the bookcase, the bookcase alone, or one book (#602, spec S2).
 *
 * No `three` and no DOM, so vitest's node environment runs every rule here. Nothing outside this file
 * decides a mode from the address, and the room's id is checked here against the one list the bundle
 * holds, before anything is fetched: an id that is not on it is never turned into a URL.
 */

export type PageMode = 'room' | 'shelf' | 'solo';

/**
 * What the landing page draws. The one rollback lever for the room (spec S19): `'shelf'` backs the
 * room out of a deploy without a revert, and `?shelf` and `?solo` keep meaning what they say.
 */
export const DEFAULT_PAGE_MODE: Exclude<PageMode, 'solo'> = 'room';

/** What a room is to the page: its name in the picker, its GLB, and the ground colour behind it. */
export interface RoomEntry {
  /** What the picker and the debug pane call the room. Set as text, never as markup. */
  readonly label: string;
  /** The packed GLB, in `public/rooms/<id>/`. */
  readonly glb: string;
  /** The scene's background while this room is drawn (the prototype's room lighting held it). */
  readonly background: number;
}

/** A list of rooms by id. The page's own is `ROOMS`; a test hands in one with a room that never ships. */
export type Catalogue = Readonly<Record<string, RoomEntry>>;

declare const roomIdBrand: unique symbol;

/**
 * An id that was found on a catalogue: the only kind of string `roomFolder` and the loader take, so a
 * value from the address, from storage or from a `?debug` link cannot reach a path without having been
 * through `isRoomId` (spec S15.3). A type and nothing at run time.
 */
export type RoomId = string & { readonly [roomIdBrand]: true };

/**
 * **The fixed list.** Spec S15.3: a room id from `?room=`, from storage and from a `?debug` link is
 * looked up here and never concatenated into a path. A theme is a room (S15.1), so adding one is one
 * entry here and its folder under `public/rooms/`. It holds one room until the second is built (T8):
 * the picker is hidden while it does, and a test room proves the machinery without ever being on it.
 */
export const ROOMS = {
  'reading-corner': { label: 'Reading corner', glb: 'room-audition.glb', background: 0x0d0b09 },
} as const satisfies Catalogue;

export const DEFAULT_ROOM_ID = 'reading-corner' as RoomId;

/** Own keys only: `?room=constructor` and `?room=__proto__` are not rooms. */
export function isRoomId(value: unknown, catalogue: Catalogue = ROOMS): value is RoomId {
  return typeof value === 'string' && Object.hasOwn(catalogue, value);
}

/** The entry for an id that was found on `catalogue`. */
export function roomEntry(id: RoomId, catalogue: Catalogue = ROOMS): RoomEntry {
  const entry = catalogue[id];
  if (entry === undefined) throw new Error(`room "${id}" is not on the list`);
  return entry;
}

/** Every room, in the list's order, for the picker and the debug pane. */
export function roomsListed(
  catalogue: Catalogue = ROOMS,
): readonly { readonly id: RoomId; readonly label: string }[] {
  return Object.entries(catalogue).map(([id, entry]) => ({ id: id as RoomId, label: entry.label }));
}

/** The picker shows when there is a choice to make: it is hidden while the list holds one room (S15.2). */
export function showsPicker(catalogue: Catalogue = ROOMS): boolean {
  return Object.keys(catalogue).length > 1;
}

/**
 * Which room this page loads (spec S2.7, S15.3): `?room=<id>` first, then the `room` a `?debug`
 * link carries, then the room the visitor picked last time (`remembered`), then the default.
 *
 * **The first source that says anything decides**, so a source that names something that is not a
 * room means the default room and does not fall through to a later one: an address that asks for
 * `attic` gets the default, not whatever the browser remembers. An empty `?room=` is that too.
 * **A `?debug=<json>` link that carries a diff and no room id opens the default room** (S15.4): it was
 * made against a room's defaults, so a room the visitor happened to pick last is not its room. A bare
 * `?debug`, which only switches the instruments on, still takes the remembered room.
 */
export function roomIdFrom(
  search: string,
  remembered?: string,
  catalogue: Catalogue = ROOMS,
): RoomId {
  const params = new URLSearchParams(search);
  const linked = params.getAll('debug').some((value) => value !== '');
  const asked = params.get('room') ?? debugRoom(params) ?? (linked ? undefined : remembered);
  return isRoomId(asked, catalogue) ? asked : DEFAULT_ROOM_ID;
}

/** Where a room's files are served from: `/rooms/<id>/`, for an id already on the list. */
export function roomFolder(id: RoomId): string {
  return `/rooms/${id}/`;
}

/** The one file a page fetches first for a room: its GLB. The loader builds its address here and nowhere else. */
export function roomGlbUrl(id: RoomId, entry: RoomEntry): string {
  return roomFolder(id) + entry.glb;
}

/**
 * The room a page opens with, from the address and from what the browser remembers: the one place the
 * page puts the two together (spec S15.3), so a reload that keeps a pick, and a blocked or unusable
 * store that means the default room, are rules a test holds. It reads storage and never writes it.
 */
export function startingRoom(
  search: string,
  store: StoreLike | undefined,
  catalogue: Catalogue = ROOMS,
): RoomId {
  return roomIdFrom(search, readRemembered(store, catalogue), catalogue);
}

/** The key the room pick is kept under in `localStorage`: a room id and nothing else. */
export const ROOM_KEY = 'stacks.room';

/**
 * The room the visitor picked last time, or `undefined`: no store, a store that throws (a blocked
 * `localStorage`), nothing there, or a value that is not on the list. **Writes nothing in any of
 * them**: a value that is not a room is left where it is and the default room loads (spec S15.3).
 */
export function readRemembered(
  store: StoreLike | undefined,
  catalogue: Catalogue = ROOMS,
): RoomId | undefined {
  if (store === undefined) return undefined;
  try {
    const value = store.getItem(ROOM_KEY);
    return isRoomId(value, catalogue) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Remembers a pick, best effort. It writes only an id on the list, so what storage holds is always
 * one of them or whatever somebody put there by hand, which `readRemembered` refuses.
 */
export function remember(
  store: StoreLike | undefined,
  id: string,
  catalogue: Catalogue = ROOMS,
): void {
  if (store === undefined || !isRoomId(id, catalogue)) return;
  try {
    store.setItem(ROOM_KEY, id);
  } catch {
    // A full or blocked store means the pick lasts for this page load; nothing else is lost.
  }
}

/**
 * The page's mode. `?solo` is unchanged and wins; `?shelf` is the bookcase alone; a visitor whose
 * browser reports `prefers-reduced-data: reduce` gets `?shelf` without asking (spec S2.6), since the
 * room is 27 MB or more of download; anything else is the default.
 */
export function pageMode(search: string, reducedData: boolean): PageMode {
  const params = new URLSearchParams(search);
  if (soloBook(params) !== undefined) return 'solo';
  if (params.has('shelf')) return 'shelf';
  if (reducedData) return 'shelf';
  return DEFAULT_PAGE_MODE;
}

/** Where the `?debug` panel sends the owner for each mode: the address with only the mode changed. */
export function addressFor(search: string, mode: PageMode): string {
  const params = new URLSearchParams(search);
  params.delete('shelf');
  params.delete('solo');
  params.delete('room');
  if (mode === 'shelf') params.set('shelf', '');
  if (mode === 'solo') params.set('solo', '');
  const query = params.toString().replace(/=(?=&|$)/g, '');
  return query === '' ? '?' : `?${query}`;
}

/**
 * The address that asks for a room: `?room=<id>` over the rest of the address.
 *
 * The `?debug=<json>` link's own `room` goes, and so do its lighting and scene: they are one room's
 * differences from that room's defaults (spec S15.4) and mean nothing against another's. The rest
 * of the link stays, and a link left holding nothing is bare `?debug` again. `shelf` and `solo` go
 * too: `pageMode` reads them before it reads a room, so a kept one would hide the room asked for.
 */
export function addressForRoom(search: string, id: RoomId): string {
  const params = new URLSearchParams(search);
  if (params.has('debug')) {
    // The last non-empty value, as `debugRoom` and `readDiff` read it.
    const value = params
      .getAll('debug')
      .filter((v) => v !== '')
      .at(-1);
    params.set('debug', withoutRoomKeys(value));
  }
  // Asking for a room leaves the plain shelf and the solo turntable, which would otherwise win.
  params.delete('shelf');
  params.delete('solo');
  params.set('room', id);
  return `?${params.toString().replace(/=(?=&|$)/g, '')}`;
}

/** A `?debug` value without the keys one room owns; a value that is not an object is left as it is. */
function withoutRoomKeys(raw: string | undefined): string {
  if (raw === undefined || raw === '') return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return raw;
  const rest = Object.entries(parsed).filter(
    ([key]) => !['room', 'lighting', 'scene'].includes(key),
  );
  return rest.length === 0 ? '' : JSON.stringify(Object.fromEntries(rest));
}
