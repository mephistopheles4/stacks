import { describe, expect, it } from 'vitest';
import {
  createSlots,
  PANE_NARROW_PX,
  startsExpanded,
  type FolderParams,
  type FolderSlice,
  type PaneHost,
  type PlacedFolder,
} from './pane-slots.ts';

/** A folder the fake host hands out: it records what the instrument did to it. */
interface FakeFolder extends PlacedFolder {
  readonly params: FolderParams;
  readonly calls: string[];
  disposed: boolean;
}

/**
 * The slice of Tweakpane's pane the shell calls, with its one ordering rule: an
 * `index` in the params inserts there, and none appends (`RackApi.add`).
 */
function fakeHost() {
  const children: FakeFolder[] = [];
  const removed: FakeFolder[] = [];
  const host: PaneHost = {
    addFolder(params) {
      const calls: string[] = [];
      const folder = {
        params,
        calls,
        disposed: false,
        dispose: () => {
          folder.disposed = true;
        },
        addBinding: () => {
          calls.push('binding');
          return { on: () => undefined };
        },
        addFolder: () => folder,
        addButton: () => ({ on: () => undefined }),
        addBlade: () => undefined,
        refresh: () => undefined,
      } as unknown as FakeFolder;
      children.splice(params.index ?? children.length, 0, folder);
      return folder;
    },
    remove(folder) {
      const at = children.indexOf(folder as FakeFolder);
      if (at < 0) throw new Error('removed a folder the pane does not hold');
      removed.push(...children.splice(at, 1));
    },
  };
  return { host, children, removed, titles: () => children.map((c) => c.params.title) };
}

/** An instrument that logs its mounts and disposes into `log`. */
function instrument(title: string, log: string[]) {
  return {
    title,
    mount: (folder: FolderSlice) => {
      log.push(`mount ${title}`);
      folder.addBinding({ a: 1 }, 'a');
      return () => {
        log.push(`dispose ${title}`);
      };
    },
  };
}

describe('createSlots', () => {
  it('adds one titled folder per instrument, in the order they were added', () => {
    const { host, titles } = fakeHost();
    const slots = createSlots(host);
    const log: string[] = [];
    slots.add(instrument('one', log));
    slots.add(instrument('two', log));
    expect(titles()).toEqual(['one', 'two']);
    expect(log).toEqual(['mount one', 'mount two']);
  });

  it('opens a folder unless the instrument asks for it closed', () => {
    const { host, children } = fakeHost();
    const slots = createSlots(host);
    slots.add(instrument('open', []));
    slots.add({ ...instrument('shut', []), expanded: false });
    expect(children.map((c) => c.params.expanded)).toEqual([true, false]);
  });

  it('disposes one instrument and its folder, and nothing else', () => {
    const { host, titles, removed } = fakeHost();
    const slots = createSlots(host);
    const log: string[] = [];
    slots.add(instrument('a', log));
    const b = slots.add(instrument('b', log));
    slots.add(instrument('c', log));
    log.length = 0;
    b.dispose();
    expect(log).toEqual(['dispose b']);
    expect(titles()).toEqual(['a', 'c']);
    expect(removed.map((f) => f.params.title)).toEqual(['b']);
    // Detached is not enough: Tweakpane's read-only rows poll until disposed.
    expect(removed.map((f) => f.disposed)).toEqual([true]);
    expect(b.live).toBe(false);
  });

  it('adds a disposed instrument again at the same index, leaving the others as they were', () => {
    const { host, children, titles } = fakeHost();
    const slots = createSlots(host);
    const log: string[] = [];
    slots.add(instrument('a', log));
    const b = slots.add(instrument('b', log));
    slots.add(instrument('c', log));
    const [a0, , c0] = [...children];
    log.length = 0;

    b.dispose();
    b.remount();

    expect(titles()).toEqual(['a', 'b', 'c']);
    // The same folder objects, never rebuilt: a re-mount that disturbed a
    // neighbour would hand it a new folder, or call its dispose.
    expect(children[0]).toBe(a0);
    expect(children[2]).toBe(c0);
    expect(log).toEqual(['dispose b', 'mount b']);
    expect(b.live).toBe(true);
  });

  it('puts a re-mounted first instrument first and a last one last', () => {
    const { host, titles } = fakeHost();
    const slots = createSlots(host);
    const a = slots.add(instrument('a', []));
    slots.add(instrument('b', []));
    const c = slots.add(instrument('c', []));
    a.dispose();
    c.dispose();
    expect(titles()).toEqual(['b']);
    c.remount();
    a.remount();
    expect(titles()).toEqual(['a', 'b', 'c']);
  });

  it('counts only the instruments that are mounted when it finds its index', () => {
    const { host, titles } = fakeHost();
    const slots = createSlots(host);
    const a = slots.add(instrument('a', []));
    const b = slots.add(instrument('b', []));
    slots.add(instrument('c', []));
    a.dispose();
    b.dispose();
    b.remount();
    expect(titles()).toEqual(['b', 'c']);
    a.remount();
    expect(titles()).toEqual(['a', 'b', 'c']);
  });

  it('mounts a replacement instrument when one is given to a remount', () => {
    const { host, titles } = fakeHost();
    const slots = createSlots(host);
    const log: string[] = [];
    const a = slots.add(instrument('a', log));
    a.dispose();
    a.remount(instrument('a2', log));
    expect(titles()).toEqual(['a2']);
    a.dispose();
    a.remount();
    expect(titles()).toEqual(['a2']);
  });

  it('swaps a live instrument for a replacement in place, disposing the old one first', () => {
    const { host, titles, children } = fakeHost();
    const slots = createSlots(host);
    const log: string[] = [];
    slots.add(instrument('a', log));
    const b = slots.add(instrument('b', log));
    slots.add(instrument('c', log));
    const [a0, , c0] = [...children];
    log.length = 0;
    b.remount(instrument('b2', log));
    expect(log).toEqual(['dispose b', 'mount b2']);
    expect(titles()).toEqual(['a', 'b2', 'c']);
    expect(children[0]).toBe(a0);
    expect(children[2]).toBe(c0);
  });

  it('leaves a live instrument alone on a remount, and ignores a second dispose', () => {
    const { host, titles } = fakeHost();
    const slots = createSlots(host);
    const log: string[] = [];
    const a = slots.add(instrument('a', log));
    a.remount();
    expect(titles()).toEqual(['a']);
    expect(log.filter((line) => line === 'mount a')).toHaveLength(1);
    a.dispose();
    a.dispose();
    expect(log.filter((line) => line === 'dispose a')).toHaveLength(1);
  });

  it('disposes every live instrument, once, on disposeAll', () => {
    const { host, titles, removed } = fakeHost();
    const slots = createSlots(host);
    const log: string[] = [];
    slots.add(instrument('a', log));
    const b = slots.add(instrument('b', log));
    b.dispose();
    log.length = 0;
    slots.disposeAll();
    expect(log).toEqual(['dispose a']);
    expect(titles()).toEqual([]);
    expect(removed.every((f) => f.disposed)).toBe(true);
  });
});

describe('startsExpanded', () => {
  it('collapses the pane at 700px wide or less, and opens it above', () => {
    expect(PANE_NARROW_PX).toBe(700);
    expect(startsExpanded(700)).toBe(false);
    expect(startsExpanded(390)).toBe(false);
    expect(startsExpanded(701)).toBe(true);
    expect(startsExpanded(1280)).toBe(true);
  });
});
