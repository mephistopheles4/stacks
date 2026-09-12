import { describe, expect, it } from 'vitest';

import {
  STAMP_NAMES,
  acceptedValues,
  newestFor,
  parseRenovations,
  type Renovation,
} from './renovations.ts';

/** A stamp entry, with only the fields a test cares about spelled out. */
function stamp(over: Partial<Renovation> = {}): Record<string, unknown> {
  return {
    date: '2026-09-12',
    stamp: 'fixtureHash',
    value: `sha256:${'a'.repeat(64)}`,
    reason: 'the counting stamp stopped digesting three installed versions',
    pr: 342,
    preserves: false,
    ...over,
  };
}

/** A free entry: a change a reader notices and no stamp records. */
function free(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: '2026-09-12',
    stamp: 'none',
    reason: 'Prettier now formats every TypeScript file',
    pr: 300,
    ...over,
  };
}

function doc(...renovations: Record<string, unknown>[]): unknown {
  return { renovations };
}

describe('parseRenovations — the shape', () => {
  it('reads a stamp entry and a free entry from one file', () => {
    const parsed = parseRenovations(doc(stamp(), free()));

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.stamp).toBe('fixtureHash');
    expect(parsed[1]?.stamp).toBe('none');
  });

  it('reads an empty list, because a repository with no renovation has none', () => {
    expect(parseRenovations(doc())).toEqual([]);
  });

  it('refuses a document that is not an object', () => {
    expect(() => parseRenovations('renovations')).toThrow(/not an object/);
  });

  it('refuses a file with no renovations list', () => {
    expect(() => parseRenovations({})).toThrow(/no renovations list/);
  });
});

describe('parseRenovations — a typo must not read as a free entry', () => {
  // The `parseCaps` idiom: an unrecognised name is a parse error rather than a
  // value that quietly means something weaker. `fixturehash` here would
  // otherwise leave the stamp unmarked and the gate green.
  it('refuses a stamp name it does not recognise', () => {
    expect(() => parseRenovations(doc(stamp({ stamp: 'fixturehash' as never })))).toThrow(
      /is not a stamp name/,
    );
  });

  it('names every stamp it does recognise in the message', () => {
    const message = String(
      (() => {
        try {
          parseRenovations(doc(stamp({ stamp: 'nonsense' as never })));
        } catch (error) {
          return error;
        }
        return new Error('it did not throw');
      })(),
    );

    for (const name of STAMP_NAMES) expect(message).toContain(name);
  });

  it('accepts each of the three stamp names', () => {
    for (const name of STAMP_NAMES) {
      expect(parseRenovations(doc(stamp({ stamp: name })))[0]?.stamp).toBe(name);
    }
  });
});

describe('parseRenovations — a stamp entry carries what a stamp entry needs', () => {
  it('refuses a stamp entry with no value', () => {
    const { value: _dropped, ...rest } = stamp();
    expect(() => parseRenovations(doc(rest))).toThrow(/carries no value/);
  });

  it('refuses a value that is not a sha256 digest', () => {
    expect(() => parseRenovations(doc(stamp({ value: 'sha256:beef' })))).toThrow(/not a digest/);
  });

  // Explicit and never defaulted. A default would let *nobody decided* read as
  // *the window restarts*, and the marker exists to record that decision.
  it('refuses a stamp entry that does not say whether it preserves', () => {
    const { preserves: _dropped, ...rest } = stamp();
    expect(() => parseRenovations(doc(rest))).toThrow(/does not say whether it preserves/);
  });

  it('refuses a free entry that carries a value', () => {
    expect(() => parseRenovations(doc(free({ value: `sha256:${'b'.repeat(64)}` })))).toThrow(
      /carries a value/,
    );
  });

  it('refuses a free entry that claims to preserve a window', () => {
    expect(() => parseRenovations(doc(free({ preserves: true })))).toThrow(/preserves nothing/);
  });
});

describe('parseRenovations — every entry carries a date, a reason and a pull request', () => {
  it('refuses a date that is not an ISO day', () => {
    expect(() => parseRenovations(doc(stamp({ date: '12 September 2026' })))).toThrow(
      /not an ISO date/,
    );
  });

  it('refuses an empty reason, because an entry with no reason marks nothing', () => {
    expect(() => parseRenovations(doc(stamp({ reason: '   ' })))).toThrow(/carries no reason/);
  });

  it('refuses a pull request that is not a positive whole number', () => {
    expect(() => parseRenovations(doc(stamp({ pr: 0 })))).toThrow(/not a pull request number/);
  });
});

describe('newestFor — the entry a gate compares against', () => {
  const older = stamp({ date: '2026-08-01', value: `sha256:${'1'.repeat(64)}` });
  const newer = stamp({ date: '2026-09-01', value: `sha256:${'2'.repeat(64)}` });

  it('returns the last entry for that stamp in file order', () => {
    const parsed = parseRenovations(doc(older, newer));
    expect(newestFor(parsed, 'fixtureHash')?.value).toBe(`sha256:${'2'.repeat(64)}`);
  });

  it('ignores entries for a different stamp', () => {
    const other = stamp({ stamp: 'configHash', value: `sha256:${'3'.repeat(64)}` });
    const parsed = parseRenovations(doc(older, newer, other));
    expect(newestFor(parsed, 'fixtureHash')?.value).toBe(`sha256:${'2'.repeat(64)}`);
  });

  it('ignores free entries, which name no stamp to compare', () => {
    const parsed = parseRenovations(doc(newer, free()));
    expect(newestFor(parsed, 'fixtureHash')?.value).toBe(`sha256:${'2'.repeat(64)}`);
  });

  it('returns nothing for a stamp no entry names', () => {
    expect(newestFor(parseRenovations(doc(newer)), 'duplicationHash')).toBeUndefined();
  });

  // File order and never date order. Two renovations can land on one day, and a
  // sort by date would pick between them by an accident of the sort's stability.
  it('reads file order, not date order', () => {
    const outOfOrder = stamp({ date: '2026-01-01', value: `sha256:${'4'.repeat(64)}` });
    const parsed = parseRenovations(doc(newer, outOfOrder));
    expect(newestFor(parsed, 'fixtureHash')?.value).toBe(`sha256:${'4'.repeat(64)}`);
  });
});

describe('acceptedValues — the preservation chain', () => {
  const v = (n: string): string => `sha256:${n.repeat(64)}`;

  // ⚠️ The chain is trusted only while its head describes the file in front of
  // us. A head naming a superseded value would otherwise widen the window with a
  // rule nobody declared comparable to the current one — the route the stamp
  // exists to close, reopened by a stale marker. G57 reddens that state at
  // merge; this is the lock for `deploy:site`, which runs where G57 does not.
  it('accepts nothing when the newest entry does not name the stamp on disk', () => {
    const parsed = parseRenovations(
      doc(stamp({ value: v('1'), preserves: false }), stamp({ value: v('2'), preserves: true })),
    );

    expect(acceptedValues(parsed, 'fixtureHash', v('9'))).toEqual([]);
  });

  it('accepts the newest value alone when nothing preserves', () => {
    const parsed = parseRenovations(
      doc(stamp({ value: v('1'), preserves: false }), stamp({ value: v('2'), preserves: false })),
    );
    expect(acceptedValues(parsed, 'fixtureHash', v('2'))).toEqual([v('2')]);
  });

  it('accepts the predecessor when the newest entry preserves', () => {
    const parsed = parseRenovations(
      doc(stamp({ value: v('1'), preserves: false }), stamp({ value: v('2'), preserves: true })),
    );
    expect(acceptedValues(parsed, 'fixtureHash', v('2'))).toEqual([v('2'), v('1')]);
  });

  it('walks back through a run of preserving entries', () => {
    const parsed = parseRenovations(
      doc(
        stamp({ value: v('1'), preserves: false }),
        stamp({ value: v('2'), preserves: true }),
        stamp({ value: v('3'), preserves: true }),
      ),
    );
    expect(acceptedValues(parsed, 'fixtureHash', v('3'))).toEqual([v('3'), v('2'), v('1')]);
  });

  // The chain stops at the entry that restarted the window, and the value of
  // that entry is still accepted — it is the run that restarted, not the entry.
  it('stops at the first entry that does not preserve', () => {
    const parsed = parseRenovations(
      doc(
        stamp({ value: v('1'), preserves: true }),
        stamp({ value: v('2'), preserves: false }),
        stamp({ value: v('3'), preserves: true }),
      ),
    );
    expect(acceptedValues(parsed, 'fixtureHash', v('3'))).toEqual([v('3'), v('2')]);
  });

  it('reads only the named stamp, so one tool cannot lengthen another chain', () => {
    const parsed = parseRenovations(
      doc(
        stamp({ value: v('1'), preserves: false }),
        stamp({ stamp: 'configHash', value: v('9'), preserves: true }),
        stamp({ value: v('2'), preserves: true }),
      ),
    );
    expect(acceptedValues(parsed, 'fixtureHash', v('2'))).toEqual([v('2'), v('1')]);
  });

  it('returns nothing for a stamp no entry names', () => {
    expect(acceptedValues(parseRenovations(doc(stamp())), 'duplicationHash', v('9'))).toEqual([]);
  });

  it('accepts the oldest value when the whole chain preserves', () => {
    const parsed = parseRenovations(
      doc(stamp({ value: v('1'), preserves: true }), stamp({ value: v('2'), preserves: true })),
    );
    expect(acceptedValues(parsed, 'fixtureHash', v('2'))).toEqual([v('2'), v('1')]);
  });
});
