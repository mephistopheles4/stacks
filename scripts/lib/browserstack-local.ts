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
import {
  chmodSync,
  existsSync,
  mkdtempSync,
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
}): string[] {
  return [
    '--config-file',
    options.configFile,
    '--only',
    onlyList(options.port),
    '--log-file',
    options.logFile,
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
  const dir = mkdtempSync(join(tmpdir(), 'bs-local-'));
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

/**
 * Removes config folders an earlier run left behind. A run that was killed outright (a closed
 * terminal, a pipe that ended, `kill -9`) cannot run its own cleanup, and its folder holds the key.
 * Only a folder this launcher made is touched: named `bs-local-`, holding `local.yml` and nothing
 * else, and older than five minutes: a launcher's binary reads its config in the first seconds, so a
 * younger folder may belong to a run that has not started it yet. Returns how many it removed.
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
    if (now - statSync(dir).mtimeMs < minAgeMs) continue;
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
