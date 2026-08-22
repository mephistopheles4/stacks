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
import { parseRecord, runInfoOf, scoresOf } from './lib/metrics-read.ts';
import {
  fetchRecords,
  parseRecordName,
  readRecord,
  type FetchedRecord,
  type RecordName,
} from './lib/metrics-record.ts';
import { UNKNOWN_WINDOW, subjectsBetween, windowFrom } from './lib/pr-window.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { configHashOf } from './lib/floors.ts';
// The config Stryker actually runs, imported rather than described. The hash
// below is a fact about the configuration this run loaded, and a flag carrying
// it would let the stamp disagree with what was actually scored.
import strykerConfig from '../stryker.config.mjs';
import {
  fraction,
  readReport,
  readScopes,
  scoreRun,
  type ScoredRun,
} from './lib/mutation-score.ts';
import { countPopulation, type Counts } from './lib/complexity.ts';
import { sourceFiles } from './lib/scope-check.ts';
import {
  TREND_SERIES,
  complexityFactsOf,
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
    'failed',
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

function trendNames(raw: string | undefined, flag: string): TrendName[] {
  const declared = new Set<string>(TREND_SERIES.map((series) => series.name));
  const wanted = (raw ?? '').split(',').map((name) => name.trim()).filter((name) => name !== '');

  const unknown = wanted.filter((name) => !declared.has(name));
  if (unknown.length > 0) {
    throw new Error(`${flag} names series that are not declared in TREND_SERIES: ${unknown.join(', ')}`);
  }
  return wanted as TrendName[];
}

const flags = args(process.argv.slice(2));

/** `--expect` is required: a run that declares nothing can never report unhealthy. */
function expected(): TrendName[] {
  const wanted = trendNames(flags.get('expect'), '--expect');
  if (wanted.length === 0) {
    throw new Error('--expect is required: name what this run set out to compute');
  }
  return wanted;
}

const timestamp = seconds(flags.get('timestamp'), '--timestamp') ?? Math.floor(Date.now() / 1000);
const commit = flags.get('commit') ?? 'unknown';

/**
 * How far back the walk for a scored run goes. `scripts/deploy.ts` bounds the
 * same walk at the same figure and for the same reason, stated there.
 */
const WINDOW_RECORD_CAP = 200;

/**
 * Which pull requests merged since the run that wrote the newest record.
 *
 * **Computed here rather than passed in**, for the reason `metrics.yml`'s header
 * already gives about the `--failed` list: a `${{ }}` expression is not
 * inspectable, not testable, and this repo has already shipped one constant
 * wearing the shape of a condition. The seam that decides what the page reads is
 * `windowFrom` in `lib/pr-window.ts`, and it is a pure function over subjects.
 *
 * The previous record is found through `fetchRecords`, so **exactly one piece of
 * code still knows where the record lives** — the same anonymous fetch the sync
 * and the deploy staleness check use. Everything that can go wrong here (no
 * branch yet, offline, a shallow checkout with no such object) arrives as
 * `unknown`, which is deliberately not `[]`.
 */
function windowSincePreviousRun(): string {
  const fetched = fetchRecords();
  if (fetched === undefined) {
    console.error('no `metrics` branch to read a previous run from — the PR window is unknown');
    return UNKNOWN_WINDOW;
  }

  const previous = previousScoringRun(fetched);
  if (previous === undefined) {
    console.error('no scored run on the `metrics` branch yet — the PR window is unknown');
    return UNKNOWN_WINDOW;
  }

  const window = windowFrom(subjectsBetween(previous.commit, commit, REPO_ROOT));
  console.log(`PR window since ${previous.name}: ${window}`);
  return window;
}

/**
 * The newest run on the branch that carried scores, and the commit it ran at.
 *
 * ⚠️ **The pair has to be the pair the delta compares, and *since the previous
 * record* is not it.** A merge record lands on every push, so a nightly's
 * previous record is usually the push it ran at — an empty window, beside a
 * delta spanning everything since the previous *nightly*. That reads as **tool
 * noise** on a page built so that an empty window means exactly that, which is
 * the worst direction this label can fail in. Found on merging
 * [#181](https://github.com/mephistopheles4/stacks/pull/181), whose deploy print
 * derives the same window at read time and gets this right; the two now measure
 * one interval and share `numbersFrom`.
 *
 * **One rule for every run, merge half included.** A merge row is not in the
 * delta, so *since the last scored run* is as true of it as anything else, and a
 * second rule would be a second thing to keep in step.
 */
function previousScoringRun(fetched: FetchedRecord): { name: string; commit: string } | undefined {
  const newestFirst = fetched.names
    .map((name) => parseRecordName(name))
    .filter((record): record is RecordName => record !== undefined)
    .sort((one, other) => other.timestamp - one.timestamp || other.name.localeCompare(one.name));

  // Bounded for `scripts/deploy.ts`'s reason, and at its figure: merge records
  // are not scored, so a busy week sits between two nightlies, and the walk has
  // to stop somewhere. Reading a record is one `git cat-file`.
  for (const record of newestFirst.slice(0, WINDOW_RECORD_CAP)) {
    const bytes = readRecord(fetched.tip, record.name);
    if (bytes === undefined) continue;

    const parsed = parseRecord(bytes);
    if (scoresOf(parsed).size === 0) continue;

    const at = runInfoOf(parsed)?.['commit'];
    if (at !== undefined && at !== 'unknown') return { name: record.name, commit: at };
  }
  return undefined;
}

/**
 * The four counts over every declared population, or the four names failed.
 *
 * ⚠️ **Both failure shapes reach one destination, and only the log tells them
 * apart.** A population with no function comes back `null` from the counter; a
 * counter that could not run at all throws, and the `catch` reports the same
 * verdict for a different reason. The record is deliberately unable to
 * distinguish them: a third state would need a reader, and *the counts did not
 * arrive* is the whole of what a reader can act on.
 *
 * **The decision itself is not here.** `complexityFactsOf` owns it, in
 * `lib/metrics.ts`, where a spec can reach it — this file is excluded from the
 * `scripts` mutation scope and no spec imports it, so a rule written at this
 * level would be a rule nothing holds.
 *
 * The tree is walked once and handed to every scope, rather than eight walks.
 */
async function complexityFacts(): Promise<ReturnType<typeof complexityFactsOf>> {
  try {
    const files = sourceFiles();
    const counted = new Map<string, Counts | null>();

    for (const scope of readScopes()) {
      const counts = await countPopulation(scope, files);
      counted.set(scope.name, counts);
      console.log(
        counts === null
          ? `complexity ${scope.name}: no function in the population`
          : `complexity ${scope.name}: ${String(counts.functions)} functions, mass ${String(
              counts.mass,
            )}, over-10 ${String(counts.massOver10)}, max ${String(counts.max)}`,
      );
    }
    return complexityFactsOf(counted);
  } catch (error) {
    // Not fatal here, for `scoresFrom`'s reason: the run's other series are
    // real measurements and dropping them would lose what did compute.
    console.error(`could not count complexity: ${String(error)}`);
    return complexityFactsOf(undefined);
  }
}

const complexity = await complexityFacts();

const facts: RunFacts = {
  timestamp,
  commit,
  event: flags.get('event') ?? 'unknown',
  configHash: configHashOf(strykerConfig as unknown as Record<string, unknown>),
  runUrl: flags.get('run-url') ?? 'unknown',
  prWindow: windowSincePreviousRun(),
  expected: expected(),
  // Named by the caller because only the workflow knows a step's exit code, and
  // a series whose step failed is dropped rather than published: the number is
  // not a measurement of what the series measures.
  //
  // ⚠️ **The complexity names join it from in here**, which is the one series
  // group whose failure this process can see for itself: the counter runs in
  // this file rather than in a workflow step, so there is no exit code for the
  // caller to pass down.
  failed: [...trendNames(flags.get('failed'), '--failed'), ...complexity.failed],
  gateSuiteRuntime: seconds(flags.get('suite-seconds'), '--suite-seconds'),
  mutationRunRuntime: seconds(flags.get('mutation-seconds'), '--mutation-seconds'),
  complexity: complexity.complexity,
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
