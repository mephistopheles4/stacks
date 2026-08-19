/**
 * Gather one CI run's facts and write the metrics record for it.
 *
 *     pnpm metrics:emit --out metrics --expect gate-suite-runtime \
 *       --suite-seconds 74
 *
 * `.github/workflows/metrics.yml` calls this and commits the file it names to
 * the orphan `metrics` branch. The rendering lives in `scripts/lib/metrics.ts`,
 * which `gates/trend-layer.test.ts` imports; this file is the plumbing around
 * it — argument parsing, the report on disk, the filename, and the exit code.
 *
 * **What this file does that the library cannot:** decide the *filename*, which
 * is `metrics/<timestamp>-<sha>.prom`. One file per run, because both events
 * write — a merge and a nightly can land minutes apart, and appending to one
 * shared file makes them contend on the same bytes. Separate paths reduce the
 * race to a ref update, which `git pull --rebase` retries cleanly.
 *
 * ⚠️ **It exits red when a declared series did not compute, and writes the file
 * anyway.** That ordering is the whole point: `run_ok 0` **plus whatever
 * computed** is what keeps *never ran* — a gap in the branch — distinguishable
 * from *ran and broke*, an explicit zero. A run that failed loudly and wrote
 * nothing would collapse the two into one silence.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/repo-root.ts';
import {
  fraction,
  readReport,
  readScopes,
  scoreRun,
  type ScoredRun,
} from './lib/mutation-score.ts';
import {
  TREND_SERIES,
  renderMetrics,
  type RunFacts,
  type ScopeScore,
  type TrendName,
} from './lib/metrics.ts';

/** `--flag value` pairs, and nothing else. Unknown flags throw rather than being ignored. */
function args(argv: readonly string[]): Map<string, string> {
  const known = new Set([
    'out',
    'expect',
    'report',
    'suite-seconds',
    'mutation-seconds',
    'commit',
    'event',
    'run-url',
    'timestamp',
  ]);
  const parsed = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 2) {
    const flag = (argv[i] ?? '').replace(/^--/, '');
    const value = argv[i + 1];
    if (!known.has(flag) || value === undefined) {
      throw new Error(
        `unknown or valueless flag: ${argv[i] ?? ''}. A typo'd flag must fail here rather ` +
          'than be dropped, which would write a record missing a series and call it healthy.',
      );
    }
    parsed.set(flag, value);
  }
  return parsed;
}

/** A number from a flag, or `undefined` when the flag is absent. Never `NaN`. */
function seconds(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} is not a number: ${raw}`);
  return parsed;
}

/** Per-scope scores from a Stryker report, or `undefined` when there is no report to read. */
function scoresFrom(path: string | undefined): {
  mutationScore?: ScopeScore[];
  liveExclusions?: { live: number; declared: number };
} {
  if (path === undefined) return {};

  let run: ScoredRun;
  try {
    run = scoreRun(readReport(path), readScopes());
  } catch (error) {
    // Not fatal here. A missing or unreadable report is exactly the crashed-run
    // case, and the caller's `--expect` list turns it into `run_ok 0`.
    console.error(`could not score ${path}: ${String(error)}`);
    return {};
  }

  const mutationScore = run.scopes.map((scope) => {
    const tally = run.perScope.get(scope.name);
    if (tally === undefined) throw new Error(`no tally for scope ${scope.name}`);
    return { scope: scope.name, score: fraction(tally) };
  });

  return {
    mutationScore,
    liveExclusions: { live: run.live.size, declared: run.declaredExclusions },
  };
}

function trendNames(raw: string | undefined): TrendName[] {
  const declared = new Set<string>(TREND_SERIES.map((series) => series.name));
  const wanted = (raw ?? '').split(',').map((name) => name.trim()).filter((name) => name !== '');

  const unknown = wanted.filter((name) => !declared.has(name));
  if (unknown.length > 0) {
    throw new Error(
      `--expect names series that are not declared in TREND_SERIES: ${unknown.join(', ')}`,
    );
  }
  if (wanted.length === 0) throw new Error('--expect is required: name what this run set out to compute');
  return wanted as TrendName[];
}

const flags = args(process.argv.slice(2));

const timestamp = seconds(flags.get('timestamp'), '--timestamp') ?? Math.floor(Date.now() / 1000);
const commit = flags.get('commit') ?? 'unknown';

const facts: RunFacts = {
  timestamp,
  commit,
  event: flags.get('event') ?? 'unknown',
  runUrl: flags.get('run-url') ?? 'unknown',
  expected: trendNames(flags.get('expect')),
  gateSuiteRuntime: seconds(flags.get('suite-seconds'), '--suite-seconds'),
  mutationRunRuntime: seconds(flags.get('mutation-seconds'), '--mutation-seconds'),
  ...scoresFrom(flags.get('report')),
};

const document = renderMetrics(facts);

// The filename is sortable by time and unique by commit. `<timestamp>` first
// because a directory listing is the cheapest possible staleness read, and
// `<sha>` second because two runs can share a second but not a commit *and* a
// second.
const directory = join(REPO_ROOT, flags.get('out') ?? 'metrics');
mkdirSync(directory, { recursive: true });
const file = join(directory, `${timestamp}-${commit.slice(0, 12)}.prom`);
writeFileSync(file, document, 'utf8');

console.log(file);
console.log(document);

// Read back out of the rendered document rather than recomputed here, so the
// exit code cannot disagree with the bytes that were written.
if (/^stacks_run_ok 0 /m.test(document)) {
  console.error('run_ok 0 — a declared series did not compute. The record was written anyway.');
  process.exit(1);
}
