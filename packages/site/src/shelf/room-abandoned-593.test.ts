import type { LibraryBook } from '@stacks/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ABANDONED_ROWS, abandonedShelf, standAt } from './room-abandoned-593.ts';
import { DEFAULT_SETTINGS } from './shelf-settings.ts';

const book = (id: string, over: Partial<LibraryBook> = {}): LibraryBook => ({
  id,
  title: id,
  status: 'abandoned',
  pages: 300,
  tags: [],
  ...over,
});

const slots = { slot_abandoned: { position: [9.5, 0, 4], rotationY: -Math.PI / 2 } };

describe('the abandoned books’ bookcase (#593 prototype)', () => {
  it('stands where the room says, its front turned to the room', () => {
    const group = new THREE.Group();
    expect(standAt(group, slots, 'slot_abandoned')).toBe(true);
    expect(group.position.toArray()).toEqual([9.5, 0, 4]);
    // the shelf's front is +z; turned a quarter it faces -x, away from the right wall
    const front = new THREE.Vector3(0, 0, 1).applyEuler(group.rotation);
    expect(front.x).toBeCloseTo(-1);
  });

  it('is left alone when the room has no slot for it', () => {
    const group = new THREE.Group();
    expect(standAt(group, {}, 'slot_abandoned')).toBe(false);
    expect(group.position.toArray()).toEqual([0, 0, 0]);
  });

  it('holds the abandoned books alone, every one spine out, even one the note turns face out', () => {
    const { rows } = abandonedShelf(
      [book('left'), book('kept', { status: 'read' }), book('propped', { faceOut: true })],
      DEFAULT_SETTINGS.books,
    );
    const shelved = rows.flatMap((row) => row.books);
    expect(shelved.map((entry) => entry.book.id).sort()).toEqual(['left', 'propped']);
    for (const entry of shelved) expect(entry.faceOut).toBe(false);
  });

  it('never grows past two rows: the books that do not fit are counted and left off', () => {
    const many = Array.from({ length: 120 }, (_, i) => book(`b${i}`));
    const { rows, left } = abandonedShelf(many, DEFAULT_SETTINGS.books);
    expect(rows).toHaveLength(ABANDONED_ROWS);
    expect(left).toBeGreaterThan(0);
    expect(rows.reduce((n, row) => n + row.books.length, 0) + left).toBe(120);
  });
});
