/**
 * G36 — the trend layer's series ↔ the scoreboard's `## Trends` table.
 *
 * `docs/gates.md` now admits things that are **not** gates. A trend takes no row
 * number and carries no status, so G19 — which finds rows by matching
 * `| **G7** |` and reads slugs out of three hardcoded tables — cannot see a
 * single cell of the new section. That is deliberate
 * ([`docs/spec/gate-or-trend.md`](../docs/spec/gate-or-trend.md) §5): a numbered
 * row in a fourth table would get uniqueness, gapless and status checks and no
 * slug checks at all, which is scored-looking and half-checked.
 *
 * The cost of keeping G19 untouched is that the new table is unwatched, and this
 * file is what watches it. Three things, and the third is the one the section
 * creates rather than inherits:
 *
 *   1. **Both directions.** A series the emitter produces with no row is a
 *      number nobody was told to read; a row naming a series nothing emits is a
 *      promise of a line that will never be drawn. Silence that looks like
 *      health is what the whole trend layer is arranged against.
 *   2. **Well-formed names.** Kebab-case and unique among themselves, for the
 *      reason `docs/gates.md` gives about slugs: a name written in twenty files
 *      and gated in none is the second copy ADR-0026 is about.
 *   3. **Disjoint from every gate slug.** A `Trend` column of names is invisible
 *      to G19's `slugByRow()`, so a trend named identically to a gate would
 *      collide **silently** — *"a name that names two things names neither"*
 *      going unenforced in exactly the place this spec added.
 *
 * ⚠️ **The correspondence is asserted against what the emitter actually renders,
 * not against its declaration list.** Reading `TREND_SERIES` and comparing it to
 * the table would gate a constant against a document while the bytes written to
 * the `metrics` branch went unwatched — G14's recorded lesson, where an anchored
 * regex held and the extractor still could not see `.alias()`. So this renders a
 * complete run and parses the OpenMetrics text, which is the artifact
 * `promtool` ingests and the only thing a dashboard ever sees.
 *
 * ⚠️ **Gate slugs are read here rather than from G19.** The two read the same
 * three tables of the same file, so they cannot disagree without both failing;
 * G19 carries a live `gated` finding in `docs/gate-register.md` and this ticket
 * does not touch it. Read **by header name** and never positionally — that
 * finding is precisely a positional read.
 *
 * See docs/gates.md, row G36 (trend-layer).
 */

import { describe, expect, it } from 'vitest';
import {
  METRIC_PREFIXES,
  TREND_SERIES,
  renderMetrics,
  trendNamesIn,
  type RunFacts,
} from '../scripts/lib/metrics.ts';
import { expectFound, markdownSection, readRepoFile, tableCells } from './repo.ts';

const SCOREBOARD = 'docs/gates.md';

/** The three tables that carry numbered rows — G19's list, for the same reason. */
const GATE_TABLES = ['Invariants → gates', 'Contract seams → gates', 'Defect gates'] as const;

/**
 * A complete run: every declared series computed, with plausible values.
 *
 * "Complete" is load-bearing. A crashed run renders `run_ok 0` **plus whatever
 * computed**, so its document is legitimately missing series — asserting
 * correspondence against one would report a drift that is really a crash.
 */
function completeRun(): RunFacts {
  return {
    timestamp: 1_755_600_000,
    commit: '0'.repeat(40),
    event: 'schedule',
    runUrl: 'https://github.com/mephistopheles4/stacks/actions/runs/1',
    prWindow: '#177, #179',
    expected: TREND_SERIES.map((series) => series.name),
    mutationScore: [
      { scope: 'packages/core/src', score: 0.7172 },
      { scope: 'packages/cli/src', score: 0.4559 },
    ],
    gateSuiteRuntime: 12.5,
    mutationRunRuntime: 3600,
    liveExclusions: { live: 0, declared: 25 },
    // ⚠️ Present, or this gate goes red in its **reverse** direction: the
    // Trends table names four complexity rows, and a "complete" run that
    // emitted none of them is a promise of four lines that will never be drawn.
    complexity: [
      { scope: 'packages/core/src', functions: 120, mass: 340, massOver10: 88, max: 21 },
      { scope: 'packages/cli/src', functions: 26, mass: 96, massOver10: 22, max: 14 },
    ],
    // ⚠️ Present for the same reason, and it carries **both populations**:
    // the Trends table names four scoped duplication rows and four whole-tree
    // ones, and the tree four render from `tree` alone — a fixture with only
    // `scopes` would emit four of the eight and look complete.
    duplication: {
      scopes: [
        {
          scope: 'packages/core/src',
          clones: 3,
          duplicatedLines: 46,
          ignoredLines: 0,
          totalLines: 2381,
        },
        {
          scope: 'packages/cli/src',
          clones: 0,
          duplicatedLines: 0,
          ignoredLines: 0,
          totalLines: 702,
        },
      ],
      tree: { clones: 34, duplicatedLines: 357, ignoredLines: 0, totalLines: 47_209 },
    },
    // ⚠️ Present for the same reason, and with a **smaller** `functions` than
    // the complexity rows above: the cognitive rule never visits a class field
    // initialiser or a static block, so its denominator is its own. A fixture
    // copying the cyclomatic count would assert the opposite of the spec.
    cognitive: [
      { scope: 'packages/core/src', functions: 118, mass: 296, massOver15: 61, max: 24 },
      { scope: 'packages/cli/src', functions: 25, mass: 71, massOver15: 0, max: 11 },
    ],
  };
}

/** The `Trend` column of the `## Trends` table, one name per row. */
function tabledTrends(): string[] {
  const section = markdownSection(readRepoFile(SCOREBOARD), 'Trends', SCOREBOARD);
  const lines = section.split('\n').filter((line) => line.trimStart().startsWith('|'));

  const header = lines.find((line) => /\|\s*Trend\s*\|/.test(line));
  const at = header === undefined ? -1 : tableCells(header).indexOf('Trend');
  if (at < 0) {
    throw new Error(
      `no "Trend" column in the "## Trends" table of ${SCOREBOARD}. This gate reads it by ` +
        'name, so a renamed column must fail here rather than silently read another one.',
    );
  }

  // Every body row, including one whose first cell does not parse as a name.
  // Skipping a malformed cell is the hole G29 is dispositioned `gated` for —
  // one stray backtick switching the gate off for the rest of the line — so a
  // cell that does not parse arrives here as its raw text and fails the
  // well-formedness check below rather than vanishing from the comparison.
  const body = lines.filter((line) => line !== header && !/^\|[\s|:-]+\|$/.test(line.trim()));

  const names = body.map((line) => (tableCells(line)[at] ?? '').replace(/`/g, '').trim());
  expectFound(names, 'rows in the Trends table of docs/gates.md', 20);
  return names;
}

/** Every numbered row's slug, from the **Name** column of whichever table holds it. */
function gateSlugs(): string[] {
  const source = readRepoFile(SCOREBOARD);
  const slugs: string[] = [];

  for (const table of GATE_TABLES) {
    const section = markdownSection(source, table, SCOREBOARD);
    const lines = section.split('\n');
    const header = lines.find((line) => /^\|\s*Row\s*\|/.test(line));
    const at = header === undefined ? -1 : tableCells(header).indexOf('Name');
    if (at < 0) {
      throw new Error(
        `no "Name" column in the "${table}" table of ${SCOREBOARD}. Read by name rather ` +
          'than by position, because a positional read returns a real string from the wrong column.',
      );
    }

    for (const line of lines.filter((candidate) => /^\|\s*\*\*G\d+\*\*\s*\|/.test(candidate))) {
      slugs.push((tableCells(line)[at] ?? '').replace(/`/g, '').trim());
    }
  }

  expectFound(slugs, 'gate slugs in docs/gates.md', 20);
  return slugs;
}

describe('G36 — the emitted series and the Trends table agree', () => {
  it('renders enough of both to be comparing anything', () => {
    // Both sides are extractions, and an extraction that stops matching reports
    // an empty set — which trivially satisfies every "each of these is in that"
    // below. Asserted before the comparisons rather than trusted by them.
    //
    // ⚠️ **The floor is a minimum and it tracks `TREND_SERIES`.** Eight
    // original plus this branch's eight duplication names. A stale-low value is
    // safe and a stale-high one is red, so a branch adding series raises it to
    // what *its own* tree produces and whoever rebases second adds theirs —
    // four sessions were appending to this list at once when it went to 16.
    expectFound(trendNamesIn(renderMetrics(completeRun())), 'series in a rendered run', 20);
    expectFound(tabledTrends(), 'rows in the Trends table', 20);
  });

  it('gives every emitted series a row', () => {
    const tabled = new Set(tabledTrends());
    const unlisted = trendNamesIn(renderMetrics(completeRun())).filter((name) => !tabled.has(name));

    expect(
      unlisted,
      'series written to the metrics record that no row of the "## Trends" table names. ' +
        'A number nobody was told to read is not a trend — it names a reader and a cadence ' +
        `or it is not one: ${unlisted.join(', ')}`,
    ).toEqual([]);
  });

  it('emits every series a row names', () => {
    const emitted = new Set(trendNamesIn(renderMetrics(completeRun())));
    const promised = tabledTrends().filter((name) => !emitted.has(name));

    expect(
      promised,
      'rows of the "## Trends" table naming a series nothing emits. The series is never ' +
        `red; its absence is — and this is the absence: ${promised.join(', ')}`,
    ).toEqual([]);
  });
});

describe('G36 — a trend name is well formed and means one thing', () => {
  it('gives every trend a kebab-case name', () => {
    const wrong = tabledTrends().filter((name) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name));

    expect(
      wrong,
      'rows of the "## Trends" table whose name is missing or is not a kebab-case slug. ' +
        `It is what citations elsewhere spell, so it has to be spellable: ${wrong.join(', ')}`,
    ).toEqual([]);
  });

  it('gives no two trends the same name', () => {
    const names = tabledTrends();
    const duplicated = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))];

    expect(
      duplicated,
      `trend names used by more than one row — a name that names two things names ` +
        `neither: ${duplicated.join(', ')}`,
    ).toEqual([]);
  });

  it('names no trend after a gate slug', () => {
    // The hazard the Trends section creates and G19 structurally cannot see:
    // `slugByRow()` reads three hardcoded tables, so a fourth table's names are
    // invisible to it and a collision is silent.
    const slugs = new Set(gateSlugs());
    const collisions = tabledTrends().filter((name) => slugs.has(name));

    expect(
      collisions,
      'trend names that are also gate slugs. A citation of that name is ambiguous about ' +
        'whether it means a rule that goes red or a number that never does, and G19 cannot ' +
        `see this table to catch it: ${collisions.join(', ')}`,
    ).toEqual([]);
  });
});

describe('G36 — the record says whether the run that wrote it worked', () => {
  it('renders run_ok 1 when every expected series computed', () => {
    expect(renderMetrics(completeRun())).toMatch(/^stacks_run_ok 1 1755600000$/m);
  });

  it('drops a series whose producing step failed, and says so in run_ok', () => {
    // Without this a red `pnpm test` records `run_ok 1`: the wall-clock is still
    // there, so "computed every series it declared" was satisfied by a run that
    // broke. Found by review. A failed step's number is not a measurement — a
    // suite that fails fast is faster — so the series is dropped rather than
    // published, and `run_ok` falls out of the same mechanism as a missing input.
    const broke: RunFacts = { ...completeRun(), failed: ['gate-suite-runtime'] };
    const document = renderMetrics(broke);

    expect(document).toMatch(/^stacks_run_ok 0 1755600000$/m);
    expect(trendNamesIn(document)).not.toContain('gate-suite-runtime');
    expect(trendNamesIn(document)).toContain('mutation-score');
  });

  it('renders run_ok 0 plus whatever computed when one did not', () => {
    // The distinction the record exists to keep: *never ran* is a gap in the
    // branch, *ran and broke* is an explicit zero. A crashed run that wrote
    // nothing at all would collapse them.
    const crashed: RunFacts = { ...completeRun(), mutationScore: undefined };
    const document = renderMetrics(crashed);

    expect(document).toMatch(/^stacks_run_ok 0 1755600000$/m);
    expect(document).toMatch(/^stacks_trend_gate_suite_runtime 12\.5 1755600000$/m);
    expect(trendNamesIn(document)).not.toContain('mutation-score');
  });

  it('separates run health from the trends by prefix, not by convention', () => {
    // `run_ok` is not a trend and must never need a row. The two prefixes are
    // what makes that structural rather than a list this gate has to maintain.
    expect(METRIC_PREFIXES.trend.startsWith(METRIC_PREFIXES.run)).toBe(false);
    expect(trendNamesIn(renderMetrics(completeRun()))).not.toContain('ok');
  });

  it('escapes a label value rather than letting it end the label', () => {
    // A run URL is the only label value this record carries that comes from
    // outside, and a bare `"` in one closes the label set early — which
    // promtool rejects as a parse error over the *whole file*, taking every
    // other series in the run with it. Asserted here rather than through the
    // shell, because a `&` in an argument is eaten by the tooling on this
    // platform long before it reaches the emitter.
    const hostile: RunFacts = {
      ...completeRun(),
      runUrl: 'https://example.invalid/1?a="b"\\c',
    };

    expect(renderMetrics(hostile)).toContain('run_url="https://example.invalid/1?a=\\"b\\"\\\\c"');
  });

  it('carries the PR window beside the run, because a score never appears without it', () => {
    // Panel 1 answers *is this real* before panel 2 answers *is this bad*, and
    // the window is what answers it. It rides on `run_info` rather than on a
    // series of its own — context, not a measurement — so the two arrive
    // together or not at all.
    expect(renderMetrics(completeRun())).toContain('pr_window="#177, #179"');
  });

  it('keeps an empty window and an unreadable one apart', () => {
    // ⚠️ The one distinction this label exists to preserve. `[]` against a
    // non-zero delta reads *tool noise* on sight; `unknown` is no answer at
    // all — a shallow checkout, a pruned object, a first-ever run. Rendering
    // the second as the first would manufacture a reading out of a gap.
    expect(renderMetrics({ ...completeRun(), prWindow: '[]' })).toContain('pr_window="[]"');
    expect(renderMetrics({ ...completeRun(), prWindow: 'unknown' })).toContain(
      'pr_window="unknown"',
    );
  });

  it('closes the document so promtool will ingest it', () => {
    // OpenMetrics requires a terminating `# EOF`; without it
    // `promtool tsdb create-blocks-from openmetrics` rejects the whole file,
    // and a record nothing can replay is a record that does not exist.
    expect(renderMetrics(completeRun()).endsWith('# EOF\n')).toBe(true);
  });

  it('stamps every sample with an explicit timestamp', () => {
    // Without one the store times samples at ingestion, so a fourteen-day
    // replay lands as fourteen days of *today* — a confident flat line, which
    // is the exact failure Pushgateway was rejected for.
    const undated = renderMetrics(completeRun())
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('#'))
      .filter((line) => !/ 1755600000$/.test(line));

    expect(undated, `samples carrying no timestamp: ${undated.join('; ')}`).toEqual([]);
  });
});
