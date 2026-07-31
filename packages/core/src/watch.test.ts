import { describe, expect, it, vi } from 'vitest';
import { isRebuildTrigger, watchVault, type Closeable } from './watch.ts';

describe('isRebuildTrigger', () => {
  it('fires for notes and cover art', () => {
    expect(isRebuildTrigger('Library/The Tidal Engine.md')).toBe(true);
    expect(isRebuildTrigger('Library\\covers\\thing.jpg')).toBe(true);
    expect(isRebuildTrigger('Library/covers/thing.PNG')).toBe(true);
  });

  it('ignores Obsidian’s own directories', () => {
    // .obsidian/ changes on every pane resize and plugin tick — watching it
    // would keep the vault permanently "busy" and rebuild forever.
    expect(isRebuildTrigger('.obsidian/workspace.json')).toBe(false);
    expect(isRebuildTrigger('.obsidian/plugins/x/data.md')).toBe(false);
    expect(isRebuildTrigger('.trash/Deleted.md')).toBe(false);
    expect(isRebuildTrigger('.git/COMMIT_EDITMSG')).toBe(false);
  });

  it('ignores everything that is not a note or a cover', () => {
    expect(isRebuildTrigger('Scratches/Library Export.json')).toBe(false);
    expect(isRebuildTrigger(null)).toBe(false);
    expect(isRebuildTrigger('')).toBe(false);
  });
});

/** Drives the watcher by hand so the tests need no files and no real clock. */
function fakeWatcher() {
  let emit: ((filename: string | null) => void) | undefined;
  let closed = false;
  return {
    factory: (_path: string, listener: (filename: string | null) => void): Closeable => {
      emit = listener;
      return { close: () => (closed = true) };
    },
    change: (filename = 'Library/A.md') => emit?.(filename),
    get closed() {
      return closed;
    },
  };
}

describe('watchVault', () => {
  it('collapses a burst of saves into one rebuild', async () => {
    vi.useFakeTimers();
    const watcher = fakeWatcher();
    const onChange = vi.fn();

    watchVault('/vault', onChange, { debounceMs: 500, watcher: watcher.factory });

    // Obsidian autosaves while you type; without debouncing one sentence would
    // rebuild dozens of times.
    for (let i = 0; i < 10; i += 1) {
      watcher.change();
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not rebuild for an uninteresting file', async () => {
    vi.useFakeTimers();
    const watcher = fakeWatcher();
    const onChange = vi.fn();

    watchVault('/vault', onChange, { debounceMs: 100, watcher: watcher.factory });
    watcher.change('.obsidian/workspace.json');
    await vi.advanceTimersByTimeAsync(500);

    expect(onChange).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('never runs two rebuilds at once, and picks up a change that arrived mid-run', async () => {
    vi.useFakeTimers();
    const watcher = fakeWatcher();

    let running = 0;
    let overlapped = false;
    const onChange = vi.fn(async () => {
      running += 1;
      if (running > 1) overlapped = true;
      await new Promise((r) => setTimeout(r, 300));
      running -= 1;
    });

    watchVault('/vault', onChange, { debounceMs: 100, watcher: watcher.factory });

    watcher.change();
    await vi.advanceTimersByTimeAsync(100);
    // A save lands while the first rebuild is still going.
    watcher.change();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1000);

    expect(overlapped).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('stops watching when closed', () => {
    const watcher = fakeWatcher();
    const handle = watchVault('/vault', vi.fn(), { watcher: watcher.factory });
    handle.close();
    expect(watcher.closed).toBe(true);
  });
});
