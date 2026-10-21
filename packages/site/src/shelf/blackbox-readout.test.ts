import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blackboxReadout } from './blackbox-readout.ts';
import type { DiagnosticsPort } from './diagnostics.ts';
import { PANE_NARROW_PX, startsExpanded, type Clickable, type FolderSlice } from './pane-slots.ts';

/** A port whose three mutable facts a test can move, and whose calls it records. */
function fakePort(overrides: Partial<{ died: boolean; forgettable: boolean }> = {}) {
  const state = { text: 'live part', forgettable: overrides.forgettable ?? false, held: 0 };
  const calls: string[] = [];
  const port: DiagnosticsPort = {
    text: () => state.text,
    died: overrides.died ?? false,
    copy: () => {
      calls.push('copy');
      return 'copied';
    },
    canForget: () => state.forgettable,
    forget: () => {
      calls.push('forget');
      return 'forgotten';
    },
    claim: () => {
      state.held += 1;
      calls.push('claim');
    },
    release: () => {
      state.held -= 1;
      calls.push('release');
    },
    dispose: () => undefined,
  };
  return { port, state, calls };
}

interface FakeButton extends Clickable {
  title: string;
  hidden: boolean;
  press(): void;
}

/** A folder that keeps the object each binding was given and the buttons it made. */
function fakeFolder() {
  const bindings: { object: Record<string, unknown>; key: string; params: unknown }[] = [];
  const buttons: FakeButton[] = [];
  let refreshes = 0;
  const folder: FolderSlice = {
    addBinding(object, key, params) {
      bindings.push({ object: object as Record<string, unknown>, key, params });
      return { on: () => undefined } as never;
    },
    addFolder: () => {
      throw new Error('unused');
    },
    addButton({ title }) {
      let handler: () => void = () => undefined;
      const button: FakeButton = {
        title,
        hidden: false,
        on(_event, h) {
          handler = h;
          return button;
        },
        press: () => {
          handler();
        },
      };
      buttons.push(button);
      return button;
    },
    addBlade: () => undefined,
    refresh: () => {
      refreshes += 1;
    },
  };
  return { folder, bindings, buttons, refreshes: () => refreshes };
}

describe('the black box readout, as an instrument', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is titled for the black box and opens itself only after a death', () => {
    expect(blackboxReadout(fakePort().port).expanded).toBe(false);
    expect(blackboxReadout(fakePort({ died: true }).port).expanded).toBe(true);
  });

  it('claims the port on mount and releases it on dispose, once each', () => {
    const { port, state } = fakePort();
    const dispose = blackboxReadout(port).mount(fakeFolder().folder);
    expect(state.held).toBe(1);
    dispose();
    expect(state.held).toBe(0);
  });

  it('shows the port text whole as a read-only multiline monitor, and follows it', () => {
    const { port, state } = fakePort();
    const { folder, bindings, refreshes } = fakeFolder();
    const dispose = blackboxReadout(port).mount(folder);

    const monitor = bindings[0];
    expect(monitor?.key).toBe('text');
    expect(monitor?.object['text']).toBe('live part');
    expect(monitor?.params).toMatchObject({ readonly: true, multiline: true });

    state.text = 'live part\n— PREVIOUS SESSION DIED (no clean exit) —';
    vi.advanceTimersByTime(1000);
    expect(monitor?.object['text']).toBe(state.text);
    expect(refreshes()).toBeGreaterThan(0);

    dispose();
    state.text = 'after teardown';
    vi.advanceTimersByTime(5000);
    expect(monitor?.object['text']).not.toBe('after teardown');
  });

  it('runs copy and forget from the folder, and shows the port’s answer on the button', () => {
    const { port, calls } = fakePort({ forgettable: true });
    const { folder, buttons } = fakeFolder();
    blackboxReadout(port).mount(folder);
    const copy = buttons.find((b) => b.title === 'copy');
    const forget = buttons.find((b) => b.title === 'forget');

    copy?.press();
    forget?.press();
    expect(calls).toEqual(['claim', 'copy', 'forget']);
    expect(copy?.title).toBe('copied');
    expect(forget?.title).toBe('forgotten');
  });

  it('shows forget only while the port says a record exists', () => {
    const { port, state } = fakePort({ forgettable: false });
    const { folder, buttons } = fakeFolder();
    blackboxReadout(port).mount(folder);
    const forget = buttons.find((b) => b.title === 'forget');
    expect(forget?.hidden).toBe(true);

    state.forgettable = true;
    vi.advanceTimersByTime(1000);
    expect(forget?.hidden).toBe(false);

    state.forgettable = false;
    vi.advanceTimersByTime(1000);
    expect(forget?.hidden).toBe(true);
  });
});

describe('the pane opens itself after a death, at any width', () => {
  it('starts expanded at a narrow width when the previous session died', () => {
    expect(startsExpanded(PANE_NARROW_PX, true)).toBe(true);
    expect(startsExpanded(320, true)).toBe(true);
    expect(startsExpanded(320, false)).toBe(false);
  });
});
