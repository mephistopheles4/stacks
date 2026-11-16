import { describe, expect, it } from 'vitest';
import {
  addressFor,
  DEFAULT_PAGE_MODE,
  DEFAULT_ROOM_ID,
  isRoomId,
  pageMode,
  roomFolder,
  roomIdFrom,
  ROOMS,
} from './room-mode.ts';

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
    expect(roomFolder('reading-corner')).toBe('/rooms/reading-corner/');
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
