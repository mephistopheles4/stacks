import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveIn, moveOut, update, type FlatBook, type FlatPage, type Screen } from './held-flat.ts';

/**
 * Just enough of an element to move between parents with no DOM library: the
 * suite runs in node and this repo adds no dependency for one test.
 */
class Box {
  parent: Box | undefined;
  readonly children: Box[] = [];
  readonly style: Record<string, string> = {};
  scrollTop = 0;
  writes = 0;

  append(...nodes: Box[]): void {
    for (const node of nodes) {
      node.parent?.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = this;
      this.children.push(node);
    }
  }
}

const asElement = (box: Box): HTMLElement => box as unknown as HTMLElement;

const BOX = { width: 460, height: 640 };
const SIZE = { width: 800, height: 600 };

function camera(): THREE.PerspectiveCamera {
  const made = new THREE.PerspectiveCamera(40, SIZE.width / SIZE.height, 0.1, 100);
  made.position.set(0, 0, 10);
  made.updateMatrixWorld(true);
  return made;
}

/** A page square to the camera, `turned` radians about y, with its slot already holding it. */
function book(turned = 0): { book: FlatBook; layer: Box; pages: Box[]; slots: Box[] } {
  const layer = new Box();
  const slots = [new Box(), new Box()];
  const pages = [new Box(), new Box()];
  // The right page has been read down: re-placing it must send it back to the top.
  (pages[1] as Box).scrollTop = 250;
  const made: FlatPage[] = [0, 1].map((index) => {
    const object = new THREE.Object3D();
    object.scale.setScalar(0.004);
    object.position.set(index === 0 ? -1 : 1, 0, 0);
    object.rotation.y = turned;
    object.updateMatrixWorld(true);
    slots[index]?.append(pages[index] as Box);
    return {
      page: asElement(pages[index] as Box),
      slot: asElement(slots[index] as Box),
      object,
      matrix: undefined,
    };
  });
  return {
    book: {
      pages: [made[0], made[1]] as [FlatPage, FlatPage],
      box: BOX,
      flat: false,
      warned: false,
    },
    layer,
    pages,
    slots,
  };
}

const screen = (): Screen => ({ camera: camera(), size: SIZE });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('moveIn', () => {
  it('takes both pages out of their slots into the layer, left then right, and places each', () => {
    const { book: held, layer, pages, slots } = book();
    expect(moveIn(asElement(layer), held, screen())).toBe(true);
    expect(layer.children).toEqual([pages[0], pages[1]]);
    expect(slots[0]?.children).toEqual([]);
    expect(slots[1]?.children).toEqual([]);
    expect(held.flat).toBe(true);
    for (const page of pages) expect(page?.style.transform).toMatch(/^matrix\(/);
  });

  it('leaves the pages in their slots, and says so once, when a page is not flat to the camera', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { book: held, layer, slots } = book(0.5);
    expect(moveIn(asElement(layer), held, screen())).toBe(false);
    expect(moveIn(asElement(layer), held, screen())).toBe(false);
    expect(held.flat).toBe(false);
    expect(layer.children).toEqual([]);
    expect(slots[0]?.children).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/px off a flat rectangle/);
  });
});

describe('update', () => {
  it('writes a matrix only when it differs from the last one written', () => {
    const { book: held, layer, pages } = book();
    moveIn(asElement(layer), held, screen());
    const writes: string[] = [];
    for (const page of pages) {
      let value = page?.style.transform ?? '';
      Object.defineProperty(page?.style, 'transform', {
        get: () => value,
        set: (next: string) => {
          writes.push(next);
          value = next;
        },
      });
    }
    update(held, screen());
    update(held, screen());
    expect(writes).toEqual([]);

    const moved = screen();
    held.pages[1].object.position.x += 0.5;
    held.pages[1].object.updateMatrixWorld(true);
    update(held, moved);
    expect(writes).toHaveLength(1);
  });

  it('does nothing for a book that is not flat, and never moves a page onto a skewed matrix', () => {
    const idle = book();
    update(idle.book, screen());
    expect(idle.pages[0]?.style.transform).toBeUndefined();

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { book: held, layer, pages } = book();
    moveIn(asElement(layer), held, screen());
    const before = pages[1]?.style.transform;
    held.pages[1].object.rotation.y = 0.5;
    held.pages[1].object.updateMatrixWorld(true);
    update(held, screen());
    expect(pages[1]?.style.transform).toBe(before);
  });
});

describe('moveOut', () => {
  it('puts both pages back in their slots, clears each transform, and sets the scroll to the top', () => {
    const { book: held, layer, pages, slots } = book();
    moveIn(asElement(layer), held, screen());
    expect(pages[1]?.scrollTop).toBe(250);
    moveOut(held);
    expect(slots[0]?.children).toEqual([pages[0]]);
    expect(slots[1]?.children).toEqual([pages[1]]);
    expect(layer.children).toEqual([]);
    for (const page of pages) {
      expect(page?.style.transform).toBe('');
      expect(page?.scrollTop).toBe(0);
    }
    expect(held.flat).toBe(false);
    expect(held.pages[0].matrix).toBeUndefined();
  });

  it('is safe on a book that is not flat, and leaves its scroll alone', () => {
    const { book: held, pages } = book();
    moveOut(held);
    expect(pages[1]?.scrollTop).toBe(250);
  });
});
