// @vitest-environment happy-dom
//
// The visible picker (spec S15.2, C15): a visitor chooses a room, the choice is remembered, and while
// the list holds one room nothing is built at all. Proved with a test room that is only ever on a
// catalogue handed in here; the page's own list holds one.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountRoomPicker } from './room-picker.ts';
import {
  addressForRoom,
  DEFAULT_ROOM_ID,
  ROOM_KEY,
  ROOMS,
  type Catalogue,
  type RoomId,
} from './room-mode.ts';

const TEST_ROOMS: Catalogue = {
  ...ROOMS,
  'test-room': { label: 'Test <b>room</b>', glb: 'test.glb', background: 0x101820 },
};

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});

describe('the picker', () => {
  it('builds nothing while the list holds one room', () => {
    const picker = mountRoomPicker({
      host,
      catalogue: ROOMS,
      current: DEFAULT_ROOM_ID,
      store: memoryStore(),
      search: () => '',
      open: vi.fn(),
    });
    expect(picker).toBeUndefined();
    expect(host.childElementCount).toBe(0);
  });

  it('lists every room by its label, as text, with the current one chosen', () => {
    mountRoomPicker({
      host,
      catalogue: TEST_ROOMS,
      current: DEFAULT_ROOM_ID,
      store: memoryStore(),
      search: () => '',
      open: vi.fn(),
    });
    const select = host.querySelector('select');
    expect(select).not.toBeNull();
    const options = [...(select?.options ?? [])];
    expect(options.map((o) => o.value)).toEqual(['reading-corner', 'test-room']);
    // a label is text: its markup is shown and never built
    expect(options.map((o) => o.textContent)).toEqual([
      ROOMS['reading-corner'].label,
      'Test <b>room</b>',
    ]);
    expect(host.querySelector('b')).toBeNull();
    expect(select?.value).toBe('reading-corner');
  });

  it('has a name a screen reader reads', () => {
    mountRoomPicker({
      host,
      catalogue: TEST_ROOMS,
      current: DEFAULT_ROOM_ID,
      store: memoryStore(),
      search: () => '',
      open: vi.fn(),
    });
    const select = host.querySelector('select');
    const label = select?.id === undefined ? null : host.querySelector(`label[for="${select.id}"]`);
    expect(label?.textContent).toBe('Room');
  });

  it('remembers a pick and opens the address that asks for it, keeping the rest', () => {
    const store = memoryStore();
    const open = vi.fn();
    mountRoomPicker({
      host,
      catalogue: TEST_ROOMS,
      current: DEFAULT_ROOM_ID,
      store,
      search: () => '?debug&woodSeed=a',
      open,
    });
    const select = host.querySelector('select');
    if (select === null) throw new Error('no select');
    select.value = 'test-room';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.data.get(ROOM_KEY)).toBe('test-room');
    expect(open).toHaveBeenCalledExactlyOnceWith(
      addressForRoom('?debug&woodSeed=a', 'test-room' as RoomId),
    );
  });

  it('still opens the room when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const open = vi.fn();
    mountRoomPicker({
      host,
      catalogue: TEST_ROOMS,
      current: DEFAULT_ROOM_ID,
      store: blocked,
      search: () => '',
      open,
    });
    const select = host.querySelector('select');
    if (select === null) throw new Error('no select');
    select.value = 'test-room';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(open).toHaveBeenCalledOnce();
  });

  it('does nothing for a value that is not on the list', () => {
    const store = memoryStore();
    const open = vi.fn();
    mountRoomPicker({
      host,
      catalogue: TEST_ROOMS,
      current: DEFAULT_ROOM_ID,
      store,
      search: () => '',
      open,
    });
    const select = host.querySelector('select');
    if (select === null) throw new Error('no select');
    const rogue = document.createElement('option');
    rogue.value = '../../etc';
    select.append(rogue);
    select.value = '../../etc';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(open).not.toHaveBeenCalled();
    expect(store.data.size).toBe(0);
  });

  it('is taken out again by dispose', () => {
    const picker = mountRoomPicker({
      host,
      catalogue: TEST_ROOMS,
      current: DEFAULT_ROOM_ID,
      store: memoryStore(),
      search: () => '',
      open: vi.fn(),
    });
    picker?.dispose();
    expect(host.childElementCount).toBe(0);
  });
});
