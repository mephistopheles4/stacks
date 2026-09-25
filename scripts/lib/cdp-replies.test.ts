/**
 * Which outstanding DevTools request a reply answers.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row, for the
 * reason `vitest.config.ts` records about `scripts/`. `phone-check.ts` needs a
 * phone to run at all, so this is the only place its reply matching runs
 * without one.
 */

import { describe, expect, it } from 'vitest';
import { replies } from './cdp-replies.ts';

interface Reply {
  readonly id?: unknown;
  readonly result?: string;
}

/** A tracked request's answers, in the order they arrived. */
function recorder(): { readonly answers: Reply[]; readonly resolve: (reply: Reply) => void } {
  const answers: Reply[] = [];
  return {
    answers,
    resolve: (reply) => {
      answers.push(reply);
    },
  };
}

describe('replies — a reply settles the request it names', () => {
  it('hands a reply to the request with its id, once', () => {
    const pending = replies<Reply>();
    const first = recorder();
    pending.track(1, first.resolve);

    expect(pending.settle({ id: 1, result: 'a' })).toBe(true);
    expect(pending.settle({ id: 1, result: 'again' })).toBe(false);
    expect(first.answers).toEqual([{ id: 1, result: 'a' }]);
  });

  it('settles requests in flight together by id, whatever order the replies come in', () => {
    const pending = replies<Reply>();
    const first = recorder();
    const second = recorder();
    pending.track(1, first.resolve);
    pending.track(2, second.resolve);

    pending.settle({ id: 2, result: 'b' });
    pending.settle({ id: 1, result: 'a' });
    expect(first.answers).toEqual([{ id: 1, result: 'a' }]);
    expect(second.answers).toEqual([{ id: 2, result: 'b' }]);
  });
});

describe('replies — what settles nothing', () => {
  it('drops a reply that came after its request was abandoned', () => {
    const pending = replies<Reply>();
    const timedOut = recorder();
    pending.track(1, timedOut.resolve);

    expect(pending.abandon(1)).toBe(true);
    expect(pending.settle({ id: 1, result: 'late' })).toBe(false);
    expect(timedOut.answers).toEqual([]);
  });

  it('reports an abandon after the answer as nothing to abandon', () => {
    const pending = replies<Reply>();
    pending.track(1, recorder().resolve);
    pending.settle({ id: 1 });
    expect(pending.abandon(1)).toBe(false);
  });

  it.each([
    ['an id this side never sent', 7],
    ['the right number spelled as a string', '1'],
    ['a name only an inherited property has', 'constructor'],
    ['no id at all', undefined],
  ])('calls nothing for %s', (_name, id) => {
    const pending = replies<Reply>();
    const waiting = recorder();
    pending.track(1, waiting.resolve);

    expect(pending.settle({ id })).toBe(false);
    expect(waiting.answers).toEqual([]);
    // Still waiting: the stray reply took nothing with it.
    expect(pending.settle({ id: 1 })).toBe(true);
  });
});
