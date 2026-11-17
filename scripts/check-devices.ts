/**
 * The three-device check (#618): does the fixture build boot, pick a book up and keep its WebGL
 * context on a real Pixel, a real iPhone and Chrome on Windows? It replaces the local smoke gate.
 *
 *     pnpm check:devices --dist <fixture dist> --out <screenshot folder>
 *         [--binary <path>] [--key-file] [--port 8766]
 *
 *     --dist <dir>      the fixture build to serve, already judged by `scripts/build-device-fixture.ts`
 *     --out <dir>       where the three screenshots go (pixel.png, iphone.png, desktop.png)
 *     --binary <path>   a BrowserStack Local binary you already hold; without it the pinned one is
 *                       downloaded, checked against its SHA-256 and refused on a mismatch
 *     --key-file        read the user and key from ~/.config/browserstack.env, for your own runs;
 *                       without it they come from BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY
 *     --port <number>   the one port the tunnel carries (8766)
 *
 * Each device, in parallel: opens the build through BrowserStack Local, waits for the shelf to
 * report ready, taps a book and waits for the shelf to name it held with the address unchanged,
 * holds it 10 seconds, fails if the shelf fell back to painted shadows (a lost context), reads the
 * session's console-error count and saves one screenshot. Every wait is on a shelf state flag
 * with a 60-second ceiling; the 10-second hold is the one thing measured with a clock.
 *
 * **It runs in CI after merge only**, in the key-holding job of `.github/workflows/devices.yml`,
 * under Node's own type stripping with no installed package. So everything it imports is a Node
 * built-in or a `.ts` file of this repository, and `scripts/lib/key-job.test.ts` holds that.
 *
 * **The key** is held in one object, sent in an `Authorization` header and written, for the
 * binary only, to a temp config file deleted on exit. It is never in a URL, on a command line or in
 * a log. The binary's own output goes to a log file outside every upload path, scrubbed after.
 * A page's text is never printed: a verdict line is this tool's sentence with a count in it.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDriver, parseCredentials, scrub } from './lib/browserstack-driver.ts';
import {
  binaryArgs,
  downloadBinary,
  readKey,
  scrubLogFile,
  startBinary,
  tunnelIsUp,
  waitForTunnel,
  writeConfigFile,
  type Key,
} from './lib/browserstack-local.ts';
import {
  DEVICES,
  HOLD_MS,
  PROBE_ARM,
  PROBE_READ,
  READ_AFTER_HOLD,
  READY_AND_FIND,
  SCRIPT_TIMEOUT_MS,
  UNEXPECTED,
  WAIT_HELD,
  judgeDevice,
  tapShift,
  readAfterHold,
  readViewport,
  readFound,
  readHeld,
  runId,
  runNames,
  type Device,
  type Measured,
  type Verdict,
} from './lib/device-check.ts';
import { DEFAULT_PORT, judgeServed } from './lib/ios-swipe.ts';
import { serveDist } from './lib/serve-dist.ts';

const CREDENTIAL_FILE = join(homedir(), '.config', 'browserstack.env');
const REQUEST_TIMEOUT_MS = 120_000;
const TUNNEL_CEILING_MS = 60_000;

interface Args {
  readonly dist: string;
  readonly out: string;
  readonly binary: string | undefined;
  readonly keyFile: boolean;
  readonly port: number;
  /** One device's slug, for a run that diagnoses it; every device when absent. */
  readonly device: string | undefined;
}

/** The arguments, or the sentence that says why they are refused. */
function parseArgs(argv: readonly string[]): Args | string {
  const values = new Map<string, string>();
  let keyFile = false;
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    if (arg === '--key-file') {
      keyFile = true;
    } else if (
      arg === '--dist' ||
      arg === '--out' ||
      arg === '--binary' ||
      arg === '--port' ||
      arg === '--device'
    ) {
      const value = argv[at + 1];
      if (value === undefined || value.startsWith('--')) return `${arg} needs a value`;
      values.set(arg, value);
      at += 1;
    } else {
      return `unknown argument at position ${String(at + 1)}`;
    }
  }
  const dist = values.get('--dist');
  const out = values.get('--out');
  if (dist === undefined) return '--dist <the fixture build> is required';
  if (out === undefined) return '--out <the screenshot folder> is required';
  const port = Number(values.get('--port') ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return '--port is not a usable port';
  const device = values.get('--device');
  if (device !== undefined && !DEVICES.some((known) => known.slug === device)) {
    return `--device is one of ${DEVICES.map((known) => known.slug).join(', ')}`;
  }
  return { dist, out, binary: values.get('--binary'), keyFile, port, device };
}

function fail(message: string): never {
  // Thrown, not exited: what is open must reach its cleanup.
  throw new Error(message);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The key, from this step's environment or, for the owner's own run, from the credential file. */
function loadKey(fromFile: boolean): Key {
  let env: Readonly<Record<string, string | undefined>> = process.env;
  if (fromFile) {
    if (!existsSync(CREDENTIAL_FILE)) {
      return fail('no credential file at ~/.config/browserstack.env');
    }
    const parsed = parseCredentials(readFileSync(CREDENTIAL_FILE, 'utf8'));
    if (parsed === undefined) {
      return fail(
        '~/.config/browserstack.env must set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY',
      );
    }
    env = { BROWSERSTACK_USERNAME: parsed.user, BROWSERSTACK_ACCESS_KEY: parsed.key };
  }
  const key = readKey(env);
  return typeof key === 'string' ? fail(key) : key;
}

interface RunOptions {
  readonly port: number;
  readonly out: string;
  readonly build: string;
  readonly identifier: string;
}

/** One device from open to verdict. A failure is a verdict, never a thrown page string. */
async function runDevice(device: Device, key: Key, options: RunOptions): Promise<Verdict> {
  const driver = createDriver({ user: key.username, key: key.accessKey }, (url, init) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  );
  let measured: Measured = {};
  try {
    await driver.start({
      ...device.caps,
      local: true,
      sessionName: device.slug,
      buildName: options.build,
      localIdentifier: options.identifier,
      consoleLogs: 'errors',
    });
    await driver.setScriptTimeout(SCRIPT_TIMEOUT_MS);
    await driver.navigate(`http://bs-local.com:${String(options.port)}/`);

    const found = readFound(await driver.runAsync(READY_AND_FIND));
    if (found === undefined) fail(UNEXPECTED);
    if ('error' in found) fail(found.error);

    // A real iPhone takes tap coordinates from the screen, not the page: tap once where nothing
    // listens, read where it landed, and ask for the book that much off.
    const viewport = readViewport(await driver.run(PROBE_ARM));
    if (viewport === undefined) fail(UNEXPECTED);
    const centre = { x: Math.round(viewport.x / 2), y: Math.round(viewport.y / 2) };
    await driver.click(centre, device.pointer);
    const shift = tapShift(centre, await driver.run(PROBE_READ));
    await driver.click({ x: found.x + shift.x, y: found.y + shift.y }, device.pointer);
    const held = readHeld(await driver.runAsync(WAIT_HELD, [found.title, found.href]));
    if (held === undefined) fail(UNEXPECTED);
    measured = { ...measured, held };

    await sleep(HOLD_MS);
    const after = readAfterHold(await driver.run(READ_AFTER_HOLD, [found.href]));
    if (after === undefined) fail(UNEXPECTED);
    measured = { ...measured, after };

    const png = Buffer.from(await driver.screenshot(), 'base64');
    writeFileSync(join(options.out, `${device.slug}.png`), png);
  } catch (error) {
    // A step that failed is the device's verdict; the hub's and the page's text were scrubbed.
    const reason = scrub(error instanceof Error ? error.message : 'unknown failure', [
      key.accessKey,
      key.username,
    ]);
    await driver.end();
    const verdict = { ok: false, line: `FAIL ${device.label}: ${reason}` };
    const told = await driver.setStatus(verdict.ok, verdict.line);
    return {
      ...verdict,
      line: `${verdict.line} [BrowserStack status: ${told ? 'set' : 'not set'}]`,
    };
  }
  await driver.end();
  let consoleErrors: number | undefined;
  try {
    consoleErrors = await driver.consoleErrorCount();
  } catch {
    consoleErrors = undefined;
  }
  const verdict = judgeDevice(device, { ...measured, consoleErrors });
  const told = await driver.setStatus(verdict.ok, verdict.line);
  return { ...verdict, line: `${verdict.line} [BrowserStack status: ${told ? 'set' : 'not set'}]` };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === 'string') return fail(args);
  if (!existsSync(join(args.dist, 'index.html'))) return fail('--dist holds no index.html');
  if (!existsSync(join(args.dist, 'library.json'))) return fail('--dist holds no library.json');

  const key = loadKey(args.keyFile);
  const { build, identifier } = runNames(runId(process.env, Date.now()));
  mkdirSync(args.out, { recursive: true });

  // Outside the checkout and every upload path: the binary, its log, and the config holding the key.
  const scratch = mkdtempSync(join(tmpdir(), 'device-check-'));
  const logFile = join(scratch, 'tunnel.log');
  const config = writeConfigFile(key.accessKey);
  process.on('exit', config.remove);
  const servers: { close: () => void }[] = [];
  let stopTunnel: (() => void) | undefined;
  try {
    const binary = args.binary ?? (await downloadBinary(scratch, (url, init) => fetch(url, init)));

    // The fixture build, on loopback and nothing else. The build was judged before it was
    // uploaded; a tunnel serves whatever is on its port, so what answers here is read once more.
    const first = await serveDist({
      root: args.dist,
      port: args.port,
      headers: { 'Cache-Control': 'no-store' },
    });
    servers.push(first.server);
    // `localhost` may resolve to ::1: serve the same folder there, so another server on that
    // address fails this run instead of answering the tunnel.
    const v6 = await serveDist({
      root: args.dist,
      port: args.port,
      host: '::1',
      headers: { 'Cache-Control': 'no-store' },
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT') return undefined;
      throw error;
    });
    if (v6 !== undefined) servers.push(v6.server);
    const reply = await fetch(`${first.origin}/library.json`, { redirect: 'error' });
    const served = judgeServed(await reply.json());
    console.log(served.line);
    if (!served.ok) return 1;

    const tunnel = startBinary(
      binary,
      binaryArgs({
        configFile: config.path,
        logFile,
        port: args.port,
        localIdentifier: identifier,
      }),
      logFile,
    );
    stopTunnel = tunnel.stop;
    const up = await waitForTunnel(
      () => existsSync(logFile) && tunnelIsUp(readFileSync(logFile, 'utf8')),
      tunnel.exited,
      TUNNEL_CEILING_MS,
    );
    if (!up) return fail('the BrowserStack Local tunnel did not come up');
    console.log('the tunnel is up');

    const options = { port: args.port, out: args.out, build, identifier };
    const chosen = DEVICES.filter(
      (device) => args.device === undefined || device.slug === args.device,
    );
    const verdicts = await Promise.all(chosen.map((device) => runDevice(device, key, options)));
    for (const verdict of verdicts) console.log(verdict.line);
    return verdicts.every((verdict) => verdict.ok) ? 0 : 1;
  } finally {
    stopTunnel?.();
    // Let the binary close its end before the log is scrubbed and the folder removed.
    await sleep(500);
    scrubLogFile(logFile, key);
    for (const server of servers) server.close();
    config.remove();
    rmSync(scratch, { recursive: true, force: true });
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(
      `check-devices: ${scrub(error instanceof Error ? error.message : 'unknown failure')}`,
    );
    process.exitCode = 1;
  },
);
