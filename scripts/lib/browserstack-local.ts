/**
 * The BrowserStack Local launcher's decisions (room spec S13, C14).
 *
 * `scripts/browserstack-local.ts` is the owner's to run: BrowserStack Local is a download and a
 * long-running process that opens one port of this machine to a device cloud. It builds the
 * fixture site into a scratch folder of its own, serves that folder on 127.0.0.1, and starts the
 * binary with `--only` naming that one port. Everything that decides anything lives here, with its
 * effects passed in, so a test drives every path without a network, a binary or a key.
 *
 * **What it promises about the key.** It reads `BROWSERSTACK_ACCESS_KEY` from `process.env` only
 * (the entry) and holds it in one variable. It reaches the binary through `--config-file`, a file
 * in the OS temp folder, readable by this user only and deleted on exit, failure and a signal
 * included. It is never in a URL, on a command line, in the binary's environment, in the tunnel's
 * log path, or in any line this launcher prints (every printed line passes `scrub` first).
 *
 * ⚠️ **The config file's key name is not confirmed**: BrowserStack's page for `--config-file`
 * names no YAML keys (2026-11). `key` mirrors the `--key` flag; the first real run settles it.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scrub } from './browserstack-driver.ts';
import { DEFAULT_PORT } from './ios-swipe.ts';

const PREFIX = 'BROWSERSTACK_';

/** Whether an environment variable's name is one of BrowserStack's, in any case (Windows names are case-blind). */
export function isBrowserstackName(name: string): boolean {
  return name.toUpperCase().startsWith(PREFIX);
}

/** The environment without any `BROWSERSTACK_` variable. */
export function dropBrowserstack(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !isBrowserstackName(name)));
}

export interface LauncherArgs {
  /** The BrowserStack Local binary the owner downloaded. */
  readonly binary: string;
  /** The tunnel's one port, and the fixture build's. */
  readonly port: number;
}

/** `--binary <path>` is required; `--port <n>` defaults to the check's own. Anything else is refused. */
export function parseLauncherArgs(argv: readonly string[]): LauncherArgs | string {
  let binary: string | undefined;
  let port = DEFAULT_PORT;
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    const value = argv[at + 1];
    if (arg === '--binary') {
      if (value === undefined || value.startsWith('--')) return '--binary needs a path';
      binary = value;
      at += 1;
    } else if (arg === '--port') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
        return '--port needs a whole number from 1024 to 65535';
      }
      port = parsed;
      at += 1;
    } else {
      return `unknown argument at position ${String(at + 1)}`;
    }
  }
  if (binary === undefined) return '--binary <path to the BrowserStack Local binary> is required';
  return { binary, port };
}

/**
 * `--only`, naming the one port under the three hosts a phone may ask for. A phone reaches this
 * machine as `bs-local.com` (measured 2026-11-15), so that name is on the list beside the two a
 * desktop uses; no other host and no other port is carried.
 */
export function onlyList(port: number): string {
  const p = String(port);
  return ['localhost', '127.0.0.1', 'bs-local.com'].map((host) => `${host},${p},0`).join(',');
}

export interface Key {
  readonly username: string;
  readonly accessKey: string;
}

/**
 * The credential if the environment holds a whole, plainly shaped one, or why not. Names the
 * variable and never the value. The shape check is also what keeps the key out of trouble in the
 * config file: a value with a quote or a line break would end its YAML string early.
 */
export function readKey(env: Readonly<Record<string, string | undefined>>): Key | string {
  const username = env['BROWSERSTACK_USERNAME'];
  const accessKey = env['BROWSERSTACK_ACCESS_KEY'];
  if (username === undefined || username === '') return 'BROWSERSTACK_USERNAME is not set';
  if (accessKey === undefined || accessKey === '') return 'BROWSERSTACK_ACCESS_KEY is not set';
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) return 'BROWSERSTACK_USERNAME has an odd shape';
  if (!/^[A-Za-z0-9]{8,64}$/.test(accessKey)) return 'BROWSERSTACK_ACCESS_KEY has an odd shape';
  return { username, accessKey };
}

/** The config file's text. Holds the key and nothing the binary does not need. */
export function configFileText(accessKey: string): string {
  return `key: "${accessKey}"\n`;
}

/**
 * The binary's whole argument list. **No element carries the key**: it is in `--config-file`.
 * The log goes to a gitignored path the caller names.
 */
export function binaryArgs(options: {
  readonly configFile: string;
  readonly logFile: string;
  readonly port: number;
  /** One per run, so two tunnels on one key cannot cross (#618). */
  readonly localIdentifier?: string;
}): string[] {
  return [
    '--config-file',
    options.configFile,
    '--only',
    onlyList(options.port),
    '--log-file',
    options.logFile,
    ...(options.localIdentifier === undefined
      ? []
      : ['--local-identifier', options.localIdentifier]),
  ];
}

/** A file written for the binary, and the one call that removes it. */
export interface ConfigFile {
  readonly path: string;
  readonly remove: () => void;
}

/**
 * Writes the config file into a folder of its own in the OS temp folder, readable by this user
 * only (mode 0600 inside a 0700 folder where the platform honours modes; on Windows the temp
 * folder sits in the user's profile, which the other accounts cannot read). `remove` is
 * idempotent and removes the folder.
 */
export function writeConfigFile(accessKey: string): ConfigFile {
  const dir = mkdtempSync(join(tmpdir(), `bs-local-${String(process.pid)}-`));
  const path = join(dir, 'local.yml');
  const remove = (): void => {
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    chmodSync(dir, 0o700);
    writeFileSync(path, configFileText(accessKey), { mode: 0o600 });
  } catch (error) {
    remove();
    throw error;
  }
  return { path, remove };
}

const SWEEP_MIN_AGE_MS = 5 * 60 * 1000;

/** Whether a process with this id exists. A refusal to signal it still means it exists. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Removes config folders an earlier run left behind. A run that was killed outright (a closed
 * terminal, a pipe that ended, `kill -9`) cannot run its own cleanup, and its folder holds the key.
 * Only a folder this launcher made is touched: named `bs-local-<pid>-…`, holding `local.yml` and
 * nothing else. A folder whose process is still alive is left alone, however old; one whose process
 * has ended goes at once. A folder with no pid in its name (an older launcher's) goes once it is five
 * minutes old, as its binary has read the config by then. Returns how many it removed.
 */
export function sweepStaleConfigs(
  root: string = tmpdir(),
  now: number = Date.now(),
  minAgeMs: number = SWEEP_MIN_AGE_MS,
): number {
  let removed = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('bs-local-')) continue;
    const dir = join(root, entry.name);
    const owner = /^bs-local-(\d+)-/.exec(entry.name)?.[1];
    if (owner === undefined) {
      if (now - statSync(dir).mtimeMs < minAgeMs) continue;
    } else if (isAlive(Number(owner))) {
      continue;
    }
    const files = readdirSync(dir);
    if (files.length === 1 && files[0] === 'local.yml') {
      rmSync(dir, { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}

/**
 * Rewrites the binary's own log with the key and the username scrubbed out. The binary writes that
 * file itself, so nothing else has seen it; a missing file is fine (the binary may not have
 * started). Run after the tunnel ends.
 */
export function scrubLogFile(path: string, key: Key): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  // Not `scrub`: that one cuts a message to 200 characters, which would leave no log to read.
  const clean = text.split(key.accessKey).join('[key]').split(key.username).join('[user]');
  writeFileSync(path, clean);
}

/** What a printed line may carry: the binary's own output, scrubbed of the key. */
export function printable(line: string, key: Key): string {
  return scrub(line, [key.accessKey, key.username]);
}

/** A started binary, as the run sees it: its output a line at a time, and its end. */
export interface Tunnel {
  /** Both streams, whole lines. */
  readonly onLine: (listener: (line: string) => void) => void;
  /** Resolves with the exit code, or `null` for a signal. */
  readonly exited: Promise<number | null>;
  readonly stop: () => void;
}

/** Every effect, required: a test that forgets one does not compile. */
export interface TunnelDeps {
  readonly writeConfig: (accessKey: string) => ConfigFile;
  /** Starts the binary with exactly these arguments and no key in its environment. */
  readonly start: (binary: string, args: readonly string[]) => Tunnel;
  readonly print: (line: string) => void;
}

/**
 * Runs the tunnel to its end and returns the exit code. The config file is removed on every path
 * out: the binary's exit, a failure to start it, and `stop` being asked for (the entry calls it
 * on a signal). A line the binary prints is scrubbed of the key before it is printed.
 */
export async function runTunnel(
  key: Key,
  args: LauncherArgs,
  logFile: string,
  deps: TunnelDeps,
  onStarted: (stop: () => void) => void = () => undefined,
): Promise<number> {
  const config = deps.writeConfig(key.accessKey);
  // A hard exit (a console closed, a crash) skips `finally`; an `exit` listener still runs.
  process.on('exit', config.remove);
  try {
    const tunnel = deps.start(
      args.binary,
      binaryArgs({ configFile: config.path, logFile, port: args.port }),
    );
    onStarted(tunnel.stop);
    tunnel.onLine((line) => {
      deps.print(printable(line, key));
    });
    const code = await tunnel.exited;
    return code ?? 1;
  } finally {
    process.removeListener('exit', config.remove);
    config.remove();
  }
}

/**
 * The binary the device check's CI job runs, pinned (#618, item 5). BrowserStack serves the binary
 * at one address that always answers with the latest build, with no version in the URL, so the pin
 * is the **host, the path and the SHA-256 of the bytes**; `published` is the address's own
 * `Last-Modified`, for the human who has to bump it. A build that differs is refused and never run:
 * the binary reads the key, so unpinned bytes would run beside it. Bump all three together.
 */
export const LOCAL_BINARY = {
  host: 'www.browserstack.com',
  path: '/local-testing/downloads/binaries/BrowserStackLocal-linux-x64',
  sha256: '00530aa185b84545756dfa055ad32d64df1b4c4662e0e16aa0dc048501200912',
  published: '2026-11-12',
} as const;

/** The one address the pinned binary is fetched from. */
export function binaryUrl(): string {
  return `https://${LOCAL_BINARY.host}${LOCAL_BINARY.path}`;
}

/** Whether `bytes` are the pinned build, byte for byte. */
export function matchesPin(bytes: Uint8Array): boolean {
  return createHash('sha256').update(bytes).digest('hex') === LOCAL_BINARY.sha256;
}

/**
 * Downloads the pinned binary into `dir` and returns its path. **Refuses a build whose hash is not
 * the pin**: nothing is written, and the message carries neither the bytes nor the hash read.
 * A redirect is an error, so the host stays the pinned one whatever the answer says.
 */
export async function downloadBinary(
  dir: string,
  get: (url: string, init: RequestInit) => Promise<Response>,
): Promise<string> {
  const reply = await get(binaryUrl(), { redirect: 'error' });
  if (!reply.ok) throw new Error(`the Local binary download answered HTTP ${String(reply.status)}`);
  const bytes = new Uint8Array(await reply.arrayBuffer());
  if (!matchesPin(bytes)) {
    throw new Error('the Local binary is not the pinned build; it is refused and not run');
  }
  const path = join(dir, 'BrowserStackLocal');
  writeFileSync(path, bytes, { mode: 0o700 });
  return path;
}

/** Whether the binary's log says the tunnel is up. */
export function tunnelIsUp(log: string): boolean {
  return /You can now access your local server|Press Ctrl-C to exit/i.test(log);
}

/**
 * Starts the binary with exactly these arguments, no shell, and an environment without any
 * `BROWSERSTACK_` variable. **Its stdout and stderr go to `logFile` and nowhere else**, so nothing
 * it says reaches a public job log; the file is outside every path the job uploads and is
 * scrubbed of the key once the tunnel ends (`scrubLogFile`).
 */
export function startBinary(
  binary: string,
  args: readonly string[],
  logFile: string,
): { readonly exited: Promise<number | null>; readonly stop: () => void } {
  const out = openSync(logFile, 'a');
  try {
    const child = spawn(binary, [...args], {
      env: dropBrowserstack(process.env),
      stdio: ['ignore', out, out],
    });
    const exited = new Promise<number | null>((resolve) => {
      // A binary that cannot start ends the run the way one that crashes does.
      child.on('error', () => {
        resolve(null);
      });
      child.on('exit', (code) => {
        resolve(code);
      });
    });
    return {
      exited,
      stop: () => {
        child.kill();
      },
    };
  } finally {
    closeSync(out);
  }
}

/**
 * Waits until `isUp()` says so, the binary ends, or `ceilingMs` passes, polling on `pause` (which a
 * test replaces). Resolves `true` only when the tunnel came up.
 */
export async function waitForTunnel(
  isUp: () => boolean,
  exited: Promise<number | null>,
  ceilingMs: number,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<boolean> {
  let ended = false;
  void exited.then(() => {
    ended = true;
  });
  for (let waited = 0; waited <= ceilingMs; waited += 500) {
    if (isUp()) return true;
    if (ended) return false;
    await pause(500);
  }
  return false;
}
