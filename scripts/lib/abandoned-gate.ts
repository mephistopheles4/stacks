/**
 * G35's abandoned-bookcase cells (#604, claims C10 and C11, spec S12 and S11.3): the judges, kept apart
 * from the browser that reads, as `pickup-gate.ts` keeps its own.
 *
 * `scripts/smoke-render.ts` drives a built page under its CSP, gives it a library whose abandoned books
 * overflow two rows, and hands what it read to these functions. Each is pure, so every clause is
 * planted red in `abandoned-gate.test.ts` rather than trusted.
 */

/**
 * A book picked up from the room's abandoned bookcase, at one viewport (C11). The steps are
 * `StackRead`'s, for the same pickup; what differs is where the book stands, so the read says how many
 * abandoned books were drawn, and has no base click, which this bookcase has no counterpart of:
 * nothing baked stands in its place.
 */
export interface AbandonedPickupRead {
  readonly viewport: string;
  /** How many abandoned books the bookcase holds. A page with none proves nothing. */
  readonly drawn: number;
  readonly picked: boolean;
  readonly arrivedClosed: boolean;
  readonly turned: boolean;
  readonly opened: boolean;
  readonly pagesShown: boolean;
  readonly closedAgain: boolean;
  readonly wentBack: boolean;
  readonly hrefUnchanged: boolean;
}

export function abandonedPickupFailures(read: AbandonedPickupRead | undefined): string[] {
  if (read === undefined) return ['the abandoned bookcase was not read'];
  const failures: string[] = [];
  const fail = (message: string): void => {
    failures.push(`${message} at ${read.viewport}`);
  };
  if (read.drawn === 0) {
    // Everything below would read a shelf book or nothing, so it is not read.
    fail('no book stood on the abandoned bookcase: the library has abandoned books');
    return failures;
  }
  if (!read.picked) fail('a click on an abandoned-bookcase book did not pick it up');
  if (!read.arrivedClosed) {
    fail('a book picked up from the abandoned bookcase did not arrive closed');
  }
  if (!read.turned) fail('a drag did not turn the book picked up from the abandoned bookcase');
  if (!read.opened) {
    fail('the open control did not open the book picked up from the abandoned bookcase');
  }
  if (!read.pagesShown) {
    fail('the pages are not visible with the abandoned-bookcase book open at rest');
  }
  if (!read.closedAgain)
    fail('the abandoned-bookcase book would not close back to the closed rest');
  if (!read.wentBack) fail('the abandoned-bookcase book did not go back when put back');
  if (!read.hrefUnchanged) {
    fail('location.href changed on a pickup from the abandoned bookcase (spec §3.9)');
  }
  return failures;
}

/**
 * What the abandoned bookcase holds when the library's abandoned books overflow two rows, one of them
 * carrying `face_out: true` (C10, spec S12.2, S12.3), with the two pages that tell it from the main
 * bookcase. Plain facts the browser half read; the judgement is here.
 */
export interface AbandonedLayoutRead {
  /** Abandoned books in the library the page was given. */
  readonly total: number;
  /** The abandoned books the room draws, by id. */
  readonly drawn: readonly string[];
  /** The abandoned books the room does not draw, as the page counts them. */
  readonly left: number;
  /** Rows the abandoned bookcase holds books on. */
  readonly rows: number;
  /** Drawn abandoned books standing cover-forward. Spine out only, so none. */
  readonly drawnFaceOut: number;
  /** The most recently abandoned book's id, which carries `face_out: true` in the library. */
  readonly newest: string;
  /**
   * Every abandoned book the overflow added, most recent first, by the dates the gate gave them: this
   * gate's order, derived from nothing the page computes.
   */
  readonly byRecency: readonly string[];
  /** Books on the main bookcase in the room, and how many the library shelves less its abandoned. */
  readonly roomShelf: number;
  readonly expectedRoomShelf: number;
  /** Books on the main bookcase of `?shelf`, and how many the library shelves, abandoned included. */
  readonly plainShelf: number;
  readonly expectedPlainShelf: number;
}

export function abandonedLayoutFailures(read: AbandonedLayoutRead | undefined): string[] {
  if (read === undefined) return ['the abandoned bookcase layout was not read'];
  if (read.total === 0 || read.left === 0) {
    return [
      `the library holds ${String(read.total)} abandoned books and ${String(read.left)} are off the ` +
        'bookcase: the fixture does not overflow two rows, so this check would assert nothing',
    ];
  }
  const failures: string[] = [];
  if (read.rows !== 2) {
    failures.push(`the abandoned bookcase holds ${String(read.rows)} rows of books, not two`);
  }
  if (read.drawn.length + read.left !== read.total) {
    failures.push(
      `${String(read.drawn.length)} drawn and ${String(read.left)} left off do not add up to the ` +
        `${String(read.total)} abandoned books`,
    );
  }
  const newest = read.byRecency.slice(0, read.drawn.length);
  if ([...read.drawn].sort().join() !== [...newest].sort().join()) {
    failures.push(
      'the abandoned bookcase does not show the most recently abandoned books: it draws ' +
        `${String(read.drawn.length)} and they are not the ${String(read.drawn.length)} newest by date`,
    );
  }
  if (!read.drawn.includes(read.newest)) {
    failures.push(
      'the most recently abandoned book, the one marked face_out, is not on the bookcase',
    );
  }
  if (read.drawnFaceOut > 0) {
    failures.push(
      `${String(read.drawnFaceOut)} abandoned book(s) stand cover-forward: ` +
        'face_out is ignored on this bookcase',
    );
  }
  if (read.roomShelf !== read.expectedRoomShelf) {
    failures.push(
      `the room's main bookcase holds ${String(read.roomShelf)} books, where the library shelves ` +
        `${String(read.expectedRoomShelf)} once its abandoned ones have gone to their own bookcase`,
    );
  }
  if (read.plainShelf !== read.expectedPlainShelf) {
    failures.push(
      `\`?shelf\` shows ${String(read.plainShelf)} books where the library shelves ` +
        `${String(read.expectedPlainShelf)}: the abandoned books belong on its main bookcase`,
    );
  }
  return failures;
}

/** A library record, as far as the overflow library needs to build one. */
export interface LibraryRecord {
  readonly id: string;
  readonly status?: string;
  readonly [key: string]: unknown;
}

export interface OverflowLibrary<L extends { readonly books: readonly LibraryRecord[] }> {
  readonly library: L;
  /** The most recently abandoned book of those added: the one marked `face_out`. */
  readonly newest: string;
  /** The added books' ids, most recent first. */
  readonly byRecency: readonly string[];
}

/**
 * The page's library with `count` more abandoned books on it, enough to overflow two rows, the most
 * recent of them marked `face_out: true`. Each is a copy of `template`'s cover and shape under its own
 * id, title and dates, which rise with its number, so the newest is the last and the order the
 * bookcase is expected to keep is known without asking the page. The copies carry no Thoughts and no
 * held copy, so a pickup asks for nothing that does not exist.
 */
export function withOverflowingAbandoned<L extends { readonly books: readonly LibraryRecord[] }>(
  library: L,
  template: LibraryRecord,
  count = 100,
): OverflowLibrary<L> {
  const added = Array.from({ length: count }, (_, i): LibraryRecord => {
    const n = String(i).padStart(3, '0');
    const { thoughts: _thoughts, heldCover: _held, shelfOrder: _order, ...shape } = template;
    return {
      ...shape,
      id: `parked-${n}`,
      title: `Parked ${n}`,
      status: 'abandoned',
      started: `1999-${String((i % 12) + 1).padStart(2, '0')}-01`,
      finished: `${String(2000 + Math.floor(i / 12))}-${String((i % 12) + 1).padStart(2, '0')}-15`,
      pages: 220,
      faceOut: i === count - 1,
    };
  });
  return {
    library: { ...library, books: [...library.books, ...added] },
    newest: `parked-${String(count - 1).padStart(3, '0')}`,
    byRecency: [...added].reverse().map((book) => book.id),
  };
}
