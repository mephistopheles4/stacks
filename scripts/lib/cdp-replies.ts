/**
 * Which outstanding DevTools request a reply answers, for `phone-check.ts`.
 *
 * Chrome's DevTools protocol numbers each request, and a reply carries the
 * number back. The reply arrives over a socket, so its `id` is whatever the
 * other end sent: **it is compared against the numbers this side handed out,
 * and never used to look one up.** A `Map#get` keyed by it would return only a
 * function this side stored or `undefined` — but CodeQL's
 * `js/unvalidated-dynamic-method-call` models any `Map#get` with a remote key
 * as possibly returning a non-function, and calls the result a dynamic method
 * call. Walking the waiting requests and comparing gives that query no path
 * from the socket to the function called, rather than a guard it has to
 * recognise.
 *
 * The walk is over requests in flight, which is one: `phone-check.ts` awaits
 * each request before sending the next. More than one still works, each
 * reply settling its own.
 */

export interface Replies<M extends { readonly id?: unknown }> {
  /** Waits for the reply to request `id`, which `settle` hands to `resolve`. */
  track(id: number, resolve: (message: M) => void): void;
  /**
   * Hands `message` to the request its `id` answers. False, and nothing is
   * called, when no request waiting here has that id: a reply that came after
   * its request timed out, or one to a request this side never sent.
   */
  settle(message: M): boolean;
  /** Stops waiting for `id`. False when it was not waiting — already answered. */
  abandon(id: number): boolean;
}

export function replies<M extends { readonly id?: unknown }>(): Replies<M> {
  const waiting = new Map<number, (message: M) => void>();
  return {
    track: (id, resolve) => {
      waiting.set(id, resolve);
    },
    settle: (message) => {
      for (const [id, resolve] of waiting) {
        if (id !== message.id) continue;
        waiting.delete(id);
        resolve(message);
        return true;
      }
      return false;
    },
    abandon: (id) => waiting.delete(id),
  };
}
