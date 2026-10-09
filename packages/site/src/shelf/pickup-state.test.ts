import { describe, expect, it } from 'vitest';
import {
  createPickupState,
  type PickupEffects,
  type Track,
  type TrackEvents,
} from './pickup-state.ts';

/** A track whose clock the test drives: `land()` and `return()` end a run. */
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

function harness(options: { reduced?: boolean } = {}) {
  const tracks: FakeTrack[] = [];
  const log: string[] = [];
  /** The history stack, as the page would see it: one state per entry. */
  const entries: (string | null)[] = [null];
  let index = 0;

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
        index -= 1;
        // The browser fires popstate as a task, after the caller returns.
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
  return { state, tracks, track, log, pressBack, entries: () => entries.slice(0, index + 1) };
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
    h.state.select('a');

    expect(h.tracks).toHaveLength(1);
    expect(h.entries()).toEqual([null, 'a']);
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

  it('puts every book in flight back when the context is lost, at once', () => {
    const h = harness();
    h.state.select('a');
    h.track('a').land();
    h.state.drop();

    expect(h.state.holding()).toBeUndefined();
    expect(h.track('a').disposed).toBe(true);
    expect(h.entries()).toEqual([null]);
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
