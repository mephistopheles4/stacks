import { soloBook } from './shelf-url.ts';

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

/** What a room is to the page: its GLB, and the ground colour behind it. */
export interface RoomEntry {
  /** The packed GLB, in `public/rooms/<id>/`. */
  readonly glb: string;
  /** The scene's background while this room is drawn (the prototype's room lighting held it). */
  readonly background: number;
}

/**
 * **The fixed list.** Spec S15.3: a room id from `?room=`, and later from storage or a `?debug`
 * link, is looked up here and never concatenated into a path. It holds one room until the themes
 * ticket (T7) adds a test room, and the second room is the last ticket.
 */
export const ROOMS = {
  'reading-corner': { glb: 'room-audition.glb', background: 0x0d0b09 },
} as const satisfies Record<string, RoomEntry>;

export type RoomId = keyof typeof ROOMS;

export const DEFAULT_ROOM_ID: RoomId = 'reading-corner';

/** Own keys only: `?room=constructor` and `?room=__proto__` are not rooms. */
export function isRoomId(value: unknown): value is RoomId {
  return typeof value === 'string' && Object.hasOwn(ROOMS, value);
}

/**
 * `?room=<id>`: a room on the list, else the default. An empty value, an unknown one and an absent
 * one all mean the default room (spec S2.7).
 */
export function roomIdFrom(search: string): RoomId {
  const asked = new URLSearchParams(search).get('room');
  return isRoomId(asked) ? asked : DEFAULT_ROOM_ID;
}

/** Where a room's files are served from: `/rooms/<id>/`, for an id already on the list. */
export function roomFolder(id: RoomId): string {
  return `/rooms/${id}/`;
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
