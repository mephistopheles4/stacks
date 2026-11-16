import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { PAGES_HIDDEN, WATCH_PAGES } from './page-watch.ts';

/**
 * Just enough of a page to run the watcher in node: an element with a class
 * list, a style and children, which is a slot holding its page.
 */
class FakeElement {
  readonly style: { visibility: string; opacity: string } = { visibility: '', opacity: '' };
  constructor(
    private readonly classes: readonly string[],
    private readonly children: readonly FakeElement[] = [],
  ) {}
  get classList(): { contains: (name: string) => boolean } {
    return { contains: (name) => this.classes.includes(name) };
  }
  querySelectorAll(selector: string): FakeElement[] {
    return selector === '.held-page'
      ? this.children.filter((child) => child.classList.contains('held-page'))
      : [];
  }
}

interface Mutation {
  readonly type: 'childList' | 'attributes';
  readonly target: FakeElement;
  readonly addedNodes: readonly FakeElement[];
}

/** The watcher installed in a fake page, with the observer's callback to drive by hand. */
function watched(): { deliver: (mutations: Mutation[]) => void; hidden: () => boolean } {
  let callback: ((mutations: Mutation[]) => void) | undefined;
  class FakeObserver {
    constructor(deliver: (mutations: Mutation[]) => void) {
      callback = deliver;
    }
    observe(): void {
      // The test delivers mutations itself.
    }
  }
  const context = createContext({
    window: {},
    document: { body: {} },
    MutationObserver: FakeObserver,
    HTMLElement: FakeElement,
  });
  runInContext(WATCH_PAGES, context);
  return {
    deliver: (mutations) => callback?.(mutations),
    hidden: () => runInContext(PAGES_HIDDEN, context) as boolean,
  };
}

const page = (visibility: string, opacity = ''): FakeElement => {
  const made = new FakeElement(['held-page']);
  made.style.visibility = visibility;
  made.style.opacity = opacity;
  return made;
};
const added = (node: FakeElement): Mutation => ({
  type: 'childList',
  target: node,
  addedNodes: [node],
});
const styled = (node: FakeElement): Mutation => ({
  type: 'attributes',
  target: node,
  addedNodes: [],
});

describe('the pages-arrive-hidden watcher (#599)', () => {
  it('passes two pages added hidden', () => {
    const { deliver, hidden } = watched();
    deliver([added(page('hidden', '0')), added(page('hidden', '0'))]);
    expect(hidden()).toBe(true);
  });

  it('is not moved by a page re-inserted into the flat layer, whatever it shows by then', () => {
    const { deliver, hidden } = watched();
    const left = page('hidden', '0');
    const right = page('hidden', '0');
    deliver([added(left), added(right)]);
    left.style.visibility = 'visible';
    left.style.opacity = '1';
    right.style.visibility = 'visible';
    right.style.opacity = '1';
    deliver([added(left), added(right)]);
    expect(hidden()).toBe(true);
  });

  it('still fails a page first added while visible', () => {
    const { deliver, hidden } = watched();
    deliver([added(page('hidden', '0')), added(page('visible', '1'))]);
    expect(hidden()).toBe(false);
  });

  it('still fails a page added visible, even after other pages that were hidden', () => {
    const { deliver, hidden } = watched();
    const first = page('hidden', '0');
    const second = page('hidden', '0');
    deliver([added(first), added(second)]);
    deliver([added(page('visible', '1'))]);
    expect(hidden()).toBe(false);
  });

  it('still fails a page that is visible while its opacity is still 0', () => {
    const { deliver, hidden } = watched();
    const left = page('hidden', '0');
    const right = page('hidden', '0');
    deliver([added(left), added(right)]);
    right.style.visibility = 'visible';
    deliver([styled(right)]);
    expect(hidden()).toBe(false);
  });

  it('fails when fewer than two pages were ever seen, which would pass without a page to read', () => {
    const { deliver, hidden } = watched();
    expect(hidden()).toBe(false);
    deliver([added(page('hidden', '0'))]);
    expect(hidden()).toBe(false);
  });

  it('sees a page that arrives inside a slot, and is not moved by the page leaving it', () => {
    const { deliver, hidden } = watched();
    const left = page('hidden', '0');
    const right = page('hidden', '0');
    // The document sees the slots added, with the pages inside them.
    deliver([added(new FakeElement(['slot'], [left])), added(new FakeElement(['slot'], [right]))]);
    expect(hidden()).toBe(true);
    left.style.visibility = 'visible';
    left.style.opacity = '1';
    right.style.visibility = 'visible';
    right.style.opacity = '1';
    deliver([added(left), added(right)]);
    expect(hidden()).toBe(true);
  });

  it('still fails a page that arrives inside a slot while visible', () => {
    const { deliver, hidden } = watched();
    deliver([
      added(new FakeElement(['slot'], [page('hidden', '0')])),
      added(new FakeElement(['slot'], [page('visible', '1')])),
    ]);
    expect(hidden()).toBe(false);
  });

  it('ignores a node that is not a held page', () => {
    const { deliver, hidden } = watched();
    deliver([
      added(new FakeElement(['other'])),
      added(page('hidden', '0')),
      added(page('hidden', '0')),
    ]);
    expect(hidden()).toBe(true);
  });
});
