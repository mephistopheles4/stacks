import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addressFor,
  addressForRoom,
  DEFAULT_PAGE_MODE,
  DEFAULT_ROOM_ID,
  isRoomId,
  pageMode,
  readRemembered,
  remember,
  roomFolder,
  roomEntry,
  roomGlbUrl,
  roomIdFrom,
  ROOM_KEY,
  ROOMS,
  roomsListed,
  showsPicker,
  startingRoom,
  type Catalogue,
  type RoomId,
} from './room-mode.ts';

/** A second room that exists only here: the themes machinery is proved with it, and it never ships. */
const TEST_ROOMS: Catalogue = {
  ...ROOMS,
  'test-room': { label: 'Test room', glb: 'test.glb', background: 0x101820 },
};

/** A store that remembers what it is told and counts every write, for "writes nothing". */
function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    writes,
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: (key: string) => {
      writes.push(key);
      data.delete(key);
    },
  };
}

describe('pageMode (spec S2)', () => {
  it('draws the room by default', () => {
    expect(DEFAULT_PAGE_MODE).toBe('room');
    expect(pageMode('', false)).toBe('room');
    expect(pageMode('?debug', false)).toBe('room');
  });

  it('draws the bookcase alone for ?shelf, with or without a value', () => {
    expect(pageMode('?shelf', false)).toBe('shelf');
    expect(pageMode('?shelf=1&debug', false)).toBe('shelf');
  });

  it('leaves ?solo as it was, and ahead of ?shelf', () => {
    expect(pageMode('?solo', false)).toBe('solo');
    expect(pageMode('?solo=3', false)).toBe('solo');
    expect(pageMode('?solo&shelf', false)).toBe('solo');
    // a malformed ?solo was never a mode: the page it would have shown is the shelf's or the room's
    expect(pageMode('?solo=x', false)).toBe('room');
  });

  it('draws the bookcase alone for a visitor who asked for reduced data (S2.6)', () => {
    expect(pageMode('', true)).toBe('shelf');
    expect(pageMode('?room=reading-corner', true)).toBe('shelf');
  });
});

describe('the room id (S2.7, S15.3)', () => {
  it('is the default when absent, empty or unknown', () => {
    expect(roomIdFrom('')).toBe(DEFAULT_ROOM_ID);
    expect(roomIdFrom('?room')).toBe(DEFAULT_ROOM_ID);
    expect(roomIdFrom('?room=')).toBe(DEFAULT_ROOM_ID);
    expect(roomIdFrom('?room=attic')).toBe(DEFAULT_ROOM_ID);
  });

  it('is the room asked for when it is on the list', () => {
    expect(roomIdFrom('?room=reading-corner')).toBe('reading-corner');
  });

  it('never lets an id that is not a room reach a path', () => {
    for (const asked of [
      '../../etc',
      'reading-corner/../x',
      'constructor',
      '__proto__',
      'toString',
    ]) {
      expect(isRoomId(asked)).toBe(false);
      expect(roomIdFrom(`?room=${encodeURIComponent(asked)}`)).toBe(DEFAULT_ROOM_ID);
    }
  });

  it('holds exactly the one room until themes arrive', () => {
    expect(Object.keys(ROOMS)).toEqual(['reading-corner']);
  });

  it('serves a room from its own folder under /rooms/', () => {
    expect(roomFolder(DEFAULT_ROOM_ID)).toBe('/rooms/reading-corner/');
  });
});

describe('addressFor (the debug panel)', () => {
  it('changes the mode and keeps the rest of the address', () => {
    expect(addressFor('?debug&woodSeed=a', 'shelf')).toBe('?debug&woodSeed=a&shelf');
    expect(addressFor('?debug&shelf', 'room')).toBe('?debug');
    expect(addressFor('?shelf', 'solo')).toBe('?solo');
    expect(addressFor('?solo=2&debug', 'room')).toBe('?debug');
  });

  it('writes the room mode as the bare address when nothing else is asked', () => {
    expect(addressFor('?shelf', 'room')).toBe('?');
  });

  it('drops a ?room it was handed, so the mode alone decides', () => {
    expect(addressFor('?room=reading-corner&debug', 'shelf')).toBe('?debug&shelf');
  });
});

describe('the room list and the picker (S15.2)', () => {
  it('lists every room by id and label, in the catalogue order', () => {
    expect(roomsListed(TEST_ROOMS).map((r) => [r.id, r.label])).toEqual([
      ['reading-corner', ROOMS['reading-corner'].label],
      ['test-room', 'Test room'],
    ]);
  });

  it('shows no picker while the list holds one room, and one once it holds two', () => {
    expect(showsPicker(ROOMS)).toBe(false);
    expect(showsPicker(TEST_ROOMS)).toBe(true);
  });

  it('ships exactly one room, and it is in public/rooms with its GLB', () => {
    expect(Object.keys(ROOMS)).toEqual(['reading-corner']);
    for (const [id, entry] of Object.entries(ROOMS)) {
      expect(existsSync(new URL(`../../public/rooms/${id}/${entry.glb}`, import.meta.url))).toBe(
        true,
      );
    }
  });
});

describe('which room a page loads (S15.3)', () => {
  it('takes a room on the list from ?room=, from the debug link, then from storage', () => {
    expect(roomIdFrom('?room=test-room', undefined, TEST_ROOMS)).toBe('test-room');
    expect(roomIdFrom('?debug=%7B%22room%22%3A%22test-room%22%7D', undefined, TEST_ROOMS)).toBe(
      'test-room',
    );
    expect(roomIdFrom('', 'test-room', TEST_ROOMS)).toBe('test-room');
  });

  it('lets ?room= beat the debug link, and the debug link beat storage', () => {
    const link = '?debug=%7B%22room%22%3A%22test-room%22%7D';
    expect(roomIdFrom(`${link}&room=reading-corner`, 'test-room', TEST_ROOMS)).toBe(
      'reading-corner',
    );
    expect(roomIdFrom(link, 'reading-corner', TEST_ROOMS)).toBe('test-room');
  });

  it('opens a debug link with a diff and no room id against the default room, not the remembered one', () => {
    const link = `?debug=${encodeURIComponent('{"lighting":{"key":{"intensity":2}}}')}`;
    expect(roomIdFrom(link, 'test-room', TEST_ROOMS)).toBe(DEFAULT_ROOM_ID);
    expect(roomIdFrom('?debug', 'test-room', TEST_ROOMS)).toBe('test-room');
  });

  it('loads the default room for an id that is not on the list, wherever it came from', () => {
    for (const bad of ['attic', '', '../../etc', 'constructor', '__proto__', 'toString']) {
      expect(roomIdFrom(`?room=${encodeURIComponent(bad)}`, 'test-room', TEST_ROOMS)).toBe(
        DEFAULT_ROOM_ID,
      );
      expect(roomIdFrom('', bad, TEST_ROOMS)).toBe(DEFAULT_ROOM_ID);
      const link = `?debug=${encodeURIComponent(JSON.stringify({ room: bad }))}`;
      expect(roomIdFrom(link, 'test-room', TEST_ROOMS)).toBe(DEFAULT_ROOM_ID);
    }
  });

  it('reads a room that is not a string in a debug link as no room', () => {
    for (const value of [1, null, ['test-room'], { id: 'test-room' }, true]) {
      const link = `?debug=${encodeURIComponent(JSON.stringify({ room: value }))}`;
      expect(roomIdFrom(link, undefined, TEST_ROOMS)).toBe(DEFAULT_ROOM_ID);
    }
  });

  it('serves only the chosen room: its GLB under its own folder', () => {
    const id = roomIdFrom('?room=test-room', undefined, TEST_ROOMS);
    expect(roomFolder(id)).toBe('/rooms/test-room/');
    expect(roomGlbUrl(id, roomEntry(id, TEST_ROOMS))).toBe('/rooms/test-room/test.glb');
  });
});

describe('the remembered room (S15.3)', () => {
  it('writes the id under one key, and reads it back when it is on the list', () => {
    const store = memoryStore();
    remember(store, 'test-room', TEST_ROOMS);
    expect(store.writes).toEqual([ROOM_KEY]);
    expect(readRemembered(store, TEST_ROOMS)).toBe('test-room');
  });

  it('reads an id that is not on the list as nothing, and writes nothing', () => {
    const store = memoryStore({ [ROOM_KEY]: '../../etc' });
    expect(readRemembered(store, TEST_ROOMS)).toBeUndefined();
    expect(roomIdFrom('', readRemembered(store, TEST_ROOMS), TEST_ROOMS)).toBe(DEFAULT_ROOM_ID);
    expect(store.writes).toEqual([]);
  });

  it('survives a store that is missing or that throws, and loads the default room', () => {
    expect(readRemembered(undefined, TEST_ROOMS)).toBeUndefined();
    expect(() => {
      remember(undefined, 'test-room', TEST_ROOMS);
    }).not.toThrow();
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readRemembered(blocked, TEST_ROOMS)).toBeUndefined();
    expect(() => {
      remember(blocked, 'test-room', TEST_ROOMS);
    }).not.toThrow();
  });

  it('refuses to remember what is not a room', () => {
    const store = memoryStore();
    remember(store, 'attic', TEST_ROOMS);
    expect(store.writes).toEqual([]);
  });
});

describe('addressForRoom (the picker and the debug pane)', () => {
  const TEST = 'test-room' as RoomId;
  it('asks for the room by ?room= and keeps the rest of the address', () => {
    expect(addressForRoom('?debug&woodSeed=a', TEST)).toBe('?debug&woodSeed=a&room=test-room');
    expect(addressForRoom('?room=reading-corner', TEST)).toBe('?room=test-room');
  });

  it("drops a room the debug link carries, and the lighting and scene that were that room's", () => {
    const json = JSON.stringify({
      room: 'reading-corner',
      lighting: { a: 1 },
      scene: {},
      books: { b: 2 },
    });
    const address = addressForRoom(`?debug=${encodeURIComponent(json)}`, TEST);
    const debug = new URLSearchParams(address).get('debug');
    expect(JSON.parse(debug ?? '')).toEqual({ books: { b: 2 } });
    expect(new URLSearchParams(address).get('room')).toBe('test-room');
  });

  it('reads the last non-empty debug value, as the link reader does', () => {
    const json = encodeURIComponent('{"books":{"b":2},"room":"x"}');
    const address = addressForRoom(`?debug=${json}&debug`, TEST);
    expect(JSON.parse(new URLSearchParams(address).get('debug') ?? '')).toEqual({
      books: { b: 2 },
    });
  });

  it('leaves a bare ?debug bare when the link held only the room', () => {
    const address = addressForRoom(`?debug=${encodeURIComponent('{"room":"x"}')}`, TEST);
    expect(address).toBe('?debug&room=test-room');
  });
});

describe('the room a page opens with (C15)', () => {
  it('keeps a pick across a reload: the bare address reads it back', () => {
    const store = memoryStore();
    remember(store, 'test-room', TEST_ROOMS);
    expect(startingRoom('', store, TEST_ROOMS)).toBe('test-room');
    expect(startingRoom('?debug', store, TEST_ROOMS)).toBe('test-room');
  });

  it('writes nothing to a store, whatever the address or the stored value says', () => {
    const store = memoryStore({ [ROOM_KEY]: 'attic' });
    expect(startingRoom('?room=attic', store, TEST_ROOMS)).toBe(DEFAULT_ROOM_ID);
    expect(startingRoom('?room=test-room', store, TEST_ROOMS)).toBe('test-room');
    expect(startingRoom('', store, TEST_ROOMS)).toBe(DEFAULT_ROOM_ID);
    expect(store.writes).toEqual([]);
  });

  it('is the default room with no store, and with one that throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(startingRoom('', undefined, TEST_ROOMS)).toBe(DEFAULT_ROOM_ID);
    expect(startingRoom('', blocked, TEST_ROOMS)).toBe(DEFAULT_ROOM_ID);
  });
});
