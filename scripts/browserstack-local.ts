/**
 * The BrowserStack Local launcher: the fixture site through one tunnel port, for the device
 * matrix (room spec S13.2, S13.3, S13.6). **Not a `pnpm` script and not a gate**: it needs the
 * owner's BrowserStack account and a downloaded binary, and it is the owner's to start and stop.
 *
 *     BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=… \
 *       pnpm exec tsx scripts/browserstack-local.ts --binary <path> [--port 8766]
 *
 * It refuses to run while a root `.env` names a `BROWSERSTACK_` variable, builds the 50-book
 * fixture site into a scratch folder of its own, judges it (G20's rules and the fixture marker),
 * serves only that folder on 127.0.0.1, and starts the binary with `--only` naming that one port.
 * The key reaches the binary through a temp `--config-file` deleted on exit, and is never printed.
 * Ctrl-C stops it. See `docs/commands.md`.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { dropBrowserstack, browserstackRootRefusalsOnDisk } from './lib/browserstack-key.ts';
import {
  parseLauncherArgs,
  readKey,
  runTunnel,
  writeConfigFile,
  type Tunnel,
} from './lib/browserstack-local.ts';
import { scrub } from './lib/browserstack-driver.ts';
import { buildFixtureDist, judgeFixtureDist, SCRATCH_ROOT } from './lib/fixture-dist.ts';
import { serveDist } from './lib/serve-dist.ts';

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

// No flag clears this (S13.6).
const keyInRootEnv = browserstackRootRefusalsOnDisk();
if (keyInRootEnv.length > 0) fail(keyInRootEnv.join('\n'));

const args = parseLauncherArgs(process.argv.slice(2));
if (typeof args === 'string') fail(args);
const key = readKey({
  BROWSERSTACK_USERNAME: process.env['BROWSERSTACK_USERNAME'],
  BROWSERSTACK_ACCESS_KEY: process.env['BROWSERSTACK_ACCESS_KEY'],
});
if (typeof key === 'string') fail(key);
if (!existsSync(args.binary)) fail('the --binary path does not exist');

const scratch = join(SCRATCH_ROOT, 'launcher', 'dist');
buildFixtureDist(scratch);
const judged = await judgeFixtureDist(scratch);
for (const line of judged.lines) console.log(line);
if (!judged.ok) fail('the fixture build is not servable; nothing is served');

// Only the scratch folder, on loopback, on the tunnel's one port.
const { server, origin } = await serveDist({
  root: scratch,
  port: args.port,
  headers: { 'Cache-Control': 'no-store' },
});
console.log(`serving the fixture build on ${origin}`);

const logDir = join(SCRATCH_ROOT, 'launcher');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, 'tunnel.log');

let stopTunnel: (() => void) | undefined;
const stop = (): void => {
  stopTunnel?.();
  server.close();
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, stop);

try {
  const code = await runTunnel(
    key,
    args,
    logFile,
    {
      writeConfig: writeConfigFile,
      start: (binary, binaryArguments): Tunnel => {
        // No shell, an argument list, and an environment without any BrowserStack variable.
        const child = spawn(binary, [...binaryArguments], {
          env: dropBrowserstack(process.env),
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const exited = new Promise<number | null>((resolve, reject) => {
          child.on('error', (error) => {
            reject(new Error(scrub(error.message, [key.accessKey, key.username])));
          });
          child.on('exit', (exitCode) => {
            resolve(exitCode);
          });
        });
        return {
          onLine: (listener) => {
            for (const stream of [child.stdout, child.stderr]) {
              createInterface({ input: stream }).on('line', listener);
            }
          },
          exited,
          stop: () => {
            child.kill();
          },
        };
      },
      print: (line) => {
        console.log(line);
      },
    },
    (handle) => {
      stopTunnel = handle;
    },
  );
  console.log(`the tunnel ended (exit ${String(code)})`);
  process.exitCode = code;
} finally {
  server.close();
}
