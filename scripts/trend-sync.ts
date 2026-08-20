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
 * ⚠️ **Two containers, and the second one is the page you actually read.** The
 * store answers PromQL; Grafana renders the fixed panel order — *is this real*
 * above *is this bad* — from `grafana/` in this repository, provisioned
 * read-only. The layout is therefore a diff somebody can review rather than a
 * state on one machine, and Grafana's own outbound reporting is switched off
 * because the no-outbound-flow principle covers the dashboard's container too.
 * See [ADR-0060](../docs/adr/0060-the-dashboard-is-provisioned-from-the-repo.md).
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
 * The page you actually read, and it is provisioned from this repository rather
 * than clicked together once. See `grafana/` and
 * [ADR-0060](../docs/adr/0060-the-dashboard-is-provisioned-from-the-repo.md).
 *
 * Pinned for the same reason the store is: a dashboard that changes under you is
 * not a reading of anything, and the calibration window the ratchet's floors
 * depend on is twenty runs long.
 */
const GRAFANA_IMAGE = 'grafana/grafana:11.6.6';
const GRAFANA_CONTAINER = 'stacks-grafana';
const GRAFANA_PORT = 3000;

/**
 * A network of their own, because Grafana reaches the store by container name.
 * `localhost` inside the Grafana container is the Grafana container, and
 * `host.docker.internal` exists on Docker Desktop and not on plain Linux.
 */
const NETWORK = 'stacks-trend';

/** Provisioning, mounted read-only: this repository is the artifact, not the UI. */
const PROVISIONING = join(REPO_ROOT, 'grafana', 'provisioning').replace(/\\/g, '/');
const DASHBOARDS = join(REPO_ROOT, 'grafana', 'dashboards').replace(/\\/g, '/');

/**
 * Grafana's outbound traffic, switched off — and this is the acceptance
 * criterion rather than hygiene.
 *
 * The whole layer rests on nothing derived from the owner's reading leaving the
 * machine, and a stock Grafana phones home twice by default: usage analytics,
 * and a version check that carries the instance id. The news feed and the
 * plugin-update check are the same shape. **A localhost store whose dashboard
 * reports on itself is not a localhost store.**
 *
 * Anonymous access with no login form is the other half. There is no user
 * database worth protecting on a container that holds nothing but provisioned
 * files, and a login screen on a single-maintainer localhost page is a password
 * to lose rather than a control.
 */
const GRAFANA_ENV = [
  'GF_ANALYTICS_ENABLED=false',
  'GF_ANALYTICS_REPORTING_ENABLED=false',
  'GF_ANALYTICS_CHECK_FOR_UPDATES=false',
  'GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false',
  'GF_ANALYTICS_FEEDBACK_LINKS_ENABLED=false',
  'GF_NEWS_NEWS_FEED_ENABLED=false',
  'GF_AUTH_ANONYMOUS_ENABLED=true',
  'GF_AUTH_ANONYMOUS_ORG_ROLE=Admin',
  'GF_AUTH_DISABLE_LOGIN_FORM=true',
  'GF_AUTH_BASIC_ENABLED=false',
  'GF_USERS_ALLOW_SIGN_UP=false',
] as const;

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
function containerStateOf(name: string): string | undefined {
  const found = docker(['ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.State}}']);
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
  if (containerStateOf(CONTAINER) === 'running') docker(['stop', CONTAINER]);
}

/**
 * Start the store, creating it the first time.
 *
 * Created here rather than being a precondition somebody has to remember: a
 * command that needs a container a human made once stops working the day
 * somebody prunes it, and that failure looks like a dead pipe rather than like
 * a missing container.
 */
/**
 * The network both containers sit on, created once and idempotently.
 *
 * `network create` on a network that exists exits non-zero, which `dockerOutput`
 * turns into `undefined` — the same shape as *there is no such container*, and
 * the same non-answer. Nothing here needs to tell the two apart: the only thing
 * that matters is that the network exists afterwards.
 */
function ensureNetwork(): void {
  if (docker(['network', 'inspect', '--format', '{{.Name}}', NETWORK]) === NETWORK) return;
  docker(['network', 'create', NETWORK]);
}

/**
 * Put an existing container on the network, whatever it was created with.
 *
 * ⚠️ **A container keeps the flags it was created with**, so a `stacks-prometheus`
 * from before the dashboard existed is on no network at all and would be
 * unreachable by name — on the one machine that has been running this the
 * longest. `network connect` on a container already attached exits non-zero and
 * is the no-op it looks like.
 */
function attachToNetwork(container: string): void {
  docker(['network', 'connect', NETWORK, container]);
}

/** What an existing container has to match before this command will reuse it. */
interface Reuse {
  name: string;
  image: string;
  /** The mount destination whose source says which checkout the container belongs to. */
  mountAt: string;
  mountSource: string;
  /** Environment entries that must all be present. Absent means nothing to check. */
  env?: readonly string[];
}

/**
 * Why a container that is already there cannot be reused, or `undefined` when it
 * can. Three questions, and each was a real failure before it was a check.
 *
 * ⚠️ **The image**, because reusing by name alone would defeat the pin: after
 * `IMAGE` moves, a `promtool` from the new image would write blocks for an old
 * server to read — the disagreement this file's header claims is
 * unrepresentable. A changed `RETENTION` would be ignored the same way, silently.
 *
 * ⚠️ **The mount**, and this is not symmetry. `pnpm worktree` is a documented
 * command here, so two checkouts on one machine is the ordinary case — and a
 * container name is global to the Docker daemon. A container created by the other
 * checkout keeps *its* bind mount, so this sync writes blocks into this `.trend/`
 * while Prometheus serves that one. **Measured: `imported 11 record(s)` against a
 * store answering for nine**, every number real and belonging to another tree.
 *
 * ⚠️ **The environment**, which is the dashboard's acceptance criterion rather
 * than tidiness. A container keeps what it was *created* with, so one made before
 * an outbound switch was added keeps reporting — and that failure is silent at
 * both ends: nothing on the page changes, and the traffic is what nobody watches.
 * Every entry is compared rather than a version marker, so adding one to
 * `GRAFANA_ENV` is the whole change.
 */
function refuseReuse(spec: Reuse): string | undefined {
  const image = docker(['inspect', '--format', '{{.Config.Image}}', spec.name]);
  if (image !== spec.image) return `it runs ${image ?? 'an unknown image'}, want ${spec.image}`;

  const source = docker([
    'inspect',
    '--format',
    `{{range .Mounts}}{{if eq .Destination "${spec.mountAt}"}}{{.Source}}{{end}}{{end}}`,
    spec.name,
  ]);
  if (source !== spec.mountSource) {
    return `it serves ${source === undefined || source === '' ? 'an unknown path' : source}, want ${spec.mountSource}`;
  }

  const declared = JSON.parse(
    docker(['inspect', '--format', '{{json .Config.Env}}', spec.name]) ?? '[]',
  ) as string[];
  if (!(spec.env ?? []).every((pair) => declared.includes(pair))) {
    return 'it was created without every switch this repo now sets';
  }
  return undefined;
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
  ensureNetwork();

  if (containerStateOf(CONTAINER) !== undefined) {
    const refusal = refuseReuse({
      name: CONTAINER,
      image: IMAGE,
      mountAt: '/trend',
      mountSource: mounted,
    });
    if (refusal === undefined) {
      docker(['start', CONTAINER]);
      attachToNetwork(CONTAINER);
      return;
    }
    console.log(`store: recreating ${CONTAINER} — ${refusal}`);
    docker(['rm', '-f', CONTAINER]);
  }

  runExe(
    'docker',
    [
      'run', '-d',
      '--name', CONTAINER,
      '--network', NETWORK,
      '-p', `127.0.0.1:${String(PORT)}:9090`,
      '-v', `${mounted}:/trend`,
      IMAGE,
      '--config.file=/trend/prometheus.yml',
      '--storage.tsdb.path=/trend/tsdb',
      `--storage.tsdb.retention.time=${RETENTION}`,
    ],
    REPO_ROOT,
  );
}

/**
 * The page, brought up beside the store.
 *
 * **Nothing is mounted for Grafana to write to, and that is the design.** Every
 * dashboard and the one datasource are provisioned from `grafana/` in this
 * repository, read-only; the container's own layer holds the sqlite file
 * Grafana insists on and there is nothing in it worth keeping. A container
 * anybody can delete and recreate with no loss is what makes the repository the
 * artifact rather than a machine's state.
 *
 * ⚠️ **Bound to `127.0.0.1`, not to every interface.** It runs anonymous with no
 * login form, and *"nobody else can see it"* is one of the two honest costs the
 * spec accepts for a localhost store — which makes it a property to keep rather
 * than a phrase. On a laptop that joins networks it does not own, `-p 3000:3000`
 * would quietly publish the owner's reading to the coffee shop.
 */
function startDashboard(): void {
  ensureNetwork();

  const state = containerStateOf(GRAFANA_CONTAINER);
  if (state !== undefined) {
    const refusal = refuseReuse({
      name: GRAFANA_CONTAINER,
      image: GRAFANA_IMAGE,
      mountAt: '/etc/grafana/dashboards',
      mountSource: DASHBOARDS,
      env: GRAFANA_ENV,
    });
    if (refusal === undefined) {
      if (state !== 'running') docker(['start', GRAFANA_CONTAINER]);
      attachToNetwork(GRAFANA_CONTAINER);
      return;
    }
    console.log(`dashboard: recreating ${GRAFANA_CONTAINER} — ${refusal}`);
    docker(['rm', '-f', GRAFANA_CONTAINER]);
  }

  runExe(
    'docker',
    [
      'run', '-d',
      '--name', GRAFANA_CONTAINER,
      '--network', NETWORK,
      '-p', `127.0.0.1:${String(GRAFANA_PORT)}:3000`,
      '-v', `${PROVISIONING}:/etc/grafana/provisioning:ro`,
      '-v', `${DASHBOARDS}:/etc/grafana/dashboards:ro`,
      ...GRAFANA_ENV.flatMap((pair) => ['-e', pair]),
      GRAFANA_IMAGE,
    ],
    REPO_ROOT,
  );
}

/** Where to look, printed the same way whichever path got here. */
function sayWhereToLook(): void {
  console.log(
    `dashboard: http://localhost:${String(GRAFANA_PORT)}/d/stacks-trend-layer\n` +
      `store:     http://localhost:${String(PORT)}`,
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
    startDashboard();
    sayWhereToLook();
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
  startDashboard();

  console.log(
    `\nimported ${String(wanted.length)} record(s) — the store now holds ${String(state.imported.length + wanted.length)}`,
  );
  sayWhereToLook();
  return 0;
}

process.exitCode = await main();
