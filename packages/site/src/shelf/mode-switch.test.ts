import { describe, expect, it, vi } from 'vitest';
import { modeSwitch, type ModeSwitchSources } from './mode-switch.ts';
import { DEFAULT_ROOM_ID, type RoomId } from './room-mode.ts';
import type { FolderSlice } from './pane-slots.ts';

/** A folder that records what the instrument puts in it, and lets a test press a button. */
function fakeFolder() {
  const buttons: { title: string; press: () => unknown }[] = [];
  const bindings: { key: string; value: unknown; params: unknown }[] = [];
  const folder = {
    addButton: ({ title }: { title: string }) => {
      const entry: { title: string; press: () => unknown } = { title, press: () => undefined };
      buttons.push(entry);
      return {
        on: (_: string, run: () => void) => {
          entry.press = run;
        },
      };
    },
    addBinding: (object: Record<string, unknown>, key: string, params: unknown) => {
      bindings.push({ key, value: object[key], params });
    },
  };
  return { folder: folder as unknown as FolderSlice, buttons, bindings };
}

const TEST = 'test-room' as RoomId;
const sources = (over: Partial<ModeSwitchSources> = {}): ModeSwitchSources => ({
  current: 'room',
  search: () => '?debug',
  open: vi.fn(),
  ...over,
});

describe('the page-mode instrument, with rooms (spec S15.4)', () => {
  it('has a button for the room, ?shelf and ?solo, and none for rooms while there is one', () => {
    const { folder, buttons } = fakeFolder();
    modeSwitch(
      sources({
        rooms: {
          list: [{ id: DEFAULT_ROOM_ID, label: 'Reading corner' }],
          current: DEFAULT_ROOM_ID,
        },
      }),
    ).mount(folder);
    expect(buttons.map((b) => b.title)).toEqual([
      'Room — this page',
      '?shelf (the bookcase alone)',
      '?solo (one book)',
    ]);
  });

  it('has a button per room once there are two, and each opens the address that asks for it', () => {
    const { folder, buttons } = fakeFolder();
    const open = vi.fn();
    modeSwitch(
      sources({
        open,
        rooms: {
          list: [
            { id: DEFAULT_ROOM_ID, label: 'Reading corner' },
            { id: TEST, label: 'Test room' },
          ],
          current: DEFAULT_ROOM_ID,
        },
      }),
    ).mount(folder);
    const titles = buttons.map((b) => b.title);
    expect(titles).toContain('Room: Reading corner — this room');
    expect(titles).toContain('Room: Test room');
    buttons.find((b) => b.title === 'Room: Test room')?.press();
    expect(open).toHaveBeenCalledExactlyOnceWith('?debug&room=test-room');
  });

  it('shows the notice as read-only text, and nothing when there is none', () => {
    const withNotice = fakeFolder();
    modeSwitch(sources({ notice: 'This link predates themes.' })).mount(withNotice.folder);
    expect(withNotice.bindings).toEqual([
      expect.objectContaining({
        key: 'notice',
        value: 'This link predates themes.',
        params: expect.objectContaining({ readonly: true }) as unknown,
      }),
    ]);
    const without = fakeFolder();
    modeSwitch(sources()).mount(without.folder);
    expect(without.bindings).toEqual([]);
  });
});
