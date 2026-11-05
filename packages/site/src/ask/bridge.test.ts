import { describe, expect, it, vi } from 'vitest';
import { announceHeld, onHeld, onPickUpRequest, requestPickUp } from './bridge.ts';

describe('the shelf and drawer seam', () => {
  it('carries a held book to the drawer, by id', () => {
    const target = new EventTarget();
    const seen = vi.fn();
    onHeld(target, seen);
    announceHeld(target, 'co-intelligence');
    expect(seen).toHaveBeenCalledWith('co-intelligence');
  });

  it('carries a pick-up request to the shelf, by id', () => {
    const target = new EventTarget();
    const seen = vi.fn();
    onPickUpRequest(target, seen);
    requestPickUp(target, 'money-unlocked');
    expect(seen).toHaveBeenCalledWith('money-unlocked');
  });

  it('keeps the two directions apart', () => {
    const target = new EventTarget();
    const held = vi.fn();
    const request = vi.fn();
    onHeld(target, held);
    onPickUpRequest(target, request);
    requestPickUp(target, 'a');
    expect(held).not.toHaveBeenCalled();
    announceHeld(target, 'b');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('ignores an event with no string id, and stops after it is unsubscribed', () => {
    const target = new EventTarget();
    const seen = vi.fn();
    const off = onHeld(target, seen);
    target.dispatchEvent(new CustomEvent('stacks:held', { detail: { id: 4 } }));
    target.dispatchEvent(new Event('stacks:held'));
    expect(seen).not.toHaveBeenCalled();
    off();
    announceHeld(target, 'x');
    expect(seen).not.toHaveBeenCalled();
  });
});
