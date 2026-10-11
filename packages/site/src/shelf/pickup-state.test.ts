import { describe, expect, it } from 'vitest';
import {
  createPickupState,
  type PickupEffects,
  type Track,
  type TrackEvents,
} from './pickup-state.ts';

/** A track whose clock the test drives: `land()` and `returnHome()` end a run. */
interface FakeTrack extends Track {
  readonly book: string;
  readonly events: TrackEvents;
  playing: 'forward' | 'reverse' | 'stopped';
  speed: number;
  at: number;
  disposed: boolean;
  land(): void;
  returnHome(): void;
}

function harness(options: { reduced?: boolean; deferPop?: boolean } = {}) {
  const tracks: FakeTrack[] = [];
  const log: string[] = [];
  /** The history stack, as the page would see it: one state per entry. */
  const entries: (string | null)[] = [null];
  let index = 0;
  /** Steps back taken, and pops a browser has yet to deliver (`deferPop`). */
  let backs = 0;
  let pending = 0;
  /** Books whose cover is closed in the hand, or still easing open again. */
  const closed = new Set<string>();
  /** How often the state asked the view to cut, closed or not. */
  let cuts = 0;

  const effects: PickupEffects<string> = {
    track(book, events) {
      const track: FakeTrack = {
        book,
        events,
        playing: 'stopped',
        speed: 1,
        at: 0,
        disposed: false,
        play() {
          this.playing = 'forward';
          this.speed = 1;
        },
        reverse(speed) {
          this.playing = 'reverse';
          this.speed = speed;
        },
        finish() {
          this.at = 1;
          this.playing = 'stopped';
        },
        rewind() {
          this.at = 0;
          this.playing = 'stopped';
        },
        seek(progress) {
          this.at = progress;
          this.playing = 'stopped';
        },
        progress() {
          return this.at;
        },
        dispose() {
          this.disposed = true;
        },
        land() {
          this.at = 1;
          this.playing = 'stopped';
          events.landed();
        },
        returnHome() {
          this.at = 0;
          this.playing = 'stopped';
          events.returned();
        },
      };
      tracks.push(track);
      return track;
    },
    left: (book) => log.push(`left ${book}`),
    landed: (book) => log.push(`landed ${book}`),
    settled: (book) => log.push(`settled ${book}`),
    announce: (book) => log.push(`announce ${book ?? '-'}`),
    examine: (book) => {
      closed.add(book);
      log.push(`examine ${book}`);
    },
    leave: (book) => log.push(`leave ${book}`),
    cutExamining: (book) => {
      cuts += 1;
      const was = closed.delete(book);
      if (was) log.push(`cut ${book}`);
      return was;
    },
    reduced: () => options.reduced === true,
    returnSpeed: () => 1.6,
    history: {
      held: () => entries[index] !== null,
      push(book) {
        entries.splice(index + 1);
        entries.push(book);
        index += 1;
      },
      replace(book) {
        entries[index] = book;
      },
      back() {
        backs += 1;
        // The browser moves the entry and fires popstate as a task, after the
        // caller returns: `deferPop` holds both until `deliverPops`, the window
        // a double click lands in.
        if (options.deferPop === true) {
          pending += 1;
          return;
        }
        index -= 1;
        state.popped();
      },
    },
  };

  const state = createPickupState(effects);
  const track = (book: string): FakeTrack => {
    const found = tracks.findLast((t) => t.book === book);
    if (found === undefined) throw new Error(`no track for ${book}`);
    return found;
  };
  /** The browser's back button: the entry moves, then popstate fires. */
  const pressBack = (): void => {
    index -= 1;
    state.popped();
  };
  /** The browser's forward button: onto the next entry, then popstate. */
  const pressForward = (): void => {
    index += 1;
    state.popped();
  };
  /** Each step back the page asked for lands, one popstate apiece. */
  const deliverPops = (): void => {
    for (; pending > 0; pending -= 1) {
      index -= 1;
      state.popped();
    }
  };
  /** Another script replaced the current entry: the pickup's is no longer current. */
  const replaceEntry = (): void => {
    entries[index] = null;
  };
  return {
    state,
    tracks,
    track,
    log,
    pressBack,
    pressForward,
    deliverPops,
    replaceEntry,
    /** The easing back open finished: nothing is closed any more. */
    finishLeave: (book: string): void => {
      closed.delete(book);
    },
    closed: () => [...closed],
    cutCalls: () => cuts,
    backs: () => backs,
    entries: () => entries.slice(0, index + 1),
  };
}

describe('picking a book up', () => {
  it('plays the book out of the shelf and pushes one history entry with no address change', () => {
    const h = harness();
    h.state.select('a');

    expect(h.track('a').playing).toBe('forward');
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'lifting' });
    expect(h.entries()).toEqual([null, 'a']);
    expect(h.log).toEqual(['left a', 'announce a']);

    h.track('a').land();
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held' });
    expect(h.log.at(-1)).toBe('landed a');
  });

  it('does nothing when the book in hand is clicked again', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    const logged = h.log.length;
    h.state.select('a');

    expect(h.tracks).toHaveLength(1);
    expect(h.entries()).toEqual([null, 'a']);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held' });
    expect(h.track('a').playing).toBe('stopped');
    expect(h.log).toHaveLength(logged);
  });

  it('cuts straight to open under reduced motion, and straight back', () => {
    const h = harness({ reduced: true });
    h.state.select('a');

    expect(h.track('a').at).toBe(1);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held' });
    expect(h.log).toEqual(['left a', 'announce a', 'landed a']);

    h.state.putBack();
    expect(h.track('a').at).toBe(0);
    expect(h.state.holding()).toBeUndefined();
    expect(h.log.slice(-2)).toEqual(['announce -', 'settled a']);
    expect(h.entries()).toEqual([null]);
  });
});

describe('putting it back', () => {
  it('goes through history, so Escape, empty space and the back button leave it as it was', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.putBack();

    expect(h.entries()).toEqual([null]);
    expect(h.track('a').playing).toBe('reverse');
    expect(h.track('a').speed).toBe(1.6);
    expect(h.state.holding()).toBeUndefined();

    h.track('a').returnHome();
    expect(h.log.slice(-2)).toEqual(['announce -', 'settled a']);
    expect(h.track('a').disposed).toBe(true);
  });

  it('puts the book back on the back button alone', () => {
    const h = harness();
    h.state.select('a');
    h.pressBack();

    expect(h.track('a').playing).toBe('reverse');
    expect(h.entries()).toEqual([null]);
  });

  it('ignores a put-back with nothing in hand', () => {
    const h = harness();
    h.state.putBack();
    h.state.select(undefined);

    expect(h.entries()).toEqual([null]);
    expect(h.log).toEqual([]);
  });

  it('plays a book forward again when it is clicked on its way back', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.putBack();
    h.state.select('a');

    expect(h.tracks).toHaveLength(1);
    expect(h.track('a').playing).toBe('forward');
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'lifting' });
    expect(h.entries()).toEqual([null, 'a']);
    expect(h.log.at(-1)).toBe('announce a');
  });

  it('leaves history alone on a lost context with nothing in hand', () => {
    const h = harness();
    // A stale pickup entry, as the forward button can leave current, with no
    // book moving: a rebuild must not send the visitor back off it.
    h.state.select('a');
    h.track('a').land();
    h.pressBack();
    h.track('a').returnHome();
    h.pressForward();
    const before = h.entries();
    expect(before).toEqual([null, 'a']);
    h.state.drop();

    expect(h.entries()).toEqual(before);
  });

  it('puts every book in flight back when the context is lost, at once', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.drop();

    expect(h.state.holding()).toBeUndefined();
    expect(h.track('a').disposed).toBe(true);
    expect(h.entries()).toEqual([null]);
    // A hard cut: rewound to the shelf, never played back.
    expect(h.track('a').at).toBe(0);
    expect(h.track('a').playing).toBe('stopped');
    expect(h.log.slice(-2)).toEqual(['settled a', 'announce -']);
  });

  it('steps back once for a double put-back, however fast the second arrives', () => {
    const h = harness({ deferPop: true });
    h.state.select('a');
    h.track('a').land();
    h.state.putBack();
    h.state.putBack();
    h.deliverPops();

    expect(h.backs()).toBe(1);
    expect(h.entries()).toEqual([null]);
    expect(h.track('a').playing).toBe('reverse');
  });

  it('puts back without stepping back when the pickup entry is no longer current', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.replaceEntry();
    h.state.putBack();

    expect(h.backs()).toBe(0);
    expect(h.entries()).toEqual([null, null]);
    expect(h.track('a').playing).toBe('reverse');
  });

  it('drops without stepping back when the pickup entry is no longer current', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.replaceEntry();
    h.state.drop();

    expect(h.backs()).toBe(0);
    expect(h.entries()).toEqual([null, null]);
    expect(h.state.holding()).toBeUndefined();
  });
});

describe('another book', () => {
  it('puts the first back, then picks the second up, keeping one history entry', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.select('b');

    expect(h.track('a').playing).toBe('reverse');
    expect(h.tracks).toHaveLength(1);

    h.track('a').returnHome();
    expect(h.track('b').playing).toBe('forward');
    expect(h.state.holding()).toEqual({ book: 'b', phase: 'lifting' });
    expect(h.entries()).toEqual([null, 'b']);
    // Cleared as the first goes back, which a live region reads as nothing, then
    // the second: a swap is announced once, by the book it ends on.
    expect(h.log.filter((line) => line.startsWith('announce'))).toEqual([
      'announce a',
      'announce -',
      'announce b',
    ]);
  });

  it('takes the latest click when several land while the first goes back', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.select('b');
    h.state.select('c');
    h.track('a').returnHome();

    expect(h.tracks.map((t) => t.book)).toEqual(['a', 'c']);
  });

  it('starts at once while another book is still returning', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.putBack();
    h.state.select('b');

    expect(h.track('a').playing).toBe('reverse');
    expect(h.track('b').playing).toBe('forward');
    expect(h.entries()).toEqual([null, 'b']);
  });

  it('cancels a queued pickup when the back button goes first', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.select('b');
    h.pressBack();
    h.track('a').returnHome();

    expect(h.tracks.map((t) => t.book)).toEqual(['a']);
    expect(h.entries()).toEqual([null]);
  });
});

describe('the tuner', () => {
  it('scrubs and reads back the book in hand', () => {
    const h = harness();
    h.state.select('a');
    h.state.scrub(0.4);

    expect(h.track('a').at).toBe(0.4);
    expect(h.track('a').playing).toBe('stopped');
    expect(h.state.current()?.progress()).toBe(0.4);
  });

  it('rebuilds the tracks in place, keeping each one where it was', () => {
    const h = harness();
    h.state.select('a');
    h.state.scrub(0.4);
    h.state.retime();

    expect(h.tracks).toHaveLength(2);
    expect(h.tracks[0]?.disposed).toBe(true);
    expect(h.track('a').at).toBe(0.4);
  });
});

describe('examining the held book (#418)', () => {
  const held = (options: { reduced?: boolean } = {}) => {
    const h = harness(options);
    h.state.select('a');
    h.track('a').land();
    return h;
  };

  it('closes the book in the hand, which stays held', () => {
    const h = held();
    expect(h.state.examine()).toBe(true);

    expect(h.log.at(-1)).toBe('examine a');
    expect(h.state.examining()).toBe(true);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held' });
    // Its own tween: the pickup's track is not touched, so its turn stays turned.
    expect(h.track('a').at).toBe(1);
    expect(h.track('a').playing).toBe('stopped');
    expect(h.entries()).toEqual([null, 'a']);
  });

  it('is accepted only while a book is held, not while it lifts or with an empty hand', () => {
    const h = harness();
    expect(h.state.examine()).toBe(false);
    h.state.select('a');
    expect(h.state.examine()).toBe(false);
    expect(h.state.examining()).toBe(false);
    expect(h.log).not.toContain('examine a');
  });

  it('is accepted once, not twice', () => {
    const h = held();
    h.state.examine();
    expect(h.state.examine()).toBe(false);
    expect(h.log.filter((line) => line === 'examine a')).toHaveLength(1);
  });

  it('leaves one level: the book opens again at its page and is still held', () => {
    const h = held();
    h.state.examine();
    expect(h.state.leave()).toBe(true);

    expect(h.log.at(-1)).toBe('leave a');
    expect(h.state.examining()).toBe(false);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held' });
    expect(h.entries()).toEqual([null, 'a']);
  });

  it('ignores a leave when the book is not being examined', () => {
    const h = held();
    expect(h.state.leave()).toBe(false);
    expect(h.log.at(-1)).toBe('landed a');
  });

  it('can be examined again after leaving', () => {
    const h = held();
    h.state.examine();
    h.state.leave();
    h.finishLeave('a');
    expect(h.state.examine()).toBe(true);
  });

  it('puts the book back as a cut when the back button comes during examining', () => {
    const h = held();
    h.state.examine();
    h.pressBack();

    // Reversing the track from its end would draw the book open before it went.
    expect(h.track('a').playing).toBe('stopped');
    expect(h.track('a').at).toBe(0);
    expect(h.log.slice(-3)).toEqual(['cut a', 'announce -', 'settled a']);
    expect(h.state.holding()).toBeUndefined();
    expect(h.state.examining()).toBe(false);
    expect(h.entries()).toEqual([null]);
  });

  it('cuts on a put-back through the control or the shelf hook, too', () => {
    const h = held();
    h.state.examine();
    h.state.putBack();

    expect(h.track('a').at).toBe(0);
    expect(h.track('a').disposed).toBe(true);
    expect(h.closed()).toEqual([]);
    expect(h.state.holding()).toBeUndefined();
  });

  it('cuts when the context is lost, and the book is closed no more', () => {
    const h = held();
    h.state.examine();
    h.state.drop();

    expect(h.log).toContain('cut a');
    expect(h.closed()).toEqual([]);
    expect(h.state.examining()).toBe(false);
    expect(h.state.holding()).toBeUndefined();
  });

  it('cuts when another book is picked up while this one is closed', () => {
    const h = held();
    h.state.examine();
    h.state.select('b');

    expect(h.log).toContain('cut a');
    expect(h.closed()).toEqual([]);
    expect(h.track('a').at).toBe(0);
  });

  it('cuts a put-back that comes while the book is still easing open', () => {
    const h = held();
    h.state.examine();
    h.state.leave();
    // The effects are still easing it open when the back button lands.
    h.pressBack();

    expect(h.log).toContain('cut a');
    expect(h.track('a').playing).toBe('stopped');
    expect(h.track('a').at).toBe(0);
  });

  it('reverses as it always did once the book is open and at rest', () => {
    const h = held();
    h.state.examine();
    h.state.leave();
    h.finishLeave('a');
    h.state.putBack();

    expect(h.log).not.toContain('cut a');
    expect(h.track('a').playing).toBe('reverse');
  });

  it('ignores a leave with nothing in hand', () => {
    const h = harness();
    expect(h.state.leave()).toBe(false);
    expect(h.state.examining()).toBe(false);
  });

  it('asks nothing of the view when a book never examined is dropped or put back', () => {
    const h = held();
    h.state.drop();
    expect(h.cutCalls()).toBe(0);
    const again = held();
    again.state.putBack();
    expect(again.cutCalls()).toBe(0);
  });

  it('calls no examine effect on a book that was never closed', () => {
    const h = held();
    h.state.putBack();
    expect(h.log.some((line) => line.startsWith('cut') || line.startsWith('leave'))).toBe(false);
  });
});
