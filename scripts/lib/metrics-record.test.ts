/**
 * Which records a sync has not seen yet.
 *
 * An ordinary unit test, not a gate. The half of `metrics-record.ts` that
 * drives git is out of reach in-process — it wants a remote — so what is
 * asserted here is the selection, which is the half that decides whether
 * running the same sync twice does anything the second time.
 *
 * ⚠️ **Nothing here may touch the filesystem**, for the reason in
 * `metrics.test.ts`: Stryker's sandbox is not the repository.
 */

import { describe, expect, it } from 'vitest';
import { newestCommitRecord, parseRecordName, selectNewRecords } from './metrics-record.ts';

const FIRST = '1787145048-f8bd379803f2.prom';
const SECOND = '1787146512-f8bd379803f2.prom';
const THIRD = '1787158309-9ceada9fafb4.prom';
const LOCAL = '1787183900-edge.prom';

describe('parseRecordName', () => {
  it('reads the timestamp a filename leads with', () => {
    expect(parseRecordName(FIRST)?.timestamp).toBe(1_787_145_048);
  });

  it('reads the local probe rows too, which carry no commit', () => {
    // Surface D's rows live in the same store and sort by the same key. They
    // are never on the branch, so `edge` stands where a sha does.
    expect(parseRecordName(LOCAL)?.timestamp).toBe(1_787_183_900);
    expect(parseRecordName(LOCAL)?.source).toBe('edge');
  });

  it('refuses anything that is not a record', () => {
    // A directory listing carries whatever anybody committed. A name this
    // cannot date has no place in a timestamp-ordered import, and guessing one
    // would put its samples at the wrong hour forever.
    expect(parseRecordName('README.md')).toBeUndefined();
    expect(parseRecordName('metrics.prom')).toBeUndefined();
    expect(parseRecordName('1787145048-f8bd379803f2.txt')).toBeUndefined();
  });
});

describe('selectNewRecords', () => {
  it('takes everything when nothing has been imported', () => {
    expect(selectNewRecords([SECOND, FIRST], [])).toEqual([FIRST, SECOND]);
  });

  it('orders by time, not by the order the listing arrived in', () => {
    // promtool appends as it parses, so a document whose samples run backwards
    // is a rejected file rather than a re-ordered one.
    expect(selectNewRecords([THIRD, FIRST, SECOND], [])).toEqual([FIRST, SECOND, THIRD]);
  });

  it('takes nothing on a second run, which is what makes a sync idempotent', () => {
    expect(selectNewRecords([FIRST, SECOND], [FIRST, SECOND])).toEqual([]);
  });

  it('takes only what arrived since', () => {
    expect(selectNewRecords([FIRST, SECOND, THIRD], [FIRST])).toEqual([SECOND, THIRD]);
  });

  it('keeps a record it cannot date out of the import rather than dropping it silently', () => {
    // Reported by the caller; what matters here is that it is neither imported
    // nor able to make the sort meaningless.
    expect(selectNewRecords(['notes.md', FIRST], [])).toEqual([FIRST]);
  });

  it('separates two records written in the same second by their commit', () => {
    // The filename is `<timestamp>-<sha>` precisely because two runs can share
    // a second but not a second *and* a commit. Importing by a watermark alone
    // would drop the second one for good.
    const sameSecond = '1787145048-9ceada9fafb4.prom';

    expect(selectNewRecords([FIRST, sameSecond], [FIRST])).toEqual([sameSecond]);
  });
});

describe('newestCommitRecord — the run a new one is measured against', () => {
  it('takes the latest by timestamp, whatever order the branch listed them', () => {
    expect(newestCommitRecord([THIRD, FIRST, SECOND])?.name).toBe(THIRD);
  });

  it('ignores surface D rows, which carry no commit to diff against', () => {
    // A local probe row is newer than every CI record on a machine that just
    // synced, and `edge` is not a commit. Taking it would make every PR window
    // `unknown` from the first sync onwards.
    expect(newestCommitRecord([FIRST, LOCAL])?.name).toBe(FIRST);
  });

  it('has no answer for a branch with nothing on it', () => {
    expect(newestCommitRecord([])).toBeUndefined();
    expect(newestCommitRecord(['README.md'])).toBeUndefined();
  });
});
