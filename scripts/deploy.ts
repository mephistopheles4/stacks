/**
 * Publishing the shelf.
 *
 * The vault is private, local, and gitignored, so CI can never build the real
 * site — it can only ever build the fixture one. That makes deploying a local
 * operation by construction, and it means every check that runs before a deploy
 * has to run here.
 *
 * Two things this script exists to get right.
 *
 * **Order.** `gate:public` and `smoke:render` both stage a *fixture* vault into
 * `packages/site/public/`. Run either one after building from the real vault and
 * the folder holds eight invented books; deploy that and you have published the
 * fixtures. So the gates run first and the real build runs last, always, and
 * that is not a style preference — it is the difference between publishing your
 * library and publishing a test.
 *
 * **Checking the artifact, not the code path.** `gate:public` proves the code
 * cannot leak, using fixtures. It says nothing about the folder actually about
 * to be uploaded. The pre-flight below re-asserts the same properties against
 * the real `dist/` — no private books, no wishlist books, no orphan covers, no
 * vault paths, every shipped key a named field, an absolute og:image — because
 * the thing that gets published is the thing worth checking.
 *
 * ⚠️ **One of those rules does not survive the trip, and this comment used to
 * say it did.** It claimed "no note bodies", and the `note-body` rule greps for
 * a canary that exists only in `fixtures/vault` — so on a real-vault deploy it
 * cannot fire. It is honest inside `pnpm gate:public`, where the canary is
 * planted, and vacuous here. What holds invariant 2 on this folder is
 * structural — no `BookRecord` field carries a body — and the `unknown-key`
 * rule is that structure asserted rather than assumed. ⚠️ **It checks key
 * names, never values.** See `scripts/lib/public-build.ts` and
 * `docs/spec/trend-layer.md` §5.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../packages/cli/src/env.ts';
import { ObsidianAdapter } from '../packages/core/src/adapters/obsidian-adapter.ts';
import {
  PROPAGATION_ATTEMPTS,
  describeStaleCover,
  probeBuild,
  probeCovers,
  stampMeta,
  stampOf,
} from './lib/edge-probe.ts';
import {
  WINDOW_RUNS,
  calibration,
  floorRefusals,
  nightliesIn,
  readFloors,
  scoredIn,
  renderFloorLines,
  runRowsFrom,
} from './lib/floors.ts';
import { gitOutput } from './lib/git.ts';
import {
  GATED_SERIES,
  SPINE_LANDED,
  STALE_AFTER_DAYS,
  judgeRecord,
  parseRecord,
  runInfoOf,
  scoresOf,
  type ParsedRecord,
} from './lib/metrics-read.ts';
import {
  parseRecordName,
  probeRecords,
  readRecord,
  storedRecords,
  type FetchedRecord,
} from './lib/metrics-record.ts';
import {
  readDeclarations,
  readReport,
  scoreRun,
  total,
  type MutationReport,
  type Scope,
  type Tally,
} from './lib/mutation-score.ts';
import { inspectPublicBuild, type PublicBuildRule } from './lib/public-build.ts';
import { numbersFrom } from './lib/pr-window.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { runShell } from './lib/run.ts';
import { emptyScopes, sourceFiles } from './lib/scope-check.ts';
import {
  asDate,
  renderPanel,
  renderRefusal,
  scoredRecords,
  type Disambiguation,
  type PrWindow,
} from './lib/trend-report.ts';

// The same loader the CLI uses, rather than a third hand-rolled `.env` parser:
// a real environment variable still wins, so `SITE_URL=... pnpm deploy` does
// what it says. Without this the script would not see STACKS_VAULT at all,
// because only the CLI was ever reading the file.
loadEnv();

const DIST = join(REPO_ROOT, 'packages', 'site', 'dist');

/** How `dist/` is named in messages, so they read the same on every platform. */
const DIST_LABEL = 'packages/site/dist';

/**
 * How many records one deploy will read looking for a window, at the most.
 *
 * Merge records are not window members, so a busy week of pushes sits between
 * two nightlies; this is the bound that keeps that from being an unbounded
 * walk. Generous rather than tight — reading a record is one `git cat-file`.
 */
const WINDOW_RECORD_CAP = 200;

/** Pinned: a deploy tool that silently changes under you is not a deploy tool. */
const WRANGLER = 'wrangler@4';

// How long to give the edge, how a page names its build, and how a refusal is
// told apart from a stale answer all live in `./lib/edge-probe.ts` now. Surface
// D — the same question asked between deploys, from `pnpm trend:sync` — is the
// second caller, and two callers deriving one contract is what ADR-0030 is
// about. It is also the first in-process oracle this check has ever had: from
// here its only one drives this whole script as a child process.


const dryRun = process.argv.includes('--dry-run');

/**
 * `--check-only`: ask the live site which build it is serving, and stop.
 *
 * Builds nothing, uploads nothing, reads the stamp out of the `dist/` that was
 * last published. It exists because the alternative advice — re-run the whole
 * deploy — answers a question by doing the thing the question is about, which
 * is both slow and a poor way to investigate a stale edge. It also makes this
 * check runnable against a local server, which is the only way to watch it
 * fail on purpose.
 */
const checkOnly = process.argv.includes('--check-only');

/**
 * Every refusal in this file, and which flags clear it.
 *
 * ⚠️ **The convention: a refusal says which flags clear it, right where it is
 * written.** Adopted because a flag whose reach is undocumented is how
 * `--skip-gates` came to skip the whole contract with nothing saying so (#152),
 * and because measuring this file found **roughly a dozen refusals outside that
 * flag's reach and four inside it, said nowhere**. The four inside were the
 * step-1 gate commands, and **the flag is gone** — deleted for the reason
 * [ADR-0064](../docs/adr/0064-no-flag-skips-the-deploy-gates.md) records.
 *
 * **The convention outlived it**, because it was never about one flag. Three
 * remain, every refusal below says which of them clear it, and the roster itself
 * is now held to `docs/commands.md` in both directions by G45 (`deploy-flags`)
 * — so the *next* undocumented flag is red the day it lands rather than the day
 * somebody greps.
 *
 * A comment convention, not a gate — there is no way to assert "this comment is
 * true of the code beside it" that is not a gate matching prose, which this repo
 * has learned three times matches anything. What makes it hold is that the
 * comment sits at the refusal, so an edit to one is an edit next to the other.
 */
function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

/**
 * `runShell` — the shell and the joined command line are its business, not this
 * script's. All this adds is the failure style: a deploy that stops should say
 * so in the same shape as every other refusal here, not as a stack trace.
 *
 * **Which flags clear this depends on the call site, so each one says.** A
 * failing command is a refusal like any other; what differs is whether the
 * command runs at all, and that is the caller's question rather than this
 * function's.
 */
function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): void {
  try {
    runShell(command, args, { env });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

// ── 0. Everything the deploy needs, checked before anything runs ────────────
//
// The branch comes first, before SITE_URL and before the vault, because it is
// the check most likely to be the reason you should not be here at all — and
// because a refusal that arrives after two minutes of gates is a refusal people
// learn to pre-empt with the override.
//
// Until worktrees, "am I on the right branch" answered itself: there was one
// checkout and you were standing in it. Now there can be four, each on a
// different branch, each with a shell open, and every one of them reads the
// same `.env` — so every one of them has SITE_URL and CF_PAGES_PROJECT and can
// publish to the live domain with one command that looks identical in all four.
//
// ADR-0019 already accepts that the live site may drift from `main`;
// that was about *when* you deploy, with one checkout to deploy from. This is
// about publishing a branch nobody has reviewed to the address people have.
// Refusing wrongly costs one flag. Publishing wrongly is live.
if (!checkOnly && !dryRun) assertPublishableBranch();

/**
 * Refuses to publish anything but `main`.
 *
 * `--any-branch` is the deliberate override, named so it cannot be typed by
 * accident and reads in shell history as what it is. `--dry-run` and
 * `--check-only` skip this entirely: neither uploads, and a dry run from a
 * feature branch is exactly how you would check this path before merging.
 *
 * A detached HEAD is refused too. It has no branch name, which means nobody can
 * say afterwards what was published.
 *
 * **Cleared by `--any-branch`, and never reached under `--dry-run` or
 * `--check-only`** — the call above is guarded on both. Nothing else clears it,
 * and nothing else clears the gates it runs before either.
 */
function assertPublishableBranch(): void {
  if (process.argv.includes('--any-branch')) {
    console.log('--any-branch: publishing a branch other than main, deliberately');
    return;
  }

  // Not a checkout at all — a tarball, say. Nothing to assert against, and
  // refusing here would block a legitimate deploy for no reason.
  const branch = gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], REPO_ROOT);
  if (branch === undefined) return;
  if (branch === 'main') return;

  fail(
    `on branch "${branch === 'HEAD' ? 'a detached HEAD' : branch}", not main.\n` +
      `  This publishes to ${process.env['SITE_URL'] ?? 'the live site'}, and every worktree\n` +
      '  shares one .env — so this command looks the same from every checkout you have open.\n\n' +
      '  Merge first, or say so on purpose:\n' +
      '      pnpm deploy:site --any-branch',
  );
}

// SITE_URL is required rather than optional. Without it the build emits a
// relative og:image, every link-preview scraper renders nothing, and the shelf
// arrives at its one moment — being sent to someone — as a bare URL. A deploy
// that silently produces that is worse than one that refuses.
//
// No flag clears either of the two refusals below. Every mode needs this value:
// a build bakes it into the page, and `--check-only` has nowhere to ask about
// without it.
const siteUrl = process.env['SITE_URL'];
if (siteUrl === undefined || siteUrl.length === 0) {
  fail(
    'SITE_URL is not set.\n' +
      '  Cloudflare Pages serves your production branch at https://<project>.pages.dev,\n' +
      '  so set it to that (or your custom domain) in .env:\n' +
      '      SITE_URL=https://stacks.pages.dev\n' +
      '  Without it the link preview shows no image, which is the one thing it is for.',
  );
}
try {
  new URL(siteUrl);
} catch {
  fail(`SITE_URL is not a valid URL: ${siteUrl}`);
}

// ── 0b. G39's deploy half: the reading ritual, and what a stale record refuses ─
//
// **The moment is this one.** A trend is obliged to reach a person on a
// cadence, and *"read it when something looks wrong"* is the unread-dashboard
// failure wearing a schedule; a weekly calendar cadence has nothing holding it
// and stops happening in month three, which is the same rot GitHub applies to
// scheduled workflows after 60 days. So the deploy prints, and separately it
// refuses. See docs/spec/trend-layer.md §4.
//
// Before the vault and before the gates, and both have a reason. It reads the
// local store and git and nothing else — no vault, no site, no network on the
// happy path — so it does not belong behind the questions about where to
// publish from and to. And a refusal that arrives after four minutes of gates
// is one people learn to pre-empt, which is the argument the branch guard above
// already makes about itself.
//
// ⚠️ **The honest cost, stated rather than papered over: if you go a long time
// without deploying, you go that long without learning.** The surface is only
// as frequent as the deploys, nothing here fixes that, and it is the second of
// three places that shape appears in this spec.
/**
 * How far back into the store one deploy reads.
 *
 * The healthy case stops on the first record: a nightly emits all four series,
 * so the loop below breaks as soon as it has them and a second one carrying
 * scores for the delta. The cap only binds when a series is **missing**, where
 * every further record read buys nothing but a better sentence — once the scan
 * is past the bound, a series not yet seen is stale whatever its true age.
 */
const RECORD_LOOKBACK = 30;

/**
 * Where `pnpm mutation:run` leaves its report on this machine.
 *
 * ⚠️ **Above the call below, and that is not style.** `reportTrendRecord()`
 * runs at module scope, and a `const` it reads declared after it is in the
 * temporal dead zone — the script dies on `Cannot access 'REPORT_PATH' before
 * initialization` before any check runs. The functions hoist; their constants
 * do not, which cost this file two stack traces on two separate passes.
 */
const REPORT_PATH = join(REPO_ROOT, 'artifacts', 'stryker', 'current', 'mutation.json');

reportTrendRecord();

/**
 * The store's newest records, parsed, newest first.
 *
 * ⚠️ **Parsed, not named.** The filename orders the candidates and answers
 * nothing: staleness here is per-series, and `1755600000-a1b2c3d.prom` cannot
 * say which series that run emitted. #121 designed this check to read a
 * filename, which was cheap and exactly right for the aggregate bound it was
 * written against; #140 made the bound per-series and that design could not
 * follow. See `scripts/lib/metrics-read.ts`.
 */
function trendRecords(store: FetchedRecord): ParsedRecord[] {
  const ordered = store.names
    .map((name) => parseRecordName(name))
    .filter((record) => record !== undefined)
    .sort((one, other) => other.timestamp - one.timestamp || other.name.localeCompare(one.name));

  const parsed: ParsedRecord[] = [];
  const seen = new Set<string>();
  let scored = 0;

  for (const record of ordered.slice(0, RECORD_LOOKBACK)) {
    const bytes = readRecord(store.tip, record.name);
    if (bytes === undefined) continue;

    const document = parseRecord(bytes);
    parsed.push(document);
    for (const [series, stamp] of document.trends) if (stamp !== undefined) seen.add(series);
    if (scoresOf(document).size > 0) scored += 1;

    // Two records carrying scores, because panel 1 is a delta and a delta needs
    // the run before this one. A merge record carries one series, so "the
    // previous record" and "the previous run that scored" are not the same
    // thing.
    if (seen.size >= GATED_SERIES.length && scored >= 2) break;
  }
  return parsed;
}

/**
 * The pull requests merged between the two runs the panel compares.
 *
 * ⚠️ **`undefined` and `[]` are different answers, and the distinction is the
 * whole of panel 1.** An empty window beside a non-zero delta is a direct
 * measurement of the tool disagreeing with itself at a fixed commit — the
 * nightly runs whether or not `main` moved — while *the commits this record
 * names are not in this checkout* is nobody having measured anything.
 */
function prWindow(records: readonly ParsedRecord[]): PrWindow {
  // The same two runs the panel compares, for the reason `scoredRecords` gives:
  // a window measured between a different pair attributes a movement to pull
  // requests that had nothing to do with it.
  const [latest, previous] = scoredRecords(records);
  const to = latest === undefined ? undefined : runInfoOf(latest)?.['commit'];
  const from = previous === undefined ? undefined : runInfoOf(previous)?.['commit'];
  if (to === undefined || from === undefined || to === 'unknown' || from === 'unknown') return undefined;

  const subjects = gitOutput(['log', '--format=%s', `${from}..${to}`], REPO_ROOT);
  if (subjects === undefined) return undefined;

  // ⚠️ **Through `numbersFrom`, and no longer through a regex of its own.** The
  // record now carries a `pr_window` label — the page cannot run git, so a label
  // is its only route to this fact — and two spellings of *what is a merged pull
  // request* would let the print and the page disagree about one commit range.
  // The shared one is also stricter: it anchors the suffix, so `(#99)` mentioned
  // mid-subject is a reference rather than a merge.
  return numbersFrom(subjects.split('\n'));
}

/**
 * The last mutation run on this machine — and **three states, not two.**
 *
 * ⚠️ **Unreadable is its own answer, beside present and absent.** Both readers
 * are a bare `JSON.parse`, and a `pnpm mutation:run` interrupted partway
 * through its ~41 minutes leaves a truncated `mutation.json` behind. Read
 * unguarded, that throws out of a **print** and takes the whole deploy with it
 * — before the freshness verdict, before the gates, as a raw stack trace. The
 * two steps below say the panel prints and the refusals are separate; a parse
 * error broke both, and it broke them from the least important half.
 *
 * ⚠️ **One reader because there were two call sites and the crash was in both.**
 * Guarding step 0b alone would have moved the stack trace two steps later
 * rather than removed it — the instance fixed and the population left, which is
 * the failure this rollout's own spec is a catalogue of.
 *
 * The distinction is kept rather than collapsed to `undefined`: *nobody ran it*
 * is the ordinary case on a fresh checkout, and *it is there and I cannot read
 * it* is a fault worth naming. Silently treating the second as the first is
 * this repo's oldest rule about instruments, broken.
 */
type MutationRun =
  | { kind: 'none' }
  | { kind: 'unreadable'; why: string }
  | { kind: 'read'; report: MutationReport; scopes: Scope[] };

function lastMutationRun(): MutationRun {
  if (!existsSync(REPORT_PATH)) return { kind: 'none' };

  try {
    return { kind: 'read', report: readReport(REPORT_PATH), scopes: readDeclarations().scopes };
  } catch (error) {
    return { kind: 'unreadable', why: error instanceof Error ? error.message : String(error) };
  }
}

/** Each scope's per-mutant resolution, from the last run **on this machine**. */
function scopeResolution(run: MutationRun): { resolution?: Map<string, Tally>; note?: string } {
  if (run.kind === 'none') {
    return { note: 'no per-mutant resolution — `pnpm mutation:run` writes one, and the record carries only the score' };
  }
  if (run.kind === 'unreadable') {
    return {
      note: `per-mutant resolution unreadable — ${run.why}\n    The report is there and cannot be parsed; \`pnpm mutation:run\` writes a fresh one.`,
    };
  }

  return {
    resolution: scoreRun(run.report, run.scopes).perScope,
    // Named rather than assumed: the record's score comes from a runner and the
    // resolution beside it comes from whenever this machine last ran Stryker.
    note: "resolution is this machine's last mutation run, which is not the run above",
  };
}

/**
 * One anonymous fetch of the branch tip, spent only when the refusal fires.
 *
 * A stale local store has two unrelated causes wearing one face — **you have
 * not synced**, and **CI stopped writing** — with opposite fixes. One request
 * tells them apart. Counting files is the right unit here and a filename is a
 * perfectly good answer to *"is there anything I have not imported"*; it is
 * *which series is stale* that a name cannot answer.
 */
function disambiguate(store: FetchedRecord | undefined): Disambiguation {
  const branch = probeRecords();
  if (branch === undefined) return { kind: 'unreachable' };

  const held = new Set(store?.names ?? []);
  const newer = branch.names.filter((name) => !held.has(name));
  if (newer.length > 0) return { kind: 'newer', newer: newer.length };

  const newest = branch.names
    .map((name) => parseRecordName(name))
    .filter((record) => record !== undefined)
    .sort((one, other) => other.timestamp - one.timestamp)[0];
  return { kind: 'same', branchNewest: newest === undefined ? undefined : asDate(newest.timestamp) };
}

/**
 * Print the panel; refuse on the instrument.
 *
 * **The score never refuses.** *"Write better tests"* is not a diff and 71.4%
 * has no named remedy, so a movement is printed and acted on by a person. What
 * refuses is a record too stale to read a movement out of — a question about
 * the pipe rather than a judgment about the code.
 *
 * **Which flags clear it: none that publish.** `--dry-run` runs this and uploads
 * nothing, and `--check-only` warns instead of refusing — the rule step 0c already
 * applies to the empty-scope residual, and for the same reason: that mode
 * exists to ask a live origin what it is serving, and the age of a local record
 * says nothing about that.
 */
function reportTrendRecord(): void {
  const now = Math.floor(Date.now() / 1000);
  const store = storedRecords();
  const records = store === undefined ? [] : trendRecords(store);
  const verdict = judgeRecord({ now, records });

  if (records.length === 0) {
    // The dated bootstrap's whole visible half. Printed rather than silent: a
    // deploy that said nothing during the exemption would make the first sign
    // of this machinery a refusal three days later.
    console.log(`\ntrend record — no record yet (spine landed ${SPINE_LANDED})`);
  } else {
    const { resolution, note } = scopeResolution(lastMutationRun());
    for (const line of renderPanel({
      now,
      records,
      held: store?.names.length ?? 0,
      window: prWindow(records),
      resolution,
      resolutionNote: note,
    })) {
      console.log(line);
    }
  }

  if (verdict.kind === 'fresh') return;

  if (verdict.kind === 'bootstrap') {
    console.log(
      `  day ${String(verdict.days)} of the dated bootstrap; this refuses from day ${String(STALE_AFTER_DAYS)}.\n` +
        '  `pnpm trend:sync` imports whatever the nightly has written since.',
    );
    return;
  }

  const message = renderRefusal(verdict, now, disambiguate(store), records.length);
  if (checkOnly) {
    console.warn(`\n! ${message}`);
    return;
  }
  fail(message);
}

// No flag clears either of these two. ⚠️ **Including `--check-only`, which
// builds nothing and therefore never reads the vault** — stated rather than
// quietly relaxed, because loosening it is a behaviour change and this pass is
// a comment convention. A `--check-only` run on a machine with no vault
// configured refuses here, and the refusal is about the environment rather than
// about the site it was asked to inspect.
const vault = process.env['STACKS_VAULT'];
if (vault === undefined || vault.length === 0) fail('STACKS_VAULT is not set (see .env.example)');
if (!existsSync(vault)) fail(`STACKS_VAULT points at nothing: ${vault}`);

// ── 0c. G38's deploy half: a declared scope that scored nothing ─────────────
//
// The one clause of `mutation-scope` the disk cannot answer. `pnpm test` has
// already asserted everything structural — the scope exists, its glob matches
// files, every source directory is declared or excluded — so what is left here
// is the residual: **the glob matched files and Stryker still produced zero
// mutants.** Every structural cause is red at merge in two seconds; this one
// needs a run's evidence, and the newest run on this machine is the only
// evidence a deploy has.
//
// Before the gates rather than after them, because a refusal that arrives after
// four minutes is a refusal people learn to pre-empt with the override — the
// argument step 0 already makes about the branch guard.
assertNoEmptyScopes();

// ── 0c. The mutation floor: the print, and the four refusals ────────────────
//
// Beside the block above and for its reason: a refusal that arrives after four
// minutes of gates is a refusal people learn to pre-empt with an override.
//
// **The floor is one of three routes down and the only one this can see.** A
// disable directive is caught at merge by `gates/ignored-mutants.test.ts`, and
// a change to the scoring configuration is caught here by the config hash —
// which is why the hash refuses on its own rather than beside a breach it
// cannot vouch for.
reportFloors();

/**
 * Refuses when a declared scope's files exist and its mutants do not.
 *
 * **Which flags clear it: none, on any path that publishes.** `--dry-run` runs
 * this and is the honest way to watch it fail on purpose, since it uploads
 * nothing.
 * `--check-only` warns instead of refusing, on the pre-flight's own rule — that
 * mode exists to investigate a stale edge, and a check that refused to run
 * would answer the question by declining to ask it.
 *
 * ⚠️ **No report is a print, never a silence.** This repo's oldest rule about
 * instruments is that a probe which silently did nothing would be worse than no
 * probe, and a machine that has never run `pnpm mutation:run` is the ordinary
 * case rather than a fault.
 *
 * ⚠️ **The residual this carries, stated rather than found later: the report is
 * a snapshot and nothing here knows how old it is.** A legitimate scope change
 * made after the last run reads exactly like a scope that stopped producing
 * mutants, and the remedy — `pnpm mutation:run` — is named in the refusal
 * because Clause A asks for a reachable one. Staleness itself belongs to G39
 * (`metrics-freshness`) in step 0b above, which reads the record's own
 * timestamps; duplicating half of it here would be two implementations of one
 * question.
 */
function assertNoEmptyScopes(): void {
  const run = lastMutationRun();

  if (run.kind === 'none') {
    console.log(
      '\n  no mutation report on this machine — the zero-mutant residual is unchecked.\n' +
        '  `pnpm mutation:run` writes one; every structural half of this rule ran in `pnpm test`.',
    );
    return;
  }
  if (run.kind === 'unreadable') {
    // A print and not a refusal, on this step's own rule — *no report is a
    // print, never a silence* — and for the same reason the absent case is one:
    // an unreadable report is a fact about this machine's last run, not about
    // the scopes. It says so rather than reading as *checked and clean*.
    console.log(
      `\n  the mutation report on this machine cannot be read — ${run.why}\n` +
        '  The zero-mutant residual is unchecked. `pnpm mutation:run` writes a fresh report.',
    );
    return;
  }

  const empty = emptyScopes(run.report, run.scopes, sourceFiles());
  if (empty.length === 0) return;

  const listed = empty.join(', ');
  const why =
    'A declared scope whose files exist and whose mutants do not is a broken declaration: ' +
    'it measures nothing, so the code it names can go away without any number moving.\n' +
    '    - Fix the declaration in stryker.scopes.json — point the glob at the new path, or\n' +
    '      narrow the exclusion that widened over the last file in it.\n' +
    '    - Deleting the scope is a legitimate fix AND the cheapest way to stop measuring an\n' +
    '      inconvenient one. It takes the visible diff and the floors-file notes entry that\n' +
    '      every other lowering carries.\n' +
    '    - If the report simply predates a legitimate change: `pnpm mutation:run`.';

  if (checkOnly) {
    console.warn(`\n! declared scope(s) with no mutants in the last run: ${listed}\n  ${why}`);
    return;
  }

  fail(
    `declared scope(s) produced no mutants in the last run: ${listed}\n\n  ${why}\n\n` +
      '  No flag clears this, and --dry-run runs it. --check-only reports instead of\n' +
      '  refusing, and publishes nothing.',
  );
}

/**
 * The floors block: what every scope stands at, and the four things it refuses.
 *
 * **Which flags clear it: none.** That is the design rather than an omission —
 * deploy is about to carry two metric refusals, and *the flag would get reached
 * for on the stale-record refusal*: a dead pipe is the ordinary, blameless
 * reason a deploy stops, so one blanket override gets typed for that and
 * silently clears the floor as well. See
 * [ADR-0061](../docs/adr/0061-the-mutation-floor-refuses-deploy.md).
 * `--dry-run` runs every refusal here and uploads nothing, which is the honest
 * way to watch one fail on purpose.
 *
 * ⚠️ **`--check-only` does not reach this at all, and that differs from the
 * block above it on purpose.** `assertNoEmptyScopes` warns under `--check-only`
 * because that mode exists to investigate a stale edge and a residual is worth
 * mentioning. The spec is explicit the other way here: *"`--dry-run` exercises
 * all of these and uploads nothing. `--check-only` skips straight to the origin
 * check and does not."* The two blocks are inconsistent by decision, not by
 * accident.
 *
 * **It prints before it refuses.** The print is the whole mechanism that ends
 * the disarmed period — it converts *indefinite* into a dated question asked
 * repeatedly of the one person who can answer it — and a refusal that suppressed
 * it would hide the countdown on exactly the deploys where somebody is looking.
 *
 * ⚠️ **Nothing here arms anything, and nothing here writes the floors file.**
 * Arming is a human judgement after a window fills, per scope, and the windows
 * start together — there is no single moment at which the ratchet is armed.
 */
function reportFloors(): void {
  if (checkOnly) return;

  const floors = readFloors();
  const declared = readDeclarations().scopes;
  const names = declared.map((scope) => scope.name);

  // Whatever the last sync left in the object store. This fetches nothing: a
  // deploy asks a question the store can answer offline, and how fresh that
  // answer is has its own refusal rather than a second opinion here.
  const rows = runRowsFrom(windowRecords(storedRecords()));

  // ⚠️ **The newest run that *scored*, never the newest record.** `metrics.yml`
  // writes on every push to `main` and a merge record carries no per-scope
  // score, so on a busy week the newest record is a merge — read that as the
  // newest run and every armed scope reports *no score in the record*, which is
  // a floor refusing nothing at exactly the moment somebody is deploying. A
  // crashed nightly is dropped for the same reason: it measured nothing.
  //
  // It is also the trend panel's own subject, which is what stops the two
  // blocks below printing different numbers for one scope.
  const scored = scoredIn(rows);
  const newest = scored.at(-1);
  const previous = scored.at(-2);

  // The same read the trend panel above already did, handed on rather than
  // repeated: one answer to *what did the last local run measure*.
  const mutants = mutantsPerScope(lastMutationRun());
  const readings = names.map((scope) => ({
    scope,
    score: newest?.scores.get(scope) ?? null,
    previous: previous?.scores.get(scope),
    mutants: mutants.get(scope),
  }));

  console.log('');
  // ⚠️ **Stateless, on purpose.** This said "every scope is unarmed", which is
  // true today and goes false the moment somebody arms one — a decaying claim
  // printed above a table that states the real answer per scope anyway.
  console.log(
    'mutation floors — one line per declared scope; arming is a human judgement, per scope, after its own window fills',
  );
  const lines = renderFloorLines({
    floors,
    readings,
    window: calibration(rows, names, floors.configHash),
    today: localToday(),
  });
  for (const line of lines) console.log(`  ${line}`);

  if (newest === undefined) {
    console.log('');
    console.log('  no run in the record on this machine — `pnpm trend:sync` imports what CI wrote.');
  }

  const refusals = floorRefusals({
    floors,
    declared: names,
    ...(newest === undefined ? {} : { run: { ...(newest.configHash === undefined ? {} : { configHash: newest.configHash }) } }),
    readings,
  });
  // The first, not all of them: a deploy refusal is read by somebody who is
  // about to fix one thing, and four at once reads as a broken machine rather
  // than as a decision to make.
  const first = refusals[0];
  if (first !== undefined) fail(first);
}

/**
 * The records one deploy reads for the calibration window.
 *
 * ⚠️ **A separate read from `trendRecords`, and not a duplicate of it.** That
 * one answers *is the record fresh* and stops as soon as it has seen every
 * series plus one more scoring run — one or two records on a healthy machine.
 * This one answers *how far has the window filled*, which needs twenty
 * consecutive nightlies. Same store, same parser, different question.
 *
 * It reads newest-first and stops once it has enough nightlies to fill a
 * window, so a healthy machine pays for twenty-one records rather than for the
 * whole branch. The hard cap is what stops a store full of merge records —
 * which score nothing and are not window members — turning one deploy into an
 * unbounded walk.
 */
function windowRecords(store: FetchedRecord | undefined): ParsedRecord[] {
  if (store === undefined) return [];

  const ordered = store.names
    .map((name) => parseRecordName(name))
    .filter((record) => record !== undefined)
    .sort((one, other) => other.timestamp - one.timestamp || other.name.localeCompare(one.name));

  const parsed: ParsedRecord[] = [];
  let nightlies = 0;

  for (const record of ordered.slice(0, WINDOW_RECORD_CAP)) {
    const bytes = readRecord(store.tip, record.name);
    if (bytes === undefined) continue;

    const document = parseRecord(bytes);
    parsed.push(document);
    // Counted through the same predicate the window uses, rather than a second
    // copy of the literal: `floors.ts` says these two must not drift and this is
    // where the drift would have started.
    nightlies += nightliesIn(runRowsFrom([document])).length;
    // One past the window, because the print's delta needs the run before the
    // newest one.
    if (nightlies > WINDOW_RUNS) break;
  }
  return parsed;
}

/**
 * Mutants per declared scope, from the newest local run, for the per-mutant
 * resolution the print and the breach both carry.
 *
 * ⚠️ **The scores come from the record and this comes from the local report,
 * and mixing them is deliberate.** A floor is derived from CI runs and compared
 * against CI runs — comparing one to a local report would be the two-machine
 * comparison the calibration rule exists to forbid. But *how many mutants a
 * scope holds* is a property of the tree rather than of the machine, and it is
 * the number that says whether a floor is one test away or ten. Absent when no
 * report exists, which prints as a line without it rather than as a silence.
 */
function mutantsPerScope(run: MutationRun): Map<string, number> {
  const counts = new Map<string, number>();
  // ⚠️ **Three states, not two, and this reads none of them off the disk
  // itself.** `readReport` is a bare `JSON.parse`, and an interrupted
  // `pnpm mutation:run` leaves a truncated `mutation.json` — a third reader here
  // would throw out of the print and kill the deploy *before* the gates, which
  // is the fault `lastMutationRun` was extracted to fix. *Nobody ran it* is
  // ordinary on a fresh checkout; *it is there and unreadable* is a fault worth
  // naming; collapsing them makes a corrupt report read as checked-and-clean.
  // Both non-`read` states degrade the line rather than refusing, on section
  // 0b's rule that no report is a print and never a silence.
  if (run.kind !== 'read') return counts;

  const declarations = { scopes: run.scopes };
  const scored = scoreRun(run.report, declarations.scopes);
  for (const scope of declarations.scopes) {
    const tally = scored.perScope.get(scope.name);
    if (tally !== undefined && total(tally) > 0) counts.set(scope.name, total(tally));
  }
  return counts;
}

/**
 * Today, in the machine's own timezone.
 *
 * `toISOString` is UTC and would disagree with the date somebody typed into the
 * floors file by hand from a local calendar — for half the day, in either
 * direction. The count it feeds is *how long has this sat unarmed*, where being
 * a day out is harmless and being confusing is not.
 */
function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${String(now.getDate()).padStart(2, '0')}`;
}

const project = process.env['CF_PAGES_PROJECT'] ?? 'stacks';

console.log(`deploying ${vault}`);
console.log(`        → ${siteUrl}  (Cloudflare Pages project "${project}")`);

// ── 1. The gates. These stage FIXTURE data — which is why they go first ─────
//
// **Four refusals, and no flag clears any of them.** Each `run` below refuses by
// failing the command. `--check-only` skips them for a reason that is not an
// override — it builds nothing, so there is nothing to gate — and `--dry-run`
// runs every one.
//
// ⚠️ **`--skip-gates` used to clear all four and then publish anyway.** It was
// in this file's first commit (2026-08-01), was documented nowhere for 19 of
// the 21 days it existed, and bought about 35 seconds. Deleted in #152; see
// [ADR-0064](../docs/adr/0064-no-flag-skips-the-deploy-gates.md). Typing it
// today is inert — the gates run — which is the safe direction for a flag that
// still sits in somebody's shell history.
if (checkOnly) {
  console.log('--check-only: not building, not uploading');
} else {
  run('pnpm', ['test']);
  run('pnpm', ['run', 'typecheck']);
  run('pnpm', ['gate:public']);
  run('pnpm', ['smoke:render']);
}

// ── 2. The real build. Last, so it overwrites whatever the gates staged ─────
//
// Two more command refusals. Only `--check-only` clears them, by building
// nothing; `--dry-run` builds, because a dry run that skipped the build would
// have no artifact to pre-flight.
if (!checkOnly) {
  run('pnpm', [
    'stacks',
    'build',
    '--public',
    '--vault',
    `"${vault}"`,
    '--assets',
    'packages/site/public',
  ]);
  run('pnpm', ['--filter', '@stacks/site', 'run', 'build'], { SITE_URL: siteUrl });
}

// ── 3. Pre-flight on the artifact that is actually about to be published ────
//
// The rules live in `scripts/lib/public-build.ts`, and `gate:public`
// applies exactly the same ones to a fixture build. They used to be two
// implementations, and this one — the only one that actually publishes
// anything — held the weaker half of both places they differed: it checked that
// `_headers` existed where the gate checked that `/covers/*` revalidates, and
// it accepted a page with no `og:image` at all so long as a `twitter:image` was
// there. Neither was a superset of the other, and neither knew the other
// existed. See docs/adr/0028-one-inspector-for-the-public-build.md.
interface ShippedBook {
  readonly title: string;
  readonly cover?: string;
}

// No flag clears this one either, and `--check-only` is the mode most likely to
// hit it: it builds nothing, so the folder it reads is whatever was last built
// here — possibly nothing at all.
const libraryPath = join(DIST, 'library.json');
if (!existsSync(libraryPath)) fail(`no library.json in ${DIST}`);

const library = JSON.parse(readFileSync(libraryPath, 'utf8')) as { books: ShippedBook[] };
const html = existsSync(join(DIST, 'index.html'))
  ? readFileSync(join(DIST, 'index.html'), 'utf8')
  : '';

const report = inspectPublicBuild(DIST, { origin: siteUrl });
for (const observation of report.observations) console.log(`  ${observation}`);

const problems: { rule: PublicBuildRule | 'stale-fixtures'; message: string }[] = [...report.problems];

// The one check that stays here, because it is not about publishability at all.
//
// `gate:public` *requires* these titles to be present in the folder it inspects
// and this requires them absent — the same strings with opposite verdicts — so
// a module handed a directory, which cannot know which vault produced it, is
// the wrong owner. What this asserts is that step 2 ran after step 1.
//
// Read from the fixture vault rather than hardcoded. It was two titles out of
// twelve, and one of those two — `Compilers for the Impatient` — has carried a
// subtitle in its frontmatter the whole time, so it never matched a shipped
// book and only one title was ever really checked.
//
// Through the adapter, because that is invariant 4 and because it is also the
// only way to get this right: a note's filename is not its title. Five of the
// twelve fixtures differ, and reading `title:` out of the file by hand would be
// a second parser of the format `enrich` and `updateBook` already have scars
// from.
if (!checkOnly) {
  // Said first, because the fixture vault contains two deliberately broken
  // notes and the adapter warns about them by name. Unannounced, in the middle
  // of a deploy, those read as something wrong with the vault being published.
  console.log('\n  reading fixture titles — any skip warnings below are the fixtures’ own, by design');
  const titles = await fixtureTitles();
  // An empty list would satisfy the filter below however the build went, which
  // is the same vacuous pass this check was just rewritten to close. Louder
  // than a problem, because it means the check itself is broken rather than the
  // build.
  //
  // No flag clears it. `--check-only` never arrives — the whole block is
  // guarded on it — and no flag skips a gate any more.
  if (titles.length === 0) {
    fail(
      'no fixture notes found to check the build against. This check exists to catch the ' +
        'gates’ staged data surviving into a deploy, and with nothing to compare it would ' +
        'pass over any build at all.',
    );
  }

  const shipped = new Set(library.books.map((book) => book.title));
  const staged = titles.filter((title) => shipped.has(title));
  if (staged.length > 0) {
    problems.push({
      rule: 'stale-fixtures',
      message:
        `fixture books are in the build — the real vault build did not run last: ${staged.slice(0, 3).join(', ')}`,
    });
  }
}

/**
 * Every book title in the fixture vault, as `library.json` would spell it.
 *
 * The same adapter the build uses, so the two cannot disagree about what a note
 * is called. A malformed fixture is skipped with a warning here exactly as it
 * is everywhere else — invariant 3 — and one fewer title to compare is a
 * weaker check, not a broken deploy.
 */
async function fixtureTitles(): Promise<string[]> {
  const vaultPath = join(REPO_ROOT, 'fixtures', 'vault');
  if (!existsSync(vaultPath)) return [];
  const books = await new ObsidianAdapter(vaultPath).listBooks();
  return books.map((book) => book.title);
}

/**
 * `--check-only` publishes nothing, so a problem is information rather than a
 * refusal — it exists to investigate a stale edge, and a pre-flight that
 * refuses to run would answer the question by declining to ask it.
 *
 * Exactly one rule is dropped rather than warned about. `share-image-origin`
 * asserts the built page against the *current* SITE_URL, and repointing
 * SITE_URL at a local server is precisely how you watch the live check fail on
 * purpose — a warning everybody expects is noise. `share-image-missing` is not
 * dropped with it: a page that lost its share tag altogether is worth saying out
 * loud whatever mode you are in, and separating those two is the whole reason
 * problems carry a rule.
 */
const applicable = checkOnly
  ? problems.filter((problem) => problem.rule !== 'share-image-origin')
  : problems;

if (applicable.length > 0) {
  const listed = applicable.map((problem) => `[${problem.rule}] ${problem.message}`).join('\n- ');
  if (checkOnly) {
    // Careful about what this claims. `--check-only` builds nothing, so this is
    // the `dist/` sitting on *this* machine — which may be whatever `gate:public`
    // last staged, and is not necessarily what the origin is serving.
    console.warn(
      `\n! the local ${DIST_LABEL} has ${String(applicable.length)} problem(s) — this is the folder ` +
        `on disk, not what the origin is serving:\n- ${listed}`,
    );
  } else {
    // Which flags clear this: none, on any path that publishes.
    //
    // The convention is that every refusal here says so rather than leaving the
    // reader to read `process.argv` — a flag whose reach is undocumented is how
    // `--skip-gates` came to skip the whole contract with nothing saying so
    // (#152), and that flag is now deleted. Stated as a fact about this refusal,
    // checked against the code above it: `--dry-run` runs this and stops before
    // the upload, and `--check-only` takes the warning branch, which publishes
    // nothing.
    fail(
      `pre-flight found ${String(applicable.length)} problem(s):\n- ${listed}\n\n` +
        '  No flag clears this, and --dry-run runs it. --check-only reports instead\n' +
        '  of refusing, but it builds nothing and uploads nothing, and it drops\n' +
        '  share-image-origin.\n' +
        '  Nothing is uploaded until this passes.',
    );
  }
}

/**
 * A name for this build, written into the page so the live site can be asked
 * which build it is serving.
 *
 * The check below used to compare cover *bytes*, which cannot answer that
 * question: covers are named after book titles and keep those names between
 * builds, so a deploy that changes only code leaves every cover byte-identical
 * and the check reports a clean site whichever build is live. That is not
 * hypothetical — it passed against the previous deployment minutes after an
 * upload, while `index.html` still pointed at the old bundle.
 *
 * Derived from the build's own contents rather than from the clock or the
 * commit — not for reproducibility, which this build does not have and never
 * did (`library.json` carries the moment it was generated, so two builds of one
 * tree already differ), but so the stamp cannot claim more than it knows. It
 * names *this artifact*: hashing `index.html` covers the code, because the
 * bundle's filename is content-hashed and appears in it, and hashing
 * `library.json` covers the shelf. A stamp that matches means the origin is
 * serving the bytes that were just uploaded, and nothing weaker.
 */
const stamp = checkOnly ? stampOfLastDeploy() : stampAndWrite();

/**
 * Reads back the stamp the last deploy wrote, rather than computing a new one.
 *
 * `--check-only` asks "is the origin serving what I last published", so it must
 * use *that* build's name. Re-hashing would produce a different one — the file
 * on disk now includes the stamp the hash was taken before — and the check would
 * report a mismatch against a site that is perfectly up to date.
 *
 * **Reached only under `--check-only`, and no flag clears it there.** The
 * refusal is the honest answer to the question that mode asks: an unstamped
 * `dist/` gives the live check nothing to compare, and reporting "up to date"
 * off no evidence is the failure this whole block exists to stop making.
 */
function stampOfLastDeploy(): string {
  const found = stampOf(html);
  if (found === undefined) {
    fail(
      'dist/index.html carries no build stamp, so there is nothing to compare.\n' +
        '  It was built before stamping existed, or by something other than a deploy.\n' +
        '  Run `pnpm deploy:site` and the check will have an answer.',
    );
  }
  return found;
}

function stampAndWrite(): string {
  const name = createHash('sha256')
    .update(readFileSync(join(DIST, 'index.html')))
    .update(readFileSync(libraryPath))
    .digest('hex')
    .slice(0, 12);

  const marked = html.replace('<head>', `<head>${stampMeta(name)}`);

  // A stamp that failed to land would make the check below fail forever, on
  // every deploy, for a reason nobody would guess — so the injection is asserted
  // rather than assumed. Astro emits a bare `<head>`; if that ever changes, this
  // says so here instead of at the far end.
  //
  // No flag clears it, on any path that publishes. `--check-only` takes the
  // other branch above; `--dry-run` reaches this and stamps the folder it leaves
  // behind, which is what makes a later `--check-only` able to answer at all.
  if (stampOf(marked) !== name) {
    fail('could not stamp index.html — no `<head>` to inject into, so the live check would be blind');
  }
  writeFileSync(join(DIST, 'index.html'), marked);
  return name;
}

console.log(
  checkOnly
    ? `\nlast deployed build ${stamp}`
    : `\npre-flight OK — ${String(library.books.length)} book(s), every key named, og:image absolute, no orphans` +
      `\nbuild ${stamp}`,
);

// ── 4. Upload ───────────────────────────────────────────────────────────────
if (checkOnly) {
  await verifyLive(siteUrl.replace(/\/$/, ''));
  process.exit(0);
}

if (dryRun) {
  console.log(`\n--dry-run: not uploading. ${DIST} is ready.`);
  console.log(`to publish: pnpm dlx ${WRANGLER} pages deploy packages/site/dist --project-name ${project}`);
  process.exit(0);
}

// The upload itself, and the last refusal in the file: a failing `wrangler`
// stops the run here. `--dry-run` and `--check-only` clear it by returning
// above; nothing clears it on a path that publishes, which is the only kind of
// path that reaches this line.
run('pnpm', [
  'dlx',
  WRANGLER,
  'pages',
  'deploy',
  'packages/site/dist',
  '--project-name',
  project,
  '--branch',
  'main',
]);

console.log(`\ndeployed → ${siteUrl}`);

// ── 5. What a visitor actually gets ─────────────────────────────────────────
//
// The upload succeeding is not the same as the site changing, and the gap
// between the two is not hypothetical: the fix for the mobile crash uploaded
// cleanly, passed every check above, and left the custom domain serving the
// previous build's covers for four hours. Cover filenames are slugs of book
// titles and are rewritten in place, so a cached copy has the right name and the
// wrong bytes, and nothing anywhere reported a problem.
//
// A warning rather than a failure, because the deploy genuinely did succeed and
// no remedy for any of these can be performed from here.
//
// It can also fail to run at all: a zone that refuses non-browser clients gives
// this check nothing to read, and it says so rather than guessing. A check that
// cannot tell "stale" from "refused" is worse than no check, because it spends
// the owner's trust on a diagnosis it did not make.
await verifyLive(siteUrl.replace(/\/$/, ''));

/**
 * Which build the origin is actually serving.
 *
 * Asks the page, rather than inferring from bytes. Cover sizes cannot answer it
 * — see the stamp's own note — and comparing whole HTML would break the first
 * time the zone enabled any edge transform, since those rewrite markup and would
 * fail forever for a reason unconnected to deploying. A meta tag's content
 * survives all of them.
 */
async function verifyBuildLive(origin: string): Promise<void> {
  const answer = await probeBuild(origin, stamp, {
    onRetry: (message, attempt, attempts) =>
      console.log(`  waiting for the edge (${String(attempt)}/${String(attempts - 1)}) — ${message}`),
  });

  if (answer.kind === 'current') {
    console.log(`serving build ${stamp}`);
    return;
  }

  if (answer.kind === 'unreachable') {
    console.warn(`\n! could not reach ${origin} to ask which build it is serving`);
    return;
  }

  if (answer.kind === 'refused') {
    reportUnreadable(origin, answer.status);
    return;
  }

  console.warn(
    `\n! ${origin} is serving ${answer.serving === undefined ? 'a build with no stamp' : `build ${answer.serving}`}, not ${stamp}\n` +
      '  The upload was fine. Either the edge has not caught up, or a cache is\n' +
      '  holding the previous index.html — which points at the previous bundle, so\n' +
      '  visitors get the old shelf however new the assets beside it are.\n' +
      '    - Wait a minute and re-run `pnpm deploy:site --check-only`, which asks\n' +
      '      again without rebuilding or re-uploading anything.\n' +
      '    - If it persists: dash.cloudflare.com → your zone → Caching → Configuration →\n' +
      '      Purge Everything, and set Browser Cache TTL to "Respect Existing Headers".',
  );
}

/**
 * The origin refused to be read — so this deploy went out unverified.
 *
 * Deliberately *not* the cache-purge advice the stamp-mismatch path gives. The
 * two failures look identical from here and have nothing in common: one is a
 * stale copy of a real page, the other is no page at all.
 *
 * The remedy is not a request header, which is the one thing worth knowing here.
 * Measured while this zone was challenging: Node's `fetch` was refused whatever
 * user agent it sent, and so was a real headless Chrome, while curl passed with
 * any user agent but its own default — so the decision was made on the client's
 * fingerprint, not on anything a caller controls. Looking browsery enough is not
 * available, and a fix that appeared to work that way would be one heuristic
 * update from silently reverting.
 *
 * The remedy is at the zone, wherever this is deployed, and it is the operator's
 * to choose. So the message names where to look rather than asserting a cause —
 * all this function knows is a status code.
 */
function reportUnreadable(origin: string, status: number): void {
  console.warn(
    `\n! could not read ${origin} — HTTP ${String(status)}, ` +
      `${String(PROPAGATION_ATTEMPTS)} attempts\n` +
      '  The upload was fine. This is not a cache: the origin refused to serve\n' +
      '  this check at all, so it never saw a page to read a build stamp out of.\n' +
      `  So nothing has confirmed what ${origin} is serving to visitors.\n` +
      '  Bot protection is the usual cause, but this only knows a status code —\n' +
      '  so name it rather than assume it:\n' +
      `    - Check by hand: open ${origin}, view source, and look for\n` +
      `      <meta name="stacks:build" content="${stamp}">. If that is right,\n` +
      '      the deploy is fine and only this check is blind.\n' +
      '    - Name the cause: dash.cloudflare.com → your zone → Security → Events.\n' +
      '      Each row says which service mitigated the request, which beats\n' +
      '      guessing from out here. Fix it there, at the zone.\n' +
      '  Sending a browser user agent does NOT fix this and has been tried: the\n' +
      '  refusal is decided on the client fingerprint. See ADR-0027.',
  );
}

async function verifyLive(origin: string): Promise<void> {
  await verifyBuildLive(origin);

  // Every cover, not a sample — the reason is in `probeCovers`, which is where
  // the comparison lives now. What stays here is what to say about its verdict:
  // one probe, two readers, and `trend:sync` prints something else entirely.
  // A cover named in `library.json` and missing from `dist/` is skipped rather
  // than thrown on — the pre-flight's orphan rule already refused this build if
  // one is, so reaching here means there is nothing to report. `trend:sync`
  // builds the same map for surface D and needs the skip for real, because its
  // `dist/` can predate a note.
  const built = new Map(
    library.books
      .map((book) => book.cover)
      .filter((cover): cover is string => cover !== undefined)
      .filter((cover) => existsSync(join(DIST, cover)))
      .map((cover) => [cover, statSync(join(DIST, cover)).size] as const),
  );

  if (built.size === 0) return;

  const answer = await probeCovers(origin, built);

  if (answer.kind === 'unreachable') {
    console.warn(`\n! could not reach ${origin} to check what is being served`);
    return;
  }

  if (answer.kind === 'refused') {
    console.warn(
      `\n! ${origin} refused the cover check — HTTP ${String(answer.status)}\n` +
        '  Not a cache. See the note above: nothing here can read this origin.',
    );
    return;
  }

  // An answer with no content-length is neither stale nor clean. Reading it as
  // zero bytes reported a stale cache for a header the origin did not send —
  // the same wrong diagnosis a refusal used to produce, and measured here.
  if (answer.uncomparable.length > 0) {
    console.warn(
      `\n! ${String(answer.uncomparable.length)} cover(s) answered with no content-length, so nothing was compared:\n` +
        answer.uncomparable
          .slice(0, 5)
          .map((cover) => `    ${cover}`)
          .join('\n') +
        '\n  Not a cache. A path this build does not have answers 200 with no length\n' +
        '  header, so check that these covers reached the upload at all.',
    );
  }

  if (answer.stale.length === 0) {
    const compared = answer.checked - answer.uncomparable.length;
    console.log(
      `checked ${String(compared)} of ${String(answer.checked)} cover(s) live — the site is serving this build`,
    );
    return;
  }

  console.warn(
    `\n! ${origin} is serving ${String(answer.stale.length)} cover(s) from a previous build:\n` +
      answer.stale
        .slice(0, 5)
        .map((one) => `    ${describeStaleCover(one)}`)
        .join('\n') +
      '\n  The upload was fine — this is caching, and cover filenames do not change\n' +
      '  between builds, so a cached copy has the right name and the wrong bytes.\n' +
      '    - Pages usually purges its edge within a minute or two of a deploy. Re-run\n' +
      '      this check before doing anything else.\n' +
      '    - If it persists: dash.cloudflare.com → your zone → Caching → Configuration →\n' +
      '      Purge Everything, and set Browser Cache TTL to "Respect Existing Headers".\n' +
      '      A zone overrides the Cache-Control this build sends, and its default is 4\n' +
      '      hours, which is why `_headers` alone does not settle it on a custom domain.',
  );
}
