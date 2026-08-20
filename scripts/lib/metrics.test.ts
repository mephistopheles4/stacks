/**
 * The reading half of the record, where the writing half's format has to hold.
 *
 * An ordinary unit test, not a gate — it takes no `docs/gates.md` row.
 * `gates/trend-layer.test.ts` (G36) owns the CI document and its correspondence
 * with the scoreboard; this owns the two pieces only `pnpm trend:sync` uses:
 * the join that makes many records ingestible as one, and surface D's row.
 *
 * ⚠️ **Nothing here may touch the filesystem.** A spec under `scripts/` runs
 * inside Stryker's sandbox too, where `REPO_ROOT` resolves somewhere else
 * entirely — so a spec that reads a real file passes under `pnpm test` and
 * fails as a mutation-run fault. Both subjects here are pure functions over
 * strings for that reason.
 */

import { describe, expect, it } from 'vitest';
import {
  METRIC_PREFIXES,
  joinRecords,
  renderEdgeCheck,
  renderMetrics,
  trendNamesIn,
  type EdgeFacts,
} from './metrics.ts';

const AT = 1_787_183_835;

function record(value: number): string {
  return [
    '# TYPE stacks_run_ok gauge',
    '# HELP stacks_run_ok One when this run computed every series it declared.',
    `stacks_run_ok ${String(value)} ${String(AT)}`,
    '# EOF',
    '',
  ].join('\n');
}

function edge(build: EdgeFacts['build'], covers?: EdgeFacts['covers']): string {
  return renderEdgeCheck({
    timestamp: AT,
    origin: 'https://stacks.example',
    expected: 'a1b2c3d4e5f6',
    build,
    covers,
  });
}

describe('joinRecords — many documents, one ingestible file', () => {
  it('leaves exactly one terminator, at the end', () => {
    // Measured, and it is the whole file that dies: `# EOF` terminates an
    // OpenMetrics document, so a second document after it is "unexpected data
    // after # EOF" and promtool writes no block at all — not a partial ingest.
    const joined = joinRecords([record(1), record(0)]);

    expect(joined.match(/^# EOF$/gm)).toHaveLength(1);
    expect(joined.endsWith('# EOF\n')).toBe(true);
  });

  it('keeps every sample from every record', () => {
    const joined = joinRecords([record(1), record(0)]);

    expect(joined).toContain(`stacks_run_ok 1 ${String(AT)}`);
    expect(joined).toContain(`stacks_run_ok 0 ${String(AT)}`);
  });

  it('writes LF, whatever it was handed', () => {
    // "invalid metric type \"gauge\\r\"" — a CRLF anywhere in the file is a
    // parse error, and a record read back through git on Windows is exactly
    // where one arrives.
    const joined = joinRecords([record(1).replace(/\n/g, '\r\n')]);

    expect(joined).not.toContain('\r');
    expect(joined).toContain(`stacks_run_ok 1 ${String(AT)}`);
  });

  it('drops blank lines rather than passing them through', () => {
    const joined = joinRecords([`${record(1)}\n\n`]);

    expect(joined).not.toMatch(/\n\n/);
  });

  it('refuses to join nothing, rather than writing an empty document', () => {
    // An empty file ingests as zero blocks and reports success, which reads as
    // "synced" to the one command that exists to say whether anything arrived.
    expect(() => joinRecords([])).toThrow(/nothing to join/i);
  });
});

describe('renderEdgeCheck — surface D, with nothing invented', () => {
  it('writes run_ok 1 and a zero when the origin serves a stale build', () => {
    // A real answer, and a red one. Distinct from a refusal in both directions:
    // the run worked, and what it learned is bad.
    const document = edge({ kind: 'stale', serving: '9f9f9f9f9f9f' });

    expect(document).toMatch(/^stacks_run_ok\{surface="edge"\} 1 1787183835$/m);
    expect(document).toMatch(/^stacks_edge_build_current\{[^}]*\} 0 1787183835$/m);
    expect(document).toContain('outcome="stale"');
    expect(document).toContain('serving="9f9f9f9f9f9f"');
  });

  it('writes run_ok 1 and a one when the origin serves this build', () => {
    const document = edge({ kind: 'current', serving: 'a1b2c3d4e5f6' });

    expect(document).toMatch(/^stacks_run_ok\{surface="edge"\} 1 1787183835$/m);
    expect(document).toMatch(/^stacks_edge_build_current\{[^}]*\} 1 1787183835$/m);
    expect(document).toContain('outcome="current"');
  });

  it('writes run_ok 0 and no build sample at all when the origin refuses', () => {
    // ADR-0027's distinction, kept in the record: a refusal is not an answer,
    // so there is no build number to write. A zero here would say "serving the
    // wrong build", which nothing measured.
    const document = edge({ kind: 'refused', status: 403 });

    expect(document).toMatch(/^stacks_run_ok\{surface="edge"\} 0 1787183835$/m);
    expect(document).not.toContain('stacks_edge_build_current');
    expect(document).toContain('outcome="refused"');
    expect(document).toContain('status="403"');
  });

  it('writes run_ok 0 when the origin could not be reached', () => {
    const document = edge({ kind: 'unreachable' });

    expect(document).toMatch(/^stacks_run_ok\{surface="edge"\} 0 1787183835$/m);
    expect(document).not.toContain('stacks_edge_build_current');
    expect(document).toContain('outcome="unreachable"');
  });

  it('carries the cover sweep when it ran, and no sample when it did not', () => {
    // The half CI could never buy: the comparison needs the local dist/ to
    // know what each cover should weigh.
    const swept = edge(
      { kind: 'current', serving: 'a1b2c3d4e5f6' },
      { checked: 41, stale: 2, uncomparable: 6 },
    );

    expect(swept).toMatch(/^stacks_edge_stale_covers\{[^}]*\} 2 1787183835$/m);
    expect(edge({ kind: 'current', serving: 'a1b2c3d4e5f6' })).not.toContain(
      'stacks_edge_stale_covers',
    );
  });

  it('counts what could not be compared beside what was stale', () => {
    // "0 stale of 41" while six were never compared is a green that means
    // nothing — an origin answering without a content-length said nothing
    // about those covers, and a zero would claim it did.
    const swept = edge(
      { kind: 'current', serving: 'a1b2c3d4e5f6' },
      { checked: 41, stale: 0, uncomparable: 6 },
    );

    expect(swept).toMatch(/^stacks_edge_stale_covers\{[^}]*\} 0 1787183835$/m);
    expect(swept).toMatch(/^stacks_edge_uncomparable_covers\{[^}]*\} 6 1787183835$/m);
  });

  it('names no trend, so the Trends table owes it no row', () => {
    // D's series live under a third prefix precisely so G36 cannot see them:
    // a row for a series CI never emits would make the gate's reverse
    // direction red against every CI run. Structural, not a list of exceptions.
    expect(trendNamesIn(edge({ kind: 'current', serving: 'a1b2c3d4e5f6' }))).toEqual([]);
  });

  it('closes the document so promtool will ingest it', () => {
    expect(edge({ kind: 'unreachable' }).endsWith('# EOF\n')).toBe(true);
  });

  it('escapes a label value rather than letting it end the label', () => {
    const document = renderEdgeCheck({
      timestamp: AT,
      origin: 'https://example.invalid/?a="b"\\c',
      expected: 'a1b2c3d4e5f6',
      build: { kind: 'unreachable' },
    });

    expect(document).toContain('origin="https://example.invalid/?a=\\"b\\"\\\\c"');
  });
});

describe('the three metric prefixes name three things', () => {
  it('makes no prefix a prefix of another', () => {
    // `trendNamesIn` strips a prefix to recover a name. If one prefix were a
    // prefix of another, every sample under the longer one would parse as a
    // series under the shorter with a mangled name — which is health-shaped.
    const prefixes = Object.values(METRIC_PREFIXES);
    const overlapping = prefixes.flatMap((one) =>
      prefixes.filter((other) => other !== one && other.startsWith(one)).map((other) => `${one} ⊂ ${other}`),
    );

    expect(overlapping, `prefixes that swallow another: ${overlapping.join(', ')}`).toEqual([]);
  });
});

describe('the run stamps the configuration it was scored under', () => {
  const facts = {
    timestamp: AT,
    commit: 'abc123',
    event: 'schedule',
    runUrl: 'https://example.invalid/run/1',
    // Nobody measured a window for a record this test invented.
    prWindow: 'unknown',
    expected: [],
  } as const;

  // The floors a deploy compares against were derived under one Stryker
  // configuration, and a score computed under another is not a number about
  // them. Lowering `timeoutMS` raises the score with no test touched, because a
  // timeout counts as detected — so the run has to say which configuration it
  // ran, at the moment it ran, and it cannot be told from outside.
  it('carries the hash as run context, beside the commit', () => {
    const document = renderMetrics({ ...facts, configHash: 'sha256:abcdef' });

    expect(document).toMatch(/^stacks_run_info\{[^}]*config_hash="sha256:abcdef"[^}]*\} 1 /m);
  });

  // ⚠️ An unstamped row is not a row with a wrong hash: it is a row from before
  // the stamp existed. It stays renderable, and the calibration window declines
  // to count it — which is the honest cost of closing the configuration route.
  it('renders a row that carries no hash at all', () => {
    expect(renderMetrics(facts)).toMatch(/^stacks_run_info\{/m);
    expect(renderMetrics(facts)).not.toContain('config_hash');
  });
});
