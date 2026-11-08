import { describe, expect, it } from 'vitest';
import {
  createPickupState,
  type PickupEffects,
  type Track,
  type TrackEvents,
} from './pickup-state.ts';

/** Where the fake track rests closed, as a fraction of its run. */
const CLOSED = 0.6;

/**
 * A track whose clock the test drives: `land()` reaches the closed rest,
 * `openUp()` the end, and `returnHome()` the shelf.
 */
interface FakeTrack extends Track {
  readonly book: string;
  readonly events: TrackEvents;
  playing: 'forward' | 'reverse' | 'closing' | 'stopped';
  speed: number;
  at: number;
  disposed: boolean;
  land(): void;
  openUp(): void;
  /** The close reaches the closed rest and holds there. */
  closeDown(): void;
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
        close() {
          this.playing = 'closing';
          this.speed = 1;
        },
        finish() {
          // A hair past the stop, as the real track parks it (`REST_PAST_STOP`).
          this.at = CLOSED + 1e-5;
          this.playing = 'stopped';
        },
        atClosedRest() {
          return Math.abs(this.at - CLOSED) <= 1e-4;
        },
        atEnd() {
          return this.at >= 1;
        },
        finishOpen() {
          this.at = 1;
          this.playing = 'stopped';
        },
        closedProgress: () => CLOSED,
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
          this.at = CLOSED;
          this.playing = 'stopped';
          events.landed();
        },
        openUp() {
          this.at = 1;
          this.playing = 'stopped';
          events.opened();
        },
        closeDown() {
          this.at = CLOSED + 1e-5;
          this.playing = 'stopped';
          events.closed();
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
    opening: (book) => log.push(`opening ${book}`),
    opened: (book) => log.push(`opened ${book}`),
    settled: (book) => log.push(`settled ${book}`),
    announce: (book) => log.push(`announce ${book ?? '-'}`),
    closing: (book) => log.push(`closing ${book}`),
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
    backs: () => backs,
    entries: () => entries.slice(0, index + 1),
  };
}

describe('picking a book up', () => {
  it('plays the book out of the shelf and pushes one history entry with no address change', () => {
    const h = harness();
    h.state.select('a');

    expect(h.track('a').playing).toBe('forward');
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'lifting', opened: false });
    expect(h.entries()).toEqual([null, 'a']);
    expect(h.log).toEqual(['left a', 'announce a']);

    h.track('a').land();
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
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
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
    expect(h.track('a').playing).toBe('stopped');
    expect(h.log).toHaveLength(logged);
  });

  it('cuts to closed under reduced motion, then to open when opened, and straight back', () => {
    const h = harness({ reduced: true });
    h.state.select('a');

    expect(h.track('a').at).toBeCloseTo(CLOSED, 3);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
    expect(h.log).toEqual(['left a', 'announce a', 'landed a']);

    expect(h.state.open()).toBe(true);
    expect(h.track('a').at).toBe(1);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });
    // A cut has no opening to play: the effect for it never runs.
    expect(h.log.slice(3)).toEqual(['opened a']);

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

  it('lands a book at once when it is caught before its reverse has moved', () => {
    // Put back from the closed rest and clicked again within a frame: it is still
    // on the rest, so playing forward would carry it on through the stop and open it.
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.putBack();
    h.state.select('a');

    expect(h.tracks).toHaveLength(1);
    expect(h.track('a').playing).toBe('stopped');
    expect(h.track('a').at).toBeCloseTo(CLOSED, 3);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
    expect(h.state.closed()).toBe(true);
    expect(h.log.slice(-2)).toEqual(['announce a', 'landed a']);
    expect(h.entries()).toEqual([null, 'a']);
  });

  it('lands it again on a second catch, from the rest the first catch parked it on', () => {
    // The jump parks a hair past the stop, so a second put-back and catch inside a
    // frame must still read it as on the rest, and not play it on through the stop.
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.putBack();
    h.state.select('a');
    h.state.putBack();
    h.state.select('a');

    expect(h.track('a').playing).toBe('stopped');
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
    expect(h.state.closed()).toBe(true);
    expect(h.log.filter((line) => line === 'landed a')).toHaveLength(3);
  });

  it('is open again when an open book is caught before its reverse has moved', () => {
    // Playing forward from the far end fires nothing, so the book would stay in
    // the lift for ever, with no Open button, until put back again.
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.open();
    h.track('a').openUp();
    h.state.putBack();
    h.state.select('a');

    expect(h.track('a').playing).toBe('stopped');
    expect(h.track('a').at).toBe(1);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });
    expect(h.log.at(-1)).toBe('opened a');
    expect(h.entries()).toEqual([null, 'a']);
  });

  it('plays a book forward again when it is clicked on its way back', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.putBack();
    // A frame of the reverse: it has left the rest.
    h.track('a').at = 0.3;
    h.state.select('a');

    expect(h.tracks).toHaveLength(1);
    expect(h.track('a').playing).toBe('forward');
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'lifting', opened: false });
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
    expect(h.state.holding()).toEqual({ book: 'b', phase: 'lifting', opened: false });
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

describe('opening the closed book (#531)', () => {
  const closedBook = (options: { reduced?: boolean } = {}) => {
    const h = harness(options);
    h.state.select('a');
    h.track('a').land();
    return h;
  };

  it('is not closed at rest while it lifts, opens, is open, or goes back', () => {
    const h = harness();
    expect(h.state.closed()).toBe(false);
    h.state.select('a');
    expect(h.state.closed()).toBe(false);
    h.track('a').land();
    expect(h.state.closed()).toBe(true);
    h.state.open();
    expect(h.state.closed()).toBe(false);
    h.track('a').openUp();
    expect(h.state.closed()).toBe(false);
    h.state.putBack();
    expect(h.state.closed()).toBe(false);
  });

  it('plays on from the rest and is open at its end, one opening at a time', () => {
    const h = closedBook();

    expect(h.state.open()).toBe(true);
    expect(h.track('a').playing).toBe('forward');
    expect(h.log.slice(-1)).toEqual(['opening a']);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
    // Opening already: a second press does nothing.
    expect(h.state.open()).toBe(false);
    expect(h.log.filter((line) => line === 'opening a')).toHaveLength(1);

    h.track('a').openUp();
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });
    expect(h.log.at(-1)).toBe('opened a');
    expect(h.state.open()).toBe(false);
  });

  it('opens only a book closed at rest', () => {
    const h = harness();
    expect(h.state.open()).toBe(false);
    h.state.select('a');
    expect(h.state.open()).toBe(false);
    expect(h.track('a').playing).toBe('forward');
    expect(h.log).not.toContain('opening a');
  });

  describe('the shelf click', () => {
    it('opens the book in hand when it is clicked', () => {
      const h = closedBook();
      h.state.clicked('a', false);

      expect(h.log.at(-1)).toBe('opening a');
      expect(h.track('a').playing).toBe('forward');
    });

    it('does nothing to a book that is lifting or opening when it is clicked', () => {
      const h = harness();
      h.state.select('a');
      h.state.clicked('a', false);
      expect(h.log).not.toContain('opening a');
      h.track('a').land();
      h.state.clicked('a', false);
      const logged = h.log.length;
      h.state.clicked('a', false);

      expect(h.log).toHaveLength(logged);
    });

    it('does nothing to an open book when it is clicked', () => {
      const h = closedBook();
      h.state.open();
      h.track('a').openUp();
      const logged = h.log.length;
      h.state.clicked('a', false);

      expect(h.log).toHaveLength(logged);
      expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });
    });

    it('swaps when another book is clicked, and the new one arrives closed', () => {
      const h = closedBook();
      h.state.open();
      h.track('a').openUp();
      h.state.clicked('b', false);
      h.track('a').returnHome();
      h.track('b').land();

      expect(h.state.holding()).toEqual({ book: 'b', phase: 'held', opened: false });
      expect(h.entries()).toEqual([null, 'b']);
    });

    it('puts the book back on a click on empty space, closed or open', () => {
      const closed = closedBook();
      closed.state.clicked(undefined, false);
      expect(closed.track('a').playing).toBe('reverse');
      expect(closed.entries()).toEqual([null]);

      const open = closedBook();
      open.state.open();
      open.track('a').openUp();
      open.state.clicked(undefined, false);
      expect(open.track('a').playing).toBe('reverse');
      expect(open.entries()).toEqual([null]);
    });

    it('ignores a click the drawer took while a book is in hand, whatever it was on', () => {
      const h = closedBook();
      h.state.clicked('a', true);
      h.state.clicked('b', true);
      h.state.clicked(undefined, true);

      expect(h.log).not.toContain('opening a');
      expect(h.tracks).toHaveLength(1);
      expect(h.track('a').playing).toBe('stopped');
      expect(h.entries()).toEqual([null, 'a']);
    });

    it('still picks up with an empty hand when the drawer took the click', () => {
      const h = harness();
      h.state.clicked('a', true);

      expect(h.track('a').playing).toBe('forward');
      expect(h.entries()).toEqual([null, 'a']);
    });
  });

  describe('a book caught on its way back', () => {
    it('lands closed and opens again, after a reverse from open', () => {
      const h = closedBook();
      h.state.open();
      h.track('a').openUp();
      h.state.putBack();
      // Reversed past the closed rest by a few frames, then clicked: forward again.
      h.track('a').at = 0.4;
      h.state.select('a');
      expect(h.track('a').playing).toBe('forward');
      h.track('a').land();

      expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
      h.state.clicked('a', false);
      h.track('a').openUp();
      expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });
    });

    it('lands closed and opens again, after a reverse begun during the opening', () => {
      const h = closedBook();
      h.state.open();
      h.state.putBack();
      h.state.select('a');
      h.track('a').land();

      expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
      expect(h.state.closed()).toBe(true);
      expect(h.state.open()).toBe(true);
      h.track('a').openUp();
      expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });
    });

    it('is open at the end of a catch inside the opening stage, which never lands', () => {
      const h = closedBook();
      h.state.open();
      h.track('a').openUp();
      h.state.putBack();
      // A few frames of the reverse: back inside the opening stage, short of the rest.
      h.track('a').at = 0.8;
      h.state.select('a');
      h.track('a').openUp();

      expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });
      expect(h.log.filter((line) => line === 'landed a')).toHaveLength(1);
      expect(h.log.at(-1)).toBe('opened a');
    });
  });

  describe('putting it back', () => {
    it('reverses once from closed and from open, at the same speed', () => {
      const closed = closedBook();
      closed.state.putBack();
      const open = closedBook();
      open.state.open();
      open.track('a').openUp();
      open.state.putBack();

      for (const h of [closed, open]) {
        expect(h.track('a').playing).toBe('reverse');
        expect(h.track('a').speed).toBe(1.6);
        expect(h.entries()).toEqual([null]);
      }
    });

    it('puts a book back from the middle of the opening', () => {
      const h = closedBook();
      h.state.open();
      h.state.putBack();

      expect(h.track('a').playing).toBe('reverse');
      expect(h.state.holding()).toBeUndefined();
    });
  });
});

describe('closing the open book again (#553)', () => {
  /** A book open at rest in the hand: only that can be closed. */
  const open = (options: { reduced?: boolean } = {}) => {
    const h = harness(options);
    h.state.select('a');
    h.track('a').land();
    h.state.open();
    h.track('a').openUp();
    return h;
  };

  it('runs the track back to the closed rest, where it is as a pickup lands it', () => {
    const h = open();
    expect(h.state.close()).toBe(true);

    expect(h.log.at(-1)).toBe('closing a');
    expect(h.track('a').playing).toBe('closing');
    expect(h.state.closed()).toBe(false);
    h.track('a').closeDown();

    expect(h.log.at(-1)).toBe('landed a');
    expect(h.state.closed()).toBe(true);
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
    expect(h.entries()).toEqual([null, 'a']);
  });

  it('is accepted only while a book is open at rest', () => {
    const h = harness();
    expect(h.state.close()).toBe(false);
    h.state.select('a');
    expect(h.state.close()).toBe(false);
    h.track('a').land();
    expect(h.state.close()).toBe(false);
    h.state.open();
    expect(h.state.close()).toBe(false);
    expect(h.log).not.toContain('closing a');
    h.track('a').openUp();
    expect(h.state.close()).toBe(true);
    expect(h.state.close()).toBe(false);
    expect(h.log.filter((line) => line === 'closing a')).toHaveLength(1);
  });

  it('ignores a tap on the book, or Open, until the close has finished', () => {
    const h = open();
    h.state.close();
    h.state.clicked('a', false);

    expect(h.state.open()).toBe(false);
    expect(h.track('a').playing).toBe('closing');
    // Once, from the open that came before the close: the tap opened nothing.
    expect(h.log.filter((line) => line === 'opening a')).toHaveLength(1);
    h.track('a').closeDown();
    expect(h.state.open()).toBe(true);
    expect(h.track('a').playing).toBe('forward');
  });

  it('opens again from the rest a close left it on', () => {
    const h = open();
    h.state.close();
    h.track('a').closeDown();
    h.state.clicked('a', false);
    h.track('a').openUp();

    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: true });
  });

  it('puts the book back with the normal return when it comes during a close', () => {
    const h = open();
    h.state.close();
    h.pressBack();

    expect(h.track('a').playing).toBe('reverse');
    expect(h.track('a').speed).toBe(1.6);
    expect(h.state.holding()).toBeUndefined();
    // Caught a few frames into the return: it lands closed, and opens again.
    h.track('a').at = 0.4;
    h.state.select('a');
    h.track('a').land();
    expect(h.state.holding()).toEqual({ book: 'a', phase: 'held', opened: false });
    expect(h.state.closed()).toBe(true);
    expect(h.state.open()).toBe(true);
    h.state.putBack();
    h.track('a').returnHome();
    expect(h.log.filter((line) => line === 'settled a')).toHaveLength(1);
    expect(h.entries()).toEqual([null]);
  });

  it('plays the normal return when put back from the rest a close left it on', () => {
    const h = open();
    h.state.close();
    h.track('a').closeDown();
    h.state.putBack();

    expect(h.track('a').playing).toBe('reverse');
    expect(h.track('a').disposed).toBe(false);
  });

  it('swaps for another book with the normal return during a close', () => {
    const h = open();
    h.state.close();
    h.state.select('b');

    expect(h.track('a').playing).toBe('reverse');
    h.track('a').returnHome();
    expect(h.log).toContain('left b');
  });

  it('cuts to the closed rest under reduced motion', () => {
    const h = open({ reduced: true });
    expect(h.state.close()).toBe(true);

    expect(h.track('a').playing).toBe('stopped');
    expect(h.track('a').atClosedRest()).toBe(true);
    expect(h.state.closed()).toBe(true);
    expect(h.log.slice(-2)).toEqual(['closing a', 'landed a']);
  });

  it('lands at the closed rest when retimed partway through a close', () => {
    const h = open();
    h.state.close();
    h.state.retime();

    expect(h.track('a').atClosedRest()).toBe(true);
    expect(h.track('a').playing).toBe('stopped');
    expect(h.state.closed()).toBe(true);
    expect(h.log.at(-1)).toBe('landed a');
  });

  it('settles at once when the context is lost partway through a close', () => {
    const h = open();
    h.state.close();
    h.state.drop();

    expect(h.track('a').at).toBe(0);
    expect(h.log).toContain('settled a');
    expect(h.state.holding()).toBeUndefined();
  });
});
