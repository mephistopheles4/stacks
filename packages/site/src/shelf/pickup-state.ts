/**
 * Which book is in your hand, which are on their way back, and what a click,
 * Escape or the back button does next — with no `three`, no GSAP and no DOM.
 *
 * The choreography is #371's, accepted as prototyped: a click picks a book up;
 * a click on another puts the first back and then picks the second up; a book
 * caught on its way back plays forward again; a second pickup may start while
 * another book is still returning; reduced motion cuts straight to open and
 * straight back. Everything that draws is behind `PickupEffects`, so every one
 * of those rules is a unit test here, and `pickup.ts` only supplies the effects.
 *
 * **Pickup owns one history entry** (spec §3.9). Picking up pushes it, carrying
 * the book in `history.state` and never in the address; Escape and an
 * empty-space click go through `history.back()`, so all three ways of putting a
 * book down leave history as it was before the pickup. A swap replaces the
 * entry's state rather than pushing a second one.
 */

export type Phase = 'lifting' | 'held' | 'returning';

/** One book's motion, from the shelf (0) to open in the hand (1). */
export interface Track {
  /** Forward, at normal speed, from wherever it is. */
  play(): void;
  /** Backward, `speed` times faster than forward. */
  reverse(speed: number): void;
  /** Jump to open, with no motion. */
  finish(): void;
  /** Jump back to the shelf, with no motion. */
  rewind(): void;
  /** Stop at `progress`, 0..1. The tuner's scrub. */
  seek(progress: number): void;
  progress(): number;
  dispose(): void;
}

/** What a track reports back as it reaches either end of its run. */
export interface TrackEvents {
  /** It reached open, playing forward. Properties, so a track may hand them on unbound. */
  readonly landed: () => void;
  /** It reached the shelf, playing backward. */
  readonly returned: () => void;
}

/** The pickup's one history entry, as this module needs to see it. */
export interface PickupHistory {
  /** Whether the current entry is the pickup's. */
  held(): boolean;
  push(book: string): void;
  replace(book: string): void;
  back(): void;
}

export interface PickupEffects<B> {
  /** A fresh, paused track for `book`, reporting its ends through `events`. */
  track(book: B, events: TrackEvents): Track;
  /** It left its slot: draw the shelf without it. */
  left(book: B): void;
  /** It came to rest open in the hand. */
  landed(book: B): void;
  /** It is back in its slot: draw the shelf with it again. */
  settled(book: B): void;
  /** «Title» by «Author» on pickup, and empty when the hand is empty. */
  announce(book: B | undefined): void;
  reduced(): boolean;
  /** How much faster putting back runs than picking up. */
  returnSpeed(): number;
  readonly history: PickupHistory;
}

export interface Holding<B> {
  readonly book: B;
  readonly phase: Phase;
}

/** A book the pickup is moving, and the track it moves on. */
export interface Moving<B> {
  readonly book: B;
  readonly phase: Phase;
  progress(): number;
}

export interface PickupState<B> {
  /** A click on `book`, or on empty space when `undefined`. */
  select(book: B | undefined): void;
  /** Escape, an empty-space click or the put-back control. */
  putBack(): void;
  /** The browser moved off the pickup's history entry: put everything back. */
  popped(): void;
  /** The context was lost: everything back in its slot at once, as a hard cut. */
  drop(): void;
  /** The book in your hand — lifting or held, never one going back. */
  holding(): Holding<B> | undefined;
  /** The latest book in motion, whatever its phase: what the tuner follows. */
  current(): Moving<B> | undefined;
  scrub(progress: number): void;
  play(): void;
  /** Rebuild every track from the motion as it now is, keeping where each one is. */
  retime(): void;
}

interface Active<B> {
  readonly book: B;
  phase: Phase;
  track: Track;
}

export function createPickupState<B>(
  effects: PickupEffects<B>,
  id: (book: B) => string = String,
): PickupState<B> {
  let active: Active<B>[] = [];
  /** A book clicked while another went back, picked up once the hand is empty. */
  let queued: B | undefined;
  /**
   * A put-back asked the browser to step back and its popstate has not come yet.
   * The entry stays current until it does, so a second put-back in that window —
   * a double click, or taps a busy phone delivers together — would step back
   * again, off the site.
   */
  let stepping = false;

  const find = (book: B): Active<B> | undefined => active.find((a) => id(a.book) === id(book));
  const holding = (): Active<B> | undefined => active.findLast((a) => a.phase !== 'returning');

  const remember = (book: B): void => {
    if (effects.history.held()) effects.history.replace(id(book));
    else effects.history.push(id(book));
  };

  const wire = (entry: Active<B>): Track =>
    effects.track(entry.book, {
      landed: () => {
        entry.phase = 'held';
        effects.landed(entry.book);
      },
      returned: () => {
        settle(entry);
      },
    });

  const pick = (book: B): void => {
    // Out of its slot first: the track is built from the book as lifted.
    effects.left(book);
    const entry: Active<B> = { book, phase: 'lifting', track: undefined as unknown as Track };
    entry.track = wire(entry);
    active.push(entry);
    remember(book);
    effects.announce(book);
    if (effects.reduced()) {
      entry.track.finish();
      entry.phase = 'held';
      effects.landed(book);
    } else {
      entry.track.play();
    }
  };

  const settle = (entry: Active<B>): void => {
    entry.track.dispose();
    active = active.filter((a) => a !== entry);
    effects.settled(entry.book);
    if (active.length === 0 && queued !== undefined) {
      const next = queued;
      queued = undefined;
      pick(next);
    }
  };

  /** Starts one book back. History is the caller's. */
  const sendBack = (entry: Active<B>): void => {
    if (entry.phase === 'returning') return;
    entry.phase = 'returning';
    if (holding() === undefined) effects.announce(undefined);
    if (effects.reduced()) {
      entry.track.rewind();
      settle(entry);
    } else {
      entry.track.reverse(effects.returnSpeed());
    }
  };

  const putBackAll = (): void => {
    for (const entry of [...active]) sendBack(entry);
  };

  return {
    select(book) {
      if (book === undefined) {
        this.putBack();
        return;
      }
      const same = find(book);
      if (same !== undefined) {
        if (same.phase !== 'returning') return;
        // Caught on its way back: forward again, from wherever it is.
        same.phase = 'lifting';
        remember(book);
        effects.announce(book);
        same.track.play();
        return;
      }
      const current = holding();
      if (current === undefined) {
        pick(book);
        return;
      }
      // Put the first back, then pick the new one up. The latest click wins.
      queued = book;
      sendBack(current);
    },

    putBack() {
      if (holding() === undefined || stepping) return;
      if (effects.history.held()) {
        stepping = true;
        effects.history.back();
      } else {
        putBackAll();
      }
    },

    popped() {
      stepping = false;
      queued = undefined;
      putBackAll();
    },

    drop() {
      queued = undefined;
      const lost = active;
      active = [];
      for (const entry of lost) {
        entry.track.rewind();
        entry.track.dispose();
        effects.settled(entry.book);
      }
      if (lost.length === 0) return;
      effects.announce(undefined);
      // Only an entry this drop emptied is stepped off. A stale pickup entry,
      // reached by the forward button with nothing in hand, stays: stepping back
      // from it on a rebuild could take the visitor off the site.
      if (effects.history.held()) effects.history.back();
    },

    holding() {
      const entry = holding();
      return entry === undefined ? undefined : { book: entry.book, phase: entry.phase };
    },

    current() {
      const entry = active.at(-1);
      return entry === undefined
        ? undefined
        : { book: entry.book, phase: entry.phase, progress: () => entry.track.progress() };
    },

    scrub(progress) {
      active.at(-1)?.track.seek(progress);
    },

    play() {
      const entry = active.at(-1);
      if (entry === undefined) return;
      if (entry.phase === 'returning') entry.phase = 'lifting';
      entry.track.play();
    },

    retime() {
      for (const entry of active) {
        const at = entry.track.progress();
        entry.track.dispose();
        entry.track = wire(entry);
        entry.track.seek(at);
        if (entry.phase === 'returning') entry.track.reverse(effects.returnSpeed());
        else if (entry.phase === 'lifting') entry.track.play();
      }
    },
  };
}
