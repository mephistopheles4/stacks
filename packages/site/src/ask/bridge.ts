/**
 * The seam between the shelf and the Ask the library drawer
 * (docs/spec/ask-the-library.md S7, S8): two DOM events and nothing else, so
 * neither side imports the other's logic.
 *
 * - `stacks:held` goes from the shelf when a book is picked up, from any source.
 *   The drawer closes on it: a signal, not a timer.
 * - `stacks:pick-up` goes from the drawer when a visitor clicks a book's link.
 *   The shelf picks that book up by id.
 */

export const HELD_EVENT = 'stacks:held';
export const PICK_UP_EVENT = 'stacks:pick-up';

interface IdDetail {
  readonly id: string;
}

export function announceHeld(target: EventTarget, id: string): void {
  target.dispatchEvent(new CustomEvent<IdDetail>(HELD_EVENT, { detail: { id } }));
}

export function requestPickUp(target: EventTarget, id: string): void {
  target.dispatchEvent(new CustomEvent<IdDetail>(PICK_UP_EVENT, { detail: { id } }));
}

function listen(target: EventTarget, name: string, handler: (id: string) => void): () => void {
  const listener = (event: Event): void => {
    const id = (event as CustomEvent<IdDetail | undefined>).detail?.id;
    if (typeof id === 'string') handler(id);
  };
  target.addEventListener(name, listener);
  return () => {
    target.removeEventListener(name, listener);
  };
}

export const onHeld = (target: EventTarget, handler: (id: string) => void): (() => void) =>
  listen(target, HELD_EVENT, handler);

export const onPickUpRequest = (target: EventTarget, handler: (id: string) => void): (() => void) =>
  listen(target, PICK_UP_EVENT, handler);
