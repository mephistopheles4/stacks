import { describe, expect, it } from 'vitest';
import { createPanelMotion, type MotionPanel } from './motion.ts';

function fakePanel(): MotionPanel & { end(target?: unknown): void; classes: Set<string> } {
  const classes = new Set<string>();
  let listener: ((event: Event) => void) | undefined;
  const panel = {
    hidden: true,
    inert: false,
    classes,
    classList: {
      add: (...names: string[]) => names.forEach((n) => classes.add(n)),
      remove: (...names: string[]) => names.forEach((n) => classes.delete(n)),
      contains: (name: string) => classes.has(name),
    },
    addEventListener: (_type: string, fn: (event: Event) => void) => {
      listener = fn;
    },
    end: (target?: unknown) => listener?.({ target: target ?? panel } as unknown as Event),
  };
  return panel;
}

describe('the panel slides in and out (S7)', () => {
  it('opening shows the panel at once and plays the slide in, which ends when the animation does', () => {
    const panel = fakePanel();
    const motion = createPanelMotion(panel, () => false);
    motion.enter();
    expect(panel.hidden).toBe(false);
    expect(panel.classes.has('is-entering')).toBe(true);
    panel.end();
    expect(panel.classes.has('is-entering')).toBe(false);
    expect(panel.hidden).toBe(false);
  });

  it('closing keeps the panel for the slide out, makes it inert, and hides it when the slide ends', () => {
    const panel = fakePanel();
    const motion = createPanelMotion(panel, () => false);
    motion.enter();
    motion.leave();
    expect(panel.hidden).toBe(false);
    expect(panel.inert).toBe(true);
    expect(panel.classes.has('is-leaving')).toBe(true);
    expect(panel.classes.has('is-entering')).toBe(false);
    panel.end();
    expect(panel.hidden).toBe(true);
    expect(panel.inert).toBe(false);
    expect(panel.classes.has('is-leaving')).toBe(false);
  });

  it('under reduced motion nothing plays: opening and closing take effect in the same call', () => {
    const panel = fakePanel();
    const motion = createPanelMotion(panel, () => true);
    motion.enter();
    expect(panel.hidden).toBe(false);
    expect(panel.classes.size).toBe(0);
    motion.leave();
    expect(panel.hidden).toBe(true);
    expect(panel.inert).toBe(false);
    expect(panel.classes.size).toBe(0);
  });

  it('reads the preference each time, so a change takes effect on the next open or close', () => {
    const panel = fakePanel();
    let reduced = false;
    const motion = createPanelMotion(panel, () => reduced);
    motion.enter();
    reduced = true;
    motion.leave();
    expect(panel.hidden).toBe(true);
  });

  it('reopening during the slide out cancels the close', () => {
    const panel = fakePanel();
    const motion = createPanelMotion(panel, () => false);
    motion.enter();
    motion.leave();
    motion.enter();
    expect(panel.hidden).toBe(false);
    expect(panel.inert).toBe(false);
    expect(panel.classes.has('is-leaving')).toBe(false);
    panel.end();
    expect(panel.hidden).toBe(false);
  });

  it('ignores an animation ending on something inside the panel', () => {
    const panel = fakePanel();
    const motion = createPanelMotion(panel, () => false);
    motion.enter();
    motion.leave();
    panel.end({});
    expect(panel.hidden).toBe(false);
    expect(panel.classes.has('is-leaving')).toBe(true);
  });
});
