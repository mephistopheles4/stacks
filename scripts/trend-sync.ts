/**
 * The pulling half of the trend layer. One command, run by hand, when you want
 * to look.
 *
 *     pnpm trend:sync [--rebuild]
 *
 * CI writes a durable record; this pulls it. It fetches the orphan `metrics`
 * branch, imports the records this machine has not seen into a local
 * Prometheus, asks the live origin what it is serving, and restarts the store.
 * See `docs/spec/trend-layer.md` §§1 and 5, and
 * [ADR-0055](../docs/adr/0055-ci-writes-a-durable-record.md).
 *
 * **Why a command and not a schedule.** No laptop cron, no daemon: a second
 * scheduled thing that can silently stop is the exact failure class this design
 * spends its budget containing, and this one would have no Actions history to
 * inspect afterwards. The cost is that nothing arrives until you ask.
 *
 * **What the record buys, and this is the whole reason for the shape.** Hosted
 * Prometheus rejects samples more than two hours behind the newest for that
 * series, so a machine that was off has lost that history for good. A git
 * record has no ingest window: a sync after two weeks away replays all fourteen
 * days. *"No history when the machine is off"* is a weakness of the **store**,
 * never of the **record**.
 *
 * ⚠️ **Surface D is folded in here and writes to the local store only.** D is
 * the edge check between deploys — B, asked when no deploy just happened. It
 * cannot live in CI: the expected build stamp is `sha256(index.html +
 * library.json)` and `library.json` is built from the real vault, which is not
 * in the repo, **so CI can never compute it.** It could only be *told*, which
 * costs a token and breaks the design's strongest property — no secret exists
 * anywhere in it. The cost, stated rather than discovered: **D's history lives
 * on one machine**, and D is no longer continuous.
 *
 * ⚠️ **The store is a pinned container this command owns, and that is a
 * correctness property rather than a convenience.** `promtool` writes TSDB
 * blocks and Prometheus reads them, and the two disagreeing about block format
 * is a class of failure that surfaces as *the sync worked and the dashboard is
 * empty*. Taking both from one pinned image makes that unrepresentable. The
 * cost is that Docker is required; see `docs/commands.md`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../packages/cli/src/env.ts';
import { dockerOutput } from './lib/docker.ts';
import {
  describeStaleCover,
  probeBuild,
  probeCovers,
  stampOf,
  type CoverAnswer,
  type EdgeAnswer,
} from './lib/edge-probe.ts';
import { joinRecords, renderEdgeCheck } from './lib/metrics.ts';
import {
  METRICS_BRANCH,
  fetchRecords,
  isFastForward,
  readRecord,
  selectNewRecords,
} from './lib/metrics-record.ts';
import { REPO_ROOT } from './lib/repo-root.ts';
import { runExe } from './lib/run.ts';

loadEnv();

/** The local store. Gitignored: it is rebuildable from the branch, and D's rows. */
const STORE = join(REPO_ROOT, '.trend');
const TSDB = join(STORE, 'tsdb');
/** Surface D's rows. **Never on the branch** — that is what keeps both ends credential-free. */
const LOCAL = join(STORE, 'local');
const INCOMING = join(STORE, 'incoming.prom');
const STATE = join(STORE, 'state.json');
const CONFIG = join(STORE, 'prometheus.yml');

/**
 * Pinned, and both halves come from it. A store that changes under you is not a
 * record of anything, and the parser and the server have to agree about blocks.
 */
const IMAGE = 'prom/prometheus:v2.55.1';
const CONTAINER = 'stacks-prometheus';
const PORT = 9090;

/**
 * Ten years. Prometheus's default retention is 15 days, which would delete the
 * replay this command exists to perform — and silently, some hours later, so
 * the sync that imported two weeks would look like it worked.
 */
const RETENTION = '10y';

/** Docker takes a forward-slashed path on every platform; Windows does not give one. */
const mounted = STORE.replace(/\\/g, '/');

const rebuild = process.argv.includes('--rebuild');

/**
 * D's probe, and it is deliberately shorter than a deploy's.
 *
 * `deploy:site` waits out edge propagation because an upload just happened.
 * Nothing just happened here, so there is nothing to catch up with — the
 * retries exist only so a **single** refusal is never reported as a standing
 * one, which is a different question and needs far less time.
 */
const PROBE = { attempts: 3, waitMs: 5_000 };

interface StoreState {
  /** The branch tip the last sync imported, for the fast-forward check. */
  tip?: string;
  /** Every record filename already in the store — branch and local alike. */
  imported: string[];
}

/**
 * What the store says it holds, or a refusal.
 *
 * ⚠️ **An unreadable state file is not treated as an empty one.** Re-importing
 * every record over an existing TSDB writes blocks that overlap the ones
 * already there, and whether that resolves cleanly is not something this
 * session measured — it is exactly the silent-store failure the pinned image
 * exists to avoid, arriving by another door. `--rebuild` is the measured
 * recovery: it drops the blocks first, so there is nothing to overlap.
 */
function readState(): StoreState | undefined {
  // A **missing** state file beside blocks is the same trap as an unreadable
  // one, and it is reachable two ways: somebody deleted it, or a run died
  // between the backfill and the write. "The store holds nothing" would then
  // replay every record over blocks that are already there.
  if (!existsSync(STATE)) {
    return existsSync(TSDB) && readdirSync(TSDB).length > 0 ? undefined : { imported: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(STATE, 'utf8')) as Partial<StoreState>;
    return { tip: parsed.tip, imported: parsed.imported ?? [] };
  } catch {
    return undefined;
  }
}

function writeState(state: StoreState): void {
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

// ── The store, which is a container ─────────────────────────────────────────

function docker(args: readonly string[]): string | undefined {
  return dockerOutput(args, REPO_ROOT);
}

/** `running`, `exited`, or `undefined` when there is no such container. */
function containerState(): string | undefined {
  const found = docker(['ps', '-a', '--filter', `name=^${CONTAINER}$`, '--format', '{{.State}}']);
  return found === undefined || found === '' ? undefined : found;
}

function requireDocker(): void {
  if (docker(['version', '--format', '{{.Server.Version}}']) !== undefined) return;

  fail(
    'Docker is not answering, and the trend store is a container.\n' +
      `  The backfill and the server both come from ${IMAGE}, pinned, so the\n` +
      '  parser that writes blocks and the server that reads them cannot disagree.\n' +
      '  Start Docker Desktop and run this again. See docs/commands.md.',
  );
}

/** The config Prometheus insists on having, even with nothing to scrape. */
function writeConfigIfAbsent(): void {
  if (existsSync(CONFIG)) return;

  writeFileSync(
    CONFIG,
    [
      '# Written by `pnpm trend:sync`. Prometheus requires a config file; this one',
      '# scrapes nothing, because every sample here arrives by backfill from the',
      '# orphan `metrics` branch. See docs/spec/trend-layer.md §1.',
      'global:',
      '  scrape_interval: 1m',
      '',
    ].join('\n'),
    'utf8',
  );
}

function backfill(): void {
  runExe(
    'docker',
    [
      'run', '--rm',
      '-v', `${mounted}:/trend`,
      '--entrypoint', 'promtool',
      IMAGE,
      'tsdb', 'create-blocks-from', 'openmetrics', '/trend/incoming.prom', '/trend/tsdb',
    ],
    REPO_ROOT,
  );
}

function stopStore(): void {
  if (containerState() === 'running') docker(['stop', CONTAINER]);
}

/**
 * Start the store, creating it the first time.
 *
 * Created here rather than being a precondition somebody has to remember: a
 * command that needs a container a human made once stops working the day
 * somebody prunes it, and that failure looks like a dead pipe rather than like
 * a missing container.
 */
function startStore(): void {
  if (containerState() !== undefined) {
    // ⚠️ **Reusing it by name alone would defeat the pin.** A container keeps
    // the image and the flags it was created with, so after `IMAGE` moves,
    // `promtool` from the new image would write blocks for an old server to
    // read — the exact disagreement this file's header claims is
    // unrepresentable. A changed `RETENTION` would be ignored the same way,
    // silently. So the image is compared and a stale container is replaced.
    const image = docker(['inspect', '--format', '{{.Config.Image}}', CONTAINER]);
    if (image === IMAGE) {
      docker(['start', CONTAINER]);
      return;
    }
    console.log(
      `store: recreating ${CONTAINER} — it runs ${image ?? 'an unknown image'}, want ${IMAGE}`,
    );
    docker(['rm', '-f', CONTAINER]);
  }

  runExe(
    'docker',
    [
      'run', '-d',
      '--name', CONTAINER,
      '-p', `${String(PORT)}:9090`,
      '-v', `${mounted}:/trend`,
      IMAGE,
      '--config.file=/trend/prometheus.yml',
      '--storage.tsdb.path=/trend/tsdb',
      `--storage.tsdb.retention.time=${RETENTION}`,
    ],
    REPO_ROOT,
  );
}

// ── Surface D ───────────────────────────────────────────────────────────────

const DIST = join(REPO_ROOT, 'packages', 'site', 'dist');

interface ShippedBook {
  readonly cover?: string;
}

/** What each cover weighs in the build that was last published. */
function builtCovers(): Map<string, number> {
  const sizes = new Map<string, number>();
  const library = join(DIST, 'library.json');
  if (!existsSync(library)) return sizes;

  // `books` is optional here and not in the builder's own shape: a `dist/` can
  // be anything on disk, and a missing key would throw out of surface D and
  // take the whole sync — import and all — down with it.
  const parsed = JSON.parse(readFileSync(library, 'utf8')) as { books?: ShippedBook[] };
  for (const book of parsed.books ?? []) {
    if (book.cover === undefined) continue;
    const path = join(DIST, book.cover);
    if (existsSync(path)) sizes.set(book.cover, statSync(path).size);
  }
  return sizes;
}

function sayBuild(origin: string, expected: string, answer: EdgeAnswer): void {
  if (answer.kind === 'current') {
    console.log(`  ${origin} is serving build ${expected}`);
    return;
  }
  if (answer.kind === 'stale') {
    console.warn(
      `! ${origin} is serving ${answer.serving === undefined ? 'a build with no stamp' : `build ${answer.serving}`}, not ${expected}\n` +
        '  A real answer, and a red one: the site changed under the last deploy, or a\n' +
        '  cache is holding the previous index.html. `pnpm deploy:site --check-only`\n' +
        '  asks again without rebuilding anything.',
    );
    return;
  }
  if (answer.kind === 'refused') {
    console.warn(
      `! ${origin} refused this check — HTTP ${String(answer.status)}, after ${String(PROBE.attempts)} attempts\n` +
        '  Refused, not stale: nothing was read, so nothing is claimed about what the\n' +
        '  site is serving. The row records run_ok 0 and no build number.\n' +
        '  Bot protection is the usual cause; name it at dash.cloudflare.com → your\n' +
        '  zone → Security → Events. Sending a browser user agent does NOT fix this\n' +
        '  and has been measured. See ADR-0027.',
    );
    return;
  }
  // The row is still written: *nothing answered* is a fact about the origin,
  // and D's series going quiet is the one thing per-series staleness could not
  // then tell apart from D never having run.
  console.warn(`! could not reach ${origin} at all — recording run_ok 0 and no build number`);
}

function sayCovers(answer: CoverAnswer): void {
  if (answer.kind === 'unreachable' || answer.kind === 'refused') return;
  if (answer.checked === 0) return;

  // Said whether or not anything was stale, because "0 stale of 41" while six
  // were never compared is a green that means nothing.
  if (answer.uncomparable.length > 0) {
    console.warn(
      `! ${String(answer.uncomparable.length)} cover(s) answered with no content-length, so nothing was compared:\n` +
        answer.uncomparable
          .slice(0, 5)
          .map((cover) => `    ${cover}`)
          .join('\n') +
        '\n  Not stale and not clean — unmeasured. A path this build does not have\n' +
        '  answers 200 with no length header, which is the usual cause.',
    );
  }

  if (answer.stale.length === 0) {
    const compared = answer.checked - answer.uncomparable.length;
    console.log(`  ${String(compared)} of ${String(answer.checked)} cover(s) match this build`);
    return;
  }
  console.warn(
    `! ${String(answer.stale.length)} of ${String(answer.checked)} cover(s) are served at another build's size:\n` +
      answer.stale
        .slice(0, 5)
        .map((one) => `    ${describeStaleCover(one)}`)
        .join('\n'),
  );
}

/**
 * Probe the origin and write D's row, or say why there was nothing to ask.
 *
 * A skip is a gap in D's series and that is the honest shape: D is reported and
 * never refused, and a row invented from an unstamped `dist/` would be a
 * measurement of nothing.
 */
async function probeOrigin(): Promise<void> {
  const origin = process.env['SITE_URL']?.replace(/\/$/, '');
  if (origin === undefined || origin === '') {
    console.log('surface D: skipped — SITE_URL is not set (see .env.example)');
    return undefined;
  }

  const index = join(DIST, 'index.html');
  const expected = existsSync(index) ? stampOf(readFileSync(index, 'utf8')) : undefined;
  if (expected === undefined) {
    console.log(
      `surface D: skipped — ${existsSync(index) ? 'dist/index.html carries no build stamp' : 'there is no local dist/'}.\n` +
        '  D asks whether the origin is serving what you last published, so it needs\n' +
        '  that build on this machine. Run `pnpm deploy:site` and it will have one.',
    );
    return undefined;
  }

  console.log(`surface D: asking ${origin} which build it is serving`);
  const build = await probeBuild(origin, expected, {
    ...PROBE,
    onRetry: (message, attempt, attempts) =>
      console.log(`  retrying (${String(attempt)}/${String(attempts - 1)}) — ${message}`),
  });
  sayBuild(origin, expected, build);

  // Only when the origin answered at all. Asking thirty times more of a zone
  // that refused the first request tells nobody anything.
  const covers =
    build.kind === 'refused' || build.kind === 'unreachable'
      ? undefined
      : await probeCovers(origin, builtCovers());
  if (covers !== undefined) sayCovers(covers);

  const timestamp = Math.floor(Date.now() / 1000);
  const name = `${String(timestamp)}-edge.prom`;
  writeFileSync(
    join(LOCAL, name),
    renderEdgeCheck({
      timestamp,
      origin,
      expected,
      build,
      covers:
        covers === undefined || covers.kind !== 'checked'
          ? undefined
          : {
              checked: covers.checked,
              stale: covers.stale.length,
              uncomparable: covers.uncomparable.length,
            },
    }),
    'utf8',
  );
}

// ── The sync ────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  mkdirSync(TSDB, { recursive: true });
  mkdirSync(LOCAL, { recursive: true });

  const state = rebuild ? { imported: [] } : readState();
  if (state === undefined) {
    fail(
      `${STATE} cannot be read or is missing beside blocks that are already there,\n` +
        '  so the store cannot say what it holds.\n' +
        '  `pnpm trend:sync --rebuild` is the way back: it drops the local blocks and\n' +
        '  replays the branch plus every surface-D row, which only this machine has.',
    );
  }

  const fetched = fetchRecords();

  if (fetched === undefined) {
    console.warn(
      `! could not fetch the \`${METRICS_BRANCH}\` branch — offline, or nothing has written one yet.\n` +
        '  Carrying on with whatever is already in the store.',
    );
  } else if (state.tip !== undefined && !isFastForward(state.tip, fetched.tip)) {
    // Tamper-evident, not tamper-proof: nothing can stop a force-push to an
    // unprotected branch. What this buys is that the next sync notices, rather
    // than importing across a rewrite and leaving a store nobody can reconcile
    // with the branch it claims to mirror. Once a floor is armed, that history
    // *is* its calibration evidence. See docs/spec/trend-layer.md §8.
    fail(
      `the \`${METRICS_BRANCH}\` branch was rewritten.\n` +
        `  imported through ${state.tip.slice(0, 12)}, which is not an ancestor of ${fetched.tip.slice(0, 12)}.\n` +
        '  Append-only is a convention here and nothing enforces it, so this is what\n' +
        '  noticing looks like. The local store still holds everything imported before\n' +
        '  the rewrite; the branch may not.\n' +
        '    - Establish what happened first. A rewritten record is not a sync problem.\n' +
        '    - `pnpm trend:sync --rebuild` then rebuilds the store from the branch as it\n' +
        '      now stands, plus every local surface-D row, which only this machine has.',
    );
  }

  await probeOrigin();

  const onBranch = fetched?.names ?? [];
  const inStore = readdirSync(LOCAL).filter((name) => name.endsWith('.prom'));
  const wanted = selectNewRecords([...onBranch, ...inStore], state.imported);

  // Reachable when D skipped — when D probed, the row it just wrote is itself
  // something to import, which is the point of D: the import is idempotent and
  // the probe is not.
  if (wanted.length === 0) {
    console.log(
      `\nnothing new to import — the store already holds all ${String(state.imported.length)} record(s)`,
    );
    // Still bring the store up. A sync that imported nothing on a machine that
    // rebooted would otherwise report success and leave no dashboard running,
    // which reads as "there is no data" rather than as "nothing is serving it".
    if (docker(['version', '--format', '{{.Server.Version}}']) === undefined) {
      console.warn('! Docker is not answering, so the dashboard is not running. See docs/commands.md');
      return 0;
    }
    writeConfigIfAbsent();
    startStore();
    console.log(`dashboard: http://localhost:${String(PORT)}`);
    return 0;
  }

  const documents = wanted.map((name) => {
    const local = join(LOCAL, name);
    const bytes = existsSync(local)
      ? readFileSync(local, 'utf8')
      : fetched === undefined
        ? undefined
        : readRecord(fetched.tip, name);
    if (bytes === undefined) fail(`could not read the record ${name}`);
    return bytes;
  });

  writeFileSync(INCOMING, joinRecords(documents), 'utf8');
  console.log(`\nimporting ${String(wanted.length)} record(s): ${wanted[0] ?? ''} … ${wanted.at(-1) ?? ''}`);

  requireDocker();
  writeConfigIfAbsent();

  // Prometheus holds a lock on its data directory, so the backfill happens with
  // the store down. That is what "restarts Prometheus" means here, and it is
  // also what makes the new blocks visible without waiting for a reload.
  stopStore();
  if (rebuild) rmSync(TSDB, { recursive: true, force: true });
  mkdirSync(TSDB, { recursive: true });

  try {
    backfill();
  } catch (error) {
    // Nothing was imported, so the state is still true. Bring the store back
    // up regardless — it was stopped by this command, and leaving it down is a
    // second fault on top of the one being reported.
    startStore();
    throw error;
  }

  // ⚠️ **Before the store is started, not after.** `startStore` throws on a
  // bound port or a failed pull, and the blocks are already on disk by then —
  // so a state written afterwards would never be written, and the next sync
  // would import the same records again over the blocks that hold them. A
  // dashboard that failed to start is a nuisance; a store that holds records it
  // does not admit to is the overlap hazard this file refuses elsewhere.
  writeState({ tip: fetched?.tip ?? state.tip, imported: [...state.imported, ...wanted] });
  rmSync(INCOMING, { force: true });
  startStore();

  console.log(
    `\nimported ${String(wanted.length)} record(s) — the store now holds ${String(state.imported.length + wanted.length)}\n` +
      `dashboard: http://localhost:${String(PORT)}`,
  );
  return 0;
}

process.exitCode = await main();
